# Ambient Mode —— Agent 驱动的极简交互形态（Demo 版需求）

> 状态：草稿（demo 阶段）｜作者：与用户共创｜最后更新：2026-05-11
>
> 本文档只覆盖 **demo 阶段** 的范围，目标是验证「气泡 → 输入 → 沉浸聊天 → Agent 主动展开 UI」这条核心交互链路可行。生产化（多语言、a11y、i18n、telemetry、设置面板迁移等）不在本文档范围内，后续版本再补。

---

## 0. 愿景 & 非目标

### 愿景

把 AionUi 从「一个功能齐全的 AI 聊天客户端」变成 **「一个悬浮在桌面上、意图驱动的 AI 助手」**：

- 用户启动应用 → 看到的只是一个悬浮气泡，不是一整屏功能。
- 用户开始表达意图 → 界面**由 Agent 主动展开**（历史、工作空间、文件预览、配置弹窗…），而不是用户自己去找按钮。
- Agent 能一次调用多个 UI tool（parallel tool calling），"唰"地一下铺好工作台。

### 非目标（demo 阶段不做）

- ❌ 替换现有 AionUi 主界面（通过 feature flag 隔离，默认关闭）
- ❌ 全套 i18n / a11y / 主题适配
- ❌ 生产级错误处理 / telemetry
- ❌ 现有所有功能（定时任务、团队、扩展市场等）都接入 ambient 模式 —— demo 只覆盖核心几个
- ❌ 移动端 / Web 端（仅 Electron 桌面）
- ❌ 多窗口 / 多气泡（demo 阶段只支持**单窗口**：一个气泡 = 一个主对话）

---

## 1. 范围与隔离策略

### 1.1 分支

- 分支名：`feat/ambient-mode`，从 `main` 拉出
- **不修改** 现有 `src/renderer/pages/`、`src/renderer/components/` 下的文件（可读，不可改）
- **Pet 模块**：在 A 演进路线下（§3 决策 7），`src/process/pet/` / `src/renderer/pet/` / `src/preload/pet*.ts` **可改名或重构**为 ambient 对应文件，具体由 Dev 与 Arch [ARCH-CHECK] 协调

### 1.2 入口隔离

- Ambient 渲染层入口：演进自 `src/renderer/pet/`（Dev 可改名为 `src/renderer/ambient/` 或保留内部名）
- Electron 窗口：**复用 pet 的** `BrowserWindow` 配置（frameless + transparent + alwaysOnTop screen-saver level + 可动态 resize），已在 pet 中跨平台验证
- Feature flag：`AIONUI_AMBIENT=1` 环境变量 **或** 设置里的 "Ambient Mode" 开关；默认关闭（升级后对存量 `pet.enabled=true` 用户做迁移，见 AC-M1-15）
- 开关开启后：启动时创建 ambient 气泡窗口（**替代** pet 窗口的创建路径，见 AC-M1-10）
- 开关关闭时：走 legacy pet 路径（作为向后兼容入口）

### 1.3 复用基建

以下模块**直接复用，不 fork**：

- IPC bridge（`src/preload.ts`）
- LLM / Agent 后端（ACP、MCP 支持）
- 会话存储、工作空间配置、LLM 凭证
- `@arco-design/web-react` 组件库、UnoCSS、i18n 框架（虽然 demo 阶段只做中文）
- **Pet 现有基建**（drag / setOpacity / Windows transparent-resize hack / hit-test 双窗口 / screen API 位置计算）

---

## 2. 模块划分与状态机

Ambient 模式是一个**状态机**，窗口在不同状态之间过渡。下列模块按状态组织。

### 状态概览

```
                  hover / 点击
[Bubble] ─────────────────────────> [Input]   ──submit──> [ImmersiveChat]
   ▲                                   │                        │
   │                                   │ Esc / 失焦且空          │ Agent tool call
   │                                   ▼                        ▼
   │                              [Bubble]                 [PanelExpanded]
   │                                                            │ 手动收起 / Agent 关闭
   │                                                            ▼
   │                                                      [ImmersiveChat]
   │
   │      主动关闭 (×) ─────> 下次 hover 回到 [Input] 空输入框
   └──── 失焦/切走 ─────────> 下次 hover 恢复 [ImmersiveChat] 上次对话
```

---

## M1. 气泡态（Bubble）

### 功能描述（用户视角）

应用启动后，桌面上出现一个圆形悬浮小气泡（尺寸约 64×64 px），默认吸附在屏幕右下角。用户可以拖动它到任意位置。

### 用户操作路径

1. 启动 AionUi（ambient flag 开启）→ 看到气泡出现在右下
2. 拖动气泡到其他位置 → 气泡跟随光标，松开后吸附到最近的屏幕边缘
3. 鼠标移开气泡一段时间 → 保持原位不变
4. 双击气泡 / 右键气泡 → 触发相应操作（见 M4 逃生阀）

### 验收标准（AC）

- **AC-M1-1**（P0）：启动后 2 秒内气泡可见，位于屏幕右下角。**精确位置口径**（来源：[ARCH-REQ-CLARIFY-REPLY] push back，对齐 `petManager.ts:308-334 computeInitialPosition()`）：
  - 用**主显示器** `screen.getPrimaryDisplay().workAreaSize`（已扣除 Dock / Windows 任务栏 / Linux panel），**不用** `screen.width`
  - 气泡窗口左上角 `x = workAreaSize.width - 24 - 64`，`y = workAreaSize.height - 24 - 64`
  - 24 px 边距按"边"算（气泡外接矩形的右边/底边），不按中心
  - **反例**：若用 `screen.width / height` 会导致气泡被 Dock / 任务栏盖掉一半
- **AC-M1-2**（P0）：气泡可拖动，拖动过程中窗口透明度略降至 0.85，松手后吸附并恢复不透明（1.0）
  - **透明度实现定稿**（来源：[ARCH-REQ-FEEDBACK ADDENDUM] 工程论证）：通过 `BrowserWindow.setOpacity(0.85)` 作用于整窗（OS compositor alpha，跨 macOS NSWindow / Windows DWM layered / Linux compositor 一致），而非 DOM `opacity` / CSS `filter: opacity`（frameless + transparent 下行为错误：气泡本体半透 → 桌面从气泡里透出来，体感"被擦掉"而非"被拿起"）。
  - **透明度复位时机（硬约束，漏即 bug）**：设 0.85 于 `drag-start` handler；复位 1.0 必须在三处全部覆盖 — ① `drag-end` 正常松手；② drag watchdog 超时（复用 pet 的 `DRAG_WATCHDOG_MS = 8000`，防 renderer 丢 pointerup）；③ drag 被 resize / 状态切换中断。任何一处漏写，用户会看到气泡永久 0.85 半透，只能重启应用恢复。
  - **性能**：`setOpacity` 不触发 renderer 重绘，drag-start / drag-end 各调一次，非每帧，不影响流畅度。
  - **E2E 验证**：封装 `getBubbleOpacity(electronApp)` helper — `electronApp.evaluate(({ BrowserWindow }) => /* 识别气泡窗 */ bubble.getOpacity())`。drag 中 = 0.85；drag 结束 = 1.0；watchdog 超时后也必须 = 1.0（可 skip 或用 fake timer 注入）。
  - **吸附规则**：只吸左右两侧，不吸上下边（产品决策，[ARCH-REQ-CLARIFY-REPLY] push back 已澄清 — 气泡是"功能入口"需要可预测位置，不是 pet 那种纯装饰物；左右吸附符合"侧边栏入口"心智模型；上下吸会被 macOS menubar / Windows 任务栏压住）。基准用气泡**当前所在显示器**的 `workArea`（非主显示器）：松手时若气泡中心 `x < workArea.x + workArea.width / 2` 吸左（`x = workArea.x + 24`），否则吸右（`x = workArea.x + workArea.width - 24 - 64`）；y 轴保留松手时位置，仅做可见区域 clamp：`y = clamp(y, workArea.y + 24, workArea.y + workArea.height - 24 - 64)`（同时覆盖 AC-M1-6）
