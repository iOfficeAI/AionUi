const LOAD_TIMEOUT = 3000;
const FADE_MS = 150;
const PET_STATES_BASE_PATH = '../pet-states';
let currentObject: HTMLObjectElement | null = document.getElementById('pet') as HTMLObjectElement;
const notificationBadge = document.getElementById('pet-notification-badge');
const atlasEl = document.getElementById('pet-atlas') as HTMLDivElement | null;
let currentState = 'idle';
let currentAsset: PetAssetPackage = {
  id: 'aionui-default',
  displayName: 'AionUi',
  description: '',
  format: 'svg-states',
  source: 'builtin',
};
let atlasTimer: ReturnType<typeof setTimeout> | null = null;
let atlasLoadToken = 0;
const loadedAtlasUrls = new Set<string>();

type AtlasFrame = {
  rowIndex: number;
  columnIndex: number;
  frameDurationMs: number;
};

const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 9;
const IDLE_SLOWDOWN = 6;
const IDLE_FRAMES: AtlasFrame[] = [
  { rowIndex: 0, columnIndex: 0, frameDurationMs: 280 },
  { rowIndex: 0, columnIndex: 1, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 2, frameDurationMs: 110 },
  { rowIndex: 0, columnIndex: 3, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 4, frameDurationMs: 140 },
  { rowIndex: 0, columnIndex: 5, frameDurationMs: 320 },
];
const SLOWED_IDLE_FRAMES = IDLE_FRAMES.map((frame) => ({
  ...frame,
  frameDurationMs: frame.frameDurationMs * IDLE_SLOWDOWN,
}));
const ATLAS_ANIMATIONS = {
  failed: createRowFrames(5, 8, 140, 240),
  idle: IDLE_FRAMES,
  jumping: createRowFrames(4, 5, 140, 280),
  review: createRowFrames(8, 6, 150, 280),
  running: createRowFrames(7, 6, 120, 220),
  'running-left': createRowFrames(2, 8, 120, 220),
  'running-right': createRowFrames(1, 8, 120, 220),
  waving: createRowFrames(3, 4, 140, 280),
  waiting: createRowFrames(6, 6, 150, 260),
} as const;

function getStateAssetPath(state: string): string {
  return `${PET_STATES_BASE_PATH}/${state}.svg`;
}

function createRowFrames(rowIndex: number, length: number, frameDurationMs: number, finalFrameDurationMs: number) {
  return Array.from({ length }, (_item, columnIndex) => ({
    columnIndex,
    frameDurationMs: columnIndex === length - 1 ? finalFrameDurationMs : frameDurationMs,
    rowIndex,
  }));
}

function setupTransitions(_target: HTMLObjectElement | null): void {
  // Intentionally empty: eye tracking now writes SVG `transform` attributes on
  // the .idle-pupil / .idle-track wrappers (see onEyeMove below), which are
  // not affected by CSS `transition` — that property only animates CSS
  // transforms. Smoothing comes from the tick rate, not from CSS transitions.
}

/**
 * Load a new SVG state and cross-fade it over the previous one. The old object
 * is removed only after the fade completes, so there's no white flash between
 * states. If the new SVG fails to load within LOAD_TIMEOUT we bail out silently
 * and keep showing the previous state.
 */
function loadSvg(svgPath: string): void {
  const newObj = document.createElement('object');
  newObj.type = 'image/svg+xml';
  newObj.id = 'pet';
  newObj.style.position = 'absolute';
  newObj.style.inset = '0';
  newObj.style.width = '100%';
  newObj.style.height = '100%';
  newObj.style.opacity = '0';
  newObj.style.transition = `opacity ${FADE_MS}ms ease-out`;
  newObj.data = svgPath;

  let loaded = false;
  const timeout = setTimeout(() => {
    if (!loaded) {
      newObj.remove();
    }
  }, LOAD_TIMEOUT);

  newObj.addEventListener('load', () => {
    loaded = true;
    clearTimeout(timeout);
    setupTransitions(newObj);

    const oldObj = currentObject;
    // Clear the old id immediately so duplicate #pet selectors (from CSS and
    // setupTransitions' query) never see two elements at once during the fade.
    if (oldObj) oldObj.removeAttribute('id');
    currentObject = newObj;

    // Trigger the fade on the next frame so the browser has painted the
    // initial opacity:0 state — otherwise the transition is skipped and the
    // swap is instant.
    requestAnimationFrame(() => {
      newObj.style.opacity = '1';
      if (oldObj) oldObj.style.opacity = '0';
    });

    // Remove the old object after the cross-fade completes. Keep a reference
    // via closure so we don't race with another state change in the meantime.
    if (oldObj) {
      setTimeout(() => {
        oldObj.remove();
      }, FADE_MS);
    }
  });

  document.body.appendChild(newObj);
}

function showSvgState(state: string): void {
  atlasLoadToken += 1;
  if (atlasTimer) {
    clearTimeout(atlasTimer);
    atlasTimer = null;
  }
  if (atlasEl) atlasEl.hidden = true;
  if (currentObject) currentObject.hidden = false;
  loadSvg(getStateAssetPath(state));
}

