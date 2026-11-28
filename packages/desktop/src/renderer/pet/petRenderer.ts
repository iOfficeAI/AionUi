const LOAD_TIMEOUT = 3000;
const FADE_MS = 150;
const PET_STATES_BASE_PATH = '../pet-states';
// Click/pat reactions must appear with zero perceived latency: they skip the
// cross-fade, and their SVG content is preloaded at startup (see
// preloadInteractionStates) so no first-load disk read sits on the reaction path.
const INTERACTION_STATES: ReadonlySet<string> = new Set(['attention', 'poke-left', 'poke-right', 'juggling', 'happy']);
// state → serialized SVG markup. Populated by the startup preload probe and
// on first load; later occurrences render from an in-memory data URL. A fresh
// <object> document is still created per state change so single-shot CSS
// animations (the poke dodge uses `animation: ... forwards`) replay each time.
const svgContentCache = new Map<string, string>();
let currentObject: HTMLObjectElement | null = document.getElementById('pet') as HTMLObjectElement;

function getStateAssetPath(state: string): string {
  return `${PET_STATES_BASE_PATH}/${state}.svg`;
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Remember the serialized markup of a loaded state for instant reuse. */
function harvestSvgContent(obj: HTMLObjectElement, state: string): void {
  if (svgContentCache.has(state)) return;
  const root = obj.contentDocument?.documentElement;
  if (root) {
    svgContentCache.set(state, root.outerHTML);
  }
}

/**
 * Warm the SVG content cache for click/pat reactions at startup: load each
 * interaction state once through a hidden probe object and keep its markup,
 * so the first real click renders straight from memory.
 */
function preloadInteractionStates(): void {
  for (const state of INTERACTION_STATES) {
    if (svgContentCache.has(state)) continue;
    const probe = document.createElement('object');
    probe.type = 'image/svg+xml';
    probe.style.position = 'absolute';
    probe.style.width = '1px';
    probe.style.height = '1px';
    probe.style.opacity = '0';
    probe.style.pointerEvents = 'none';
    probe.data = getStateAssetPath(state);
    probe.addEventListener('load', () => {
      harvestSvgContent(probe, state);
      probe.remove();
    });
    document.body.appendChild(probe);
  }
}
preloadInteractionStates();

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
 * and keep showing the previous state. Interaction reactions skip the fade and
 * render from the preloaded in-memory cache.
 */
function loadSvg(state: string): void {
  const instant = INTERACTION_STATES.has(state);
  const cached = svgContentCache.get(state);
  const data = cached ? toSvgDataUrl(cached) : getStateAssetPath(state);

  const newObj = document.createElement('object');
  newObj.type = 'image/svg+xml';
  newObj.id = 'pet';
  newObj.style.position = 'absolute';
  newObj.style.inset = '0';
  newObj.style.width = '100%';
  newObj.style.height = '100%';
  newObj.style.opacity = '0';
  newObj.style.transition = instant ? 'none' : `opacity ${FADE_MS}ms ease-out`;
  newObj.data = data;

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
    harvestSvgContent(newObj, state);

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
    // Interaction reactions swap instantly — no fade to wait out.
    if (oldObj) {
      setTimeout(
        () => {
          oldObj.remove();
        },
        instant ? 0 : FADE_MS
      );
    }
  });

  document.body.appendChild(newObj);
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
  loadSvg(state);
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
