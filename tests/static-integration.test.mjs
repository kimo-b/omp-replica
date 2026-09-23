import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import test from 'node:test';
import vm from 'node:vm';

const serverURL = new URL('../server.mjs', import.meta.url);

// Exercise the local server handler without a socket, browser, or GPU.
async function localHandler() {
  let handler;
  const context = vm.createContext({ URL, process: { env: {} }, console: { log() {} } });
  const dependencies = {
    'node:fs/promises': fs,
    'node:path': path,
    'node:url': url,
    'node:http': { createServer(callback) { handler = callback; return { listen() {} }; } },
  };
  const server = new vm.SourceTextModule(await fs.readFile(serverURL, 'utf8'), {
    context,
    initializeImportMeta(meta) { meta.url = serverURL.href; },
  });
  await server.link((specifier) => {
    const dependency = dependencies[specifier];
    assert.ok(dependency, `unexpected server dependency: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(dependency), function initialize() {
      for (const [key, value] of Object.entries(dependency)) this.setExport(key, value);
    }, { context });
  });
  await server.evaluate();
  return async (requestPath) => {
    const response = {};
    await handler({ url: requestPath }, {
      writeHead(status, headers = {}) { response.status = status; response.headers = headers; },
      end(body) { response.body = body; },
    });
    return response;
  };
}

test('Blackbit page serves its owned assets and all internal destinations', async () => {
  const request = await localHandler();
  const page = await request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers['Content-Type'], /^text\/html/);
  const html = page.body.toString();
  for (const name of ['Blackbit Zero', 'Blackbit VOID', 'Blackbit Bay']) assert.ok(html.includes(name));
  assert.equal([...html.matchAll(/data-product-panel="(zero|void|bay)"/g)].length, 3);
  assert.ok(!/data-product-panel="(?:zero|void|bay)"[^>]*\shidden\b/.test(html), 'all product stories remain in no-JavaScript HTML');
  for (const forbidden of ['omp.sh', 'Stencil Labs', '95/100', 'ahead of Mythos']) assert.ok(!html.includes(forbidden));
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const hash of [...html.matchAll(/\bhref="#([^"]+)"/g)].map((match) => match[1])) {
    assert.ok(ids.has(hash), `broken internal destination: #${hash}`);
  }

  const sources = [...new Set([...html.matchAll(/(?:src|href)="(\/[^\"]+)"/g)].map((match) => match[1]))];
  for (const source of sources) {
    const asset = await request(source);
    assert.equal(asset.status, 200, `missing local resource: ${source}`);
    assert.ok(asset.body.length > 0);
    if (source.endsWith('.svg')) {
      assert.equal(asset.headers['Content-Type'], 'image/svg+xml');
      assert.match(asset.body.toString(), /^<svg/);
    }
  }
});

test('the Blackbit JavaScript and Three.js import graphs resolve with module MIME', async () => {
  const request = await localHandler();
  const visited = new Set();
  async function inspect(moduleURL) {
    if (visited.has(moduleURL.pathname)) return;
    visited.add(moduleURL.pathname);
    const response = await request(moduleURL.pathname);
    assert.equal(response.status, 200, `missing module: ${moduleURL.pathname}`);
    assert.match(response.headers['Content-Type'], /^text\/javascript/);
    const module = new vm.SourceTextModule(response.body.toString());
    for (const dependency of module.dependencySpecifiers) {
      assert.ok(dependency.startsWith('.') || dependency.startsWith('/'), `unmapped import: ${dependency}`);
      await inspect(new URL(dependency, moduleURL));
    }
  }
  await inspect(new URL('https://local.invalid/app.mjs'));
  await inspect(new URL('https://local.invalid/scope-scene.mjs'));
  for (const required of ['/app.mjs', '/navigation.mjs', '/scope-scene.mjs', '/node_modules/three/build/three.module.js', '/node_modules/three/build/three.core.js']) {
    assert.ok(visited.has(required), `missing module in graph: ${required}`);
  }
});

test('preview server does not expose repository metadata or working notes', async () => {
  const request = await localHandler();
  for (const pathname of ['/.git/config', '/.scratch/blackbit-landing/checklist.md', '/tests/navigation.test.mjs', '/package-lock.json']) {
    const response = await request(pathname);
    assert.equal(response.status, 404, pathname);
  }
});
