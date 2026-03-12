(function () {
  const state = {
    track: null,
    draftTrack: null,
    studioUrl: '',
    dirty: false,
    isSaving: false,
    pollTimer: null,
  };

  const saveState = document.getElementById('save-state');
  const studioState = document.getElementById('studio-state');
  const renderState = document.getElementById('render-state');
  const saveButton = document.getElementById('save-button');
  const reloadButton = document.getElementById('reload-button');
  const startStudioButton = document.getElementById('start-studio-button');
  const refreshPreviewButton = document.getElementById('refresh-preview-button');
  const stopStudioButton = document.getElementById('stop-studio-button');
  const renderButton = document.getElementById('render-button');
  const stopRenderButton = document.getElementById('stop-render-button');
  const metaTitleInput = document.getElementById('meta-title-input');
  const metaNotesInput = document.getElementById('meta-notes-input');
  const trackPath = document.getElementById('track-path');
  const sceneCount = document.getElementById('scene-count');
  const sceneList = document.getElementById('scene-list');
  const rawJsonInput = document.getElementById('raw-json-input');
  const syncJsonButton = document.getElementById('sync-json-button');
  const applyJsonButton = document.getElementById('apply-json-button');
  const previewFrame = document.getElementById('preview-frame');
  const previewPlaceholder = document.getElementById('preview-placeholder');
  const studioLink = document.getElementById('studio-link');
  const outputLink = document.getElementById('output-link');
  const outputPreview = document.getElementById('output-preview');
  const outputVideo = document.getElementById('output-video');
  const studioLog = document.getElementById('studio-log');
  const renderLog = document.getElementById('render-log');
  const studioMeta = document.getElementById('studio-meta');
  const renderMeta = document.getElementById('render-meta');

  const sceneIdPattern = /(?:^|_)scene_(\d+)(?:_|$)/;

  const requestJson = async (url, options) => {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Request failed: ${response.status}`);
    }

    return payload;
  };

  const formatStatus = (value) => {
    const map = {
      idle: '空闲',
      starting: '启动中',
      running: '运行中',
      stopping: '停止中',
      completed: '已完成',
      error: '失败',
    };

    return map[value] || value || '未知';
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));

  const extractSceneNumber = (trackId) => {
    if (!trackId) {
      return null;
    }

    const match = String(trackId).match(sceneIdPattern);
    return match ? Number(match[1]) : null;
  };

  const buildScenes = (track) => {
    const scenes = new Map();

    (track.tracks || []).forEach((item) => {
      const sceneNumber = extractSceneNumber(item.id);
      if (sceneNumber === null) {
        return;
      }

      const scene = scenes.get(sceneNumber) || {
        sceneNumber,
        title: null,
        subtitles: [],
        characters: [],
        backgrounds: [],
      };

      if (item.type === 'text' && /(^|_)title(_|$)/.test(item.id || '')) {
        scene.title = item;
      } else if (item.type === 'text') {
        scene.subtitles.push(item);
      } else if (item.type === 'video') {
        scene.characters.push(item);
      } else if (item.type === 'image') {
        scene.backgrounds.push(item);
      }

      scenes.set(sceneNumber, scene);
    });

    return [...scenes.values()].sort((left, right) => left.sceneNumber - right.sceneNumber);
  };

  const setDirty = (value) => {
    state.dirty = value;
    saveButton.disabled = state.isSaving || !state.dirty;
    if (state.isSaving) {
      saveState.textContent = '保存中';
      return;
    }

    saveState.textContent = state.dirty ? '有未保存改动' : '已同步到 track.json';
  };

  const renderTrackMeta = () => {
    metaTitleInput.value = state.draftTrack?.meta?.title || '';
    metaNotesInput.value = state.draftTrack?.meta?.notes || '';
    rawJsonInput.value = JSON.stringify(state.draftTrack, null, 2);
  };

  const createField = ({label, value, onInput, multiline = false, rows = 3, placeholder = ''}) => {
    const wrap = document.createElement('label');
    wrap.className = 'field';

    const title = document.createElement('span');
    title.textContent = label;

    const control = multiline ? document.createElement('textarea') : document.createElement('input');
    if (multiline) {
      control.rows = rows;
    } else {
      control.type = 'text';
    }
    control.value = value || '';
    control.placeholder = placeholder;
    control.addEventListener('input', (event) => {
      onInput(event.target.value);
      setDirty(true);
    });

    wrap.append(title, control);
    return wrap;
  };

  const renderScenes = () => {
    const scenes = buildScenes(state.draftTrack || {tracks: []});
    sceneCount.textContent = `${scenes.length} 场`;
    sceneList.innerHTML = '';

    if (scenes.length === 0) {
      sceneList.innerHTML = `
        <div class="placeholder-card">
          <strong>没有找到可编辑场景</strong>
          <span>请确认 \`track.json\` 里的 track id 含有 \`scene_数字\`。</span>
        </div>
      `;
      return;
    }

    scenes.forEach((scene) => {
      const card = document.createElement('article');
      card.className = 'scene-item';

      const head = document.createElement('div');
      head.className = 'scene-head';
      head.innerHTML = `
        <div>
          <h3>Scene ${scene.sceneNumber}</h3>
          <div class="scene-meta">
            <span>背景: ${scene.backgrounds.map((item) => item.assetId || item.id).join(' / ') || '无'}</span>
            <span>角色: ${scene.characters.map((item) => item.characterLabel || item.assetId || item.id).join(' / ') || '无'}</span>
          </div>
        </div>
      `;
      card.append(head);

      if (scene.title) {
        card.append(
          createField({
            label: '场景标题',
            value: scene.title.content,
            rows: 2,
            multiline: true,
            onInput: (nextValue) => {
              scene.title.content = nextValue;
            },
          }),
        );
      }

      const compactGrid = document.createElement('div');
      compactGrid.className = 'compact-grid';
      const firstBackground = scene.backgrounds[0];
      compactGrid.append(
        createField({
          label: '背景 assetId',
          value: firstBackground?.assetId || '',
          onInput: (nextValue) => {
            if (firstBackground) {
              firstBackground.assetId = nextValue.trim();
            }
          },
          placeholder: '例如 bg_office_open',
        }),
      );
      compactGrid.append(
        createField({
          label: '场景备注',
          value: `${scene.subtitles.length} 条字幕 / ${scene.characters.length} 个角色`,
          onInput: () => {},
          placeholder: '',
        }),
      );
      compactGrid.lastChild.querySelector('input').disabled = true;
      card.append(compactGrid);

      const characterList = document.createElement('div');
      characterList.className = 'character-list';
      scene.characters.forEach((character, index) => {
        const item = document.createElement('div');
        item.className = 'character-item';
        const title = document.createElement('strong');
        title.textContent = `角色 ${index + 1}`;
        item.append(title);
        item.append(
          createField({
            label: '显示名',
            value: character.characterLabel || '',
            onInput: (nextValue) => {
              character.characterLabel = nextValue;
            },
            placeholder: '例如 实习生',
          }),
        );
        item.append(
          createField({
            label: '视频 assetId',
            value: character.assetId || '',
            onInput: (nextValue) => {
              character.assetId = nextValue.trim();
            },
            placeholder: '例如 intern_focus',
          }),
        );
        characterList.append(item);
      });
      if (scene.characters.length > 0) {
        card.append(characterList);
      }

      const subtitleList = document.createElement('div');
      subtitleList.className = 'subtitle-list';
      scene.subtitles.forEach((subtitle, index) => {
        const item = document.createElement('div');
        item.className = 'subtitle-item';
        const title = document.createElement('strong');
        title.textContent = `字幕 ${index + 1}`;
        item.append(title);
        item.append(
          createField({
            label: subtitle.id,
            value: subtitle.content,
            rows: 3,
            multiline: true,
            onInput: (nextValue) => {
              subtitle.content = nextValue;
            },
          }),
        );
        subtitleList.append(item);
      });
      card.append(subtitleList);

      sceneList.append(card);
    });
  };

  const renderProcessState = (payload) => {
    studioState.textContent = formatStatus(payload.studio.status);
    renderState.textContent = formatStatus(payload.render.status);
    studioMeta.textContent = payload.studio.pid ? `PID ${payload.studio.pid}` : '等待启动';
    renderMeta.textContent = payload.render.pid ? `PID ${payload.render.pid}` : '还没开始';
    studioLog.textContent = payload.studio.logs.length > 0 ? payload.studio.logs.join('\n') : '等待启动 Remotion Studio...';
    renderLog.textContent = payload.render.logs.length > 0 ? payload.render.logs.join('\n') : '确认版本后，点“确认导出 MP4”。';

    state.studioUrl = payload.studio.url;
    studioLink.href = payload.studio.url;

    const studioRunning = payload.studio.status === 'running' || payload.studio.status === 'starting';
    previewPlaceholder.classList.toggle('hidden', studioRunning);
    previewFrame.classList.toggle('hidden', !studioRunning);
    startStudioButton.disabled = studioRunning;
    stopStudioButton.disabled = !studioRunning;

    renderButton.disabled = payload.render.status === 'running' || payload.render.status === 'starting';
    stopRenderButton.disabled = !(payload.render.status === 'running' || payload.render.status === 'starting');

    if (payload.render.outputUrl) {
      if (outputLink.href !== new URL(payload.render.outputUrl, window.location.origin).href) {
        outputLink.href = payload.render.outputUrl;
      }
      outputLink.classList.remove('hidden');
      outputPreview.classList.remove('hidden');
      if (outputVideo.src !== new URL(payload.render.outputUrl, window.location.origin).href) {
        outputVideo.src = payload.render.outputUrl;
      }
    } else {
      outputLink.classList.add('hidden');
      outputPreview.classList.add('hidden');
      outputVideo.removeAttribute('src');
    }
  };

  const refreshPreviewFrame = () => {
    if (!state.studioUrl) {
      return;
    }

    previewFrame.src = `${state.studioUrl}/?fromReview=1&ts=${Date.now()}`;
  };

  const loadData = async ({preserveDraft = false} = {}) => {
    const payload = await requestJson('/api/review-data');

    trackPath.textContent = payload.files.trackPath;
    renderProcessState(payload);

    if (!preserveDraft || !state.draftTrack) {
      state.track = clone(payload.track);
      state.draftTrack = clone(payload.track);
      renderTrackMeta();
      renderScenes();
      setDirty(false);
    }
  };

  const saveTrack = async () => {
    if (!state.draftTrack) {
      return;
    }

    state.isSaving = true;
    saveButton.disabled = true;
    saveState.textContent = '保存中';

    try {
      const payload = await requestJson('/api/review-track', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({track: state.draftTrack}),
      });

      state.track = clone(payload.track);
      state.draftTrack = clone(payload.track);
      renderTrackMeta();
      renderScenes();
      setDirty(false);
      await loadData({preserveDraft: true});
      refreshPreviewFrame();
    } finally {
      state.isSaving = false;
      saveButton.disabled = !state.dirty;
    }
  };

  metaTitleInput.addEventListener('input', (event) => {
    if (!state.draftTrack) {
      return;
    }

    state.draftTrack.meta = state.draftTrack.meta || {};
    state.draftTrack.meta.title = event.target.value;
    setDirty(true);
  });

  metaNotesInput.addEventListener('input', (event) => {
    if (!state.draftTrack) {
      return;
    }

    state.draftTrack.meta = state.draftTrack.meta || {};
    state.draftTrack.meta.notes = event.target.value;
    setDirty(true);
  });

  saveButton.addEventListener('click', async () => {
    try {
      await saveTrack();
    } catch (error) {
      window.alert(error.message);
      setDirty(true);
    }
  });

  reloadButton.addEventListener('click', async () => {
    const shouldContinue = !state.dirty || window.confirm('当前有未保存改动，确认丢弃并重新载入吗？');
    if (!shouldContinue) {
      return;
    }

    try {
      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  });

  startStudioButton.addEventListener('click', async () => {
    try {
      await requestJson('/api/review-studio/start', {method: 'POST'});
      await loadData({preserveDraft: true});
      refreshPreviewFrame();
    } catch (error) {
      window.alert(error.message);
    }
  });

  stopStudioButton.addEventListener('click', async () => {
    try {
      await requestJson('/api/review-studio/stop', {method: 'POST'});
      await loadData({preserveDraft: true});
    } catch (error) {
      window.alert(error.message);
    }
  });

  refreshPreviewButton.addEventListener('click', () => {
    refreshPreviewFrame();
  });

  renderButton.addEventListener('click', async () => {
    try {
      if (state.dirty) {
        const shouldSave = window.confirm('导出前需要先保存改动。现在保存并开始导出吗？');
        if (!shouldSave) {
          return;
        }

        await saveTrack();
      }

      await requestJson('/api/review-render/start', {method: 'POST'});
      await loadData({preserveDraft: true});
    } catch (error) {
      window.alert(error.message);
    }
  });

  stopRenderButton.addEventListener('click', async () => {
    try {
      await requestJson('/api/review-render/stop', {method: 'POST'});
      await loadData({preserveDraft: true});
    } catch (error) {
      window.alert(error.message);
    }
  });

  syncJsonButton.addEventListener('click', () => {
    rawJsonInput.value = JSON.stringify(state.draftTrack, null, 2);
  });

  applyJsonButton.addEventListener('click', () => {
    try {
      const nextTrack = JSON.parse(rawJsonInput.value);
      state.draftTrack = nextTrack;
      renderTrackMeta();
      renderScenes();
      setDirty(true);
    } catch (error) {
      window.alert(`JSON 解析失败: ${error.message}`);
    }
  });

  const startPolling = () => {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
    }

    state.pollTimer = window.setInterval(async () => {
      try {
        await loadData({preserveDraft: true});
      } catch (error) {
        studioMeta.textContent = error.message;
      }
    }, 3000);
  };

  const boot = async () => {
    try {
      await loadData();
      startPolling();
    } catch (error) {
      saveState.textContent = '载入失败';
      sceneList.innerHTML = `
        <div class="placeholder-card">
          <strong>页面初始化失败</strong>
          <span>${error.message}</span>
        </div>
      `;
    }
  };

  boot();
})();
