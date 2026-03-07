const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCatalogTree,
  loadCatalogData,
  resolveMediaFilePath,
  updateCatalogItem,
} = require('../scripts/catalog-editor-lib');
const {createCatalogEditorServer} = require('../scripts/catalog-editor-server');

const createTempRepo = () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-editor-'));

  fs.mkdirSync(path.join(repoRoot, 'public', 'img', '办公室'), {recursive: true});
  fs.writeFileSync(
    path.join(repoRoot, 'describe.json'),
    `${JSON.stringify([
      {
        title: '视频 A',
        description: '旧视频描述',
        path: './clips/demo.mp4',
        aspect_ratio: '1080x1920',
        common_level: 3,
        keep: 'video-extra',
      },
    ], null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(repoRoot, 'img-describe.json'),
    `${JSON.stringify([
      {
        title: '办公室/001',
        description: '旧图片描述',
        path: './办公室/001.jpeg',
        aspect_ratio: '1280x720',
        common_level: 4,
        keep: 'image-extra',
      },
    ], null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(path.join(repoRoot, 'public', 'img', '办公室', '001.jpeg'), 'jpeg', 'utf8');
  fs.mkdirSync(path.join(repoRoot, 'clips'), {recursive: true});
  fs.writeFileSync(path.join(repoRoot, 'clips', 'demo.mp4'), 'mp4', 'utf8');

  return repoRoot;
};

test('loadCatalogData returns normalized items and grouped image tree', () => {
  const repoRoot = createTempRepo();
  const payload = loadCatalogData({repoRoot});

  assert.equal(payload.catalogs.length, 2);
  assert.equal(payload.catalogs[0].items[0].type, 'video');
  assert.equal(payload.catalogs[1].items[0].group, '办公室');
  assert.equal(payload.catalogs[1].tree.children[0].label, '办公室');
});

test('buildCatalogTree keeps video catalog flat and image catalog grouped', () => {
  const videoTree = buildCatalogTree(
    {id: 'describe', label: 'describe.json', type: 'video'},
    [{index: 0, title: '视频 A', normalizedPath: 'clips/demo.mp4'}]
  );
  const imageTree = buildCatalogTree(
    {id: 'image', label: 'img-describe.json', type: 'image'},
    [{index: 0, title: '图 A', normalizedPath: '办公室/001.jpeg', group: '办公室'}]
  );

  assert.equal(videoTree.children[0].kind, 'item');
  assert.equal(imageTree.children[0].kind, 'group');
  assert.equal(imageTree.children[0].children[0].label, '001.jpeg');
});

test('resolveMediaFilePath maps image path into public/img', () => {
  const repoRoot = createTempRepo();
  const filePath = resolveMediaFilePath({
    catalogId: 'image',
    relativePath: './办公室/001.jpeg',
    repoRoot,
  });

  assert.equal(filePath, path.join(repoRoot, 'public', 'img', '办公室', '001.jpeg'));
});

test('updateCatalogItem only changes description and common_level', () => {
  const repoRoot = createTempRepo();

  const updated = updateCatalogItem({
    catalogId: 'image',
    index: 0,
    description: '新图片描述',
    commonLevel: 2,
    repoRoot,
  });

  assert.equal(updated.description, '新图片描述');
  assert.equal(updated.common_level, 2);

  const saved = JSON.parse(fs.readFileSync(path.join(repoRoot, 'img-describe.json'), 'utf8'));
  assert.equal(saved[0].description, '新图片描述');
  assert.equal(saved[0].common_level, 2);
  assert.equal(saved[0].is_edited, true);
  assert.equal(saved[0].keep, 'image-extra');
  assert.equal(saved[0].path, './办公室/001.jpeg');
});

test('loadCatalogData exposes edited state for tree rendering', () => {
  const repoRoot = createTempRepo();
  const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, 'describe.json'), 'utf8'));
  raw[0].is_edited = true;
  fs.writeFileSync(path.join(repoRoot, 'describe.json'), `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

  const payload = loadCatalogData({repoRoot});
  const item = payload.catalogs[0].items[0];
  const treeItem = payload.catalogs[0].tree.children[0];

  assert.equal(item.is_edited, true);
  assert.equal(treeItem.isEdited, true);
});

test('server returns 4xx for invalid catalogId, index, and common_level', async () => {
  const repoRoot = createTempRepo();
  const server = createCatalogEditorServer({repoRoot});

  await new Promise((resolve) => server.listen(0, resolve));
  const {port} = server.address();
  const request = (body) =>
    fetch(`http://127.0.0.1:${port}/api/catalog-item`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });

  try {
    const invalidCatalog = await request({
      catalogId: 'missing',
      index: 0,
      description: 'x',
      common_level: 3,
    });
    assert.equal(invalidCatalog.status, 400);

    const invalidIndex = await request({
      catalogId: 'image',
      index: 9,
      description: 'x',
      common_level: 3,
    });
    assert.equal(invalidIndex.status, 400);

    const invalidLevel = await request({
      catalogId: 'image',
      index: 0,
      description: 'x',
      common_level: 8,
    });
    assert.equal(invalidLevel.status, 400);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
