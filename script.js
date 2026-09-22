const commands = {
  curl: { command: 'curl -fsSL https://omp.sh/install | sh', platform: 'macOS · Linux' },
  brew: { command: 'brew install can1357/tap/omp', platform: 'macOS · Linux' },
  bun: { command: 'bun install -g @oh-my-pi/pi-coding-agent', platform: 'recommended' },
  ps1: { command: 'irm https://omp.sh/install.ps1 | iex', platform: 'windows' },
  mise: { command: 'mise use -g github:can1357/oh-my-pi', platform: 'pinned versions' },
};

const commandText = document.querySelector('#command-text');
const platformLabel = document.querySelector('#platform-label');
const copyButton = document.querySelector('#copy-button');
const tabs = [...document.querySelectorAll('.install-tab')];

// Keep the compatibility strip useful in offline previews. The reference uses
// provider PNGs; local copies are bundled for the five assets we ship, while
// remote marks fall back to a quiet initial only when their image cannot load.
const replaceProviderWithFallback = (image) => {
  const fallback = document.createElement('span');
  fallback.className = 'provider provider-fallback';
  fallback.textContent = (image.alt || '?').replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase() || '?';
  fallback.setAttribute('title', image.title || image.alt || 'provider');
  image.replaceWith(fallback);
};

document.querySelectorAll('.provider[src^="http"]').forEach((image) => {
  image.addEventListener('error', () => replaceProviderWithFallback(image), { once: true });
  if (image.complete && image.naturalWidth === 0) replaceProviderWithFallback(image);
});

function selectMethod(method) {
  const selected = commands[method];
  if (!selected) return;
  commandText.textContent = selected.command;
  platformLabel.textContent = selected.platform;
  copyButton.setAttribute('aria-label', `Copy install command for ${method}`);
  tabs.forEach((tab) => {
    const isActive = tab.dataset.method === method;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
}

tabs.forEach((tab) => tab.addEventListener('click', () => selectMethod(tab.dataset.method)));

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(commandText.textContent);
    copyButton.classList.add('copied');
    window.setTimeout(() => copyButton.classList.remove('copied'), 1500);
  } catch {
    const range = document.createRange();
    range.selectNodeContents(commandText);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
});

const previewOverlay = document.querySelector('#preview-overlay');
const previewVideo = document.querySelector('#preview-video');
const previewLabel = document.querySelector('#preview-label');
const previewDismiss = document.querySelector('#preview-dismiss');
const sidecarItems = [...document.querySelectorAll('.sidecar-item')];

const sidecarClips = {
  debugger: ['dap', 'debugger'],
  'stream rules': ['ttsr', 'stream rules'],
  subagents: ['irc', 'subagents'],
  advisor: ['advisor', 'advisor'],
  collab: ['collab', 'collab'],
  web: ['web', 'web'],
  'conflict resolution': ['conflict', 'conflict resolution'],
  codemod: ['codemod', 'codemod'],
};

function setSidecarState(activeLabel = null) {
  sidecarItems.forEach((button) => {
    const isActive = button.dataset.sidecar === activeLabel;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function closePreview() {
  previewVideo.pause();
  previewVideo.removeAttribute('src');
  previewVideo.removeAttribute('poster');
  previewVideo.load();
  previewOverlay.classList.remove('open');
  previewOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('preview-open');
  setSidecarState();
}

function openPreview(label) {
  const clip = sidecarClips[label];
  if (!clip) return;
  const [name, displayLabel] = clip;
  setSidecarState(label);
  previewLabel.textContent = displayLabel;
  previewVideo.src = `https://omp.sh/clips/${name}.mp4`;
  previewVideo.poster = `https://omp.sh/clips/${name}-poster.webp`;
  previewVideo.muted = true;
  previewVideo.loop = true;
  previewVideo.load();
  previewOverlay.classList.add('open');
  previewOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('preview-open');
  const play = previewVideo.play();
  if (play && typeof play.catch === 'function') play.catch(() => {});
}

sidecarItems.forEach((item) => {
  item.addEventListener('click', () => {
    const label = item.dataset.sidecar;
    if (previewOverlay.classList.contains('open') && item.getAttribute('aria-pressed') === 'true') closePreview();
    else openPreview(label);
  });
});
previewDismiss.addEventListener('click', closePreview);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && previewOverlay.classList.contains('open')) closePreview();
});

