# Visual Explain — Three.js (3D Engine)

Expertise in 3D interactive visualizations using Three.js. Use this skill for spatial concepts: room acoustics, spatial audio, speaker placement, 3D particle systems, terrain, architectural visualization, molecular structures, and any visualization that benefits from depth, perspective, and camera control.

## When to Use Three.js

Three.js is the right choice when the visualization is inherently **three-dimensional**:

| Concept               | Why Three.js                                   |
| --------------------- | ---------------------------------------------- |
| Room acoustics        | 3D room geometry, ray-traced reflections       |
| Spatial audio         | Sound source positions, directional cones      |
| Speaker placement     | 3D room with positioned objects                |
| 3D particle systems   | Volumetric particle fields, depth sorting      |
| Terrain generation    | Height-mapped surfaces, erosion                |
| Architectural viz     | Room layouts, lighting, materials              |
| Molecular / atomic    | 3D bond structures, crystal lattices           |
| Orbital mechanics     | 3D trajectories, gravitational fields          |
| Voxel art             | 3D grid-based structures                       |
| Surface math          | Parametric surfaces (Klein bottle, torus knot) |
| Wave propagation (3D) | Spherical waves, interference in volume        |
| Network graphs (3D)   | Force-directed layouts in 3D space             |

## Template

All Three.js visualizations start from `viewer-base-3js.html` (located in this skill folder). This template provides:

- **FIXED sections** (do not modify): CSS layout (CSS variables in `:root`, responsive at <900px, identical to p5 template), Mulberry32 PRNG, seed controls, action buttons
- **VARIABLE sections** (customize): title, parameters, colors, `DEFAULT_CONFIG`, `syncUIFromConfig()`, `generateArt()`

### Scene Setup

```javascript
const CANVAS_SIZE = 1200;
let scene, camera, renderer, controls;

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(CONFIG.background);

  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 5);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(CANVAS_SIZE, CANVAS_SIZE);
  renderer.setPixelRatio(1);
  document.getElementById('canvasContainer').appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  generateArt();
  animate();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
```

Three.js creates its own `<canvas>` via `WebGLRenderer` inside `#canvasContainer`. The canvas area CSS is identical to the p5 template.

### Library Loading

```html
<script src="three.min.js"></script>
<!-- OrbitControls is inlined or loaded separately -->
```

Always use the local bundled `three.min.js` — never CDN. OrbitControls can be inlined in the template or loaded from `OrbitControls.js`.

## Randomness Rules

Same Mulberry32 PRNG as p5.js — all randomness must be seeded:

| Function                      | Usage                           |
| ----------------------------- | ------------------------------- |
| `seededRandom()`              | Float in [0, 1)                 |
| `seededRandomRange(min, max)` | Float in [min, max)             |
| `seededRandomInt(min, max)`   | Integer in [min, max] inclusive |
| `seededGaussian(mean, sd)`    | Normal distribution             |
| `seededShuffle(arr)`          | Shuffled copy of array          |

**Never** use `Math.random()` in art generation code.

For noise in Three.js (no built-in Perlin), implement a simple 3D value noise or use the seeded PRNG with smoothstep interpolation:

```javascript
// Simple 3D seeded noise using hash + smoothstep
function seededNoise3D(x, y, z) {
  let ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  let fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); // smoothstep
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  // ... trilinear interpolation with seeded hash values
}
```

## Layering Strategy

3D scenes use depth naturally, but still structure in layers:

1. **Environment layer** — background color/gradient, ambient lighting, fog
2. **Primary layer** — main 3D geometry (room, terrain, particle cloud)
3. **Detail layer** — accents, labels, wireframe overlays, glow effects

### Lighting

```javascript
// Ambient for base illumination
scene.add(new THREE.AmbientLight(0x404040, 0.6));

// Directional for shadows and form
let dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 7);
scene.add(dirLight);

// Point lights for accents (use CONFIG colors)
let accentLight = new THREE.PointLight(CONFIG.colors[0], 1, 50);
accentLight.position.set(0, 3, 0);
scene.add(accentLight);
```

## Key Three.js APIs

| Category | Classes / Methods                                                                     |
| -------- | ------------------------------------------------------------------------------------- |
| Scene    | `THREE.Scene`, `THREE.Fog`, `THREE.Color`                                             |
| Camera   | `THREE.PerspectiveCamera`, `THREE.OrthographicCamera`                                 |
| Renderer | `THREE.WebGLRenderer`, `.setSize()`, `.render()`                                      |
| Geometry | `THREE.BoxGeometry`, `THREE.SphereGeometry`, `THREE.BufferGeometry`                   |
| Material | `THREE.MeshStandardMaterial`, `THREE.MeshPhongMaterial`, `THREE.LineBasicMaterial`    |
| Mesh     | `THREE.Mesh`, `THREE.Line`, `THREE.Points`, `THREE.InstancedMesh`                     |
| Light    | `THREE.AmbientLight`, `THREE.DirectionalLight`, `THREE.PointLight`, `THREE.SpotLight` |
| Helpers  | `THREE.GridHelper`, `THREE.AxesHelper`, `THREE.ArrowHelper`                           |
| Math     | `THREE.Vector3`, `THREE.Quaternion`, `THREE.Matrix4`, `THREE.MathUtils`               |
| Controls | `OrbitControls` — camera pan/zoom/rotate                                              |
| Export   | `renderer.domElement.toDataURL('image/png')` — for Download PNG                       |

## Performance Tips

- Use `THREE.InstancedMesh` for repeated geometry (>100 identical objects)
- Use `THREE.BufferGeometry` with typed arrays for custom geometry
- Merge static geometry with `BufferGeometryUtils.mergeGeometries()`
- Set `material.flatShading = true` for low-poly aesthetic and better performance
- Use `renderer.setPixelRatio(1)` to avoid HiDPI doubling
- Dispose of old geometry/materials in `regenerate()` to prevent memory leaks:

```javascript
function clearScene() {
  while (scene.children.length > 0) {
    let obj = scene.children[0];
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
    scene.remove(obj);
  }
}
```

## References

Detailed guides live in `references/`:

- **3d-techniques.md** — room acoustics, spatial audio, speaker placement, 3D particles, parametric surfaces, terrain generation
- **color-and-composition.md** — palette theory, harmony rules, layering strategy, composition principles
- **palettes.csv** — 26 curated palettes with mood, colors, background, and keywords
- **references.csv** — 15 notable educational and visualization references (Nature of Code, Coding Train, etc.)

## Download / Export

Three.js uses `renderer.domElement` (a `<canvas>`) for export:

```javascript
function downloadPNG() {
  renderer.render(scene, camera); // ensure fresh render
  let link = document.createElement('a');
  link.download = 'visualization_seed_' + currentSeed + '.png';
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
}
```

Note: `preserveDrawingBuffer: true` must be set on the renderer for `toDataURL()` to work.

## Output Format

Single self-contained HTML file with:

- Inline `<style>` (same sidebar CSS as p5 viewer-base — identical layout)
- Local `<script src="three.min.js">`
- OrbitControls inlined or loaded from `OrbitControls.js`
- Inline `<script>` with all JavaScript
- No external assets (images, fonts, data files, HDRI)
- 1200x1200 renderer output
- Download PNG button via `renderer.domElement.toDataURL()`
- OrbitControls for camera interaction (mouse drag to rotate, scroll to zoom)