- **AC-M1-3**（P0）：气泡始终置顶（alwaysOnTop），不被其他窗口遮挡
- **AC-M1-4**（P1）：气泡窗口 frameless + transparent，**看不到系统标题栏和窗口边框**
- **AC-M1-5**（P1）：关闭应用后下次启动，气泡恢复到上次关闭前的位置。**持久化定稿**（来源：[ARCH-REQ-CLARIFY-REPLY] Q1）：走主进程 `ConfigStorage`（参考 `src/common/config/storage.ts:191-198` 已有的 `pet.*` 命名空间），新增以下 key：
  - `ambient.enabled?: boolean` — AC-M1-11/12 feature flag settings 侧存储
  - `ambient.bubblePosition?: { x: number; y: number; displayId: number }` — AC-M1-5 本条；`displayId` = `screen.Display.id`，用于外接屏拔掉的降级
  - `ambient.onboardingHintShown?: boolean` — AC-M6-4 持久化
  - `ambient.lastSessionClosedExplicitly?: boolean` — AC-M3-10/11 "主动关闭 vs 失焦切走"
  - Bridge 模板参考 `src/process/bridge/systemSettingsBridge.ts:154-164`（pet 已有 getter/setter 模式）
- **AC-M1-6**（P2，边界）：如果用户把气泡拖到屏幕外 → 自动拉回可见区域（由 AC-M1-2 的 y-axis clamp 规则覆盖；x 轴因吸附天然不会越界）
- **AC-M1-7**（P2，边界）：多显示器场景下的气泡位置决策（来源：[ARCH-REQ-FEEDBACK] ⑥-1）：
  - **首次启动**（无持久化位置）：位于**主显示器** (`screen.getPrimaryDisplay()`) 的右下角。说明：原需求"跟光标所在显示器"改为"主显示器"，理由：首启时光标位置不稳定（Windows 登录瞬间、macOS 切空间），主显示器语义更稳；且 pet 的 `petManager.ts:308-334 computeInitialPosition()` 已经采用此策略，保持一致
  - **非首次启动**：恢复上次关闭时的位置（含 `displayId`）
  - **降级**：若上次位置的 `displayId` 在当前启动时不存在（外接屏拔了） → 回落到主显示器右下角
  - **E2E 方案定稿**（来源：[ARCH-REQ-CLARIFY-REPLY] Q2）：**不可 mock**。Electron `screen` 是 main process native module，即使 monkey-patch JS 函数，`BrowserWindow` 构造时 Chromium 会按真实显示器校正位置。→ **直接 `test.skip()`**，原因 = `'Multi-monitor scenarios require hardware; tracked in manual-checklist'`，在 `docs/testing/manual-checklist.md` 登记手工验收步骤
- **AC-M1-8**（P1）：**点击**气泡（不是 hover）等价于 hover 展开 → 进入 M2 输入态（作为触屏 / 外接鼠标用户的 fallback）
  - **点击 vs 拖动冲突口径**：`mousedown → 记录起始位置 → mouseup 时若累计位移 ≤ 5 px` 视为点击（触发 M2 展开）；否则视为拖动（仅落位，不展开）。阈值 5 px 对齐 macOS / Windows 原生点击容差。触发事件为 **mouseup**（非 mousedown），避免拖动途中误展开。
- **AC-M1-9**（P0，测试可达性约束）：气泡主要 DOM 节点须挂 `data-testid="ambient-bubble"`；输入态根节点 `data-testid="ambient-input"`；沉浸聊天窗口 `data-testid="ambient-chat"`。禁止 E2E 通过 CSS class selector（例如 `.ambient-bubble`）定位——让测试与实现目录解耦（Ambient ↔ Pet 关系未定，见 §5）。
- **AC-M1-10**（P1，Pet ↔ Ambient 替代关系；来源：用户 2026-05-11 裁决 U-1 = A 演进 + 追加 2026-05-11 裁决细化）：Ambient 是 Pet 的演进后形态（**不是并行互斥，是同一 BrowserWindow 家族的演进**）：
  - **启动分叉**：主进程在 `handleAppReady` 读取 `ambient.enabled` / `AIONUI_AMBIENT` env var（AC-M1-11 优先级）。若 ambient 启用 → 创建 ambient 窗口（内部实现可直接复用 `petManager.ts` 或改名为 `ambientWindowManager.ts`，由 Dev 与 Arch [ARCH-CHECK] 协调）；若未启用 → 走 legacy pet 路径（作为向后兼容入口）
  - **不会同时存在**：因同一窗口家族的两种语义形态，互斥由"启动期二选一"天然保证，不需要运行时动态判断
  - **Settings UI**：不再显示"Pet Enabled"独立开关，统一为"Ambient Mode"开关。旧 `pet.enabled` 值由迁移逻辑（AC-M1-15）消费后不再显示
- **AC-M1-11**（P1，feature flag 优先级；来源：[ARCH-REQ-FEEDBACK] ⑤）：`AIONUI_AMBIENT=1` env var **优先级高于** settings 开关。当 env var 显式设置（= `1` 或 `0`）时忽略 settings 开关。理由：方便 E2E / CI 固定模式测试。env var 未设置（undefined）时才读 settings 开关。
- **AC-M1-12**（P1，模式切换需重启；来源：[ARCH-REQ-FEEDBACK] ⑤）：通过 settings 开关切换 ambient ↔ 传统模式 → **必须重启应用才生效**，切换后弹 toast "Restart required to apply"（demo 阶段英文即可），用户点重启或忽略。理由：Electron `BrowserWindow` 的 frameless/transparent 属性创建后不可改。
- **AC-M1-13**（P1，启动位置 validate；来源：[ARCH-REQ-CLARIFY-REPLY] Q1 边界）：主进程 `createAmbientWindow()` 读取 `ambient.bubblePosition` 后必须 validate：
  - 若 `displayId` 不在 `screen.getAllDisplays().map(d => d.id)` 中（外接屏拔了） → 回落 `computeInitialPosition()` = 主显示器右下角默认位置，**不抛错**
  - 若 `displayId` 存在但 `{x, y}` 被拖到该显示器 `workArea` 外 → clamp 回 workArea 边界（与 AC-M1-6 合并实现）
  - 这条是 AC-M1-5 / AC-M1-6 / AC-M1-7 的边界保护网，实现侧必须覆盖
- **AC-M1-14**（P1，E2E fixture 契约；来源：[ARCH-REQ-CLARIFY-REPLY] Q3）：ambient E2E 不走现有 singleton app，使用独立 fixture：
  - 新增 `tests/e2e/fixtures.ts` 中 `launchAppWithEnv(extraEnv)` helper（抽通用逻辑，env 参数化）
  - 导出新 fixture `ambientTest extends base`：`ambientApp` 走 `AIONUI_AMBIENT=1` env，`ambientPage` 通过 title/url resolve 气泡窗口
  - ambient spec 用 `import { ambientTest as test } from '../fixtures';`
  - 现有 30+ spec 不受影响（不走 C 路线的 runtime IPC toggle，因窗口 frameless/transparent 不可运行时切换）
