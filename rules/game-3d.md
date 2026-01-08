# 3D Star Adventure - Final Hyper-Prescriptive Rules

## 0. Initialization & Error Handling

- **0.1. Boot Process**: The main game logic function, `initGame()`, must be called within the `window.onload` event to ensure all page resources (including scripts) have finished loading.
- **0.2. Resource Loading Check**:
  - **Strictly Prescriptive Instruction**: The **first step** of the `initGame()` function must be to check if the global `THREE` object exists. This is to handle the edge case where the `three.min.js` script fails to load. The following exact code must be used for this check:
    ```javascript
    if (typeof THREE === 'undefined') {
      alert('Three.js failed to load. Please check your network connection.');
      return;
    }
    ```

## 1. Game Overview

- **1.1. Game Title**: `3D Star Adventure` (Kirby-like 3D)
- **1.2. Game Type**: 3D Platformer
- **1.3. Core Objective**: Collect all **5** stars.
- **1.4. Tech Stack**: `Three.js` (r128), HTML5, CSS3, JavaScript (ES6)

## 2. Visuals & Scene Settings

- **2.1. Scene**:
  - **Background Color**: Sky Blue (`0x87CEEB`)
  - **Fog**: `THREE.Fog`, color `0x87CEEB`, near `20`, far `60`.
- **2.2. Camera**:
  - **Type**: `THREE.PerspectiveCamera`
  - **Field of View (FOV)**: `60` degrees
  - **Clipping Plane**: `near: 0.1`, `far: 1000`
- **2.3. Lighting**:
  - **Ambient Light**: color `0xffffff`, intensity `0.6`.
  - **Directional Light**:
    - **Basics**: color `0xffffff`, intensity `0.8`, position `(20, 50, 20)`.
    - **Shadows**:
      - `castShadow`: `true`
      - `shadow.mapSize.width`: `1024`
      - `shadow.mapSize.height`: `1024`
      - `shadow.camera.near`: `0.5`
      - `shadow.camera.far`: `100`
      - `shadow.camera.left`: `-30`
      - `shadow.camera.right`: `30`
      - `shadow.camera.top`: `30`
      - `shadow.camera.bottom`: `-30`

## 3. Player Character

- **3.1. Geometric Composition**: A `THREE.Group` composed of a body (Sphere), eyes (Cylinder), blush (Circle), arms (Sphere), and feet (deformed Sphere).
- **3.2. Body Material**: The `bodyMat` material must be a `THREE.MeshStandardMaterial` and include the following exact properties:
  - `color`: `CONFIG.colors.player`
  - `roughness`: `0.4`
- **3.3. Physics & Controls**:
  - `playerSpeed`: `0.08`
  - `jumpForce`: `0.35`
  - `gravity`: `0.015`

## 4. Level Entities & Interactions

- **4.1. Stars**:
  - **Material**: `emissiveIntensity: 0.5`, `metalness: 0.5`, `roughness: 0.2`
  - **Interaction**: Collected when distance to player is less than `1.5`.
- **4.2. Enemies**:
  - **Behavior**: Patrols along the X-axis within a `baseX ± range` at a speed of `0.05` u/frame.
  - **Interaction**: When distance to player is less than `1.4`, pushes the player `2.0` units away and applies a `0.2` initial velocity on the Y-axis.

## 5. Core Game Loop & Algorithm Specification

- **5.1. `updatePhysics()`**:
  - **Strictly Prescriptive Instruction**: The movement direction calculation must be implemented in the following exact manner to ensure behavioral fidelity:

    ```javascript
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();

    const camRight = new THREE.Vector3();
    camRight.crossVectors(camForward, new THREE.Vector3(0, 1, 0));

    const moveDir = new THREE.Vector3();
    if (keys.w) moveDir.add(camForward);
    if (keys.s) moveDir.sub(camForward);
    if (keys.d) moveDir.add(camRight);
    if (keys.a) moveDir.sub(camRight);

    if (moveDir.length() > 0) {
      moveDir.normalize();
      player.mesh.position.add(moveDir.multiplyScalar(CONFIG.playerSpeed));
      const targetRotation = Math.atan2(moveDir.x, moveDir.z);
      player.mesh.rotation.y = targetRotation;
    }
    ```

  - **Collision Logic**: Ground detection and snapping are based on the logic: `currentFeetY >= platformTop - 0.5 && nextFeetY <= platformTop + 0.1`.
  - **Fall Reset**: When Y coordinate is `< -20`, reset position to `(0, 2, 0)`.

## 6. UI & Display Text

- **score_text**: "Stars: {score} / 5"
- **controls_text**: "WASD or Arrow Keys to Move | Space to Jump"
- **loading_text**: "Loading assets..."
- **win_title**: "Level Complete!"
- **win_body**: "You collected all the stars!"
- **win_button**: "Play Again"
- **error_alert**: "Three.js failed to load. Please check your network connection."
