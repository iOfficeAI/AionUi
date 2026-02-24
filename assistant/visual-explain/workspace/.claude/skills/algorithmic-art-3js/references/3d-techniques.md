# Three.js 3D Techniques Reference

Detailed technique guides for 3D visualizations with Three.js.

## Room Acoustics Visualization

Model a room as a 3D box and trace sound reflections:

```javascript
// Room as wireframe box
let roomGeo = new THREE.BoxGeometry(CONFIG.roomWidth, CONFIG.roomHeight, CONFIG.roomDepth);
let roomMat = new THREE.MeshBasicMaterial({ color: 0x334455, wireframe: true });
scene.add(new THREE.Mesh(roomGeo, roomMat));

// Ray reflections — trace from source, bounce off walls
function traceRay(origin, direction, bounces) {
  let raycaster = new THREE.Raycaster(origin, direction);
  let points = [origin.clone()];
  let currentOrigin = origin.clone();
  let currentDir = direction.clone();

  for (let b = 0; b < bounces; b++) {
    raycaster.set(currentOrigin, currentDir);
    let intersects = raycaster.intersectObject(roomMesh);
    if (intersects.length > 0) {
      let hit = intersects[0];
      points.push(hit.point.clone());
      // Reflect direction off wall normal
      currentDir.reflect(hit.face.normal);
      currentOrigin = hit.point.clone().add(currentDir.clone().multiplyScalar(0.01));
    }
  }
  return points;
}
```

### Visualization Layers

1. **Room wireframe** — transparent box showing boundaries
2. **Sound source** — emissive sphere at source position
3. **Ray paths** — colored lines showing reflection paths
4. **Absorption zones** — transparent colored planes on walls (different materials)
5. **Listener position** — distinct marker (e.g., head-shaped mesh)

## Spatial Audio / Speaker Placement

```javascript
// Sound sources as emissive spheres with directional cones
let speakerGeo = new THREE.ConeGeometry(0.2, 0.4, 8);
let speakerMat = new THREE.MeshStandardMaterial({
  color: CONFIG.colors[0],
  emissive: CONFIG.colors[0],
  emissiveIntensity: 0.5,
});

// Directional cone visualization
let coneGeo = new THREE.ConeGeometry(CONFIG.coneRadius, CONFIG.coneLength, 16, 1, true);
let coneMat = new THREE.MeshBasicMaterial({
  color: CONFIG.colors[1],
  transparent: true,
  opacity: 0.15,
  side: THREE.DoubleSide,
});
```

### Speaker Array Patterns

- **Stereo**: 2 speakers at ±30° from listener, equal distance
- **Surround 5.1**: Center, L/R front at ±30°, L/R surround at ±110°, sub anywhere
- **Surround 7.1**: Add L/R back at ±150° to 5.1
- **Atmos**: Add height layer (4+ ceiling speakers)
- **Line array**: Vertical stack for large venues, cylindrical dispersion

## 3D Particle Systems

```javascript
// High-performance points-based particles
let positions = new Float32Array(CONFIG.particleCount * 3);
let colors = new Float32Array(CONFIG.particleCount * 3);

for (let i = 0; i < CONFIG.particleCount; i++) {
  positions[i * 3] = seededRandomRange(-5, 5); // x
  positions[i * 3 + 1] = seededRandomRange(-5, 5); // y
  positions[i * 3 + 2] = seededRandomRange(-5, 5); // z
}

let geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

let mat = new THREE.PointsMaterial({ size: 0.05, vertexColors: true });
scene.add(new THREE.Points(geo, mat));
```

### Particle Distributions

- **Uniform sphere**: `r * sqrt(seededRandom()), θ, φ`
- **Gaussian cloud**: `seededGaussian(0, σ)` per axis
- **Shell**: fixed radius, random angles
- **Lattice + jitter**: regular grid with noise displacement

## Parametric Surfaces