- **AC-M1-15**（P1，存量 Pet 用户迁移；来源：用户 2026-05-11 裁决 U-1 = A 演进 + 伴生子问题）：升级后对已有 `pet.*` 设置的用户做**首次启动迁移**（幂等，只做一次）：
  - 条件：检测到 `pet.enabled === true` 或任何 `pet.*` key 存在且 `ambient.enabled === undefined`（表示首次升级）
  - 迁移映射：`pet.enabled → ambient.enabled`；`pet` 窗口持久化位置 → `ambient.bubblePosition`（保留 x/y，`displayId` 从 `screen.getDisplayNearestPoint({x,y}).id` 推算）；其他 `pet.*` 设置（如 dnd、confirmEnabled）**暂不迁移**（pet 的卡通语义在 A 选项下默认去除）
  - 迁移标记：写入 `ambient._migratedFromPet = true` 持久化 key（非用户可见）避免重复迁移
  - 迁移失败降级：任一读写失败 → 不中断启动，记 warn 日志，下次启动重试
  - i18n：`pet.json` 语言包保留不动（作为 legacy 字符串），ambient 新增 `ambient.json` 按需使用。demo 阶段只做中文，i18n 迁移延后
  - **E2E**：单独 test case 验证"模拟 `pet.enabled=true` + 未有 ambient 配置 → 启动 → 断言 `ambient.enabled=true` + `ambient.bubblePosition` 被赋值 + `ambient._migratedFromPet=true`"

### 状态：未实现

---

## M2. 输入态（Input）

### 功能描述（用户视角）

鼠标 hover 到气泡上（停留 > 300 ms）→ 气泡平滑展开为一个输入框（约 480 × 160 px）。输入框上方列出若干**推荐提示词**，帮助用户快速发起意图。用户也可以直接拖文件到输入框。

### 用户操作路径

1. 鼠标 hover 气泡 → 展开为输入框 + 提示词
2. 点击提示词 → 提示词填入输入框（不自动发送）
3. 输入文字 / 拖入文件 → 文件以附件形式显示在输入框下方
4. 回车 / 点发送 → 进入沉浸聊天态（M3）
5. Esc / 输入框失焦且无内容 → 收起回气泡态（M1）

### 推荐提示词（demo 默认集）

hover 展开后，输入框上方展示 3–4 条预设提示词（后续可配置）：

- 📜 "看看我最近的聊天"（触发 `show_history()`）
- 💻 "进入写代码模式"（触发 `switch_scene('coding')`）
- 🔧 "配置一下 LLM"（触发 `open_llm_settings()`）
- 🎯 "开始新对话"（纯文本占位，直接进入 M3）

### 验收标准（AC）

- **AC-M2-1**（P0）：hover 气泡 300 ms 后展开为输入框，展开动画 ≤ 250 ms
- **AC-M2-2**（P0）：输入框上方显示至少 3 条推荐提示词
- **AC-M2-3**（P0）：点击提示词 → 提示词文本填入输入框，**不自动发送**，光标停在文本末尾
- **AC-M2-4**（P0）：回车发送 → 进入 M3 沉浸聊天态
- **AC-M2-5**（P1）：拖文件到输入框 → 文件作为附件挂载，显示文件名 + 图标
- **AC-M2-6**（P1）：Esc / 失焦且输入框为空 → 收起回气泡态
- **AC-M2-7**（P2，边界）：失焦但输入框**有内容** → 保持输入态不收起（避免丢失草稿）
- **AC-M2-8**（P2，边界）：拖入非受支持文件类型 → 显示错误提示，不挂载
- **AC-M2-9**（P2，边界）：输入框内容超过单行 → 输入框高度自适应，最高 6 行后出现滚动条

### 状态：未实现

---

## M3. 沉浸聊天态（Immersive Chat）

### 功能描述（用户视角）

发送第一条消息后，输入框所在窗口**变高**（约 480 × 720 px），变成一个极简的聊天界面：顶部只有当前 agent/模型指示器，中间是消息流，底部保留输入框。**没有** 侧边栏、会话列表、工作空间、顶部菜单。

### 用户操作路径

1. 在 M2 发送消息 → 窗口向上扩展为 720 px 高，消息出现在中间区域
2. Agent 流式返回消息 → 实时渲染
3. 继续输入 / 发送 → 继续对话
4. 点击顶部 agent 指示器 → 可切换 agent/模型（极简 popover，不展开侧栏）
5. 点击窗口外 / Esc → 收起回气泡态（**保留会话，下次 hover 展开时恢复为 M3 而非 M2**？见下方 [待确认]）

### 验收标准（AC）

- **AC-M3-1**（P0）：发送首条消息后窗口扩展为 ~720 px 高，扩展动画 ≤ 300 ms
- **AC-M3-2**（P0）：消息流支持流式渲染（打字机效果），和当前 AionUi 一致
- **AC-M3-3**（P0）：界面**不包含** 左侧栏、会话列表、工作空间面板、顶部菜单栏
- **AC-M3-4**（P0）：顶部显示当前 agent + model 名称（简洁 chip）
- **AC-M3-5**（P1）：点击顶部 agent chip → 弹出极简下拉，可切换模型
- **AC-M3-6**（P1）：窗口保持 frameless + transparent，聊天态下背景为半透明 blur。跨平台降级（来源：[ARCH-REQ-FEEDBACK] ①-2）：
  - **macOS**：`BrowserWindow` 创建时加 `vibrancy: 'hud'`（或 `'sidebar'`，demo 阶段任选其一先跑通）
  - **Windows 10/11**：用 `backgroundMaterial: 'acrylic'`（需 Electron 32+）
  - **Windows < 10 / Linux**：退化为不透明深色背景（例如 `#1f1f1f` 95% 不透明）+ 无 blur，不阻塞功能
  - **注意**：动态 resize（M4 面板展开）期间 vibrancy 可能有 1-2 帧视觉 artifact，demo 阶段接受，不做额外抑制
- **AC-M3-7**（P1）：Esc / 点击气泡收起按钮 → 回到气泡态，**对话保留在当前会话**
- **AC-M3-8**（P2，边界）：失去焦点不自动收起（用户需要去看文档 / 复制代码片段）
- **AC-M3-9**（P2，边界）：窗口最小宽度 360 px，最小高度 480 px，不允许小于此
- **AC-M3-10**（P1）：从气泡重新 hover 展开时的恢复策略：
  - 若用户上次**主动关闭了对话窗口**（点关闭按钮 / Esc） → 展开为**空输入框 M2 状态**
  - 若用户上次**只是让窗口失焦 / 切走**（未主动关闭） → 展开为**上次的 M3 沉浸聊天状态**，对话保留
