import * as THREE from '/node_modules/three/build/three.module.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function fieldGeometry() {
  const random = seededRandom(0xb1acb17);
  const positions = [];
  const colors = [];
  const blue = new THREE.Color('#3253ff');
  const lime = new THREE.Color('#b9ffa1');
  const quiet = new THREE.Color('#536576');
  const color = new THREE.Color();

  // This seeded field is illustration only. It is never derived from target,
  // authorization, inference, or scan data.
  for (let lane = 0; lane < 30; lane += 1) {
    const offset = (lane - 14.5) / 14.5;
    const phase = random() * Math.PI * 2;
    for (let step = 0; step < 190; step += 1) {
      if (random() < .18) continue;
      const u = step / 189;
      const x = -4.5 + 9 * u + (random() - .5) * .085;
      const width = .7 + 1.15 * Math.abs(u - .5);
      const y = offset * width * 1.52 + Math.sin(u * 6.1 + phase) * .115 + (random() - .5) * .075;
      const z = Math.sin(u * Math.PI) * Math.cos(lane * .27) * .54 + offset * .6 + (random() - .5) * .1;
      const inside = Math.abs(x) < 1.48 && Math.abs(y) < 1.36;
      color.copy(inside ? blue : quiet);
      if (inside) color.lerp(lime, .28 + u * .6);
      else color.multiplyScalar(.35 + random() * .4);
      positions.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function aperture() {
  const group = new THREE.Group();
  const corners = [[-1.5, -1.38], [1.5, -1.38], [1.5, 1.38], [-1.5, 1.38]];
  const vertices = [];
  for (const z of [-.42, .62]) {
    for (let index = 0; index < 4; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % 4];
      vertices.push(a[0], a[1], z, b[0], b[1], z);
    }
  }
  for (const corner of corners) {
    vertices.push(corner[0], corner[1], -.42, corner[0], corner[1], .62);
  }
  const outline = new THREE.BufferGeometry();
  outline.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  group.add(new THREE.LineSegments(outline, new THREE.LineBasicMaterial({ color: '#8da7a7', transparent: true, opacity: .66 })));
  group.add(new THREE.Mesh(
    new THREE.PlaneGeometry(3, 2.76),
    new THREE.MeshBasicMaterial({ color: '#3253ff', transparent: true, opacity: .045, depthWrite: false, side: THREE.DoubleSide }),
  ));
  const sweepGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -1.38, .7),
    new THREE.Vector3(0, 1.38, .7),
  ]);
  const sweep = new THREE.Line(sweepGeometry, new THREE.LineBasicMaterial({ color: '#b9ffa1', transparent: true, opacity: .44 }));
  group.add(sweep);
  return { group, sweep };
}

export function initScopeScene({ canvas, container }) {
  if (!canvas || !container) throw new Error('Scope scene needs a canvas and container');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'default' });
  } catch (error) {
    container.classList.remove('scene-ready');
    throw error;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  if (renderer.debug) renderer.debug.onShaderError = () => { throw new Error('Scope material failed to compile'); };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 30);
  camera.position.set(0, .05, 9.2);
  const stage = new THREE.Group();
  stage.add(new THREE.Points(fieldGeometry(), new THREE.PointsMaterial({
    size: .033,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: .94,
    depthWrite: false,
  })));
  const { group, sweep } = aperture();
  stage.add(group);
  scene.add(stage);

  let disposed = false;
  let failed = false;
  let contextLost = false;
  let intersecting = true;
  let running = false;
  let lastFrame = 0;
  let elapsed = 0;
  let pointerX = .5;
  let pointerY = .5;
  let currentX = .5;
  let currentY = .5;

  function stop() {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
    lastFrame = 0;
  }

  function fail() {
    failed = true;
    stop();
    container.classList.remove('scene-ready');
  }

  function draw(time) {
    if (disposed || failed || contextLost || document.visibilityState === 'hidden' || !intersecting) return;
    const now = Number.isFinite(time) ? time : performance.now();
    if (lastFrame && now - lastFrame < 1000 / 30) return;
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 0;
    lastFrame = now;
    elapsed += delta;
    currentX += (pointerX - currentX) * .065;
    currentY += (pointerY - currentY) * .065;
    stage.rotation.y = (currentX - .5) * .18;
    stage.rotation.x = (currentY - .5) * -.11;
    stage.position.y = Math.sin(elapsed * .35) * .035;
    sweep.position.x = (currentX - .5) * 2.6;
    try {
      renderer.render(scene, camera);
      container.classList.add('scene-ready');
    } catch {
      fail();
    }
  }

  function syncLoop() {
    const shouldRun = !disposed && !failed && !contextLost && intersecting && document.visibilityState !== 'hidden';
    if (shouldRun === running) return;
    if (!shouldRun) { stop(); return; }
    running = true;
    lastFrame = 0;
    renderer.setAnimationLoop(draw);
    draw(performance.now());
  }

  function resize() {
    if (disposed || failed || contextLost) return;
    const { width, height } = container.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    renderer.setSize(Math.round(width), Math.round(height), false);
    camera.aspect = width / height;
    camera.position.z = width < 650 ? 11 : 9.2;
    camera.updateProjectionMatrix();
    lastFrame = 0;
    draw(performance.now());
  }

  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    stop();
    container.classList.remove('scene-ready');
  }
  function onContextRestored() {
    contextLost = false;
    resize();
    syncLoop();
  }

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(container);
  const intersectionObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; syncLoop(); }, { threshold: .01 })
    : null;
  intersectionObserver?.observe(container);
  document.addEventListener('visibilitychange', syncLoop);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  window.addEventListener('resize', resize, { passive: true });
  resize();
  syncLoop();

  return {
    setPointer(x, y) {
      pointerX = Math.min(1, Math.max(0, x));
      pointerY = Math.min(1, Math.max(0, y));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', syncLoop);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      window.removeEventListener('resize', resize);
      scene.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose();
      });
      renderer.dispose();
      container.classList.remove('scene-ready');
    },
  };
}
