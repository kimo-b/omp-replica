import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import * as THREE from '../node_modules/three/build/three.module.js';

const root = fileURLToPath(new URL('../', import.meta.url));

class Events {
  listeners = new Map();
  addEventListener(name, listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(listener);
  }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  emit(name) {
    const event = { preventDefault() { this.defaultPrevented = true; }, defaultPrevented: false };
    for (const listener of this.listeners.get(name) || []) listener(event);
    return event;
  }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}

async function setup(t, { width = 960, height = 700 } = {}) {
  const time = { now: 0 };
  const document = Object.assign(new Events(), { visibilityState: 'visible' });
  const window = Object.assign(new Events(), { devicePixelRatio: 3 });
  const canvas = new Events();
  const classes = new Set();
  const container = {
    classList: { add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); } },
    getBoundingClientRect() { return { width, height }; },
  };
  let intersection;
  class FakeIntersectionObserver {
    constructor(callback) { this.callback = callback; intersection = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
    update(isIntersecting) { this.callback([{ isIntersecting }]); }
  }
  let resizeObserver;
  class FakeResizeObserver {
    constructor(callback) { this.callback = callback; resizeObserver = this; }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const instances = [];
  class FakeRenderer {
    constructor() { this.debug = {}; this.frames = []; this.disposals = 0; instances.push(this); }
    setPixelRatio(value) { this.pixelRatio = value; }
    setClearColor() {}
    setSize(w, h) { this.size = [w, h]; }
    setAnimationLoop(callback) { this.loop = callback; }
    render(scene, camera) {
      if (this.fail) throw new Error('GPU failed');
      this.scene = scene;
      this.camera = camera;
      this.frames.push({ at: time.now, stageY: scene.children[0].position.y });
    }
    dispose() { this.disposals += 1; }
  }
  const context = vm.createContext({
    window, document, ResizeObserver: FakeResizeObserver, IntersectionObserver: FakeIntersectionObserver,
    performance: { now: () => time.now }, console,
  });
  const three = new vm.SyntheticModule(Object.keys(THREE), function initialize() {
    for (const key of Object.keys(THREE)) this.setExport(key, key === 'WebGLRenderer' ? FakeRenderer : THREE[key]);
  }, { context });
  const source = new vm.SourceTextModule(await readFile(resolve(root, 'scope-scene.mjs'), 'utf8'), { context });
  await source.link((specifier) => {
    assert.equal(specifier, '/node_modules/three/build/three.module.js');
    return three;
  });
  await source.evaluate();
  const api = source.namespace.initScopeScene({ canvas, container });
  const renderer = instances[0];
  t.after(() => api.dispose());
  return {
    api, renderer, canvas, container, document, window, intersection, resizeObserver, time,
    step(ms = 40) { time.now += ms; renderer.loop?.(time.now); },
  };
}

test('scene is bounded, seeded once, and drawn at a capped device ratio', async (t) => {
  const h = await setup(t);
  assert.equal(h.renderer.pixelRatio, 1.5);
  assert.deepEqual(h.renderer.size, [960, 700]);
  assert.equal(h.container.classList.contains('scene-ready'), true);
  const stage = h.renderer.scene.children[0];
  const points = stage.children.find((child) => child.isPoints);
  assert.ok(points.geometry.attributes.position.count <= 6000);
  assert.equal(points.material.depthWrite, false);
  const geometry = points.geometry;
  h.api.setPointer(2, -1);
  for (let index = 0; index < 90; index += 1) h.step();
  assert.ok(Math.abs(stage.rotation.y) <= .09);
  assert.ok(Math.abs(stage.rotation.x) <= .055);
  assert.equal(points.geometry, geometry, 'no per-frame geometry replacement');
  const before = h.renderer.frames.length;
  h.step(1);
  assert.equal(h.renderer.frames.length, before, 'sub-30fps call is skipped');
});

test('visibility, intersection, and context loss pause the scene and preserve the still', async (t) => {
  const h = await setup(t);
  h.document.visibilityState = 'hidden';
  h.document.emit('visibilitychange');
  assert.equal(h.renderer.loop, null);
  h.document.visibilityState = 'visible';
  h.document.emit('visibilitychange');
  assert.equal(typeof h.renderer.loop, 'function');
  h.intersection.update(false);
  assert.equal(h.renderer.loop, null);
  h.intersection.update(true);
  assert.equal(typeof h.renderer.loop, 'function');
  const lost = h.canvas.emit('webglcontextlost');
  assert.equal(lost.defaultPrevented, true);
  assert.equal(h.renderer.loop, null);
  assert.equal(h.container.classList.contains('scene-ready'), false);
  h.canvas.emit('webglcontextrestored');
  assert.equal(typeof h.renderer.loop, 'function');
  assert.equal(h.container.classList.contains('scene-ready'), true);
});

test('render failure falls back and disposal releases listeners and GPU objects', async (t) => {
  const h = await setup(t);
  h.renderer.fail = true;
  h.step();
  assert.equal(h.renderer.loop, null);
  assert.equal(h.container.classList.contains('scene-ready'), false);
  h.api.dispose();
  h.api.dispose();
  assert.equal(h.renderer.disposals, 1);
  assert.equal(h.document.count(), 0);
  assert.equal(h.canvas.count(), 0);
  assert.equal(h.window.count(), 0);
  assert.equal(h.intersection.disconnected, true);
  assert.equal(h.resizeObserver.disconnected, true);
});