- **AC-M3-11**（P1）：M3 状态下提供显式的"关闭对话"按钮（顶部 × 图标），点击后记录为"主动关闭"，下次 hover 回到 M2
- **AC-M3-12**（P0，渲染模式切换；来源：[ARCH A/B/C 预判] 路线 A 硬约束）：M1 气泡态到 M3 以上的窗口需切换渲染模式以规避 Windows transparent-resize 闪烁。**实现约束**：
  - **M1 气泡态**：`transparent: true`（沿用 pet 的真透明方案，小尺寸 resize 偶发可接受）
  - **M3 沉浸聊天态及以上（含 M4 面板展开）**：切换为 `transparent: false` + `backgroundColor: 'rgba(0,0,0,0.85)'` 的"半透明模式"。这是"半透明渲染"而非"真 transparent"，Windows 的频繁 resize 不会触发 DWM 闪烁
  - **切换时机**：发送首条消息时（M2 → M3 过渡），用 fade 动画掩盖窗口切换。**此时机具有不可逆性**——用户主动关闭对话回到气泡态后，下次展开若恢复 M3（AC-M3-10 未主动关闭分支），可以继续保留半透明模式；若恢复 M2（主动关闭分支），重新创建真 transparent 气泡窗口
  - **平台差异**：macOS vibrancy（AC-M3-6）与本条不冲突，vibrancy 在半透明模式下仍可生效（底层 blur）
  - **E2E 断言**：通过 `BrowserWindow.isTransparent()` + `getBackgroundColor()` 区分两种模式
  - **不选此方案的代价**：走 pet 现有 hide→setBounds→show workaround 能撑过 M1 气泡 <-> 输入态的偶发 resize，但 M4 并发 tool call 动画 + 频繁 panel toggle 下闪烁**不可接受**（arch 评估）

### 状态：未实现

---

## M4. Agent 驱动的面板展开（Panel Expanded）

### 功能描述（用户视角）

Agent 在回答用户意图时，可以**调用 UI tool**，主动让界面展开特定面板：

- 用户："给我看看最近的聊天记录" → Agent 调 `show_history()` → 窗口向左扩展，出现会话列表
- 用户："我想开始写代码" → Agent 可能并行调用 `switch_scene('coding')` = `open_workspace()` + `resize_window('wide')`
- 用户："帮我看下 SKILL.md 这个文件" → Agent 调 `open_file_preview(path)` → 窗口向右扩展，出现文件预览面板
- 用户："LLM 怎么配置" → Agent 调 `open_llm_settings()` → 弹出配置 modal

### UI Tool 清单（demo 版）

**注册通道：路径 B（Agent 内置虚拟 UI tool，非 MCP）**（用户于 2026-05-11 裁定，见 §3 决策 6 / §5 U-2）— 这些 tool 不通过 MCP 注册，而是作为 Agent 端原生可见的虚拟 tool set，hook 到 agent tool-call 流里拦截对应 tool name，直接主进程 IPC 到 ambient renderer。Gemini 端参考 `src/process/agent/gemini/cli/tools/img-gen.ts` 模式；ACP 端（claude/codex/qwen）挂在 agent 适配层（`src/process/task/AcpAgentManager.ts` 或 `src/process/agent/acp/*`）。

Agent 可按需调用（支持 parallel tool calling，合批规则见 AC-M4-7）：

| Tool                      | 说明               | UI 行为                                |
| ------------------------- | ------------------ | -------------------------------------- |
| `show_history()`          | 展开会话历史面板   | 左侧扩展 ~240 px，显示会话列表         |
| `hide_history()`          | 收起会话历史面板   | 左侧面板消失                           |
| `open_workspace()`        | 展开工作空间文件树 | 右侧扩展 ~280 px，显示文件树           |
| `hide_workspace()`        | 收起工作空间       | 右侧面板消失                           |
| `open_file_preview(path)` | 打开文件预览       | 右侧扩展 ~640 px，显示文件内容         |
| `close_file_preview()`    | 关闭文件预览       | 预览面板消失                           |
| `open_llm_settings()`     | 打开 LLM 配置弹窗  | 弹出 modal                             |
| `switch_scene(scene)`     | 切换场景预设       | 组合调用多个 tool（见下方"场景预设"）  |
| `resize_window(preset)`   | 调整窗口尺寸预设   | `narrow` / `default` / `wide` / `full` |

### 场景预设

`switch_scene` 接受 `chatting` / `coding` / `research` 三种值，语义如下：

- `chatting` = `hide_history()` + `hide_workspace()` + `close_file_preview()` + `resize_window('default')`
- `coding` = `open_workspace()` + `resize_window('wide')`
- `research` = `show_history()` + `open_workspace()` + `resize_window('full')`

### 验收标准（AC）

- **AC-M4-1**（P0，注册通道定稿；来源：用户 2026-05-11 裁决 = 路径 B）：所有 UI tool 作为 **Agent 端原生虚拟 tool** 暴露给 Agent 调用，**不走 MCP server**：
  - Gemini 端：按 `src/process/agent/gemini/cli/tools/img-gen.ts` 模式注入到 gemini fork 的内置 tool 集
  - ACP 端（claude / codex / qwen）：挂在 agent 适配层（`src/process/task/AcpAgentManager.ts` 或 `src/process/agent/acp/*`）
  - tool handler 实现在主进程 **`src/process/ambient/ambientUiToolHandler.ts`**，直接持有 `BrowserWindow` 引用 + 通过 IPC bridge 推送状态到 ambient renderer
  - **对外叙事**：tool 称为 "Ambient UI tools (agent-native)"，不叫 "MCP tools"
  - **未选路径 A 的理由**：路径 A 需重构 MCP transport 层 + in-process MCP server + stdio bridge 桥接，工程量约 5x，demo 阶段不值；v2 若确需 MCP-first 可将 tool 定义从 handler 解耦再接 MCP transport，接口保持稳定
  - **历史决策记录**：Arch 在 [ARCH-REQ-FEEDBACK] ② 发现现行 MCP server 跑在独立 stdio 子进程，无 `BrowserWindow / ipcMain` 访问能力；给出路径 A（in-process MCP）/ 路径 B（agent 原生虚拟 tool）两个方案；PM + Arch 均推荐 B；用户 2026-05-11 裁定选 B
  - **Demo 范围定稿（用户 2026-05-11 裁决 U-3 = 仅 Gemini）**：
    - **仅支持 Gemini**：按 `src/process/agent/gemini/cli/tools/img-gen.ts` 的 `BaseDeclarativeTool` + `BaseToolInvocation` pattern 注入兄弟 tool 类（`AmbientShowHistoryTool` / `AmbientOpenWorkspaceTool` / `AmbientOpenFilePreviewTool` 等）到 gemini fork 的内置 tool 集，工作量约 1 人·天
    - **ACP 后端（claude / codex / qwen）不在 demo 范围**，延后到 v2（见 §6）。用户切 Claude / Codex / Qwen 时 M3 聊天正常，但 M4 UI tool 调用无效（Agent 声明 tool 不存在 → 友好降级消息 per AC-M4-10，不崩溃）
    - **实现入口**：tool handler 在 `src/process/ambient/ambientUiToolHandler.ts`（或演进自 pet 目录），持 `BrowserWindow` 引用 + 通过 IPC bridge 推送状态到 ambient renderer
