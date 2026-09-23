import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicFiles = new Set([
  '/index.html', '/styles.css', '/app.mjs', '/navigation.mjs', '/scope-scene.mjs',
  '/assets/blackbit-wordmark.svg', '/assets/blackbit-zero.svg',
  '/assets/blackbit-void.svg', '/assets/blackbit-bay.svg',
  '/node_modules/three/build/three.module.js', '/node_modules/three/build/three.core.js',
]);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const requestPath = req.url?.split('?')[0] || '/';
  const pathname = requestPath === '/' ? '/index.html' : requestPath;
  if (!publicFiles.has(pathname)) { res.writeHead(404); res.end('Not found'); return; }
  const assetRoot = pathname.startsWith('/assets/') ? join(root, 'public') : root;
  const file = normalize(join(assetRoot, pathname));
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}).listen(process.env.PORT || 4173, '127.0.0.1', () => {
  console.log(`Blackbit preview running at http://localhost:${process.env.PORT || 4173}`);
});
