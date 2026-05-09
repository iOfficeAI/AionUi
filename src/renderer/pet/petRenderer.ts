const LOAD_TIMEOUT = 3000;
const FADE_MS = 150;
const PET_STATES_BASE_PATH = '../pet-states';
let currentObject: HTMLObjectElement | null = document.getElementById('pet') as HTMLObjectElement;

function getStateAssetPath(state: string): string {
  return `${PET_STATES_BASE_PATH}/${state}.svg`;
}

function setupTransitions(_target: HTMLObjectElement | null): void {
  // Eye tracking uses SVG attribute transforms, not CSS transitions.
}

/**
 * Cross-fade to a new SVG state. The old object is removed after the fade so
 * there's no flash between states.
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
    if (!loaded) newObj.remove();
  }, LOAD_TIMEOUT);

  newObj.addEventListener('load', () => {
    loaded = true;
    clearTimeout(timeout);
    setupTransitions(newObj);

    const oldObj = currentObject;
    if (oldObj) oldObj.removeAttribute('id');
    currentObject = newObj;

    requestAnimationFrame(() => {
      newObj.style.opacity = '1';
      if (oldObj) oldObj.style.opacity = '0';
    });

    if (oldObj) {
      setTimeout(() => oldObj.remove(), FADE_MS);
    }
  });

  document.body.appendChild(newObj);
}

if (currentObject) {
  currentObject.style.position = 'absolute';
  currentObject.style.inset = '0';
  currentObject.style.transition = `opacity ${FADE_MS}ms ease-out`;
  currentObject.addEventListener('load', () => {
    setupTransitions(currentObject);
  });
}

window.petAPI.onStateChange((state: string) => {
  loadSvg(getStateAssetPath(state));
});

window.petAPI.onEyeMove(({ eyeDx, eyeDy, bodyDx, bodyRotate }) => {
  if (!currentObject) return;
  const doc = currentObject.contentDocument;
  if (!doc) return;

  const pupil = doc.querySelector('.idle-pupil') as SVGGElement | null;
  const track = doc.querySelector('.idle-track') as SVGGElement | null;

  if (pupil) pupil.setAttribute('transform', `translate(${eyeDx} ${eyeDy})`);
  if (track) track.setAttribute('transform', `translate(${bodyDx} 0) rotate(${bodyRotate} 11 12)`);
});

// ---------------------------------------------------------------------------
// Pomodoro capsule
// ---------------------------------------------------------------------------

const capsule = document.getElementById('pomodoro-capsule')!;
const capsuleTimeCollapsed = document.getElementById('capsule-time-collapsed')!;
const capsuleDot = document.getElementById('capsule-dot')!;

const particles = [1, 2, 3, 4, 5].map((i) => document.getElementById(`p${i}`)!);

function setParticles(active: boolean): void {
  particles.forEach((p) => {
    if (active) p.classList.add('active');
    else p.classList.remove('active');
  });
}

function formatMs(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

window.petAPI.onPomodoroTick((tick: PomodoroTick) => {
  if (tick.phase === 'idle') {
    capsule.classList.remove('visible');
    setParticles(false);
    return;
  }
  capsuleTimeCollapsed.textContent = formatMs(tick.remainingMs);
  capsuleDot.style.background = tick.phase === 'break' ? '#22c55e' : '#ef5f3c';
  capsule.classList.add('visible');
  setParticles(tick.phase === 'focus');
});