- **AC-M4-2**（P0）：Agent 单次响应调用多个 tool 时，UI **同时执行**（parallel，不排队），动画并行播放
- **AC-M4-3**（P0）：每次面板展开/收起动画 ≤ 300 ms，无闪烁
- **AC-M4-4**（P0）：`show_history()` 展开后，用户点击列表项 → 切换到该会话，窗口状态保持
- **AC-M4-5**（P0）：`open_file_preview(path)` 支持 .md / .txt / 常见代码文件（复用现有预览组件）
- **AC-M4-6**（P0）：`open_llm_settings()` 复用现有 LLM 配置组件（不重新实现）
- **AC-M4-7**（P1）：`switch_scene` 调用时，所有子 tool 在同一动画帧触发，体感是"一下铺开"。**实现要求**（来源：[ARCH-REQ-FEEDBACK] ②）：Agent 单轮响应 emit N 个 tool_call → 主进程 IPC **一次性 send 一条合批消息** `{ ops: [...] }` → renderer 在一个 `requestAnimationFrame` 里一起 apply。**禁止**主进程独立 send N 次 IPC（Windows DWM 调度下帧序不保证，动画必然错峰）
- **AC-M4-8**（P1）：用户可以手动关闭 Agent 打开的面板（每个面板右上角有收起按钮）
- **AC-M4-9**（P2，边界；来源：[ARCH-REQ-FEEDBACK] ⑥-2）：面板展开后超屏处理：
  - **屏幕宽度基准**：取"当前光标所在显示器" `workArea.width`（已扣除 Dock / 任务栏），不用 `screen.width`
  - **压缩优先级**：先压 workspace 面板（右侧文件树），次压 history 面板（左侧会话列表），**最后**才缩小 file preview（用户最关心）
  - **宽度 hard floor**：`narrow=480` / `default=640` / `wide=960` / `full=1280`。若当前屏幕 workArea.width 低于 `full` 所需的 1280，`full` 场景自动降级为 `wide`
- **AC-M4-10**（P2，边界）：Agent 调用不存在的 tool 或参数错误 → 返回友好错误消息给 Agent，不崩溃 UI
- **AC-M4-11**（P2，边界）：Agent 在一次响应中重复调用同一 tool → 只执行一次（幂等）
- **AC-M4-12**（P0，并发排队；来源：[ARCH-REQ-FEEDBACK] ④）：动画并发控制（填补 AC-M4-2/AC-M4-11 之间 gap）：
  - 面板展开/收起动画**进行中**时，若有**新** tool call 到达（例如 `switch_scene('coding')` 动画中 Agent 再 emit `open_file_preview`）→ 必须**排队**到当前动画完成再执行；不得中途切状态（Windows `setBounds` 打架会导致视觉撕裂）
  - 排队上限 3 个，超出丢弃并记 warn 日志（demo 阶段不做复杂调度）
  - AC-M4-7 的"同一响应多 tool 合批"和本条"跨响应排队"是两个机制：合批 = 一帧内并发；排队 = 跨帧串行
- **AC-M4-13**（P2，DPI 边界；来源：[ARCH-REQ-FEEDBACK] ⑥-3）：用户把 ambient 窗口拖到不同 DPI 显示器之间（如 2x 内屏 → 1x 外屏）→ 允许一帧视觉跳动，不保证 smooth transition。切屏瞬间重算 bounds 并 `setBounds`（Electron `BrowserWindow` API 使用 logical pixel，主进程不做额外 DPI 校正）

### 状态：未实现

---

## M5. 手动逃生阀（Manual Escape）

### 功能描述（用户视角）

用户有时候不想和 Agent 说话，直接想看全景。提供两条手动入口：

1. **气泡右键菜单**：右键气泡 → 选"展开完整面板" → 切换到 `research` 场景（历史 + 工作空间 + 默认对话）
2. **全局快捷键**：`⌘⇧E`（mac）/ `Ctrl+Shift+E`（win）→ 切换 ambient 模式 ↔ 完整面板

### 验收标准（AC）

- **AC-M5-1**（P1）：气泡右键菜单包含"展开完整面板"选项
- **AC-M5-2**（P1）：点击后等价于调用 `switch_scene('research')`，不需要和 Agent 说话
- **AC-M5-3**（P2）：全局快捷键 `⌘⇧E` 可触发切换
- **AC-M5-4**（P1）：逃生阀切换行为 = **ambient 模式下展开全部面板**（等价于 `switch_scene('research')`），不回退到传统 AionUi 主界面。demo 阶段不引入双主界面切换
- **AC-M5-5**（P2）：气泡右键菜单还应包含：退出应用、打开设置、关于

### 状态：未实现

---

## 3. 已决策项（2026-05-11 用户确认）

以下项在需求对齐阶段由用户明确决策，已合并到各模块 AC 中：

1. **M3 恢复策略** → 用户主动关闭对话 = 下次展开为空输入框；未主动关闭 = 恢复上次对话状态。见 AC-M3-10 / AC-M3-11
2. **逃生阀行为** → ambient 模式下全面板展开（`switch_scene('research')`），不切回传统界面。见 AC-M5-4
3. **首次启动引导** → 需要；3 秒 hint "Hover me to start"，第二次启动后不再出现。见下方 M6
4. **多窗口** → demo 阶段仅单窗口（一个气泡对应一个主对话）
5. **气泡点击行为** → 等于 hover 展开（作为触屏/外接鼠标的 fallback）。见 AC-M1-8
6. **M4 UI tool 注册通道 = 路径 B（Agent 内置虚拟 UI tool，非 MCP）** — 用户 2026-05-11 裁决。理由：demo 阶段验证交互形态优先，架构干净，不引入 in-process MCP transport 重构成本；后续若需升级到真 MCP 可接受技术债重构。见 AC-M4-1 / §4 交付物清单 / §5 U-2
7. **Pet ↔ Ambient 关系 = A 演进**（Ambient 是 Pet 的演进后形态）— 用户 2026-05-11 裁决 U-1。影响 M1 实现路径：复用 `src/process/pet/petManager.ts` 等 pet 模板（Windows transparent-resize hack 等成熟代码），Dev 可直接改名为 `ambientWindowManager.ts` 或保留内部 `pet` 目录名作为实现细节（由 Dev 与 Arch [ARCH-CHECK] 协调），AC-M1-10 从"互斥"改写为"替代"（同一 BrowserWindow 家族的两种语义形态，启动期二选一），新增 AC-M1-15 存量用户迁移。见 AC-M1-10 / AC-M1-15 / §4 交付物清单 / §5 U-1
8. **Dev 可并行启动 M1 窗口骨架** — 用户 2026-05-11 裁定 Task #9。理由：Arch [ADDENDUM] 论证 M1 窗口骨架（BrowserWindow + transparent/frameless/alwaysOnTop + drag/opacity/snap/persistence）与 U-1 A/B/C 三个选项都不变。现在 U-1 = A 已定，Dev 可立即开工，不等其他模块细节。实现需先发 [ARCH-CHECK] 给 Arch 走目录命名 / 抽象时机的工程协调
9. **M4 UI tool demo 范围 = 仅 Gemini** — 2026-05-11 决策，**决策人：team-lead（封版）**。用户基于 arch "+30-50%" 旧估算初选"仅 Gemini"；arch 17:37 发 ACP 新估算修正后，team-lead 以 leader 权限评估该新估算**不触发重开**（核心论据"demo 验证链路 + Gemini 覆盖最高"与 ACP 成本无关；用户已睡以"明早交付"为先），封版维持"仅 Gemini"。Demo MVP 只实现 Gemini fork CLI 路径（按 `src/process/agent/gemini/cli/tools/img-gen.ts` 的 `BaseDeclarativeTool` pattern 注入兄弟 tool 类）；**ACP 后端（claude / codex / qwen）延后到 v2**。用户使用 Claude / Codex / Qwen 时 M3 聊天正常，但 M4 UI tool 无效（功能降级不阻塞核心链路验证）。见 AC-M4-1 / §5 U-3 / §6 后续

## M6. 首次启动引导（Onboarding Hint）

### 功能描述（用户视角）

用户**第一次**启动 ambient 模式时，气泡旁边浮出一个简短 hint：`Hover me to start`（demo 阶段英文即可），3 秒后自动消失。第二次启动不再出现。

### 验收标准（AC）