const header = document.querySelector('.site-header');
const setScrolled = () => header.classList.toggle('scrolled', window.scrollY > 16);
window.addEventListener('scroll', setScrolled, { passive: true });
setScrolled();

const spaceCanvas = document.querySelector('#space-canvas');
const noiseCanvas = document.querySelector('#noise-canvas');
const spaceCtx = spaceCanvas.getContext('2d');
const noiseCtx = noiseCanvas.getContext('2d');
// The original background is a low-resolution, pixelated particle field. Keeping
// the renderer below CSS resolution gives the points their characteristic 2–3px
// stipple while keeping the animation inexpensive on laptop GPUs.
let stars = [];
let field = [];
let sceneWidth = 1;
let sceneHeight = 1;
let raf = 0;
let lastFrame = 0;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const scanlines = document.querySelector('.scanlines');

// CSS assigns the canvases negative stacking levels for the stock layout. Inline
// levels put this generated texture in the hero's isolated stacking context,
// below content but above its #09090b background.
spaceCanvas.style.zIndex = '0';
noiseCanvas.style.zIndex = '1';
if (scanlines) scanlines.style.zIndex = '1';

function boundaryAt(x) {
  // Normalized quadratic segments reproduce the lower-right sweeping edge:
  // (0.45w, 1.01h) → (0.70w, .81h) → (1.00w, .42h).
  const u = x / sceneWidth;
  if (u <= .45) return sceneHeight * (1.055 - (u / .45) * .055);
  if (u <= .70) {
    const t = (u - .45) / .25;
    return sceneHeight * (1.01 * (1 - t) + .81 * t - .045 * Math.sin(Math.PI * t));
  }
  const t = Math.min(1, (u - .70) / .30);
  return sceneHeight * (.81 * (1 - t) + .42 * t - .015 * Math.sin(Math.PI * t));
}

function seedTexture() {
  const w = sceneWidth;
  const h = sceneHeight;
  // A sparse star map above the boundary, concentrated toward the right spray.
  const starCount = Math.min(5600, Math.max(1800, Math.floor((w * h) / 105)));
  stars = Array.from({ length: starCount }, () => {
    const x = Math.random() * w;
    const edge = boundaryAt(x);
    const spray = Math.random() < .66 && x > w * .48;
    const y = spray
      ? Math.max(1, edge - Math.pow(Math.random(), 1.65) * h * .38)
      : Math.random() * Math.max(1, edge - 2);
    return {
      x, y,
      size: Math.random() < .08 ? 2 : 1,
      alpha: spray ? .16 + Math.random() * .64 : .04 + Math.random() * .34,
      phase: Math.random() * Math.PI * 2,
      speed: .16 + Math.random() * .8,
    };
  });

  // Colored pixels below the boundary. Most sit close to the cyan/purple edge;
  // the remaining points fade into the dark lower half of the viewport.
  const fieldCount = Math.min(60000, Math.max(23000, Math.floor((w * h) / 14)));
  field = [];
  for (let i = 0; i < fieldCount; i += 1) {
    const x = w * (.30 + Math.random() * .77);
    const edge = boundaryAt(x);
    const depth = Math.pow(Math.random(), .62);
    const y = edge + depth * Math.max(1, h - edge);
    if (y < h + 2) {
      field.push({
        x, y,
        depth,
        size: Math.random() < .09 ? 2 : 1,
        phase: Math.random() * Math.PI * 2,
        alpha: .14 + Math.random() * .86,
      });
    }
  }
}

function resizeCanvas() {
  // Deliberately render at ~60% resolution and let image-rendering:pixelated
  // enlarge the stipple. Cap dimensions to avoid huge allocations on 4K screens.
  const scale = Math.min(.68, Math.max(.48, 900 / Math.max(window.innerWidth, window.innerHeight)));
  sceneWidth = Math.max(360, Math.floor(window.innerWidth * scale));
  sceneHeight = Math.max(260, Math.floor(window.innerHeight * scale));
  spaceCanvas.width = sceneWidth;
  spaceCanvas.height = sceneHeight;
  noiseCanvas.width = sceneWidth;
  noiseCanvas.height = sceneHeight;
  spaceCanvas.style.width = `${window.innerWidth}px`;
  spaceCanvas.style.height = `${window.innerHeight}px`;
  noiseCanvas.style.width = `${window.innerWidth}px`;
  noiseCanvas.style.height = `${window.innerHeight}px`;
  seedTexture();
  draw(performance.now(), true);
}

