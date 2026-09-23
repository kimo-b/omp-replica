import { initProductNavigation } from '/navigation.mjs';

initProductNavigation({ document, window });

const sceneRoot = document.querySelector('.hero-scene');
const sceneCanvas = document.querySelector('#scope-canvas');
const crosshair = document.querySelector('.pointer-crosshair');
const xValue = document.querySelector('#pointer-x');
const yValue = document.querySelector('#pointer-y');
const finePointer = window.matchMedia('(pointer: fine)');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const narrowScreen = window.matchMedia('(max-width: 700px)');
const connection = navigator.connection;

let scene = null;
let sceneEpoch = 0;
let pointerFrame = 0;
let latestPointer = { x: .5, y: .5 };

const clamp = (value) => Math.min(1, Math.max(0, value));
const enhancementAllowed = () => finePointer.matches
  && !reducedMotion.matches
  && !narrowScreen.matches
  && !connection?.saveData;

async function syncEnhancement() {
  const epoch = ++sceneEpoch;
  const allowed = enhancementAllowed();
  document.body.classList.toggle('pointer-enabled', allowed);
  if (!allowed) {
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    scene?.dispose();
    scene = null;
    sceneRoot.classList.remove('scene-ready');
    return;
  }
  if (scene) return;
  try {
    const { initScopeScene } = await import('/scope-scene.mjs');
    if (epoch !== sceneEpoch || !enhancementAllowed()) return;
    scene = initScopeScene({ canvas: sceneCanvas, container: sceneRoot });
    scene.setPointer(latestPointer.x, latestPointer.y);
  } catch {
    // The still aperture is in the initial markup and needs no JavaScript.
    sceneRoot.classList.remove('scene-ready');
  }
}

window.addEventListener('pointermove', (event) => {
  if (!enhancementAllowed()) return;
  latestPointer = {
    x: clamp(event.clientX / Math.max(1, window.innerWidth)),
    y: clamp(event.clientY / Math.max(1, window.innerHeight)),
  };
  if (pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    pointerFrame = 0;
    const { x, y } = latestPointer;
    xValue.textContent = String(Math.round(x * 100)).padStart(3, '0');
    yValue.textContent = String(Math.round(y * 100)).padStart(3, '0');
    crosshair.style.left = `${x * 100}%`;
    crosshair.style.top = `${y * 100}%`;
    scene?.setPointer(x, y);
  });
}, { passive: true });

for (const preference of [finePointer, reducedMotion, narrowScreen]) {
  preference.addEventListener('change', syncEnhancement);
}
connection?.addEventListener?.('change', syncEnhancement);
window.addEventListener('pagehide', () => {
  ++sceneEpoch;
  scene?.dispose();
  scene = null;
});
window.addEventListener('pageshow', syncEnhancement);
syncEnhancement();