- **AC-M6-1**（P1）：首次启动时，气泡旁显示提示气泡 "Hover me to start"
- **AC-M6-2**（P1）：提示 3 秒后自动淡出消失
- **AC-M6-3**（P1）：用户 hover 气泡（触发 M2 展开）→ 提示立即消失
- **AC-M6-4**（P1）：是否"已显示过 hint"持久化到 settings，下次启动不再显示
- **AC-M6-5**（P2，边界）：如果用户清除 settings / 重装 → hint 再次出现（符合预期）

### 状态：未实现

---

## 4. 交付物清单（demo 版）

| 类型 | 路径 / 产物                                                                                                           | 说明                                                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 代码 | 渲染层：演进自 `src/renderer/pet/`（Dev 可改名为 `src/renderer/ambient/` 或保留内部名，由 [ARCH-CHECK] 决定）         | Ambient 模式渲染层入口 + 组件；复用 pet 现有 HTML/CSS/hit-test 基建                                                     |
| 代码 | 主进程：演进自 `src/process/pet/petManager.ts`（Dev 可改名为 `ambientWindowManager.ts` 或保留，由 [ARCH-CHECK] 决定） | 复用 drag + opacity + Windows transparent-resize hack + screen API 位置计算；新增 ambient 状态机替换 pet 的宠物语义     |
| 代码 | `src/process/ambient/ambientUiToolHandler.ts`                                                                         | UI tool handler（路径 B 定稿，用户 2026-05-11 裁决；Agent 原生虚拟 tool，非 MCP；持 `BrowserWindow` 引用 + IPC bridge） |
| 配置 | `package.json` / env                                                                                                  | Feature flag 定义                                                                                                       |
| 文档 | `docs/product/ambient-mode-requirements.md`（本文件）                                                                 | 需求文档                                                                                                                |
| 演示 | 本地可运行的 demo（`AIONUI_AMBIENT=1 bun run dev`）                                                                   | 能完整走通 M1 → M2 → M3 → M4 的用户流程                                                                                 |

---

## 5. 未决项（2026-05-11 发现，等待用户裁决）

本节记录 demo 需求对齐后、开工前代码核验阶段发现的关键上下文缺口，必须解决后才能推进 Arch 架构评审和 QA M1 测试落地。

### U-1. Ambient 与现有 Pet 模块的关系 — **✅ 已裁决（2026-05-11）：A 演进**

**用户裁决**：选 A（Ambient 是 Pet 的演进后形态）。已落入 §1 隔离策略 / §3 决策 7 / AC-M1-10 / AC-M1-15 / §4 交付物清单。

**伴生子问题裁决**：

1. Pet 卡通语义（眨眼 / juggling / poke-left）→ **去除**（A 选项默认，v2 可作为可选皮肤）
2. Pet AI tool-call 确认气泡（`pet.confirmEnabled`）→ **demo 硬移除**（与 PM 倾向一致）
3. 存量用户迁移策略 → 覆盖于 AC-M1-15（迁移 `pet.enabled` + 位置，其他 pet 设置暂不迁移）

以下技术背景保留作为决策追溯。

---

**发现**：仓库已存在完整的桌面宠物 / 悬浮气泡模块，本文档未提及：

- `src/process/pet/`：`petManager.ts` (691 LoC)、`petStateMachine.ts`、`petIdleTicker.ts`、`petConfirmManager.ts`、`petEventBridge.ts`、`petTypes.ts`
- `src/preload/`：`petPreload.ts` / `petConfirmPreload.ts` / `petHitPreload.ts`（hit-test 双窗口架构）
- `src/renderer/pet/`：`petRenderer.ts` / `petHitRenderer.ts` / `petConfirmRenderer.ts` + `pet.html` / `pet-hit.html` / `pet-confirm.html`
- `src/renderer/pages/settings/PetSettings.tsx`：设置页
- `src/renderer/services/i18n/locales/*/pet.json`：8 语言 i18n

**已在 pet 中解决的硬骨头**（与 M1 需求高度重叠）：

- `BrowserWindow` + `transparent: true` + `frame: false` + `alwaysOnTop: 'screen-saver'` 跨平台组合
- Windows transparent + frame:false 窗口 `setBounds` 失效的 workaround（`petManager.ts` L509–533：hide → setBounds → show）
- hit-test 双窗口方案（主窗鼠标穿透 + 专门 hit-test 窗口）
- `screen.getAllDisplays()` / `screen.getCursorScreenPoint()` 实际用法

**请用户裁决（3 选 1）**：

- **A. Ambient = Pet 的演进**：基于 pet 改造（去宠物语义，扩展 M1-M6 能力），分支 `feat/ambient-mode`，diff 集中在 pet 目录重命名 + 扩展
- **B. Ambient 与 Pet 并存**：走原方案，新建 `src/renderer/ambient/` + `src/process/ambient/`，pet 保留不变
- **C. Ambient 替代 Pet**：ambient 全新重写，合入后 pet 废弃/删除

PM 倾向 A（避免重造跨平台硬骨头；B 会产生双套状态机/preload/i18n 维护地狱）。**Arch 同样倾向 A**（理由：pet 代码 ~90% 可复用，沉没成本高；"桌面宠物"在用户心智中本就是"桌面悬浮 AI 入口"的 pre-form，演进有叙事连贯性；demo 阶段工程量少 ~40%）。用户裁决后本节合并到 §1 隔离策略。

#### 伴生产品子问题（arch 提出，请用户在裁决 U-1 时一并明确）

1. **Pet 的卡通语义（眨眼 / juggling / poke-left 等）是否保留？**
   - 选 A（演进）：这些状态在 ambient 状态机里没有对应语义，默认**去除**；如用户希望保留作为"可选宠物皮肤"→ v2 再做
   - 选 B（并存）：pet 体验完全不受影响
   - 选 C（替代）：默认去除，但可考虑保留"装饰气泡"选项作为兼容 UI
2. **Pet 的 AI tool-call 确认气泡（`pet.confirmEnabled` + `petConfirmManager` 三件套）在 ambient 里对应什么形态？**
   - 候选 A：M4 panel 里有一栏"等待确认"，Agent 工具调用在 M3 聊天态内联显示 approve/deny 按钮
   - 候选 B：demo 阶段**硬移除**，v2 再设计
   - PM 倾向 **候选 B**：demo 阶段 agent 调用视为全自动（已有 LLM 安全策略托底），UI 简洁优先
3. **（仅选 C 时）存量用户迁移策略**：若用户现在 `pet.enabled = true`，升级到有 ambient 的版本时
   - 候选 A：默认启用 ambient，自动迁移 `pet.bubblePosition` → `ambient.bubblePosition`
   - 候选 B：保留 pet，用户需手动去 settings 切 ambient（opt-in）
   - PM 不倾向 C，故此项暂搁置

### U-2. M4 UI tool 的注册通道（MCP 路径 A/B）— **✅ 已裁决（2026-05-11）：路径 B**

**用户裁决**：选路径 B（Agent 内置虚拟 UI tool，非 MCP）。对外叙事采纳"Ambient UI tools（agent 原生可调）"表述。已落入 AC-M4-1 / §3 决策 6 / §4 交付物清单。以下技术背景保留作为决策追溯。

---

**来源**：[ARCH-REQ-FEEDBACK] ②。原 AC-M4-1 写"通过 MCP 注册"，但 arch 审阅时发现**现行 MCP 架构硬约束**：

