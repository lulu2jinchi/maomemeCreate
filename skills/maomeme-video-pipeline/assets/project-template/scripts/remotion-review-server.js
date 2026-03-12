const fs = require('fs');
const http = require('http');
const path = require('path');
const {spawn} = require('child_process');
const {URL} = require('url');
const {REPO_ROOT, getMimeType} = require('./catalog-editor-lib');
const {rebalanceDialogueTiming} = require('./fit-dialogue-timing');

const STATIC_ROOT = path.join(REPO_ROOT, 'public', 'remotion-review');
const DEFAULT_PORT = Number(process.env.PORT || 3031);
const DEFAULT_STUDIO_PORT = Number(process.env.REMOTION_STUDIO_PORT || 3041);
const TRACK_FILE = path.join(REPO_ROOT, 'track.json');
const OUTPUT_FILE = path.join(REPO_ROOT, 'out', 'review-approved.mp4');
const MAX_LOG_LINES = 160;

const getNpxCommand = () => (process.platform === 'win32' ? 'npx.cmd' : 'npx');

const createProcessState = () => ({
  child: null,
  status: 'idle',
  logs: [],
  startedAt: null,
  finishedAt: null,
  pid: null,
  error: null,
  killTimer: null,
});

const pushLog = (target, source, chunk) => {
  const text = String(chunk || '').trimEnd();
  if (!text) {
    return;
  }

  const timestamp = new Date().toISOString();
  const lines = text.split(/\r?\n/).map((line) => `[${timestamp}] ${source}: ${line}`);
  target.logs.push(...lines);

  if (target.logs.length > MAX_LOG_LINES) {
    target.logs.splice(0, target.logs.length - MAX_LOG_LINES);
  }
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(`${JSON.stringify(payload)}\n`);
};

const sendText = (response, statusCode, message) => {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(message);
};

const sendFile = (response, filePath) => {
  const stream = fs.createReadStream(filePath);
  response.writeHead(200, {
    'Content-Type': getMimeType(filePath),
    'Cache-Control': 'no-store',
  });
  stream.pipe(response);
  stream.on('error', () => {
    if (!response.headersSent) {
      sendText(response, 500, 'Failed to read file');
    } else {
      response.destroy();
    }
  });
};

const readJsonBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
};

const serveStaticFile = (response, pathname) => {
  const requestedPath = pathname === '/remotion-review/' ? 'index.html' : pathname.replace(/^\/remotion-review\//, '');
  const targetPath = requestedPath.endsWith('/') ? `${requestedPath}index.html` : requestedPath;
  const resolvedPath = path.resolve(STATIC_ROOT, targetPath);
  const relativeToRoot = path.relative(STATIC_ROOT, resolvedPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    sendText(response, 400, 'Invalid static path');
    return;
  }

  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    sendText(response, 404, 'Not found');
    return;
  }

  sendFile(response, resolvedPath);
};

const extractSceneNumber = (trackId) => {
  if (!trackId) {
    return null;
  }

  const match = String(trackId).match(/(?:^|_)scene_(\d+)(?:_|$)/);
  return match ? Number(match[1]) : null;
};

const buildSceneSummaries = (trackData) => {
  const scenes = new Map();

  for (const track of trackData.tracks || []) {
    const sceneNumber = extractSceneNumber(track.id);
    if (sceneNumber === null) {
      continue;
    }

    const existing = scenes.get(sceneNumber) || {
      sceneNumber,
      titleTrackId: null,
      title: '',
      subtitles: [],
      characters: [],
      backgrounds: [],
    };

    if (track.type === 'text' && /(^|_)title(_|$)/.test(track.id || '')) {
      existing.titleTrackId = track.id;
      existing.title = track.content || '';
    } else if (track.type === 'text') {
      existing.subtitles.push({
        id: track.id,
        content: track.content || '',
      });
    } else if (track.type === 'video') {
      existing.characters.push({
        id: track.id,
        assetId: track.assetId || '',
        label: track.characterLabel || '',
      });
    } else if (track.type === 'image') {
      existing.backgrounds.push({
        id: track.id,
        assetId: track.assetId || '',
      });
    }

    scenes.set(sceneNumber, existing);
  }

  return [...scenes.values()].sort((left, right) => left.sceneNumber - right.sceneNumber);
};

