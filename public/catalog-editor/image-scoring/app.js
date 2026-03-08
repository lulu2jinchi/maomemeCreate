(function () {
  const state = {
    items: [],
    selectedGroup: null,
    editMode: false,
    selectedIndexes: new Set(),
    pendingScores: new Map(),
    isSaving: false,
  };

  const groupList = document.getElementById('group-list');
  const gridRoot = document.getElementById('grid-root');
  const progressRatio = document.getElementById('progress-ratio');
  const progressRemaining = document.getElementById('progress-remaining');
  const pendingCount = document.getElementById('pending-count');
  const groupTitle = document.getElementById('group-title');
  const groupMeta = document.getElementById('group-meta');
  const selectionStatus = document.getElementById('selection-status');
  const scoreActions = document.getElementById('score-actions');
  const saveState = document.getElementById('save-state');
  const editToggle = document.getElementById('edit-toggle');
  const clearSelectionButton = document.getElementById('clear-selection');
  const saveButton = document.getElementById('save-button');

  const scoreValues = [1, 2, 3, 4, 5];

  const normalizePath = (value) => (value || '').replace(/\\/g, '/').replace(/^\.\//, '');

  const getMediaUrl = (item) => `/media/image/${encodeURIComponent(normalizePath(item.path))}`;

  const getGroupNames = () =>
    [...new Set(state.items.map((item) => item.group || '未分组'))].sort((left, right) =>
      left.localeCompare(right, 'zh-Hans-CN')
    );

  const getItemsForGroup = (groupName) => state.items.filter((item) => (item.group || '未分组') === groupName);

  const getProgressStats = (items) => {
    const total = items.length;
    const edited = items.filter((item) => item.is_edited === true).length;

    return {
      total,
      edited,
      remaining: total - edited,
    };
  };

  const getEffectiveScore = (item) =>
    state.pendingScores.has(item.index) ? state.pendingScores.get(item.index) : item.common_level;

  const setSaveState = (text, tone) => {
    saveState.textContent = text;
    saveState.dataset.tone = tone || 'neutral';
  };

  const updateToolbar = () => {
    const currentItems = state.selectedGroup ? getItemsForGroup(state.selectedGroup) : [];
    const selectedCount = state.selectedIndexes.size;

    groupTitle.textContent = state.selectedGroup || '未选择';
    groupMeta.textContent = currentItems.length
      ? `当前目录共 ${currentItems.length} 张，已改 ${getProgressStats(currentItems).edited} 张`
      : '请选择左侧目录';

    editToggle.textContent = state.editMode ? '退出编辑' : '进入编辑';
    editToggle.classList.toggle('active', state.editMode);
    clearSelectionButton.disabled = selectedCount === 0 || state.isSaving;
    saveButton.disabled = state.pendingScores.size === 0 || state.isSaving;

    if (!state.editMode) {
      selectionStatus.textContent = '未进入编辑模式';
      return;
    }

    if (selectedCount === 0) {
      selectionStatus.textContent = '编辑模式中，点击图片可多选';
      return;
    }

    selectionStatus.textContent = `已选择 ${selectedCount} 张，点下面分数即可批量标记`;
  };

  const renderSidebar = () => {
    groupList.innerHTML = '';
    const overallStats = getProgressStats(state.items);
    progressRatio.textContent = `${overallStats.edited} / ${overallStats.total}`;
    progressRemaining.textContent = `还有 ${overallStats.remaining} 张没改`;
    pendingCount.textContent = `未保存 ${state.pendingScores.size} 张`;

    getGroupNames().forEach((groupName) => {
      const groupItems = getItemsForGroup(groupName);
      const groupStats = getProgressStats(groupItems);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `group-button ${state.selectedGroup === groupName ? 'active' : ''}`;
      button.addEventListener('click', () => {
        state.selectedGroup = groupName;
        state.selectedIndexes.clear();
        render();
      });

      const name = document.createElement('span');
      name.className = 'group-name';
      name.textContent = groupName;

      const count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = `已改 ${groupStats.edited}/${groupStats.total}，未改 ${groupStats.remaining}`;

      button.append(name, count);
      groupList.append(button);
    });
  };

  const renderScoreButtons = () => {
    scoreActions.innerHTML = '';

    scoreValues.forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-button';
      button.textContent = `${value} 分`;
      button.disabled = !state.editMode || state.selectedIndexes.size === 0 || state.isSaving;
      button.addEventListener('click', () => {
        state.selectedIndexes.forEach((index) => {
          state.pendingScores.set(index, value);
        });
        state.selectedIndexes.clear();
        setSaveState(`已把选中图片标记为 ${value} 分，记得保存`, 'neutral');
        render();
      });
      scoreActions.append(button);
    });
  };

  const renderGrid = () => {
    gridRoot.innerHTML = '';

    if (!state.selectedGroup) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<strong>没有图片目录</strong>';
      gridRoot.append(empty);
      return;
    }

    const items = getItemsForGroup(state.selectedGroup);
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<strong>这个目录下没有图片</strong>';
      gridRoot.append(empty);
      return;
    }

    items.forEach((item) => {
      const card = document.createElement('article');
      const isSelected = state.selectedIndexes.has(item.index);
      const hasPending = state.pendingScores.has(item.index);
      card.className = `image-card ${state.editMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''} ${hasPending ? 'pending' : ''}`;

      if (state.editMode) {
        card.addEventListener('click', () => {
          if (state.selectedIndexes.has(item.index)) {
            state.selectedIndexes.delete(item.index);
          } else {
            state.selectedIndexes.add(item.index);
          }
          render();
        });
      }

      const frame = document.createElement('div');
      frame.className = 'image-frame';

      const image = document.createElement('img');
      image.src = getMediaUrl(item);
      image.alt = item.title || item.normalizedPath;
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        frame.classList.add('missing');
        image.remove();
      });
      frame.append(image);

      const selectPill = document.createElement('span');
      selectPill.className = `select-pill ${isSelected ? 'selected' : ''} ${state.editMode ? 'editable' : 'inactive'}`;
      selectPill.textContent = isSelected ? '✓' : '○';
      selectPill.setAttribute('aria-label', isSelected ? '已选中' : state.editMode ? '可选择' : '未进入编辑模式');
      selectPill.title = isSelected ? '已选中' : state.editMode ? '可选择' : '未进入编辑模式';
      frame.append(selectPill);

      const meta = document.createElement('div');
      meta.className = 'card-meta';

      const title = document.createElement('p');
      title.className = 'card-title';
      title.textContent = item.normalizedPath.split('/').pop() || item.title || `图片 ${item.index + 1}`;

      const footer = document.createElement('div');
      footer.className = 'card-footer';

      const effectiveScore = getEffectiveScore(item);
      const score = document.createElement('span');
      score.className = `score-pill ${Number.isInteger(effectiveScore) ? `score-${effectiveScore}` : 'score-empty'}`;
      score.textContent = `${effectiveScore ?? '-'} 分`;

      const edited = document.createElement('span');
      edited.className = 'edited-pill';
      edited.textContent = hasPending ? '待保存' : item.is_edited ? '已改' : '未改';

      footer.append(score, edited);
      meta.append(title, footer);
      card.append(frame, meta);
      gridRoot.append(card);
    });
  };

  const render = () => {
    renderSidebar();
    renderScoreButtons();
    renderGrid();
    updateToolbar();
  };

  const mergeUpdatedItems = (updatedItems) => {
    const itemMap = new Map(updatedItems.map((item) => [item.index, item]));
    state.items = state.items.map((item) => itemMap.get(item.index) || item);
  };

  const saveBatchScores = async () => {
    if (state.pendingScores.size === 0 || state.isSaving) {
      return;
    }

    state.isSaving = true;
    updateToolbar();
    renderScoreButtons();
    setSaveState('保存中...', 'neutral');

    try {
      const updates = [...state.pendingScores.entries()].map(([index, common_level]) => ({
        index,
        common_level,
      }));
      const response = await fetch('/api/image-score-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({updates}),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '保存失败');
      }

      mergeUpdatedItems(payload.items);
      payload.items.forEach((item) => {
        state.pendingScores.delete(item.index);
      });
      state.selectedIndexes.clear();
      setSaveState(`已保存 ${payload.items.length} 张图片评分`, 'saved');
    } catch (error) {
      setSaveState(error.message || '保存失败', 'error');
    } finally {
      state.isSaving = false;
      render();
    }
  };

  editToggle.addEventListener('click', () => {
    state.editMode = !state.editMode;
    state.selectedIndexes.clear();
    render();
  });

  clearSelectionButton.addEventListener('click', () => {
    state.selectedIndexes.clear();
    render();
  });

  saveButton.addEventListener('click', () => {
    saveBatchScores();
  });

  window.addEventListener('beforeunload', (event) => {
    if (state.pendingScores.size === 0) {
      return;
    }

    event.preventDefault();
    event.returnValue = '';
  });

  const init = async () => {
    try {
      const response = await fetch('/api/catalog-data');
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '加载数据失败');
      }

      const imageCatalog = payload.catalogs.find((catalog) => catalog.id === 'image');
      state.items = imageCatalog ? imageCatalog.items : [];
      state.selectedGroup = getGroupNames()[0] || null;
      setSaveState('已加载图片目录');
      render();
    } catch (error) {
      setSaveState(error.message || '加载失败', 'error');
      gridRoot.innerHTML =
        '<div class="empty-state"><strong>加载失败</strong><span>请检查本地服务是否正常启动。</span></div>';
    }
  };

  init();
})();