- 现有 MCP server 跑在**独立 stdio 子进程**（证据：`scripts/build-mcp-servers.js:19-31` esbuild 打包 CJS + `external: ['electron']`；`src/process/resources/builtinMcp/imageGenServer.ts` 仅通过 env var 取配置）
- stdio 子进程**无法访问 BrowserWindow / ipcMain**，所以一个 MCP tool 被 agent 调用后，其 handler 无法拉宽 ambient 窗口

**两条可行路径**：

- **路径 A（MCP-first，语义保留）**：对外仍叙事"通过 MCP 注册"，但 tool 实现从 stdio 子进程迁到**主进程内嵌 MCP server**（走 MCP SDK 的 in-process `McpServer` + IPC 回调）。Agent 端 transport 通过"本地 HTTP / unix socket"或"假 stdio bridge"连到主进程。**工程量大**（需重构 MCP transport 层 + 双类型 MCP server 并存），但产品/对外故事一致。
- **路径 B（agent 内置虚拟 tool，demo 推荐）**：**不走 MCP**，做成 agent 端看到的虚拟 tool set，hook 到 agent tool-call 流里拦截 `show_history` / `open_file_preview` 等 tool name，**直接主进程 IPC 到 ambient renderer**。Gemini 端参考 `src/process/agent/gemini/cli/tools/img-gen.ts` 注入；ACP 后端（claude/codex/qwen）挂在 `src/process/task/AcpAgentManager.ts` 或 `src/process/agent/acp/*`。**工程量小 5x**，但对外叙事不能说"MCP tool"。

**请用户裁决（2 选 1）**：

- A / B 其中一个
- 如果选 A，是否接受 demo 时间成本翻倍（arch 估计）
- 如果选 B，产品对外叙事是否可以改成"Ambient UI tools（agent 原生可调）"而非"MCP tools"？

**PM 倾向 B**，理由：

1. demo 目标是"验证气泡 → 展开链路可行"，对外叙事层次低，不需要 MCP-first
2. 路径 A 的重构（MCP transport 层 + 双 server 并存）风险高，demo 阶段容易在工程细节卡壳
3. 路径 B 的延迟/并发控制完全在主进程里，满足 AC-M4-7 "一次铺开"、AC-M4-12 "排队"更简单
4. v2 阶段若确需 MCP-first，可以重构为路径 A（tool 定义分离，注册通道可换）

U-2 已裁决（路径 B），仍等 U-1 Pet 关系（A/B/C）+ 3 伴生子问题用户裁决后，将 §5 全节合并到 §1 隔离策略 / §3 已决策项。

### U-3. 路径 B 的 demo 范围（Gemini only vs Gemini + ACP）— **✅ 已裁决（2026-05-11）：仅 Gemini**

**用户裁决**：选 A（仅 Gemini），ACP 后端延后到 v2。已落入 AC-M4-1 Demo 范围定稿 / §3 决策 9 / §6 后续。

---

**来源**：Arch [路径 B 预读] 发现。路径 B 定稿后实际实现分叉：

- **Gemini** 有 fork CLI，可直接注入 `BaseDeclarativeTool` 类（参考 `src/process/agent/gemini/cli/tools/img-gen.ts`），工作量 ~1 人·天
- **ACP 后端（claude/codex/qwen）** 是独立进程 + ACP 协议通信，注册走 ACP 协议层（session init tools list），主进程需拦截 tool-call 流本地执行，**另一套适配工作**

**请用户裁决（2 选 1）**：

- **选项 A — 仅 Gemini（PM + Arch 倾向）**：Demo MVP 仅 Gemini backend 能触发 UI tool；ACP backend 在 demo 期间无法调 M4 tool（降级为 M3 聊天态 only）。ACP 支持延后到 M4 收尾或 v2
- **选项 B — Gemini + ACP 都要**：M4 排期延长 30-50%，完整覆盖所有 backend

**决策依据**：

- demo 目标是"验证气泡 → Agent 驱动展开"链路可行。只要有一个 backend 能完整演示即可
- AionUi 的 fork Gemini 是主线，Gemini 覆盖度最高
- 若选 A，用户用 Claude / Codex / Qwen 时 M4 tool 无效，但 M3 聊天正常（功能降级但不 block）

---

## 7. M4 实现指引（供 Dev 进入 M4 阶段参考，来源：Arch [路径 B 预读] 2026-05-11）

> 本节是 **Dev 实现 M4 阶段前必读的工程指导**，不是产品需求。需求层面见 §M4 + AC-M4-\*。本节可随 arch [ARCH-CHECK] 反馈继续补充。

### 7.1 Gemini 端接入点位（U-3 demo 范围定稿：仅 Gemini）

- **Pattern 参考**：`src/process/agent/gemini/cli/tools/img-gen.ts`
  - 结构：`BaseDeclarativeTool` + `BaseToolInvocation` 双类（来自 `@office-ai/aioncli-core`）
  - 兄弟 tool 参考：`ImageGenerationTool` / `WebFetchTool` / `WebSearchTool`（同目录下 3 个完全一致 pattern 的 tool 类）
  - Tool 注册：`tools/index.ts` 统一 re-export，真正注册发生在 `@office-ai/aioncli-core` Config constructor 的 tool registry 内，**自动 pick up**（没有显式 `registerTool` 调用）

### 7.2 Ambient UI tool 类命名清单（Dev 按此 clone img-gen.ts 结构）

| tool 类                       | 对应 AC 行为                                                 |
| ----------------------------- | ------------------------------------------------------------ |
| `AmbientShowHistoryTool`      | `show_history()` — 左侧扩展 ~240 px 会话列表                 |
| `AmbientHideHistoryTool`      | `hide_history()`                                             |
| `AmbientOpenWorkspaceTool`    | `open_workspace()` — 右侧扩展 ~280 px 文件树                 |
| `AmbientHideWorkspaceTool`    | `hide_workspace()`                                           |
| `AmbientOpenFilePreviewTool`  | `open_file_preview(path)` — 右侧扩展 ~640 px                 |
| `AmbientCloseFilePreviewTool` | `close_file_preview()`                                       |
| `AmbientOpenLlmSettingsTool`  | `open_llm_settings()` — 弹 modal                             |
| `AmbientSwitchSceneTool`      | `switch_scene(scene)` — 组合调用（chatting/coding/research） |
| `AmbientResizeWindowTool`     | `resize_window(preset)` — narrow/default/wide/full           |

### 7.3 Tool `execute()` 实现模式

每个 tool 的 `execute()` 内**不要**直接操作 `BrowserWindow`（tool 实现通常跑在 gemini fork 的进程空间，无 Electron main API 访问）。模式：

```ts
// 伪代码
async execute(params) {
  // 通过 IPC bridge 把 op 发给主进程的 ambient window manager
  ipcBridge.emit('ambient:ui-op', { toolName: 'show_history', params });
  return { success: true };  // tool-call 协议返回
}
```

主进程侧的 **`src/process/ambient/ambientUiToolHandler.ts`** 监听 `ambient:ui-op` IPC，路由到具体的 window 操作（setBounds / panel state 更新 / 动画触发）。

### 7.4 合批 + 排队（AC-M4-7 / AC-M4-12 实现）

