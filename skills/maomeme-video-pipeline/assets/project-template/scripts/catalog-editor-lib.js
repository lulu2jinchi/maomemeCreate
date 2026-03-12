const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const DEFAULT_CATALOGS = {
  describe: {
    id: 'describe',
    label: 'describe.json',
    file: 'describe.json',
    type: 'video',
  },
  image: {
    id: 'image',
    label: 'img-describe.json',
    file: 'img-describe.json',
    type: 'image',
  },
};

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
};

const normalizePathValue = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
};

const getCatalogDefinition = (catalogId, catalogs = DEFAULT_CATALOGS) => {
  const catalog = catalogs[catalogId];
  if (!catalog) {
    const error = new Error(`Unknown catalog: ${catalogId}`);
    error.statusCode = 400;
    throw error;
  }

  return catalog;
};

const readCatalogFile = ({catalogId, repoRoot = REPO_ROOT, catalogs = DEFAULT_CATALOGS}) => {
  const catalog = getCatalogDefinition(catalogId, catalogs);
  const filePath = path.join(repoRoot, catalog.file);
  const rawText = fs.readFileSync(filePath, 'utf8');
  const items = JSON.parse(rawText);

  return {
    catalog,
    filePath,
    items,
  };
};

const getGroupName = (catalog, normalizedPath) => {
  if (catalog.type !== 'image') {
    return null;
  }

  const [firstSegment] = normalizedPath.split('/');
  return firstSegment || '未分组';
};

const normalizeCatalogItem = (rawItem, index, catalog) => {
  const normalizedPath = normalizePathValue(rawItem.path);

  return {
    catalogId: catalog.id,
    sourceFile: catalog.label,
    index,
    title: rawItem.title ?? '',
    path: rawItem.path ?? '',
    normalizedPath,
    description: rawItem.description ?? '',
    common_level: rawItem.common_level ?? null,
    aspect_ratio: rawItem.aspect_ratio ?? null,
    is_edited: rawItem.is_edited === true,
    type: catalog.type,
    group: getGroupName(catalog, normalizedPath),
  };
};

const buildCatalogTree = (catalog, items) => {
  if (catalog.type === 'video') {
    return {
      id: catalog.id,
      label: catalog.label,
      kind: 'catalog',
      children: items.map((item) => ({
        id: `${catalog.id}:${item.index}`,
        label: item.title || item.normalizedPath || `条目 ${item.index + 1}`,
        kind: 'item',
        itemIndex: item.index,
        isEdited: item.is_edited === true,
      })),
    };
  }

  const groups = new Map();

  items.forEach((item) => {
    const groupName = item.group || '未分组';
    const groupItems = groups.get(groupName) ?? [];
    groupItems.push({
      id: `${catalog.id}:${item.index}`,
      label: item.normalizedPath.split('/').pop() || item.title || `条目 ${item.index + 1}`,
      kind: 'item',
      itemIndex: item.index,
      isEdited: item.is_edited === true,
    });
    groups.set(groupName, groupItems);
  });

  return {
    id: catalog.id,
    label: catalog.label,
    kind: 'catalog',
    children: [...groups.entries()]
      .sort((left, right) => left[0].localeCompare(right[0], 'zh-Hans-CN'))
      .map(([groupName, groupItems]) => ({
        id: `${catalog.id}:group:${groupName}`,
        label: groupName,
        kind: 'group',
        children: groupItems,
      })),
  };
};

const loadCatalogData = ({repoRoot = REPO_ROOT, catalogs = DEFAULT_CATALOGS} = {}) => {
  return {
    catalogs: Object.values(catalogs).map((catalog) => {
      const {items} = readCatalogFile({catalogId: catalog.id, repoRoot, catalogs});
      const normalizedItems = items.map((item, index) => normalizeCatalogItem(item, index, catalog));

      return {
        id: catalog.id,
        label: catalog.label,
        type: catalog.type,
        items: normalizedItems,
        tree: buildCatalogTree(catalog, normalizedItems),
      };
    }),
  };
};

const assertValidCommonLevel = (value) => {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    const error = new Error('common_level must be an integer between 1 and 5');
    error.statusCode = 400;
    throw error;
  }
};

const assertValidIndex = (items, index) => {
  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    const error = new Error('index is out of range');
    error.statusCode = 400;
    throw error;
  }
};