```javascript
// Custom parametric surface using BufferGeometry
function parametricSurface(u, v) {
  // Klein bottle, torus knot, etc.
  let x = Math.cos(u) * (3 + Math.cos(v));
  let y = Math.sin(u) * (3 + Math.cos(v));
  let z = Math.sin(v);
  return new THREE.Vector3(x, y, z);
}

// Build geometry from parametric function
function buildSurface(fn, uSteps, vSteps) {
  let geo = new THREE.BufferGeometry();
  let positions = [];
  let indices = [];

  for (let i = 0; i <= uSteps; i++) {
    for (let j = 0; j <= vSteps; j++) {
      let u = (i / uSteps) * Math.PI * 2;
      let v = (j / vSteps) * Math.PI * 2;
      let p = fn(u, v);
      positions.push(p.x, p.y, p.z);
    }
  }

  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      let a = i * (vSteps + 1) + j;
      let b = a + vSteps + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
```

### Common Surfaces

| Surface         | Description                                              |
| --------------- | -------------------------------------------------------- |
| Torus           | `(R + r·cos(v))·cos(u), (R + r·cos(v))·sin(u), r·sin(v)` |
| Möbius strip    | Twisted rectangle, single-sided                          |
| Klein bottle    | Non-orientable closed surface                            |
| Torus knot      | `THREE.TorusKnotGeometry(p, q)`                          |
| Sphere harmonic | `r(θ,φ) = Σ Y_lm(θ,φ)` — spherical harmonics             |

## Terrain Generation

```javascript
// Height-mapped plane geometry
let planeGeo = new THREE.PlaneGeometry(10, 10, CONFIG.resolution, CONFIG.resolution);
let positions = planeGeo.attributes.position.array;

for (let i = 0; i < positions.length; i += 3) {
  let x = positions[i],
    y = positions[i + 1];
  positions[i + 2] = seededNoise2D(x * CONFIG.noiseScale, y * CONFIG.noiseScale) * CONFIG.heightScale;
}

planeGeo.computeVertexNormals();
```

### Terrain Coloring

- Height-based: water (blue) → sand → grass → rock → snow
- Slope-based: flat = grass, steep = rock
- Vertex colors from height map for efficient rendering
- Optional fog for atmospheric depth

## Network / Graph Visualization (3D)

```javascript
// Force-directed 3D graph layout
let nodes = [];
let edges = [];

// Simulation step
function stepForceLayout() {
  // Repulsion between all nodes (Coulomb)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      let dir = nodes[j].pos.clone().sub(nodes[i].pos);
      let dist = Math.max(dir.length(), 0.1);
      let force = CONFIG.repulsion / (dist * dist);
      dir.normalize().multiplyScalar(force);
      nodes[i].vel.sub(dir);
      nodes[j].vel.add(dir);
    }
  }
  // Attraction along edges (spring)
  for (let e of edges) {
    let dir = e.target.pos.clone().sub(e.source.pos);
    let force = dir.length() * CONFIG.springStrength;
    dir.normalize().multiplyScalar(force);
    e.source.vel.add(dir);
    e.target.vel.sub(dir);
  }
}
```

## Voxel Art

```javascript
// InstancedMesh for efficient voxel rendering
let boxGeo = new THREE.BoxGeometry(1, 1, 1);
let boxMat = new THREE.MeshStandardMaterial();
let mesh = new THREE.InstancedMesh(boxGeo, boxMat, CONFIG.maxVoxels);

let dummy = new THREE.Object3D();
let idx = 0;
for (let x = 0; x < CONFIG.gridSize; x++) {
  for (let y = 0; y < CONFIG.gridSize; y++) {
    for (let z = 0; z < CONFIG.gridSize; z++) {
      if (shouldPlace(x, y, z)) {
        // your algorithm
        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        mesh.setColorAt(idx, new THREE.Color(getVoxelColor(x, y, z)));
        idx++;
      }
    }
  }
}
mesh.count = idx;
scene.add(mesh);
```