- **合批（同一响应内 N 个 tool_call）**：Agent 端 tool_call 合成一次发生时，Gemini fork 按顺序同步执行 N 个 `execute()`。主进程 `ambientUiToolHandler.ts` **不立即 `setBounds`**，而是 accumulate 到 `opsBuffer: UiOp[]`，在 agent 当前响应结束的 tick 末尾一次性 `send('ambient:ui-op-batch', { ops })` 到 ambient renderer，renderer 在 `requestAnimationFrame` 里一起 apply。
- **排队（跨响应 tool_call 在动画进行中到达）**：主进程维护 `animationPending: boolean` 状态机。若为 `true` 且新 ops 到达 → 入队 `pendingOps: UiOp[][]`（上限 3 批），动画结束 `animationend` 事件回调时 flush 下一批。超 3 批丢弃 + `warn` 日志。

### 7.5 D 路径：ACP 预埋（team-lead 2026-05-11 封版，来源：[ARCH-IMPL-GUIDE]）

**背景 — arch 自修正**：arch 预读 `conversation-tool-config.ts` + `AcpConnection.ts` + `mcpSessionConfig.ts` 后**推翻**原 "ACP 每 backend 1-2 人·天"估算。真相：ACP 协议原生支持 per-session `mcpServers`（`AcpConnection.ts:798/853/875`），transport 可为 `stdio / http / sse`（`mcpSessionConfig.ts:15-30`）。**一个主进程内 HTTP MCP server 即可覆盖所有 ACP backend**（claude / codex / qwen / opencode），不是每 backend 单独适配。总工期降为 **2.5–3.5 人·天**（原估 4–8）。

**team-lead 封版 D 路径**：

- **Demo 肉眼可见行为仍 = 仅 Gemini**（U-3 承诺维持）
- **M4 实施 = 预埋 ACP skeleton**：HTTP MCP server 落地 + tool 定义就位，v2 启用 ACP = 一行改动

#### 7.5.1 架构

```
主进程
├── src/process/ambient/ambientMcpServer.ts    # 新：主进程内 HTTP MCP server（demo 预埋）
│   ├── new McpServer({ name: 'ambient-ui', version: '1.0.0' })
│   ├── server.tool('ambient_show_history', ...)
│   ├── StreamableHTTPServerTransport（或 SSE）
│   └── listen on 127.0.0.1:<OS-assigned random port>
│
├── src/process/ambient/ambientUiToolHandler.ts # tool handler：Gemini 和 MCP server 共用
│                                                 └─ BrowserWindow ref + IPC send
│
└── src/process/agent/acp/mcpSessionConfig.ts   # 改：buildBuiltinAcpSessionMcpServers 追加 ambient
    └── { type: 'http', name: 'ambient-ui', url: getAmbientMcpServerUrl() }
```

#### 7.5.2 落地步骤

1. **新建 `ambientMcpServer.ts`**（~200-300 LoC）：主进程启动时 `new McpServer`，注册 6-8 个 ambient tool，HTTP listener port=`0`（OS 分配），`server.address()` 拿 port，导出 `getAmbientMcpServerUrl()`。启动时机在 `src/index.ts` 的 `handleAppReady`，ambient 模式开启时起；**不要按 session 起**
2. **改 `mcpSessionConfig.ts`**：`buildBuiltinAcpSessionMcpServers` 追加 `{ type: 'http', name: 'ambient-ui', url: getAmbientMcpServerUrl() }`，加 `capabilities.http` 检查（参考 `shouldInjectBuiltinServer` pattern）
3. **Gemini / ACP 共用 handler**：Gemini tool class 的 `execute()` 和 MCP server tool handler 调同一个 `handleShowHistory` 等函数，保证行为一致
4. **Demo 阶段可默认关闭 ACP 注入**：通过 env var / 内部 flag 控制，v2 改默认开启即可（这是"预埋"的含义）

#### 7.5.3 Backend 兼容性

- **claude-code / codex**：支持 HTTP MCP transport
- **qwen / opencode**：运行时 `AcpMcpCapabilities.http` 探测；不支持则跳过（per AC-M4-10 友好降级）
- **stdio 退化**：backend 完全不支持 HTTP 时可退化到 subprocess + IPC，demo 不做

#### 7.5.4 Tool 命名（Gemini 和 ACP 共用，覆盖 7.2 原表）

| 需求语义                  | tool name                    |
| ------------------------- | ---------------------------- |
| `show_history()`          | `ambient_show_history`       |
| `hide_history()`          | `ambient_hide_history`       |
| `open_workspace()`        | `ambient_open_workspace`     |
| `hide_workspace()`        | `ambient_hide_workspace`     |
| `open_file_preview(path)` | `ambient_open_file_preview`  |
| `close_file_preview()`    | `ambient_close_file_preview` |
| `open_llm_settings()`     | `ambient_open_llm_settings`  |
| `switch_scene(scene)`     | `ambient_switch_scene`       |
| `resize_window(preset)`   | `ambient_resize_window`      |

前缀 `ambient_` 避免与现有 builtin tool (`aionui_image_generation` 等) 冲突。

#### 7.5.5 Gemini 侧目录合规

`src/process/agent/gemini/cli/tools/` 当前 8 项，新增 6 个 ambient tool 会超 10 项上限。**新建 `tools/ambient/` 子目录**，放 6 个 tool + `index.ts` re-export，`tools/` 根仅多 1 项。

#### 7.5.6 Tool 注册时机（Gemini）

`ConversationToolConfig.registerCustomTools()` 在 conversation 初始化后调用，每新对话 fresh 注册。ambient 场景下用户反复开关气泡 → 每次展开到 M3 都是新 conversation，不担心重复注册。

#### 7.5.7 Dev 前置 / 盲区

1. `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport` 版本可用性：检查 `package.json`，不行先用 SSE transport
2. `AcpMcpCapabilities.http` 探测由 `AcpDetector` 现有逻辑处理
3. Port 选择：`listen(0)` + `server.address()` 拿 OS 分配的 free port

### 7.6 建议 Dev 开工顺序（M4 阶段）

1. 先跑通一个 `AmbientShowHistoryTool`（最简单，只开一个左侧面板）
2. 验证"Gemini 调 tool → 主进程 IPC → renderer apply"整链路
3. 再横向扩展 9 个 tool（每个 ~30-60 min）
4. 最后做合批 + 排队（AC-M4-7 + AC-M4-12）的框架，替换 5 个 tool 的朴素实现

### 7.7 相关 AC 回指

- AC-M4-1：路径 B + 仅 Gemini
- AC-M4-2 / AC-M4-7：并行 tool call + 合批
- AC-M4-3：动画 ≤ 300 ms
- AC-M4-9：超屏压缩优先级 + hard floor
- AC-M4-12：跨响应排队（上限 3）
- AC-M4-13：DPI 切屏一帧跳动

---

## 6. 后续（v2 以上，demo 之后）

以下内容记录下来，demo 跑通后再讨论：

- 生产级 i18n（英文 / 多语言推荐提示词）
- 设置面板里暴露 ambient 模式 + 推荐提示词自定义
- 键盘驱动（不用鼠标也能全流程操作）
- 更多 UI tool（打开设置的具体 tab、打开定时任务、搜索等）
- 多窗口 / 多气泡场景
- telemetry：哪些推荐词被点击、Agent 平均调用多少 tool、用户用逃生阀频率
- 和现有 AionUi 主模式的共存策略（设置里可切换默认形态）
- **ACP 后端（claude / codex / qwen）的 UI tool 注册**（v2；demo 阶段仅 Gemini，来源：§3 决策 9 / U-3 裁决）：需在 ACP 客户端（主进程）拦截 tool-call 流匹配 tool name 本地执行，或让 ACP agent 通过 session init 声明这些 tool 但 handler 放主进程。工作量约 M4 排期 30-50%
