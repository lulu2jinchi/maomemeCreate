(function () {
  const state = {
    catalogs: [],
    selectedKey: null,
    selectedItem: null,
    form: {
      description: '',
      common_level: null,
    },
    isDirty: false,
    isSaving: false,
  };

  const treeRoot = document.getElementById('tree-root');
  const previewRoot = document.getElementById('preview-root');
  const metaRoot = document.getElementById('meta-root');
  const saveState = document.getElementById('save-state');
  const saveButton = document.getElementById('save-button');
  const descriptionInput = document.getElementById('description-input');
  const editorForm = document.getElementById('editor-form');
  const levelOptions = document.getElementById('level-options');
  const levelFieldset = editorForm.querySelector('fieldset');

  const levelValues = [1, 2, 3, 4, 5];

  const normalizePath = (value) => (value || '').replace(/\\/g, '/').replace(/^\.\//, '');

  const getItemKey = (item) => `${item.catalogId}:${item.index}`;

  const getMediaUrl = (item) => {
    const encoded = encodeURIComponent(normalizePath(item.path));
    return item.type === 'image' ? `/media/image/${encoded}` : `/media/video/${encoded}`;
  };

  const flattenItems = (catalogs) => catalogs.flatMap((catalog) => catalog.items);

  const getItemByKey = (key) => flattenItems(state.catalogs).find((item) => getItemKey(item) === key) || null;

  const setSaveState = (text, tone) => {
    saveState.textContent = text;
    saveState.dataset.tone = tone || 'neutral';
  };

  const updateFormAvailability = () => {
    const disabled = !state.selectedItem || state.isSaving;
    descriptionInput.disabled = disabled;
    levelFieldset.disabled = disabled;
    saveButton.disabled = disabled || !state.isDirty;
  };

  const syncFormFromSelected = () => {
    if (!state.selectedItem) {
      state.form.description = '';
      state.form.common_level = null;
      descriptionInput.value = '';
      updateLevelInputs();
      updateFormAvailability();
      return;
    }

    state.form.description = state.selectedItem.description || '';
    state.form.common_level = state.selectedItem.common_level;
    descriptionInput.value = state.form.description;
    updateLevelInputs();
    updateFormAvailability();
  };

  const createMetaRow = (label, value) => {
    const wrap = document.createElement('div');
    wrap.className = 'meta-row';

    const labelNode = document.createElement('span');
    labelNode.className = 'meta-label';
    labelNode.textContent = label;

    const valueNode = document.createElement('span');
    valueNode.className = 'meta-value';
    valueNode.textContent = value || '-';

    wrap.append(labelNode, valueNode);
    return wrap;
  };

  const renderMeta = () => {
    metaRoot.innerHTML = '';

    if (!state.selectedItem) {
      metaRoot.append(createMetaRow('状态', '未选择素材'));
      return;
    }

    const item = state.selectedItem;
    metaRoot.append(
      createMetaRow('标题', item.title),
      createMetaRow('路径', item.path),
      createMetaRow('来源', item.sourceFile),
      createMetaRow('比例', item.aspect_ratio || '未知'),
      createMetaRow('类型', item.type === 'image' ? '图片' : '视频')
    );
  };

  const renderMissingPreview = (item, message) => {
    previewRoot.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'placeholder missing';

    const title = document.createElement('strong');
    title.textContent = message;

    const pathNode = document.createElement('code');
    pathNode.textContent = item.path;

    const hint = document.createElement('span');
    hint.textContent = '当前无法预览，请确认素材文件是否存在。';

    wrap.append(title, pathNode, hint);
    previewRoot.append(wrap);
  };

  const renderPreview = () => {
    previewRoot.innerHTML = '';

    if (!state.selectedItem) {
      const empty = document.createElement('div');
      empty.className = 'placeholder';
      empty.innerHTML = '<strong>请选择左侧素材</strong><span>选中后会在这里显示图片或视频。</span>';
      previewRoot.append(empty);
      return;
    }

    const item = state.selectedItem;
    const mediaUrl = getMediaUrl(item);

    if (item.type === 'image') {
      const image = document.createElement('img');
      image.className = 'preview-media';
      image.alt = item.title || item.path;
      image.src = mediaUrl;
      image.addEventListener('error', () => renderMissingPreview(item, '图片文件缺失'));
      previewRoot.append(image);
      return;
    }

    const video = document.createElement('video');
    video.className = 'preview-media';
    video.controls = true;
    video.preload = 'metadata';
    video.src = mediaUrl;
    video.addEventListener('error', () => renderMissingPreview(item, '视频文件缺失'));
    previewRoot.append(video);
  };

  const updateDirtyState = (isDirty) => {
    state.isDirty = isDirty;
    updateFormAvailability();

    if (!state.selectedItem) {
      setSaveState('未选择素材');
      return;
    }

    if (state.isSaving) {
      setSaveState('保存中...', 'saving');
      return;
    }

    if (isDirty) {
      setSaveState('有未保存修改', 'dirty');
    } else {
      setSaveState('已同步到 JSON', 'saved');
    }
  };

  const updateLevelInputs = () => {
    const radios = levelOptions.querySelectorAll('input[name="common_level"]');
    radios.forEach((radio) => {
      radio.checked = Number(radio.value) === Number(state.form.common_level);
    });
  };

  const handleSelectItem = (key) => {
    if (state.isDirty) {
      const confirmed = window.confirm('当前条目有未保存修改，确认切换并丢弃吗？');
      if (!confirmed) {
        return;
      }
    }

    state.selectedKey = key;
    state.selectedItem = getItemByKey(key);
    syncFormFromSelected();
    renderTree();
    renderMeta();
    renderPreview();
    updateDirtyState(false);
  };

  const createTreeButton = (label, className, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.addEventListener('click', onClick);
    return button;
  };

  const renderTree = () => {
    treeRoot.innerHTML = '';

    state.catalogs.forEach((catalog) => {
      const details = document.createElement('details');
      details.className = 'tree-catalog';
      details.open = true;

      const summary = document.createElement('summary');
      summary.textContent = catalog.label;
      details.append(summary);

      const branch = document.createElement('div');
      branch.className = 'tree-branch';

      if (catalog.type === 'video') {
        catalog.items.forEach((item) => {
          const key = getItemKey(item);
          const button = createTreeButton(
            item.title || item.normalizedPath,
            `tree-item ${state.selectedKey === key ? 'active' : ''}`,
            () => handleSelectItem(key)
          );
          branch.append(button);
        });
      } else {
        catalog.tree.children.forEach((groupNode) => {
          const groupDetails = document.createElement('details');
          groupDetails.className = 'tree-group';
          groupDetails.open = true;

          const groupSummary = document.createElement('summary');
          groupSummary.textContent = `${groupNode.label} (${groupNode.children.length})`;
          groupDetails.append(groupSummary);

          const groupBranch = document.createElement('div');
          groupBranch.className = 'tree-branch';

          groupNode.children.forEach((itemNode) => {
            const item = catalog.items[itemNode.itemIndex];
            const key = getItemKey(item);
            const button = createTreeButton(
              itemNode.label,
              `tree-item ${state.selectedKey === key ? 'active' : ''}`,
              () => handleSelectItem(key)
            );
            groupBranch.append(button);
          });

          groupDetails.append(groupBranch);
          branch.append(groupDetails);
        });
      }

      details.append(branch);
      treeRoot.append(details);
    });
  };

  const renderLevelOptions = () => {
    levelOptions.innerHTML = '';

    levelValues.forEach((value) => {
      const label = document.createElement('label');
      label.className = 'level-option';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'common_level';
      radio.value = String(value);
      radio.addEventListener('change', () => {
        state.form.common_level = value;
        updateDirtyState(true);
      });

      const text = document.createElement('span');
      text.textContent = String(value);

      label.append(radio, text);
      levelOptions.append(label);
    });
  };

  const replaceItemInState = (updatedItem) => {
    state.catalogs = state.catalogs.map((catalog) => {
      if (catalog.id !== updatedItem.catalogId) {
        return catalog;
      }

      const items = catalog.items.map((item) => (item.index === updatedItem.index ? updatedItem : item));
      return {
        ...catalog,
        items,
        tree: catalog.tree.kind ? buildTreeForCatalog(catalog.id, catalog.label, catalog.type, items) : catalog.tree,
      };
    });
  };

  const buildTreeForCatalog = (catalogId, label, type, items) => {
    if (type === 'video') {
      return {
        id: catalogId,
        label,
        kind: 'catalog',
        children: items.map((item) => ({
          id: `${catalogId}:${item.index}`,
          label: item.title || item.normalizedPath || `条目 ${item.index + 1}`,
          kind: 'item',
          itemIndex: item.index,
        })),
      };
    }

    const groups = new Map();
    items.forEach((item) => {
      const groupName = item.group || '未分组';
      const groupItems = groups.get(groupName) || [];
      groupItems.push({
        id: `${catalogId}:${item.index}`,
        label: item.normalizedPath.split('/').pop() || item.title || `条目 ${item.index + 1}`,
        kind: 'item',
        itemIndex: item.index,
      });
      groups.set(groupName, groupItems);
    });

    return {
      id: catalogId,
      label,
      kind: 'catalog',
      children: Array.from(groups.entries())
        .sort((left, right) => left[0].localeCompare(right[0], 'zh-Hans-CN'))
        .map(([groupName, children]) => ({
          id: `${catalogId}:group:${groupName}`,
          label: groupName,
          kind: 'group',
          children,
        })),
    };
  };

  const saveCurrentItem = async () => {
    if (!state.selectedItem || !state.isDirty || state.isSaving) {
      return;
    }

    state.isSaving = true;
    let savedSuccessfully = false;
    updateDirtyState(state.isDirty);
    saveButton.disabled = true;

    try {
      const response = await fetch('/api/catalog-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          catalogId: state.selectedItem.catalogId,
          index: state.selectedItem.index,
          description: state.form.description,
          common_level: Number(state.form.common_level),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '保存失败');
      }

      replaceItemInState(payload.item);
      state.selectedItem = payload.item;
      syncFormFromSelected();
      renderTree();
      renderMeta();
      renderPreview();
      savedSuccessfully = true;
    } catch (error) {
      setSaveState(error.message || '保存失败', 'error');
    } finally {
      state.isSaving = false;
      if (savedSuccessfully) {
        updateDirtyState(false);
      }
      updateFormAvailability();
    }
  };

  descriptionInput.addEventListener('input', (event) => {
    state.form.description = event.target.value;
    updateDirtyState(true);
  });

  saveButton.addEventListener('click', () => {
    saveCurrentItem();
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.isDirty) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  });

  const init = async () => {
    renderLevelOptions();

    try {
      const response = await fetch('/api/catalog-data');
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '加载目录失败');
      }

      state.catalogs = payload.catalogs;
      renderTree();
      renderMeta();
      renderPreview();
      updateFormAvailability();
    } catch (error) {
      treeRoot.innerHTML = `<div class="placeholder missing"><strong>加载失败</strong><span>${error.message}</span></div>`;
      setSaveState('加载失败', 'error');
    }
  };

  init();
})();