function showAtlasState(state: string): void {
  if (!atlasEl || currentAsset.format !== 'codex-spritesheet' || !currentAsset.spritesheetUrl) return;

  const spritesheetUrl = currentAsset.spritesheetUrl;
  const token = ++atlasLoadToken;
  if (loadedAtlasUrls.has(spritesheetUrl)) {
    renderLoadedAtlasState(state, spritesheetUrl);
    return;
  }

  const image = new Image();
  image.addEventListener('load', () => {
    if (token !== atlasLoadToken || currentAsset.format !== 'codex-spritesheet') return;
    if (currentAsset.spritesheetUrl !== spritesheetUrl) return;
    loadedAtlasUrls.add(spritesheetUrl);
    renderLoadedAtlasState(state, spritesheetUrl);
  });
  image.addEventListener('error', () => {
    if (token !== atlasLoadToken || currentAsset.spritesheetUrl !== spritesheetUrl) return;
    console.warn('[Pet] Failed to load pet spritesheet:', spritesheetUrl);
    showSvgState(state);
  });
  image.src = spritesheetUrl;
}

function renderLoadedAtlasState(state: string, spritesheetUrl: string): void {
  if (!atlasEl) return;

  if (atlasTimer) {
    clearTimeout(atlasTimer);
    atlasTimer = null;
  }
  if (currentObject) currentObject.hidden = true;
  atlasEl.hidden = false;
  atlasEl.style.backgroundImage = `url("${spritesheetUrl}")`;

  const animation = getAtlasAnimation(state);
  const frames = animation.frames;
  let frameIndex = 0;
  atlasEl.style.backgroundPosition = getAtlasFramePosition(frames[frameIndex]);

  if (frames.length <= 1) return;

  const advance = () => {
    atlasTimer = setTimeout(() => {
      const nextIndex = frameIndex + 1;
      frameIndex = nextIndex >= frames.length ? animation.loopStartIndex : nextIndex;
      atlasEl.style.backgroundPosition = getAtlasFramePosition(frames[frameIndex]);
      advance();
    }, frames[frameIndex].frameDurationMs);
  };

  advance();
}

function getAtlasAnimation(state: string): { frames: AtlasFrame[]; loopStartIndex: number } {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const atlasState = mapPetStateToAtlasState(state);
  const frames = ATLAS_ANIMATIONS[atlasState];

  if (prefersReducedMotion) return { frames: [frames[0]], loopStartIndex: 0 };
  if (atlasState === 'idle') return { frames: SLOWED_IDLE_FRAMES, loopStartIndex: 0 };

  const actionFrames = [...frames, ...frames, ...frames];
  return { frames: [...actionFrames, ...SLOWED_IDLE_FRAMES], loopStartIndex: actionFrames.length };
}

function mapPetStateToAtlasState(state: string): keyof typeof ATLAS_ANIMATIONS {
  switch (state) {
    case 'thinking':
    case 'notification':
    case 'dozing':
      return 'waiting';
    case 'working':
    case 'building':
    case 'sweeping':
    case 'carrying':
      return 'running';
    case 'dragging':
      return 'running-right';
    case 'done':
    case 'happy':
      return 'waving';
    case 'attention':
    case 'poke-left':
    case 'poke-right':
    case 'juggling':
    case 'waking':
      return 'jumping';
    case 'error':
      return 'failed';
    default:
      return 'idle';
  }
}

function getAtlasFramePosition(frame: AtlasFrame): string {
  return `${(frame.columnIndex / (ATLAS_COLUMNS - 1)) * 100}% ${(frame.rowIndex / (ATLAS_ROWS - 1)) * 100}%`;
}

function renderCurrentState(): void {
  if (currentAsset.format === 'codex-spritesheet') {
    showAtlasState(currentState);
    return;
  }
  showSvgState(currentState);
}

// The initial SVG is hard-coded in pet.html without any transition setup or
// positioning — mirror the runtime swap target so subsequent cross-fades work
// and eye/body transforms animate from the start.
if (currentObject) {
  currentObject.style.position = 'absolute';
  currentObject.style.inset = '0';
  currentObject.style.transition = `opacity ${FADE_MS}ms ease-out`;
  currentObject.addEventListener('load', () => {
    setupTransitions(currentObject);
  });
}

window.petAPI.onStateChange((state: string) => {
  currentState = state;
  renderCurrentState();
});

window.petAPI.onEyeMove(({ eyeDx, eyeDy, bodyDx, bodyRotate }) => {
  if (!currentObject) return;
  const doc = currentObject.contentDocument;
  if (!doc) return;

  // Target the dedicated wrapper groups (.idle-pupil and .idle-track) rather
  // than the animated .idle-eye / .idle-body. Those already have CSS keyframes
  // running — writing style.transform to them gets overwritten every frame, so
  // tracking becomes invisible. The wrappers have no animation of their own,
  // so their SVG transform attributes stick. Using setAttribute (not style)
  // because SVG transform attributes and CSS transforms are separate channels
  // in SVG — the attribute stacks on top of the descendant's CSS animation
  // without overwriting it.
  const pupil = doc.querySelector('.idle-pupil') as SVGGElement | null;
  const track = doc.querySelector('.idle-track') as SVGGElement | null;

  if (pupil) pupil.setAttribute('transform', `translate(${eyeDx} ${eyeDy})`);
  // rotate(angle cx cy) — rotation center is pinned to (11,12) in SVG units,
  // which is the head center for the idle pose.
  if (track) track.setAttribute('transform', `translate(${bodyDx} 0) rotate(${bodyRotate} 11 12)`);
});

window.petAPI.onNotificationSummary(({ pendingConfirmations }) => {
  if (!notificationBadge) return;
  if (pendingConfirmations <= 0) {
    notificationBadge.hidden = true;
    notificationBadge.textContent = '';
    return;
  }

  notificationBadge.hidden = false;
  notificationBadge.textContent = pendingConfirmations > 99 ? '99+' : String(pendingConfirmations);
});

window.petAPI.onAssetChange((asset) => {
  currentAsset = asset;
  renderCurrentState();
});