const updateCatalogItem = ({
  catalogId,
  index,
  description,
  commonLevel,
  repoRoot = REPO_ROOT,
  catalogs = DEFAULT_CATALOGS,
}) => {
  const {catalog, filePath, items} = readCatalogFile({catalogId, repoRoot, catalogs});

  assertValidIndex(items, index);
  assertValidCommonLevel(commonLevel);

  if (typeof description !== 'string') {
    const error = new Error('description must be a string');
    error.statusCode = 400;
    throw error;
  }

  const updatedItems = [...items];
  const currentItem = {...updatedItems[index]};
  currentItem.description = description;
  currentItem.common_level = commonLevel;
  currentItem.is_edited = true;
  updatedItems[index] = currentItem;

  fs.writeFileSync(filePath, `${JSON.stringify(updatedItems, null, 2)}\n`, 'utf8');

  return normalizeCatalogItem(currentItem, index, catalog);
};

const updateCatalogItemsCommonLevelBatch = ({
  catalogId,
  updates,
  repoRoot = REPO_ROOT,
  catalogs = DEFAULT_CATALOGS,
}) => {
  const {catalog, filePath, items} = readCatalogFile({catalogId, repoRoot, catalogs});

  if (catalog.type !== 'image') {
    const error = new Error('batch score only supports image catalog');
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(updates) || updates.length === 0) {
    const error = new Error('updates must be a non-empty array');
    error.statusCode = 400;
    throw error;
  }

  const seenIndexes = new Set();
  const nextItems = [...items];

  updates.forEach((update) => {
    if (!update || typeof update !== 'object') {
      const error = new Error('each update must be an object');
      error.statusCode = 400;
      throw error;
    }

    const {index, common_level: commonLevel} = update;
    assertValidIndex(items, index);
    assertValidCommonLevel(commonLevel);

    if (seenIndexes.has(index)) {
      const error = new Error('duplicate indexes are not allowed');
      error.statusCode = 400;
      throw error;
    }

    seenIndexes.add(index);

    const currentItem = {...nextItems[index]};
    currentItem.common_level = commonLevel;
    currentItem.is_edited = true;
    nextItems[index] = currentItem;
  });

  fs.writeFileSync(filePath, `${JSON.stringify(nextItems, null, 2)}\n`, 'utf8');

  return updates.map((update) => normalizeCatalogItem(nextItems[update.index], update.index, catalog));
};

const deleteCatalogItem = ({
  catalogId,
  index,
  repoRoot = REPO_ROOT,
  catalogs = DEFAULT_CATALOGS,
}) => {
  const {catalog, filePath, items} = readCatalogFile({catalogId, repoRoot, catalogs});

  assertValidIndex(items, index);

  const deletedItem = items[index];
  const nextItems = items.filter((_, itemIndex) => itemIndex !== index);

  fs.writeFileSync(filePath, `${JSON.stringify(nextItems, null, 2)}\n`, 'utf8');

  return {
    deletedItem: normalizeCatalogItem(deletedItem, index, catalog),
    remainingCount: nextItems.length,
  };
};

const resolveWithinRoot = (rootDir, relativePath) => {
  const normalized = normalizePathValue(relativePath);
  const resolvedPath = path.resolve(rootDir, normalized);
  const relativeToRoot = path.relative(rootDir, resolvedPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    const error = new Error('invalid media path');
    error.statusCode = 400;
    throw error;
  }

  return resolvedPath;
};

const resolveMediaFilePath = ({
  catalogId,
  relativePath,
  repoRoot = REPO_ROOT,
}) => {
  if (catalogId === 'image') {
    return resolveWithinRoot(path.join(repoRoot, 'public', 'img'), relativePath);
  }

  if (catalogId === 'describe') {
    return resolveWithinRoot(repoRoot, relativePath);
  }

  const error = new Error('unknown media catalog');
  error.statusCode = 400;
  throw error;
};

const getMimeType = (filePath) => {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
};

module.exports = {
  DEFAULT_CATALOGS,
  MIME_TYPES,
  REPO_ROOT,
  buildCatalogTree,
  deleteCatalogItem,
  getCatalogDefinition,
  getMimeType,
  loadCatalogData,
  normalizeCatalogItem,
  normalizePathValue,
  readCatalogFile,
  resolveMediaFilePath,
  updateCatalogItem,
  updateCatalogItemsCommonLevelBatch,
};