const loadTrackData = () => {
  const raw = fs.readFileSync(TRACK_FILE, 'utf8');
  return JSON.parse(raw);
};

const saveTrackData = (trackData) => {
  if (!trackData || typeof trackData !== 'object' || Array.isArray(trackData)) {
    const error = new Error('track must be a JSON object');
    error.statusCode = 400;
    throw error;
  }

  const clone = JSON.parse(JSON.stringify(trackData));
  rebalanceDialogueTiming(clone);
  fs.writeFileSync(TRACK_FILE, `${JSON.stringify(clone, null, 2)}\n`, 'utf8');
  return clone;
};

const serializeProcessState = (processState) => ({
  status: processState.status,
  logs: processState.logs,
  startedAt: processState.startedAt,
  finishedAt: processState.finishedAt,
  pid: processState.pid,
  error: processState.error,
});

const createRemotionReviewServer = ({repoRoot = REPO_ROOT} = {}) => {
  const studio = createProcessState();
  const render = createProcessState();
  const outputPath = path.join(repoRoot, path.relative(REPO_ROOT, OUTPUT_FILE));

  const studioUrl = `http://127.0.0.1:${DEFAULT_STUDIO_PORT}`;

  const getStatePayload = () => {
    const trackData = loadTrackData();
    const outputExists = fs.existsSync(outputPath);
    const outputStat = outputExists ? fs.statSync(outputPath) : null;

    return {
      track: trackData,
      scenes: buildSceneSummaries(trackData),
      files: {
        trackPath: path.relative(repoRoot, TRACK_FILE),
        outputPath: path.relative(repoRoot, outputPath),
      },
      studio: {
        ...serializeProcessState(studio),
        port: DEFAULT_STUDIO_PORT,
        url: studioUrl,
      },
      render: {
        ...serializeProcessState(render),
        outputExists,
        outputUrl: outputExists ? `/review-output/latest.mp4?ts=${outputStat.mtimeMs}` : null,
      },
    };
  };

  const attachProcessHooks = (child, processState, label) => {
    child.stdout.on('data', (chunk) => pushLog(processState, label, chunk));
    child.stderr.on('data', (chunk) => pushLog(processState, `${label}:err`, chunk));
    child.on('error', (error) => {
      if (processState.killTimer) {
        clearTimeout(processState.killTimer);
        processState.killTimer = null;
      }
      processState.status = 'error';
      processState.error = error.message;
      processState.finishedAt = new Date().toISOString();
      processState.child = null;
      processState.pid = null;
      pushLog(processState, label, error.message);
    });
    child.on('exit', (code, signal) => {
      if (processState.killTimer) {
        clearTimeout(processState.killTimer);
        processState.killTimer = null;
      }
      processState.child = null;
      processState.pid = null;
      processState.finishedAt = new Date().toISOString();
      if (processState.status === 'stopping') {
        processState.status = 'idle';
        processState.error = null;
        pushLog(processState, label, `Stopped (${signal || code || 'done'})`);
        return;
      }

      if (code === 0) {
        processState.status = 'completed';
        processState.error = null;
      } else {
        processState.status = 'error';
        processState.error = `Exited with code ${code}${signal ? `, signal ${signal}` : ''}`;
      }

      pushLog(processState, label, `Exited (${signal || code || 'done'})`);
    });
  };

  const startStudio = () => {
    if (studio.child) {
      return;
    }

    studio.status = 'starting';
    studio.startedAt = new Date().toISOString();
    studio.finishedAt = null;
    studio.error = null;
    studio.logs = [];

    const child = spawn(getNpxCommand(), ['remotion', 'studio', 'src/index.jsx', '--port', String(DEFAULT_STUDIO_PORT)], {
      cwd: repoRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    studio.child = child;
    studio.pid = child.pid || null;
    attachProcessHooks(child, studio, 'studio');

    const markReady = (chunk) => {
      const text = String(chunk || '');
      if (studio.status === 'starting' && /ready|localhost|http:\/\//i.test(text)) {
        studio.status = 'running';
      }
    };

    child.stdout.on('data', markReady);
    child.stderr.on('data', markReady);
  };

  const stopStudio = () => {
    if (!studio.child) {
      studio.status = 'idle';
      return;
    }

    if (studio.killTimer) {
      clearTimeout(studio.killTimer);
    }
    studio.status = 'stopping';
    studio.child.kill('SIGTERM');
    studio.killTimer = setTimeout(() => {
      if (studio.child) {
        pushLog(studio, 'studio', 'SIGTERM timeout, forcing SIGKILL');
        studio.child.kill('SIGKILL');
      }
    }, 2000);
  };

  const startRender = () => {
    if (render.child) {
      const error = new Error('Render is already running');
      error.statusCode = 409;
      throw error;
    }

    const trackData = saveTrackData(loadTrackData());
    const compositionId = trackData.composition?.id || 'CatMemeMain';

    fs.mkdirSync(path.dirname(outputPath), {recursive: true});

    render.status = 'running';
    render.startedAt = new Date().toISOString();
    render.finishedAt = null;
    render.error = null;
    render.logs = [];

    const child = spawn(
      getNpxCommand(),
      ['remotion', 'render', 'src/index.jsx', compositionId, path.relative(repoRoot, outputPath)],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    render.child = child;
    render.pid = child.pid || null;
    attachProcessHooks(child, render, 'render');
  };

  const stopRender = () => {
    if (!render.child) {
      return;
    }

    if (render.killTimer) {
      clearTimeout(render.killTimer);
    }
    render.status = 'stopping';
    render.child.kill('SIGTERM');
    render.killTimer = setTimeout(() => {
      if (render.child) {
        pushLog(render, 'render', 'SIGTERM timeout, forcing SIGKILL');
        render.child.kill('SIGKILL');
      }
    }, 2000);
  };

  const server = http.createServer(async (request, response) => {
    const method = request.method || 'GET';
    const url = new URL(request.url || '/', 'http://localhost');
    const {pathname} = url;

    try {
      if (method === 'GET' && pathname === '/api/review-data') {
        sendJson(response, 200, getStatePayload());
        return;
      }

      if (method === 'POST' && pathname === '/api/review-track') {
        const body = await readJsonBody(request);
        const track = saveTrackData(body.track);
        sendJson(response, 200, {
          ok: true,
          track,
          scenes: buildSceneSummaries(track),
        });
        return;
      }

      if (method === 'POST' && pathname === '/api/review-studio/start') {
        startStudio();
        sendJson(response, 200, {ok: true, studio: serializeProcessState(studio)});
        return;
      }

      if (method === 'POST' && pathname === '/api/review-studio/stop') {
        stopStudio();
        sendJson(response, 200, {ok: true, studio: serializeProcessState(studio)});
        return;
      }

      if (method === 'POST' && pathname === '/api/review-render/start') {
        startRender();
        sendJson(response, 200, {ok: true, render: serializeProcessState(render)});
        return;
      }

      if (method === 'POST' && pathname === '/api/review-render/stop') {
        stopRender();
        sendJson(response, 200, {ok: true, render: serializeProcessState(render)});
        return;
      }

      if (method === 'GET' && pathname === '/review-output/latest.mp4') {
        if (!fs.existsSync(outputPath)) {
          sendText(response, 404, 'Render output not found');
          return;
        }

        sendFile(response, outputPath);
        return;
      }

      if (method === 'GET' && (pathname === '/remotion-review' || pathname === '/remotion-review/' || pathname.startsWith('/remotion-review/'))) {
        const targetPath = pathname === '/remotion-review' ? '/remotion-review/' : pathname;
        serveStaticFile(response, targetPath);
        return;
      }

      if (method === 'GET' && pathname === '/') {
        response.writeHead(302, {Location: '/remotion-review/'});
        response.end();
        return;
      }

      sendText(response, 404, 'Not found');
    } catch (error) {
      const statusCode = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected server error',
      });
    }
  });

  const teardown = () => {
    stopStudio();
    stopRender();
  };

  process.on('SIGINT', teardown);
  process.on('SIGTERM', teardown);

  return server;
};

if (require.main === module) {
  const server = createRemotionReviewServer();

  server.listen(DEFAULT_PORT, () => {
    process.stdout.write(`Remotion review app running at http://localhost:${DEFAULT_PORT}/remotion-review/\n`);
  });
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_STUDIO_PORT,
  OUTPUT_FILE,
  STATIC_ROOT,
  TRACK_FILE,
  buildSceneSummaries,
  createRemotionReviewServer,
};
