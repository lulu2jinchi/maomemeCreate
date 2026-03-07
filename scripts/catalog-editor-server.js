const fs = require('fs');
const http = require('http');
const path = require('path');
const {URL} = require('url');
const {
  REPO_ROOT,
  deleteCatalogItem,
  getMimeType,
  loadCatalogData,
  resolveMediaFilePath,
  updateCatalogItem,
} = require('./catalog-editor-lib');

const STATIC_ROOT = path.join(REPO_ROOT, 'public', 'catalog-editor');
const DEFAULT_PORT = Number(process.env.PORT || 3030);

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

const serveStaticFile = (response, pathname) => {
  const requestedPath = pathname === '/catalog-editor/' ? 'index.html' : pathname.replace(/^\/catalog-editor\//, '');
  const resolvedPath = path.resolve(STATIC_ROOT, requestedPath);
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

const readJsonBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody);
};

const createCatalogEditorServer = ({repoRoot = REPO_ROOT} = {}) => {
  return http.createServer(async (request, response) => {
    const method = request.method || 'GET';
    const url = new URL(request.url || '/', 'http://localhost');
    const {pathname} = url;

    try {
      if (method === 'GET' && pathname === '/api/catalog-data') {
        sendJson(response, 200, loadCatalogData({repoRoot}));
        return;
      }

      if (method === 'POST' && pathname === '/api/catalog-item') {
        const body = await readJsonBody(request);
        const updatedItem = updateCatalogItem({
          catalogId: body.catalogId,
          index: body.index,
          description: body.description,
          commonLevel: body.common_level,
          repoRoot,
        });

        sendJson(response, 200, {item: updatedItem});
        return;
      }

      if (method === 'DELETE' && pathname === '/api/catalog-item') {
        const body = await readJsonBody(request);
        const result = deleteCatalogItem({
          catalogId: body.catalogId,
          index: body.index,
          repoRoot,
        });

        sendJson(response, 200, result);
        return;
      }

      if (method === 'GET' && pathname.startsWith('/media/image/')) {
        const relativePath = decodeURIComponent(pathname.slice('/media/image/'.length));
        const filePath = resolveMediaFilePath({
          catalogId: 'image',
          relativePath,
          repoRoot,
        });

        if (!fs.existsSync(filePath)) {
          sendText(response, 404, 'Image not found');
          return;
        }

        sendFile(response, filePath);
        return;
      }

      if (method === 'GET' && pathname.startsWith('/media/video/')) {
        const relativePath = decodeURIComponent(pathname.slice('/media/video/'.length));
        const filePath = resolveMediaFilePath({
          catalogId: 'describe',
          relativePath,
          repoRoot,
        });

        if (!fs.existsSync(filePath)) {
          sendText(response, 404, 'Video not found');
          return;
        }

        sendFile(response, filePath);
        return;
      }

      if (method === 'GET' && (pathname === '/catalog-editor' || pathname === '/catalog-editor/' || pathname.startsWith('/catalog-editor/'))) {
        const targetPath = pathname === '/catalog-editor' ? '/catalog-editor/' : pathname;
        serveStaticFile(response, targetPath);
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
};

if (require.main === module) {
  const server = createCatalogEditorServer();

  server.listen(DEFAULT_PORT, () => {
    process.stdout.write(`Catalog editor running at http://localhost:${DEFAULT_PORT}/catalog-editor/\n`);
  });
}

module.exports = {
  DEFAULT_PORT,
  STATIC_ROOT,
  createCatalogEditorServer,
};
