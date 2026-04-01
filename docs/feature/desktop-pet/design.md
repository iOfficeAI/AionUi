# Desktop Pet — 实现方案设计

> 日期：2026-04-01
> 调研来源：[clawd-on-desk](https://github.com/rullerzhou-afk/clawd-on-desk)（MIT License）

## 1. 背景

在 AionUi 窗口内加入一个可拖动的 Clawd 桌面宠物，实时响应 AI 会话状态（思考、输出、空闲、报错等）。

动画资产直接复用 clawd-on-desk 的 SVG 素材（MIT 授权），无需自行绘制。

> **角色版权说明**：Clawd 形象归 Anthropic 所有，clawd-on-desk 是社区项目，非官方。AionUi 使用时须保留 LICENSE 文件。

---

## 2. 核心约束

1. **不影响现有布局**：宠物组件通过 `position: fixed` 悬浮，不插入任何现有布局层级
2. **最小改动**：各 platform SendBox 只需上报 `aiProcessing` 状态，约 5 行改动/文件
3. **纯 CSS 动画**：复用 SVG 自带动画，无需引入 framer-motion / lottie 等新依赖
4. **状态优先级**：error > notification > thinking > working > idle > sleeping，与 clawd-on-desk 一致
5. **可关闭**：用户可在设置中关闭宠物

---

## 3. 动画资产

从 clawd-on-desk `assets/svg/` 目录下载以下 12 个 SVG，放入 `src/renderer/assets/pet/`：

| 状态 | 文件名 | 触发条件 |
|------|--------|---------|
| `idle` | `clawd-idle-follow.svg` | 默认 |
| `idle-random-1` | `clawd-idle-reading.svg` | 空闲随机切换 |
| `idle-random-2` | `clawd-idle-doze.svg` | 空闲随机切换 |
| `thinking` | `clawd-working-thinking.svg` | AI 处理中（等待首个 token） |
| `working` | `clawd-working-typing.svg` | 流式输出中 |
| `happy` | `clawd-happy.svg` | 回复完成后 3s |
| `error` | `clawd-error.svg` | 会话报错 |
| `notification` | `clawd-notification.svg` | 需要用户确认操作 |
| `yawning` | `clawd-idle-yawn.svg` | 空闲 3min 后 |
| `collapsing` | `clawd-collapse-sleep.svg` | yawning → sleeping 过渡 |
| `sleeping` | `clawd-sleeping.svg` | 深度睡眠 |
| `waking` | `clawd-wake.svg` | 从睡眠唤醒 |

---

## 4. 文件结构

```
src/renderer/
├── assets/pet/                          ← SVG 资产（从 clawd-on-desk 复制）
│   ├── clawd-idle-follow.svg
│   ├── clawd-working-thinking.svg
│   └── ...（共 12 个）
├── components/pet/
│   ├── PetWidget.tsx                    ← 主组件：悬浮、可拖动、渲染 SVG
│   └── usePetState.ts                   ← 状态机 hook
└── hooks/context/
    └── PetContext.tsx                   ← 全局状态广播（新增）
```

改动现有文件：

| 文件 | 改动内容 |
|------|---------|
| `src/renderer/App.tsx`（或根布局） | 挂载 `<PetWidget />` 和 `<PetProvider>` |
| `platforms/openclaw/OpenClawSendBox.tsx` | `aiProcessing` 变化时调用 `usePet().report()` |
| `platforms/codex/CodexSendBox.tsx` | 同上 |
| `platforms/gemini/GeminiSendBox.tsx` | 同上（`streamRunning` / `waitingResponse`） |
| `platforms/nanobot/NanobotSendBox.tsx` | 同上 |
| `platforms/acp/AcpSendBox.tsx` | 同上 |

---

## 5. 状态机设计

### 5.1 状态定义

```ts
type PetState =
  | 'idle'        // 默认，随机切换 3 个 idle SVG
  | 'thinking'    // AI 在处理，未开始输出
  | 'working'     // 流式输出中
  | 'happy'       // 回复完成，持续 3s 后返回 idle
  | 'error'       // 报错，持续 5s 后返回 idle
  | 'notification'// 需要用户确认，持续 2.5s 后返回 idle
  | 'yawning'     // 空闲 3min 触发，持续 3s → collapsing
  | 'collapsing'  // 过渡动画 → sleeping
  | 'sleeping'    // 深度睡眠，鼠标移动唤醒
  | 'waking';     // 醒来动画，持续 1.5s → idle
```

### 5.2 状态优先级

```
error(8) > notification(7) > thinking(3) > working(2) > idle(1) > sleeping(0)
```

高优先级状态会中断低优先级；低优先级请求在最短展示时间（`MIN_DISPLAY_MS`）内会排队等待。

### 5.3 最短展示时间

| 状态 | 最短展示 |
|------|---------|
| `error` | 5000ms |
| `happy` | 3000ms |
| `notification` | 2500ms |
| `thinking` / `working` | 1000ms |

### 5.4 空闲睡眠序列

```
idle ──(3min 无事件)──► yawning ──(3s)──► collapsing ──► sleeping
sleeping ──(鼠标移动)──► waking ──(1.5s)──► idle
```

### 5.5 PetContext API

```ts
// PetContext.tsx
type PetContextValue = {
  report: (event: PetEvent) => void;  // 各 SendBox 调用
  state: PetState;                    // PetWidget 订阅
  visible: boolean;
  setVisible: (v: boolean) => void;
};

type PetEvent =
  | { type: 'thinking-start' }
  | { type: 'streaming-start' }
  | { type: 'streaming-end' }
  | { type: 'error' }
  | { type: 'confirm-required' }   // ConversationChatConfirm 触发
  | { type: 'user-activity' };     // 鼠标/键盘事件，用于重置睡眠计时器
```

---

## 6. 组件设计

### 6.1 PetWidget

- `position: fixed; bottom: 24px; right: 24px; z-index: 9999`
- 订阅 `PetContext.state`，切换对应 SVG `src`
- 支持鼠标拖动（`onMouseDown` + `document.mousemove`），拖动后位置存 `localStorage`
- 点击宠物：触发 `happy` 状态（互动反馈）
- SVG 切换时加 100ms `opacity` 淡入淡出过渡

### 6.2 SVG 渲染

直接用 `<img src={svgUrl} />` 渲染，SVG 文件内的 `<animate>` / `<animateTransform>` 标签会自动播放，无需额外控制。

宠物尺寸：`width: 80px; height: 80px`（默认），可在设置中调整为 60px / 80px / 100px。

---

## 7. 各 Platform 接入

各 SendBox 已有 `aiProcessing` / `streamRunning` / `waitingResponse` 等状态变量，只需在变化时调用 `usePet().report()`：

```ts
// 以 OpenClawSendBox 为例，改动约 5 行
const { report } = usePet();

useEffect(() => {
  if (aiProcessing) report({ type: 'thinking-start' });
}, [aiProcessing]);

useEffect(() => {
  if (running) report({ type: 'streaming-start' });
  else report({ type: 'streaming-end' });
}, [running]);
```

`ConversationChatConfirm` 弹出确认时上报 `confirm-required`，触发 `notification` 状态。

---

## 8. 设置项

在「显示设置」页新增「桌面宠物」分组：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 显示宠物 | 开 | 全局开关 |
| 宠物大小 | 中（80px） | 小/中/大 |

设置存 `localStorage`，无需写入 DB。

---

## 9. 实现步骤

| 步骤 | 内容 | 估计工作量 |
|------|------|-----------|
| 1 | 批量下载 12 个 SVG 到 `src/renderer/assets/pet/` | 10min |
| 2 | 实现 `PetContext.tsx` + `usePetState.ts` 状态机 | 2h |
| 3 | 实现 `PetWidget.tsx`（渲染 + 拖动） | 1h |
| 4 | 在根组件挂载 PetProvider 和 PetWidget | 15min |
| 5 | 各 platform SendBox 接入（5个文件，各约5行） | 1h |
| 6 | 显示设置页新增开关 | 30min |
| 7 | 写测试（状态机逻辑） | 1h |

---

## 10. 不做的事

- **不支持窗口外悬浮**：主窗口非透明/无边框，宠物只在 app 内，不飘在桌面
- **不做成长/进化系统**：Phase 1 不需要，保持简单
- **不接入 Claude API 生成性格**：SVG 动画本身已足够表达状态
- **不做 Mini 模式**：clawd-on-desk 有 mini 变体，AionUi 暂不需要
