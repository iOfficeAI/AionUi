# 《3D星之冒险》最终版·超规定性游戏规则文档

## 0. 启动与错误处理 (Initialization & Error Handling)

- **0.1. 启动流程**: 游戏的主逻辑函数 `initGame()` 必须在 `window.onload` 事件中被调用，以确保所有页面资源（包括脚本）加载完毕。
- **0.2. 资源加载检查**:
  - **强规定性指令**: `initGame()` 函数的**第一步**必须是检查 `THREE` 全局对象是否存在。这是为了处理 `three.min.js` 脚本加载失败的边界情况。必须使用以下精确代码实现此检查：
    ```javascript
    if (typeof THREE === 'undefined') {
      alert('Three.js 加载失败，请检查网络连接。');
      return;
    }
    ```

## 1. 游戏总览 (Game Overview)

- **1.1. 游戏名称**: `3D 星之冒险` (Kirby-like 3D)
- **1.2. 游戏类型**: 3D平台跳跃 (3D Platformer)
- **1.3. 核心目标**: 收集全部 **5** 颗星星。
- **1.4. 技术栈**: `Three.js` (r128), HTML5, CSS3, JavaScript (ES6)

## 2. 视觉与场景设定 (Visual & Scene Settings)

- **2.1. 场景 (Scene)**:
  - **背景色**: 天蓝色 (`0x87CEEB`)
  - **雾效 (Fog)**: `THREE.Fog`, 颜色 `0x87CEEB`, 起始 `20`, 结束 `60`。
- **2.2. 摄像机 (Camera)**:
  - **类型**: `THREE.PerspectiveCamera`
  - **视场角 (FOV)**: `60` 度
  - **近/远裁剪面**: `0.1` / `1000`
- **2.3. 光照 (Lighting)**:
  - **环境光 (Ambient Light)**: 颜色 `0xffffff`, 强度 `0.6`。
  - **平行光 (Directional Light)**:
    - **基础**: 颜色 `0xffffff`, 强度 `0.8`, 位置 `(20, 50, 20)`。
    - **阴影**:
      - `castShadow`: `true`
      - `shadow.mapSize.width`: `1024`
      - `shadow.mapSize.height`: `1024`
      - `shadow.camera.near`: `0.5`
      - `shadow.camera.far`: `100`
      - `shadow.camera.left`: `-30`
      - `shadow.camera.right`: `30`
      - `shadow.camera.top`: `30`
      - `shadow.camera.bottom`: `-30`

## 3. 玩家角色 (Player Character)

- **3.1. 几何构成**: 由身体(球体)、眼睛(圆柱体)、红晕(圆形平面)、手臂(球体)、脚(变形球体)组成的`THREE.Group`。
- **3.2. 身体材质**: 身体的`bodyMat`材质必须为`THREE.MeshStandardMaterial`，并包含以下精确属性：
  - `color`: `CONFIG.colors.player`
  - `roughness`: `0.4`
- **3.3. 物理与控制**:
  - `playerSpeed`: `0.08`
  - `jumpForce`: `0.35`
  - `gravity`: `0.015`

## 4. 关卡实体与交互 (Level Entities & Interactions)

- **4.1. 星星 (Stars)**:
  - **材质**: `emissiveIntensity: 0.5`, `metalness: 0.5`, `roughness: 0.2`
  - **交互**: 距离玩家小于 `1.5` 时被收集。
- **4.2. 敌人 (Enemies)**:
  - **行为**: 在 `baseX ± range` 范围内沿X轴以 `0.05` u/frame速度巡逻。
  - **交互**: 距离玩家小于 `1.4` 时，将玩家沿远离方向推开 `2.0` 单位，并给予 `0.2` 的Y轴初速度。

## 5. 核心游戏循环与算法规定

- **5.1. `updatePhysics()`**:
  - **强规定性指令**: 移动方向的计算必须严格按照以下方式实现，以保证行为保真度：

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

  - **碰撞逻辑**: 基于 `currentFeetY >= platformTop - 0.5 && nextFeetY <= platformTop + 0.1` 的逻辑进行地面检测和吸附。
  - **坠落重置**: Y坐标 `< -20` 时，重置位置到 `(0, 2, 0)`。

## 6. UI与显示文本 (UI & Display Text)

- **score_text**: "星星: {score} / 5"
- **controls_text**: "WASD 或 方向键移动 | 空格跳跃"
- **loading_text**: "正在加载资源..."
- **win_title**: "关卡完成!"
- **win_body**: "你收集了所有的星星！"
- **win_button**: "再玩一次"
- **error_alert**: "Three.js 加载失败，请检查网络连接。"