function draw(timestamp = performance.now(), force = false) {
  // ~24fps is enough for the almost-static star field and materially reduces
  // CPU usage while keeping the few twinkling pixels alive.
  if (!force && !reducedMotion && timestamp - lastFrame < 40) {
    raf = requestAnimationFrame(draw);
    return;
  }
  lastFrame = timestamp;
  const t = reducedMotion ? 0 : timestamp * .001;
  const w = sceneWidth;
  const h = sceneHeight;
  spaceCtx.clearRect(0, 0, w, h);
  spaceCtx.fillStyle = '#09090b';
  spaceCtx.fillRect(0, 0, w, h);

  // Colored field: alpha fades with depth; hue transitions from hot magenta to
  // violet/cyan toward the right-hand crest.
  for (const p of field) {
    const xRatio = p.x / w;
    const depthFade = Math.pow(1 - p.depth, .56) * .92 + .035;
    const flicker = reducedMotion ? 1 : .84 + Math.sin(t * .7 + p.phase) * .16;
    const nearEdge = p.depth < .12;
    let r; let g; let b;
    if (nearEdge && xRatio > .66) {
      const mix = Math.min(1, (xRatio - .66) / .34);
      r = Math.round(95 + (218 - 95) * (1 - mix));
      g = Math.round(146 + (54 - 146) * (1 - mix));
      b = Math.round(255 - 22 * (1 - mix));
    } else {
      // Keep the palette stable between frames; only opacity twinkles. A
      // deterministic phase avoids a noisy full-field color flash every tick.
      const tint = Math.abs(Math.sin(p.phase));
      r = 208 + Math.round(28 * tint);
      g = 24 + Math.round(42 * tint);
      b = 130 + Math.round(78 * tint);
    }
    spaceCtx.fillStyle = `rgba(${r},${g},${b},${Math.min(.94, depthFade * flicker * p.alpha)})`;
    spaceCtx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
  }

  // Thin luminous crest, drawn underneath the white spray so the edge remains
  // visible through the stipple without becoming a smooth neon stroke.
  spaceCtx.save();
  spaceCtx.lineWidth = Math.max(1, Math.round(w / 900));
  spaceCtx.shadowBlur = 0;
  spaceCtx.beginPath();
  spaceCtx.moveTo(w * .39, h * 1.03);
  spaceCtx.quadraticCurveTo(w * .68, h * .83, w * 1.02, h * .40);
  const crest = spaceCtx.createLinearGradient(w * .4, h, w, h * .35);
  crest.addColorStop(0, 'rgba(239,58,185,.75)');
  crest.addColorStop(.60, 'rgba(135,107,255,.95)');
  crest.addColorStop(1, 'rgba(104,222,255,.98)');
  spaceCtx.strokeStyle = crest;
  spaceCtx.stroke();
  spaceCtx.restore();

  // Bright white spray above the edge, denser near the right side.
  for (const p of stars) {
    const flicker = reducedMotion ? 1 : .72 + Math.sin(t * p.speed + p.phase) * .28;
    spaceCtx.fillStyle = `rgba(246,245,255,${Math.min(.92, p.alpha * flicker)})`;
    spaceCtx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
  }

  // A separate sparse grain layer keeps the dark sky from looking vector-flat.
  const grain = noiseCtx.createImageData(w, h);
  for (let i = 0; i < grain.data.length; i += 4) {
    const v = Math.random() > .50 ? 255 : 0;
    grain.data[i] = v; grain.data[i + 1] = v; grain.data[i + 2] = v;
    grain.data[i + 3] = Math.random() * 18;
  }
  noiseCtx.putImageData(grain, 0, 0);
  if (!reducedMotion) raf = requestAnimationFrame(draw);
}

window.addEventListener('resize', resizeCanvas, { passive: true });
resizeCanvas();
if (reducedMotion) draw(performance.now(), true);
