const LOAD_TIMEOUT = 3000;
const PET_STATES_BASE_PATH = '../pet-states';
let currentObject: HTMLObjectElement | null = document.getElementById('pet') as HTMLObjectElement;

function getStateAssetPath(state: string): string {
  return `${PET_STATES_BASE_PATH}/${state}.svg`;
}

function setupTransitions(): void {
  if (!currentObject) return;
  const doc = currentObject.contentDocument;
  if (!doc) return;

  const eye = doc.querySelector('.idle-eye') as SVGElement | null;
  const body = doc.querySelector('.idle-body') as SVGElement | null;

  if (eye) eye.style.transition = 'transform 0.2s ease-out';
  if (body) body.style.transition = 'transform 0.2s ease-out';
}

function loadSvg(svgPath: string): void {
  const newObj = document.createElement('object');
  newObj.type = 'image/svg+xml';
  newObj.id = 'pet';
  newObj.style.width = '100%';
  newObj.style.height = '100%';
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
    if (currentObject) currentObject.remove();
    currentObject = newObj;
    setupTransitions();
  });

  document.body.appendChild(newObj);
}

// Setup transitions for initial SVG
if (currentObject) {
  currentObject.addEventListener('load', () => {
    setupTransitions();
  });
}

window.petAPI.onStateChange((state: string) => {
  loadSvg(getStateAssetPath(state));
});

window.petAPI.onEyeMove(({ eyeDx, eyeDy, bodyDx, bodyRotate }) => {
  if (!currentObject) return;
  const doc = currentObject.contentDocument;
  if (!doc) return;

  const eye = doc.querySelector('.idle-eye') as SVGElement | null;
  const body = doc.querySelector('.idle-body') as SVGElement | null;

  if (eye) eye.style.transform = `translate(${eyeDx}px, ${eyeDy}px)`;
  if (body) body.style.transform = `translate(${bodyDx}px, 0) rotate(${bodyRotate}deg)`;
});
