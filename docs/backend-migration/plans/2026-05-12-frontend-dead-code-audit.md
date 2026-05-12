# 前端 process 层后端迁移死代码审计

## 1. 元信息

- **日期**：2026-05-12
- **分支**：`feat/backend-migration`（或从其派生的清理分支）
- **审计范围**：`packages/desktop/src/process/**/*.ts`（不含 `renderer/`、`tests/`、`preload/`）
- **审计方法**：逐文件 Read + grep 追溯消费者 + 对照 `common/adapter/ipcBridge.ts` 路由类型 + 对照 `aionui-backend` crate 覆盖范围
- **与先前文档的关系**：
  - `2026-05-08-cleanup-and-test-rewrite-design.md`（总设计 / UC-A / UC-B / 关键事实 A-C）
  - `2026-05-08-cleanup-team-playbook.md`（team playbook）
  - `2026-05-08-cleanup-teammate-cheatsheet.md`（teammate cheatsheet）
  - `2026-05-08-n1-dead-code-cleanup-requirements.md`（N1 requirements —— 已覆盖 7 个 bridge/service 文件；现场确认**已全部删除**）
  - 本文档**扩展**上述 N1 的范围：审计 N1 未覆盖的所有其余 `process/` 文件，给出新一轮 DELETE / MODIFY / KEEP / NEEDS-DECISION 分类

## 2. 背景与目标

### 2.1 背景

- `aionui-backend`（Rust）在 M1-M9 期间接管了绝大多数业务能力。
- `common/adapter/ipcBridge.ts` 被重写为 HTTP/WS 适配层：所有 `httpGet` / `httpPost` / `httpPut` / `httpPatch` / `httpDelete` / `stubProvider` / `wsEmitter` 返回的对象 `.provider` 字段都是 `() => {}`（见 `httpBridge.ts:197/209/222/236/250/263/277`）。
- 结论（**关键事实 A**）：任何只包含 `ipcBridge.xxx.provider(...)` 调用、且 `xxx` 走 HTTP/WS 适配的 bridge 文件，**其 `.provider()` 注册在 runtime 完全不会被调用**，是死代码。
- `2026-05-08` 系列清理已删除 7 个纯死 bridge/service（bedrock / previewHistory / pptPreview / officeWatch / document / previewHistoryService / conversionService，共 1748 行）。
- 但 `process/` 目录仍有一大批由该机制产生的残留，以及若干孤儿 service / util，需要一次性扫清。

### 2.2 目标

1. 枚举 `process/` 下**所有**文件，按 DELETE / MODIFY / KEEP / NEEDS-DECISION 分类。
2. 为每个 DELETE 项提供可验证的 grep 证据。
3. 标出删除依赖顺序（避免"删 A 后 B 立即 TS 报错"的串行错误）。
4. 明确风险和需要人类拍板的决策点。
5. 明示哪些事项与 `2026-05-08` 三份文档重叠、不重复处理。

## 3. 审计方法论

### 3.1 no-op 判定依据

`packages/desktop/src/common/adapter/httpBridge.ts`（grep 结果）：

```
188:  provider: (handler: (params: Params) => Promise<Data>) => void;
197:    provider: () => {},
209:    provider: () => {},
222:    provider: () => {},
236:    provider: () => {},
250:    provider: () => {},
263:    provider: () => {},
277:    provider: () => {},
```

对比 `common/adapter/ipcBridge.ts` 的顶层 namespace 绑定类型：

- `bridge.buildProvider(...)` / `bridge.buildEmitter(...)` → **真实 Electron IPC**（`@office-ai/platform`），`provider()` 处理器会被调用 → **LIVE**。
- `httpGet` / `httpPost` / `httpPut` / `httpPatch` / `httpDelete` / `stubProvider` / `wsEmitter` / `wsMappedEmitter` / `withResponseMap` → **HTTP/WS/桩**，`provider()` 是 no-op → **DEAD**。

### 3.2 grep 追溯协议

对每个候选文件：

1. `grep -rn '<basename>' packages/desktop/src/ --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
2. 如果是类/函数文件，对其每个 `export` 名字单独 grep 一次（类型 + 值）。
3. 排除自我引用（同文件）和 test 文件（N2 单独处理测试）。

### 3.3 backend 覆盖对照

按 `aionui-backend` crate 名匹配前端领域：

| 前端领域 / 模块                  | 对应 backend crate                   | adapter 路由                                                      |
| -------------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| conversation / message           | `aionui-conversation` + `aionui-db`  | `/api/conversations/*`, `/api/messages/*`                         |
| assistants                       | `aionui-assistant`                   | `/api/assistants/*`                                               |
| providers / model fetch          | `aionui-system` + `aionui-api-types` | `/api/providers/*`                                                |
| cron                             | `aionui-cron`                        | `/api/cron/jobs/*`                                                |
| mcp                              | `aionui-mcp`                         | `/api/mcp/*`                                                      |
| office / preview                 | `aionui-office`                      | `/api/ppt-preview/*`, `/api/preview-history/*`, `/api/document/*` |
| shell / file-open                | `aionui-shell`                       | `/api/shell/*`                                                    |
| fs (read/write/snapshot)         | `aionui-file`                        | `/api/fs/*`                                                       |
| speech-to-text                   | `aionui-system`                      | `/api/stt`                                                        |
| team                             | `aionui-team`                        | `/api/team/*`                                                     |
| channel (lark / telegram / 飞书) | `aionui-channel`                     | `/api/channel/*`                                                  |
| auth (SSO / password / webui)    | `aionui-auth`                        | `/api/auth/*`, `/api/webui/*`                                     |

Electron-native 仍保留 IPC 的领域（不经过 backend）：

- windowControls / dialog / update + autoUpdate / notification / application (restart / devtools / zoom / CDP / getPath / startOnBoot / updateSystemInfo) / webui lifecycle (getStatus / start / stop) / systemSettings (pet 开关部分)

## 4. 审计结果 —— 逐模块分类

> 每个表格的 **exports** 列只列关键 symbol；**consumers** 列格式为 `外部引用数（文件列表）`；**adapter** 列标注该文件涉及的 `ipcBridge.xxx` 在 adapter 中的类型。

### 4.1 `process/bridge/*.ts`

#### 4.1.1 `bridge/applicationBridge.ts`（199 行） —— **KEEP**

- **adapter**：`application.restart / openDevTools / isDevToolsOpened / getZoomFactor / setZoomFactor / getCdpStatus / updateCdpConfig / getStartOnBootStatus / setStartOnBoot` 全部 `bridge.buildProvider`（真 IPC）。
- **consumers**：`wasLaunchedAtLogin` / `setApplicationMainWindow` 被 `src/index.ts`、`process/utils/mainWindowLifecycle.ts` 直接调用：
  ```
  src/index.ts:29:import { wasLaunchedAtLogin } from '@process/bridge/applicationBridge';
  src/process/utils/mainWindowLifecycle.ts:8:import { setApplicationMainWindow } from '../bridge/applicationBridge';
  ```
- **结论**：整文件 LIVE，保留。

#### 4.1.2 `bridge/applicationBridgeCore.ts`（44 行） —— **KEEP**

- **adapter**：`application.systemInfo` 走 `httpGet('/api/system/info')`（no-op）；`application.updateSystemInfo` 和 `application.getPath` 是 `bridge.buildProvider`（LIVE）。
- **consumers**：`initApplicationBridgeCore()` 被 `applicationBridge.ts:99` 调用。
- **结论**：混合文件，`systemInfo` 的 `.provider()` 是死注册但其余两个是真 IPC → KEEP。可选微优化：`systemInfo.provider(...)` 代码块删掉节省 3 行（归入 MODIFY 的可选项，不强制）。

#### 4.1.3 `bridge/authBridge.ts`（59 行） —— **DELETE**

- **adapter**：`googleAuth.status` 是 `stubProvider<..>('googleAuth.status', { success: false, msg: 'Google Auth not available in backend mode' })`（adapter `ipcBridge.ts:578-583`）→ 整个 `.provider(handler)` 注册完全 no-op，`handler` 永远不会触发。
- **consumers**：
  ```
  $ grep -rn 'initAuthBridge' packages/desktop/src/ | grep -v '\.test\.'
  packages/desktop/src/process/bridge/index.ts:8:import { initAuthBridge } from './authBridge';
  packages/desktop/src/process/bridge/index.ts:30:  initAuthBridge();
  packages/desktop/src/process/bridge/index.ts:44:  initAuthBridge,
  ```
  仅 `bridge/index.ts` 在串联调用；renderer 端 `ipcBridge.googleAuth.status.invoke(...)` 调到的是 stub（success: false）。
- **结论**：DELETE。同时需要在 `bridge/index.ts` 移除 3 处 `initAuthBridge` 引用。
- **理由**：Google OAuth 流程整体下线（aioncli-core 的 `getOauthInfoWithCache` 在 backend 模式下不可用，adapter 明确返回 "Google Auth not available in backend mode"）。`Storage.getOAuthCredsPath` 文件存在性检查等代码只是噪声。

#### 4.1.4 `bridge/dialogBridge.ts`（28 行） —— **KEEP**

- **adapter**：`dialog.showOpen` 是 `bridge.buildProvider`（LIVE，Electron `dialog.showOpenDialog` 必须在主进程）。
- **consumers**：`initDialogBridge` 被 `bridge/index.ts` 调用。
- **结论**：LIVE，保留。

#### 4.1.5 `bridge/feedbackBridge.ts`（104 行） —— **KEEP**

- **adapter**：不通过 `ipcBridge` 走，直接 `ipcMain.handle('feedback:collect-logs')` / `ipcMain.handle('feedback:capture-screenshot')`。
- **consumers**：
  ```
  src/preload/main.ts:45: collectFeedbackLogs: () => ipcRenderer.invoke('feedback:collect-logs')
  src/preload/main.ts:47: captureFeedbackScreenshot: () => ipcRenderer.invoke('feedback:capture-screenshot')
  src/index.ts:28:import './process/bridge/feedbackBridge';
  ```
- **结论**：原生 IPC + preload 消费 → LIVE，保留。

#### 4.1.6 `bridge/index.ts`（59 行） —— **MODIFY**

- **consumers**：`process/utils/initBridge.ts:8`。
- **改动**：随 DELETE 项同步移除相关 `import` / `initAllBridges` 调用 / `export` 段引用。详见 §5.
- **结论**：MODIFY。

#### 4.1.7 `bridge/notificationBridge.ts`（73 行） —— **KEEP**

- **adapter**：`notification.show` 是 `bridge.buildProvider`（LIVE）。
- **consumers**：`showNotification` 是主进程直接调用的函数；`initNotificationBridge` 被 `bridge/index.ts` 串联。
- **结论**：LIVE，保留。

#### 4.1.8 `bridge/remoteAgentBridge.ts`（21 行） —— **DELETE**

- **adapter**：`remoteAgent.*` 全部 HTTP（ipcBridge.ts:818-848）。
- **文件内容**：只有一个注释 + 空函数体 `initRemoteAgentBridge()`。注释自己写明"Intentionally empty"。
- **consumers**：仅 `bridge/index.ts` 在串联调用。
- **结论**：DELETE。空函数无任何副作用，保留它只是"礼貌性 no-op"。同时需要在 `bridge/index.ts` 移除 3 处 `initRemoteAgentBridge` 引用。

#### 4.1.9 `bridge/shellBridge.ts`（273 行） —— **DELETE**

- **adapter**：`shell.openFile / showItemInFolder / openExternal / checkToolInstalled / openFolderWith` 全部 `httpPost('/api/shell/*')`（backend `aionui-shell` 接管）→ **所有 `.provider()` 注册均 no-op**。
- **consumers**：
  ```
  $ grep -rn 'initShellBridge' packages/desktop/src/ | grep -v '\.test\.'
  packages/desktop/src/process/bridge/index.ts:10:import { initShellBridge } from './shellBridge';
  packages/desktop/src/process/bridge/index.ts:28:  initShellBridge();
  packages/desktop/src/process/bridge/index.ts:47:  initShellBridge,
  ```
  没有模块级副作用（`isVSCodeInstalled` / `commandExists` / `findVSCodeExecutable` / `openFolderWithTool` 都是局部函数，只在 `.provider()` 回调中使用）。
- **结论**：DELETE。backend `aionui-shell` 有等价的 VSCode / Terminal / Explorer / openExternal 实现。
- **理由**：backend 侧 VSCode 查找逻辑已覆盖 Windows / darwin / linux 所有路径分支。

#### 4.1.10 `bridge/speechToTextBridge.ts`（14 行） —— **DELETE**

- **adapter**：`speechToText.transcribe` 是 `httpPost('/api/stt')`（ipcBridge.ts:518）→ `.provider()` 注册 no-op。
- **consumers**：
  ```
  $ grep -rn 'initSpeechToTextBridge' packages/desktop/src/ | grep -v '\.test\.'
  packages/desktop/src/process/bridge/index.ts:11:import { initSpeechToTextBridge } from './speechToTextBridge';
  packages/desktop/src/process/bridge/index.ts:36:  initSpeechToTextBridge();
  packages/desktop/src/process/bridge/index.ts:48:  initSpeechToTextBridge,
  ```
- **结论**：DELETE（bridge 文件 + 级联删 SpeechToTextService，见 §4.2.1）。

#### 4.1.11 `bridge/systemSettingsBridge.ts`（206 行） —— **KEEP**（UC-B 保留）

- **adapter**：混合：`getCloseToTray / setCloseToTray / getNotificationEnabled / setNotificationEnabled / getCronNotificationEnabled / setCronNotificationEnabled / getKeepAwake / setKeepAwake / changeLanguage / languageChanged / getSaveUploadToWorkspace / setSaveUploadToWorkspace / getAutoPreviewOfficeFiles / setAutoPreviewOfficeFiles` 全部 HTTP → `.provider()` 这 14 处是死注册；**但** `getPetEnabled / setPetEnabled / getPetSize / setPetSize / getPetDnd / setPetDnd / getPetConfirmEnabled / setPetConfirmEnabled` 是 `bridge.buildProvider` → LIVE（需要本地驱动 pet 窗口）。此外 `setKeepAwake` 的本地 `power.preventDisplaySleep()` 副作用仍然需要（backend 无法控制 Electron 的 powerSaveBlocker）。
- **结论**：KEEP。UC-B 明确保留。可选 MODIFY：移除已被 HTTP 接管的 14 处死 `.provider()` 注册（节省 ~90 行），保留 pet + keepAwake + language broadcast 的本地副作用。如做此瘦身，归入 NEEDS-DECISION（见 §7）。

#### 4.1.12 `bridge/taskBridge.ts`（45 行） —— **DELETE**

- **adapter**：`task.stopAll / getRunningCount` 是 `stubProvider(...{ success: true, count: 0 })`（ipcBridge.ts:1032-1036）→ `.provider()` no-op，renderer 收到固定桩。
- **consumers**：
  ```
  $ grep -rn 'initTaskBridge' packages/desktop/src/ | grep -v '\.test\.'
  packages/desktop/src/process/bridge/index.ts:12:import { initTaskBridge } from './taskBridge';
  packages/desktop/src/process/bridge/index.ts:35:  initTaskBridge(deps.workerTaskManager);
  packages/desktop/src/process/bridge/index.ts:50:  initTaskBridge,
  ```
- **结论**：DELETE。该桥以 `workerTaskManager.listTasks()` 为数据源；由于 task 注册路径（AgentFactory）在后端迁移后已空（见 §4.7），`listTasks()` 实际上永远返回 `[]`，stub 给出 count=0 已经等价。

#### 4.1.13 `bridge/updateBridge.ts`（666 行） —— **KEEP**

- **adapter**：`update.*` 和 `autoUpdate.*` 全部 `bridge.buildProvider`（LIVE，Electron electron-updater 必须主进程）。
- **consumers**：被 `bridge/index.ts` + `autoUpdaterService.ts` 串联；`createAutoUpdateStatusBroadcast` 被 `src/index.ts:339` 调用。
- **结论**：LIVE，保留。

#### 4.1.14 `bridge/webuiBridge.ts`（107 行） —— **KEEP**

- **adapter**：`webui.getStatus / start / stop / statusChanged` 是 `bridge.buildProvider` / `bridge.buildEmitter`（LIVE —— 本进程必须拥有 WebUI 启停能力，backend 自己不能 spawn WebUI 壳）；`changePassword / changeUsername / resetPassword / generateQRToken` 是 `httpPost`（由 renderer 直接打 backend，不经过此文件）。
- **consumers**：`initWebuiBridge` 被 `bridge/index.ts` 串联。
- **结论**：LIVE，保留。

#### 4.1.15 `bridge/windowControlsBridge.ts`（91 行） —— **KEEP**

- **adapter**：`windowControls.*` 全部 `bridge.buildProvider`（LIVE）。
- **consumers**：`registerWindowMaximizeListeners` 被 `bridge/index.ts` re-export，`initWindowControlsBridge` 被串联。
- **结论**：LIVE，保留。

#### 4.1.16 `bridge/workspaceSnapshotBridge.ts`（68 行） —— **DELETE**

- **adapter**：`fileSnapshot.init / compare / getBaselineContent / getInfo / dispose / stageFile / stageAll / unstageFile / unstageAll / discardFile / resetFile / getBranches` 全部 `httpPost('/api/fs/snapshot/*')`（ipcBridge.ts:551-572）→ `.provider()` 全部 no-op。
- **consumers**：

  ```
  $ grep -rn 'initWorkspaceSnapshotBridge\|workspaceSnapshotBridge' packages/desktop/src/ | grep -v '\.test\.'
  packages/desktop/src/process/bridge/workspaceSnapshotBridge.ts:12:export function initWorkspaceSnapshotBridge(): void {
  packages/desktop/src/process/bridge/index.ts:17:import { initWorkspaceSnapshotBridge } from './workspaceSnapshotBridge';
  packages/desktop/src/process/bridge/index.ts:37:  initWorkspaceSnapshotBridge();
  packages/desktop/src/process/bridge/index.ts:54:  initWorkspaceSnapshotBridge,
  packages/desktop/src/process/bridge/index.ts:57:export { disposeAllSnapshots } from './workspaceSnapshotBridge';

  $ grep -rn 'disposeAllSnapshots' packages/desktop/src/ | grep -v '\.test\.'
  packages/desktop/src/process/bridge/index.ts:57:export { disposeAllSnapshots } from './workspaceSnapshotBridge';
  packages/desktop/src/process/bridge/workspaceSnapshotBridge.ts:66:export function disposeAllSnapshots(): Promise<void> {
  ```

  `disposeAllSnapshots` 被 re-export 但**没有任何消费者**。

- **结论**：DELETE。级联删 `process/services/WorkspaceSnapshotService.ts`（433 行，见 §4.2.2）。

### 4.2 `process/bridge/services/*.ts`

#### 4.2.1 `bridge/services/SpeechToTextService.ts`（260 行） —— **DELETE**（级联）

- **consumers**：仅 `bridge/speechToTextBridge.ts:8` `import { SpeechToTextService } from './services/SpeechToTextService'`。当 `speechToTextBridge.ts` 被删除时，该文件失去唯一消费者。
- **结论**：DELETE（级联）。backend `/api/stt` 由 `aionui-system` crate 实现（或通过 backend 转发到 OpenAI/Deepgram/Gemini）。

### 4.3 `process/services/*.ts`

#### 4.3.1 `services/ConversationServiceImpl.ts`（160 行） —— **DELETE**

- **consumers**：
  ```
  $ grep -rn 'ConversationServiceImpl' packages/desktop/src/ | grep -v '\.test\.'
  packages/desktop/src/process/services/conversationServiceSingleton.ts:8: * Singleton ConversationServiceImpl wired with the backend-backed repository.
  packages/desktop/src/process/services/conversationServiceSingleton.ts:13:import { ConversationServiceImpl } from './ConversationServiceImpl';
  packages/desktop/src/process/services/conversationServiceSingleton.ts:16:export const conversationServiceSingleton: IConversationService = new ConversationServiceImpl(
  packages/desktop/src/process/services/ConversationServiceImpl.ts:23:export class ConversationServiceImpl implements IConversationService {
  ```
  唯一消费者是 `conversationServiceSingleton.ts`，而 singleton 本身无消费者（见下）。
- **结论**：DELETE。级联依赖：`IConversationService.ts`、`conversationServiceSingleton.ts`、`initAgent.ts`、`openclawUtils.ts`（详见 §5）。

#### 4.3.2 `services/IConversationService.ts`（58 行） —— **DELETE**

- **consumers**：仅 `ConversationServiceImpl.ts:7` 与 `conversationServiceSingleton.ts:14`。
- **结论**：DELETE（级联）。

#### 4.3.3 `services/conversationServiceSingleton.ts`（18 行） —— **DELETE**

- **consumers**：
  ```
  $ grep -rn 'conversationServiceSingleton' packages/desktop/src/ | grep -v '\.test\.'
  packages/desktop/src/process/services/conversationServiceSingleton.ts:16:export const conversationServiceSingleton: IConversationService = new ConversationServiceImpl(
  ```
  只在自己文件内出现 → **零外部消费**。
- **结论**：DELETE。

#### 4.3.4 `services/autoUpdaterService.ts`（335 行） —— **KEEP**

- **consumers**：被 `src/index.ts:338` 与 `bridge/updateBridge.ts:21` 调用。
- **结论**：LIVE，Electron electron-updater 封装。

#### 4.3.5 `services/ccSwitchModelSource.ts`（236 行） —— **DELETE**

- **UC-B 状态**：`2026-05-08-cleanup-and-test-rewrite-design.md` 第 109 行明确保留："被 `process/agent/acp/*` 和 `process/acp/compat/AcpAgentV2.ts` 使用"。
- **当前实地核查**：

  ```
  $ ls packages/desktop/src/process/agent/ packages/desktop/src/process/acp/ 2>&1
  ls: /Users/.../process/acp/: No such file or directory
  packages/desktop/src/process/agent/:
  remote

  $ grep -rn 'ccSwitchModelSource\|CcSwitchModelSource\|getCcSwitchPaths\|buildClaudeModelInfoFromCcSwitchConfig\|readClaudeModelInfoFromCcSwitch\|readClaudeProviderEnvFromCcSwitch\|ClaudeProviderEnv' packages/ | grep -v 'ccSwitchModelSource.ts'
  （无输出）
  ```

- **结论**：DELETE。UC-B 保留理由已失效（`process/agent/acp/` 和 `process/acp/compat/` 都已删除）。
- **注意**：本条改写了 `2026-05-08-cleanup-and-test-rewrite-design.md` §UC-B 的结论，属于**新发现**。

#### 4.3.6 `services/openclawConflictDetector.ts`（208 行） —— **DELETE**

- **exports**：`detectLarkConflict` / `detectTelegramConflict` / `hasOpenClawChannelsEnabled` / `getOpenClawConfigPath` / `getConflictResolutionSteps`
- **consumers**：
  ```
  $ grep -rn 'detectLarkConflict\|detectTelegramConflict\|hasOpenClawChannelsEnabled\|getOpenClawConfigPath\|getConflictResolutionSteps' packages/desktop/src/ | grep -v 'openclawConflictDetector.ts'
  （无输出）
  ```
- **结论**：DELETE。零消费者；`aionui-channel` crate 未继承"检查 OpenClaw 本地配置冲突"这个能力，若未来需要由 backend 接管。

#### 4.3.7 `services/WorkspaceSnapshotService.ts`（433 行） —— **DELETE**（级联）

- **consumers**：仅 `bridge/workspaceSnapshotBridge.ts:8` 和 `workspaceSnapshotBridge.ts:14` `WorkspaceSnapshotService.cleanupStaleSnapshots()`。
- **结论**：DELETE（级联，依赖于 §4.1.16）。
- **理由**：backend `aionui-file::snapshot_manager` 已完全接管 `/api/fs/snapshot/*`。

### 4.4 `process/services/i18n/*.ts`

#### 4.4.1 `services/i18n/index.ts`（88 行） —— **KEEP**

- **consumers**：
  ```
  src/index.ts:667: await setInitialLanguage(savedLanguage);
  process/index.ts:21: import './services/i18n'; // Initialize i18n for main process
  process/bridge/systemSettingsBridge.ts:18: import { changeLanguage } from '@process/services/i18n';
  process/bridge/updateBridge.ts:27: _i18nCache = import('../services/i18n');
  ```
- **结论**：LIVE（主进程 i18n 初始化，tray / updateBridge 翻译文本需要）。

### 4.5 `process/services/database/**.ts`

#### 4.5.1 `database/IConversationRepository.ts`（39 行） —— **KEEP**

- **consumers**：`WorkerTaskManager.ts:11`（类型）、`workerTaskManagerSingleton.ts:15`（类型+实例）、`ConversationServiceImpl.ts:8`（类型，DELETE 后消失）、`SqliteConversationRepository.ts:8`（类型，DELETE 后消失）。
- **结论**：KEEP —— `workerTaskManagerSingleton.ts:19-85` 直接 inline 了一个基于 `ipcBridge.conversation.*` / `ipcBridge.database.*` 的 `IConversationRepository` 实例，该接口仍是 live 契约。

#### 4.5.2 `database/SqliteConversationRepository.ts`（109 行） —— **DELETE**

- **实质**：尽管文件名叫 "Sqlite"，内部实现全部通过 `ipcBridge.conversation.*` / `ipcBridge.database.*` 走 HTTP。但 `workerTaskManagerSingleton.ts` 已 inline 同逻辑，此类**是重复代码**。
- **consumers**：仅 `conversationServiceSingleton.ts:12,17`。
- **结论**：DELETE（级联，依赖 §4.3.3）。

#### 4.5.3 `database/migrations.ts`（1392 行） —— **KEEP**

- **consumers**：`runLegacyDatabaseMigrations.ts:11` 导入 `runMigrations`。
- **结论**：KEEP（老用户 `aionui.db` 首启升级到 v26 baseline 所必需，后续才由 backend 接管）。

#### 4.5.4 `database/runLegacyDatabaseMigrations.ts`（86 行） —— **KEEP**

- **consumers**：`process/utils/initStorage.ts:31,587`。
- **结论**：KEEP（一次性 bootstrap）。

#### 4.5.5 `database/schema.ts`（154 行） —— **KEEP**

- **consumers**：`runLegacyDatabaseMigrations.ts:13-17`、`migrations.ts`（间接）。
- **结论**：KEEP。

#### 4.5.6 `database/drivers/BetterSqlite3Driver.ts`（49 行） —— **KEEP**

- **consumers**：`runLegacyDatabaseMigrations.ts:62,63`（动态 import）。
- **结论**：KEEP。

#### 4.5.7 `database/drivers/ISqliteDriver.ts`（15 行） —— **KEEP**

- **consumers**：`BetterSqlite3Driver.ts:5`、`schema.ts:7`、`migrations.ts:7`、`runLegacyDatabaseMigrations.ts:10`。
- **结论**：KEEP。

### 4.6 `process/utils/*.ts`

#### 4.6.1 `utils/analyticsId.ts`（41 行） —— **KEEP**

- **consumers**：1 外部（`src/index.ts` / 分析场景）。
- **结论**：LIVE。

#### 4.6.2 `utils/appMenu.ts`（77 行） —— **KEEP**

- **consumers**：1 外部（`src/index.ts`）。
- **结论**：LIVE。

#### 4.6.3 `utils/configureChromium.ts`（389 行） —— **KEEP**

- **consumers**：`src/index.ts:9`、`process/index.ts:9`、`bridge/applicationBridge.ts`（CDP 状态）。
- **结论**：LIVE。

#### 4.6.4 `utils/configureConsole.ts`（21 行） —— **DELETE**

- **consumers**：
  ```
  $ grep -rn 'configureConsole\b' packages/desktop/src/
  （无输出 —— 除自身外）
  ```
- **文件作用**：Windows chcp 65001 设置。没有被任何地方 import（注意：`configureConsoleLog.ts` 不是它）。
- **结论**：DELETE。如有需要其逻辑可 inline 到 `configureConsoleLog.ts` 或直接在 `src/index.ts` 顶部执行；但当前无人使用。

#### 4.6.5 `utils/configureConsoleLog.ts`（81 行） —— **KEEP**

- **consumers**：`src/index.ts:16`（side-effect import）。
- **结论**：LIVE。

#### 4.6.6 `utils/credentialCrypto.ts`（109 行） —— **DELETE**

- **exports**：`isEncryptionAvailable` / `encryptString` / `decryptString` / `encryptCredentials` / `decryptCredentials`
- **consumers**：
  ```
  $ grep -rn 'isEncryptionAvailable\|encryptCredentials\|decryptCredentials\|encryptString\|decryptString\|credentialCrypto' packages/desktop/src/ | grep -v 'process/utils/credentialCrypto.ts'
  （无输出）
  ```
- **结论**：DELETE。backend `aionui-auth` + `aionui-db` 接管所有凭证加密；前端 Electron safeStorage 流程已废弃。

#### 4.6.7 `utils/deepLink.ts`（78 行） —— **KEEP**

- **consumers**：`src/index.ts`（deep link 协议注册必须主进程）。
- **结论**：LIVE。

#### 4.6.8 `utils/ensureAdminUser.ts`（78 行） —— **KEEP**

- **consumers**：`src/index.ts:510`（WebUI bootstrap 迁移）。
- **结论**：LIVE（老用户 webui.config.json → backend SQLite 迁移）。

#### 4.6.9 `utils/index.ts`（18 行） —— **KEEP**

- **作用**：`@process/utils` barrel，re-export `utils.ts` 中的文件系统 helper。
- **结论**：LIVE。

#### 4.6.10 `utils/initAgent.ts`（414 行） —— **DELETE**

- **exports**：`createAcpAgent` / `createOpenClawAgent` / `createNanobotAgent` / `createRemoteAgent` / `createAionrsAgent`
- **consumers**：
  ```
  $ grep -rn 'createAcpAgent\|createOpenClawAgent\|createNanobotAgent\|createRemoteAgent\|createAionrsAgent' packages/desktop/src/ | grep -v 'process/utils/initAgent'
  packages/desktop/src/process/services/ConversationServiceImpl.ts:12-16 + :109,113,117,121,125
  ```
  唯一消费者是 `ConversationServiceImpl`，已被分类为 DELETE（§4.3.1）。
- **结论**：DELETE（级联）。所有会话创建已由 backend `aionui-conversation::create_conversation` 接管（adapter `ipcBridge.conversation.create` 路由到 `POST /api/conversations`）。

#### 4.6.11 `utils/initBridge.ts`（15 行） —— **KEEP**

- **consumers**：`process/index.ts:20`（side-effect import，驱动 bridge 初始化）。
- **结论**：LIVE。

#### 4.6.12 `utils/initStorage.ts`（633 行） —— **KEEP**

- **consumers**：`process/index.ts:19`、多个 bridge / service（ProcessConfig / ProcessEnv / getSystemDir 等）。
- **结论**：LIVE。

#### 4.6.13 `utils/mainLogger.ts`（43 行） —— **KEEP**

- **consumers**：`bridge/services/SpeechToTextService.ts`（DELETE 后级联损失消费者）+ 可能其他。
- **校核**：
  ```
  $ grep -rn 'mainLog\|mainError\|mainWarn' packages/desktop/src/process/ | grep -v 'mainLogger.ts' | head
  （SpeechToTextService 是唯一消费者）
  ```
- **结论**：**NEEDS-DECISION**（见 §7）。

#### 4.6.14 `utils/mainWindowLifecycle.ts`（39 行） —— **KEEP**

- **consumers**：`src/index.ts`（BrowserWindow 生命周期钩子）。
- **结论**：LIVE。

#### 4.6.15 `utils/message.ts`（143 行） —— **DELETE**

- **exports**：`addMessage` / `removeFromMessageCache` / `addOrUpdateMessage` / `nextTickToLocalFinish` / `executePendingCallbacks` / `nextTickToLocalRunning`
- **consumers**：
  ```
  $ grep -rn 'from.*process/utils/message\|from.*utils/message\b' packages/desktop/src/ | grep -v '\.test\.'
  （无输出 —— renderer 的 addOrUpdateMessage 同名但来自 renderer/hooks/）
  ```
- **结论**：DELETE。本文件是 ACP era 的消息队列缓存；backend `aionui-conversation` 完全接管消息持久化 + 更新 WS 推送。

#### 4.6.16 `utils/migrateAssistants.ts`（270 行） —— **KEEP**（UC-B）

- **consumers**：`utils/runBackendMigrations.ts:10` → `migrateAssistantsToBackend`。
- **结论**：KEEP（老用户本地 electron-storage assistants → backend 首启 bootstrap）。

#### 4.6.17 `utils/openclawUtils.ts`（30 行） —— **DELETE**（级联）

- **exports**：`computeOpenClawIdentityHash`
- **consumers**：仅 `utils/initAgent.ts:15,383`。
- **结论**：DELETE（级联，依赖 §4.6.10）。

#### 4.6.18 `utils/previewUtils.ts`（84 行） —— **DELETE**

- **UC-B 状态**：`2026-05-08-cleanup-and-test-rewrite-design.md` 第 109 行保留："`task/AcpAgentManager.ts:25` 的 `handlePreviewOpenEvent`"。
- **当前实地核查**：

  ```
  $ grep -rn 'handlePreviewOpenEvent\|NAVIGATION_TOOLS\|createPreviewOpenMessage\|extractNavigationUrl' packages/desktop/src/ | grep -v 'process/utils/previewUtils.ts'
  （NAVIGATION_TOOLS 的命中在 common/chat/navigation/NavigationInterceptor.ts —— 是独立重复定义，不消费本文件；其余无命中）

  $ find packages/desktop/src/process/task -name 'AcpAgentManager*'
  （无结果 —— 文件已不存在）
  ```

- **结论**：DELETE。UC-B 保留理由已失效（`AcpAgentManager.ts` 已随 ACP 后端化删除）。
- **注意**：和 §4.3.5 一样是**新发现**，改写了 `2026-05-08-cleanup-and-test-rewrite-design.md` §UC-B 的结论。

#### 4.6.19 `utils/resetPasswordCLI.ts`（70 行） —— **KEEP**

- **consumers**：`src/index.ts:533`（`--resetpass` CLI 模式）。
- **结论**：LIVE。

#### 4.6.20 `utils/runBackendMigrations.ts`（93 行） —— **KEEP**（UC-B）

- **consumers**：`src/index.ts:233`。
- **结论**：KEEP（老用户本地数据 → backend 首启 orchestrator）。

#### 4.6.21 `utils/safeExec.ts`（173 行） —— **DELETE**

- **exports**：`safeExec` / `safeExecFile` / 相关 types
- **consumers**：
  ```
  $ grep -rn 'safeExec\|safeExecFile' packages/desktop/src/ | grep -v 'process/utils/safeExec.ts'
  （无输出）
  ```
- **结论**：DELETE。backend `aionui-shell` / `aionui-runtime` 接管所有受控命令执行；前端不再需要在主进程执行外部 CLI。

#### 4.6.22 `utils/tray.ts`（296 行） —— **KEEP**

- **consumers**：`src/index.ts`（托盘必须主进程）。
- **结论**：LIVE。

#### 4.6.23 `utils/utils.ts`（460 行） —— **KEEP**

- **consumers**：多个（`applicationBridgeCore.ts:16` / `runLegacyDatabaseMigrations.ts:9` / 经 `utils/index.ts` barrel 散布）。
- **结论**：LIVE。

#### 4.6.24 `utils/webuiConfig.ts`（336 行） —— **KEEP**

- **consumers**：`bridge/webuiBridge.ts`、`utils/ensureAdminUser.ts`。
- **结论**：LIVE。

#### 4.6.25 `utils/zoom.ts`（136 行） —— **KEEP**

- **consumers**：`bridge/applicationBridge.ts`、`src/index.ts`。
- **结论**：LIVE。

### 4.7 `process/agent/**.ts`

#### 4.7.1 `agent/remote/types.ts`（51 行） —— **KEEP**

- **consumers**：
  ```
  renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx:8: import type { RemoteAgentConfig, RemoteAgentInput } from '@process/agent/remote/types'
  common/adapter/ipcBridge.ts:818,819,823-826: import('@process/agent/remote/types').RemoteAgent* 作为类型参数
  ```
- **结论**：LIVE（类型定义跨进程边界使用）。
- **备注**：这是 `process/agent/` 目录下**唯一**剩余文件。文件名本意是 "定义前端用的 agent 契约"。考虑到目录只剩一个 types 文件、又被 renderer 和 adapter 消费，建议后续将其搬到 `common/types/remoteAgentTypes.ts`（语义上更合理）。NEEDS-DECISION（§7）。

### 4.8 `process/backend/**.ts`

#### 4.8.1 `backend/binaryResolver.ts`（60 行） —— **KEEP**

- **consumers**：`src/index.ts:27` 经 `backend/index.ts` barrel。
- **结论**：LIVE（resolve bundled/PATH 的 aionui-backend 二进制）。

#### 4.8.2 `backend/index.ts`（1 行） —— **KEEP**

- **结论**：LIVE（barrel）。

### 4.9 `process/task/**.ts` —— 全部 **DELETE**（条件式,附替换方案）

> 2026-05-12 复审：整目录处于"架构空壳"状态。进一步对照 aionui-backend 能力后确认：三个真实消费点均有 backend 替代方案,整目录可以整体 DELETE。

#### 4.9.1 死代码证据

- **AgentFactory 注册证据**：
  ```
  $ grep -rn 'agentFactory.register\|\.register\(' packages/desktop/src/process/task/ packages/desktop/src/index.ts packages/desktop/src/process/
  （无命中 —— AgentFactory 虽被实例化但没有任何 agent creator 被注册）
  ```
- **addTask / getOrBuildTask 调用链**：
  ```
  $ grep -rn '\.addTask\b\|getOrBuildTask\b' packages/desktop/src/ | grep -v '\.test\.' | grep -v 'process/task/'
  （无命中 —— WorkerTaskManager 的注册/构建 API 没有任何外部调用者）
  ```

#### 4.9.2 四个 live 消费点 × backend 替代方案

| #   | 消费点                                            | 前端现有调用                                                   | 替代方案                                                                                                                                                                                                                                                                                               | 可行性                                           |
| --- | ------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 1   | `index.ts:787` —— 应用退出清理                    | `await workerTaskManager.clear()`                              | **直接删除调用**。backend `aionui-backend` 子进程由 `backendManager.stop()`（第 784 行）终止,backend 退出时会杀光它 spawn 的所有 agent 子进程。前端 `taskList` 永远为空,`.clear()` 什么都没杀。                                                                                                        | ✅ 零成本                                        |
| 2   | `applicationBridge.ts:103` —— restart 清理        | `await workerTaskManager.clear()`                              | 同 #1,直接删除调用。`app.relaunch()` 会触发 `before-quit` hook,走同一套 backend shutdown 流程。                                                                                                                                                                                                        | ✅ 零成本                                        |
| 3   | `petConfirmManager.ts:361` —— 提交 tool-call 确认 | `workerTaskManager.getTask(cid)?.confirm(msgId, callId, data)` | **改用现有 HTTP 接口**：`ipcBridge.confirmation.confirm.invoke({ conversation_id, call_id, msg_id, data, always_allow })` —— `common/adapter/ipcBridge.ts:287-293` 已封装为 `POST /api/conversations/{id}/confirmations/{callId}/confirm`,backend 路由 `aionui-conversation/src/routes.rs:40` 已实现。 | ✅ backend HTTP 已就绪,前端改 1 行               |
| 4   | `tray.ts:71` —— 托盘 badge "运行任务数"           | `workerTaskManager.listTasks().length`                         | **短期**：硬编码返回 `0`（与当前行为等价 —— 由于 taskList 永远为空）。**中期**：后端补 `GET /api/conversations/active-count` 路由（`aionui-ai-agent/src/task_manager.rs:160 active_count()` 已有内部实现,只差 HTTP 暴露）,前端改用 `ipcBridge.conversation.activeCount.invoke()`。                     | ⚠️ 短期零成本（硬编码 0）；中期需后端补 1 个路由 |

#### 4.9.3 前端必要改动清单（删除 `process/task/` 前置步骤）

1. **`src/index.ts:783-787`** —— 删除 `import { workerTaskManager }` 及 `await workerTaskManager.clear()` 调用。
2. **`src/process/bridge/applicationBridge.ts`**
   - 删除 `import type { IWorkerTaskManager }`（line 10）
   - `initApplicationBridge(workerTaskManager: IWorkerTaskManager)` → `initApplicationBridge()`（去掉参数）
   - 删除 `await workerTaskManager.clear()`（line 103）
3. **`src/process/bridge/index.ts`** —— 去掉 `BridgeInitDeps.workerTaskManager` 字段,调整 `initAllBridges(deps)` 入参。
4. **`src/process/utils/initBridge.ts`** —— 去掉 `workerTaskManager` 相关 import 和 wiring。
5. **`src/process/utils/tray.ts:69-75`** —— `getRunningTasksCount()` 改为 `return 0`（或改用新 HTTP 路由,二选一）。
6. **`src/process/pet/petConfirmManager.ts:357-364`**
   - 把 `new IpcAgentEventEmitter().emitConfirmationRemove(...)` 改为 `ipcBridge.confirmation.remove.emit({ conversation_id, id })`（wsEmitter,见 `ipcBridge.ts:297`）
   - 把 `workerTaskManager.getTask(cid)?.confirm(...)` 改为 `await ipcBridge.confirmation.confirm.invoke({ conversation_id, msg_id, call_id, data })`
7. **`src/process/pet/petManager.ts`** —— 搜 `workerTaskManager` / `IpcAgentEventEmitter` 其他引用并清理（`grep -rn 'workerTaskManager\|IpcAgentEventEmitter' packages/desktop/src/process/pet/`）。

#### 4.9.4 可选后端改动

- **新增** `GET /api/conversations/active-count` —— 暴露 `task_manager.active_count()` 为 HTTP 路由,返回 `{ count: number }`。
- 前端 adapter 补一行 `conversation.activeCount: httpGet<{count:number}>('/api/conversations/active-count')`。
- tray.ts 改用此接口,每次托盘刷新时拉一次（或订阅 WS 事件）。

#### 4.9.5 目录文件分类（全部 DELETE）

| 文件                                 | 行数 | 替换后状态                                                                                                            |
| ------------------------------------ | ---: | --------------------------------------------------------------------------------------------------------------------- |
| `task/AgentFactory.ts`               |   25 | DELETE（从未注册 creator）                                                                                            |
| `task/ConversationBusyGuard.ts`      |   96 | DELETE（仅 `killIdleCliAgents` 调用,而 taskList 永远空）                                                              |
| `task/IAgentEventEmitter.ts`         |   23 | DELETE（接口仅被 `IpcAgentEventEmitter` 实现,后者随 §4.9.3 #6 删除）                                                  |
| `task/IAgentFactory.ts`              |   28 | DELETE（仅 `AgentFactory.ts` 消费）                                                                                   |
| `task/IAgentManager.ts`              |   30 | DELETE（没有实现类;类型仅 task/ 内部互引）                                                                            |
| `task/IpcAgentEventEmitter.ts`       |   53 | DELETE（pet 改用 `ipcBridge.confirmation.remove.emit(...)` WS 发射器）                                                |
| `task/IWorkerTaskManager.ts`         |   19 | DELETE（`bridge/index.ts` / `applicationBridge.ts` 的消费随 §4.9.3 #2-#4 清除）                                       |
| `task/WorkerTaskManager.ts`          |  123 | DELETE（所有方法均无 live 消费者）                                                                                    |
| `task/agentTypes.ts`                 |   17 | DELETE（`AgentType` 仅被 task/ 内部 + pet 间接引用;pet 可直接用字符串字面量或 `common/types/agentTypes.ts` 同义类型） |
| `task/workerTaskManagerSingleton.ts` |   86 | DELETE（`conversationRepo` inline 实现从未触发）                                                                      |

**总计**：`process/task/` 目录 10 个文件,~600 行,全部 DELETE。

### 4.10 `process/pet/**.ts`

| 文件                       | 行数 | 分类     | consumers                                                                                       |
| -------------------------- | ---- | -------- | ----------------------------------------------------------------------------------------------- |
| `pet/petConfirmManager.ts` | 384  | **KEEP** | `pet/petManager.ts` 动态 import                                                                 |
| `pet/petEventBridge.ts`    | 89   | **KEEP** | `pet/petManager.ts`                                                                             |
| `pet/petIdleTicker.ts`     | 164  | **KEEP** | `pet/petManager.ts`                                                                             |
| `pet/petManager.ts`        | 691  | **KEEP** | `bridge/systemSettingsBridge.ts`（动态 import）/ `utils/tray.ts`（动态 import）/ `src/index.ts` |
| `pet/petStateMachine.ts`   | 137  | **KEEP** | `pet/petManager.ts`                                                                             |
| `pet/petTypes.ts`          | 110  | **KEEP** | `pet/petManager.ts` / `bridge/systemSettingsBridge.ts`                                          |

### 4.11 `process/resources/**.ts`

| 文件                                     | 行数 | 分类     | consumers                                                                                                                                                         |
| ---------------------------------------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resources/builtinMcp/constants.ts`      | 31   | **KEEP** | `utils/initStorage.ts`（`BUILTIN_IMAGE_GEN_*`）+ `resources/builtinMcp/imageGenServer.ts`（自身 entry）                                                           |
| `resources/builtinMcp/imageGenServer.ts` | 136  | **KEEP** | `scripts/build-mcp-servers.js` 作为 esbuild 入口编译为 `out/main/builtin-mcp-image-gen.js`，打包进 asar.unpacked（`electron-builder.yml:210`）由 MCP 客户端 spawn |
| `resources/skills/`                      | ——   | **KEEP** | 只有 `.DS_Store`；非源码目录                                                                                                                                      |

### 4.12 `process/index.ts`（顶层）

| 文件               | 行数 | 分类     | consumers                                                        |
| ------------------ | ---- | -------- | ---------------------------------------------------------------- |
| `process/index.ts` | 29   | **KEEP** | `src/index.ts:23: import { initializeProcess } from './process'` |

## 5. 汇总统计

### 5.1 最终总表（2026-05-12 复审后）

| 分类                                                  |  文件数 |      行数 |
| ----------------------------------------------------- | ------: | --------: |
| **DELETE**（含 `task/` 10 + `mainLogger` + 其余级联） |  **32** | **~3579** |
| **MODIFY**（前端调整消费点 / 瘦身 / 搬迁）            |      10 |        —— |
| **KEEP**                                              |      38 |        —— |
| **总计审计**                                          | **~80** |        —— |

NEEDS-DECISION 在 §7 逐项决议后归零:

- §7.1 `task/` 整目录 → DELETE(见 §4.9)
- §7.2 `utils/mainLogger.ts` → DELETE(SpeechToTextService 的级联)
- §7.3 `agent/remote/types.ts` → **MOVE** 到 `common/types/` (MODIFY)
- §7.4 `systemSettingsBridge.ts` → 瘦身 (MODIFY,净减 ~90 行)
- §7.5 `applicationBridgeCore.ts` → 瘦身 (MODIFY,净减 3 行)
- §7.6 `initStorage` 迁移打标 → 超出范围,留作 future-work
- §7.7 snapshot 残留目录 → release notes + 可选后端 cleanup

### 5.2 DELETE 明细（行数降序,含 `task/` 目录）

| #   | 路径                                                        | 行数 | 理由                                                                             |
| --- | ----------------------------------------------------------- | ---: | -------------------------------------------------------------------------------- |
| 1   | `process/services/WorkspaceSnapshotService.ts`              |  433 | 级联：`workspaceSnapshotBridge` 唯一消费者                                       |
| 2   | `process/utils/initAgent.ts`                                |  414 | 级联：`ConversationServiceImpl` 的唯一消费者；backend `aionui-conversation` 接管 |
| 3   | `process/bridge/shellBridge.ts`                             |  273 | 全文 `httpPost` → no-op 注册                                                     |
| 4   | `process/bridge/services/SpeechToTextService.ts`            |  260 | 级联：`speechToTextBridge` 的唯一消费者                                          |
| 5   | `process/services/ccSwitchModelSource.ts`                   |  236 | **UC-B 已失效**；零消费者                                                        |
| 6   | `process/services/openclawConflictDetector.ts`              |  208 | 零消费者                                                                         |
| 7   | `process/utils/safeExec.ts`                                 |  173 | 零消费者                                                                         |
| 8   | `process/services/ConversationServiceImpl.ts`               |  160 | 级联：仅被 singleton 消费，而 singleton 零消费                                   |
| 9   | `process/utils/message.ts`                                  |  143 | 零消费者；ACP era 消息缓存                                                       |
| 10  | `process/task/WorkerTaskManager.ts`                         |  123 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 11  | `process/utils/credentialCrypto.ts`                         |  109 | 零消费者                                                                         |
| 12  | `process/services/database/SqliteConversationRepository.ts` |  109 | 级联：`conversationServiceSingleton` 唯一消费者                                  |
| 13  | `process/task/ConversationBusyGuard.ts`                     |   96 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 14  | `process/task/workerTaskManagerSingleton.ts`                |   86 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 15  | `process/utils/previewUtils.ts`                             |   84 | **UC-B 已失效**；`AcpAgentManager` 已删                                          |
| 16  | `process/bridge/workspaceSnapshotBridge.ts`                 |   68 | 全文 `httpPost` → no-op                                                          |
| 17  | `process/bridge/authBridge.ts`                              |   59 | `googleAuth.status` 是 stubProvider                                              |
| 18  | `process/services/IConversationService.ts`                  |   58 | 级联                                                                             |
| 19  | `process/task/IpcAgentEventEmitter.ts`                      |   53 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 20  | `process/bridge/taskBridge.ts`                              |   45 | `task.stopAll/getRunningCount` 是 stubProvider                                   |
| 21  | `process/task/IAgentManager.ts`                             |   30 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 22  | `process/utils/openclawUtils.ts`                            |   30 | 级联：仅被 `initAgent.ts` 消费                                                   |
| 23  | `process/task/IAgentFactory.ts`                             |   28 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 24  | `process/task/AgentFactory.ts`                              |   25 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 25  | `process/task/IAgentEventEmitter.ts`                        |   23 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 26  | `process/bridge/remoteAgentBridge.ts`                       |   21 | 空函数，自述 "Intentionally empty"                                               |
| 27  | `process/utils/configureConsole.ts`                         |   21 | 零消费者                                                                         |
| 28  | `process/task/IWorkerTaskManager.ts`                        |   19 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 29  | `process/services/conversationServiceSingleton.ts`          |   18 | 零消费者                                                                         |
| 30  | `process/task/agentTypes.ts`                                |   17 | `process/task/` 目录整体 DELETE（§4.9）                                          |
| 31  | `process/bridge/speechToTextBridge.ts`                      |   14 | `speechToText.transcribe` 是 httpPost                                            |
| 32  | `process/utils/mainLogger.ts`                               |   43 | 级联：唯一消费者 `SpeechToTextService` 已 DELETE（§7.2）                         |

**合计：32 文件,~3579 行**（原 21 文件 2936 行 + `task/` 10 文件 600 行 + mainLogger 43 行）。

### 5.3 MODIFY 明细

| 路径                                                                 | 改动                                                                                                                                                                                                                                                                                                                                                                                                                        | 来源章节        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `process/bridge/index.ts`                                            | 移除对已删 bridge 的 import / init 调用 / export；移除 `BridgeInitDeps.workerTaskManager`                                                                                                                                                                                                                                                                                                                                   | §4.1.6 / §4.9.3 |
| `process/utils/initBridge.ts`                                        | 移除 `workerTaskManager` 相关 import 和 wiring                                                                                                                                                                                                                                                                                                                                                                              | §4.9.3          |
| `src/index.ts`                                                       | 删除 `import { workerTaskManager }` 和 `await workerTaskManager.clear()`                                                                                                                                                                                                                                                                                                                                                    | §4.9.3          |
| `process/bridge/applicationBridge.ts`                                | 删除 `IWorkerTaskManager` import、`initApplicationBridge` 参数、`await workerTaskManager.clear()`                                                                                                                                                                                                                                                                                                                           | §4.9.3          |
| `process/utils/tray.ts`                                              | `getRunningTasksCount()` 改为 `return 0`,或改用新 HTTP 路由                                                                                                                                                                                                                                                                                                                                                                 | §4.9.3          |
| `process/pet/petConfirmManager.ts`                                   | `new IpcAgentEventEmitter().emitConfirmationRemove(...)` → `ipcBridge.confirmation.remove.emit(...)`；`workerTaskManager.getTask().confirm(...)` → `ipcBridge.confirmation.confirm.invoke(...)`                                                                                                                                                                                                                             | §4.9.3          |
| `process/pet/petManager.ts`                                          | 清理残留的 `workerTaskManager` / `IpcAgentEventEmitter` import                                                                                                                                                                                                                                                                                                                                                              | §4.9.3          |
| `process/agent/remote/types.ts` → `common/types/remoteAgentTypes.ts` | **文件搬迁**：更新 5 处 `@process/agent/remote/types` import 到 `@/common/types/remoteAgentTypes`,然后删除空的 `process/agent/` 目录                                                                                                                                                                                                                                                                                        | §7.3            |
| `process/bridge/systemSettingsBridge.ts`                             | **瘦身**：删除 11 处 HTTP no-op `.provider()` 块(`getCloseToTray`/`setCloseToTray`/`getNotificationEnabled`/`setNotificationEnabled`/`getCronNotificationEnabled`/`setCronNotificationEnabled`/`getKeepAwake` getter/`getSaveUploadToWorkspace`/`setSaveUploadToWorkspace`/`getAutoPreviewOfficeFiles`/`setAutoPreviewOfficeFiles`),保留 `setKeepAwake` + `changeLanguage` 本地副作用 + 8 处 pet buildProvider。净减 ~90 行 | §7.4            |
| `process/bridge/applicationBridgeCore.ts`                            | **瘦身**：删除 `systemInfo.provider(...)` 3 行,保留 `updateSystemInfo` / `getPath` 真 IPC                                                                                                                                                                                                                                                                                                                                   | §7.5            |

## 6. 删除顺序建议（依赖图）

### 6.1 依赖图（箭头表示"删 A 前必须先删/处理 B"）

```
bridge/index.ts (MODIFY: 先移除 import/调用/export 中对已删 bridge 的引用)
  │
  ├── DELETE: bridge/authBridge.ts
  ├── DELETE: bridge/remoteAgentBridge.ts
  ├── DELETE: bridge/shellBridge.ts
  ├── DELETE: bridge/taskBridge.ts
  ├── DELETE: bridge/workspaceSnapshotBridge.ts ──┐
  │     └── DELETE: services/WorkspaceSnapshotService.ts
  └── DELETE: bridge/speechToTextBridge.ts ──────┐
        └── DELETE: bridge/services/SpeechToTextService.ts

（services 层独立删除链，需先于 bridge 修改或同一 commit）
services/conversationServiceSingleton.ts  ← 先删（没有外部依赖）
  │
  ├── DELETE: services/ConversationServiceImpl.ts
  │     │
  │     ├── DELETE: services/IConversationService.ts
  │     └── DELETE: utils/initAgent.ts
  │           └── DELETE: utils/openclawUtils.ts
  │
  └── DELETE: services/database/SqliteConversationRepository.ts

（services 孤儿）
DELETE: services/ccSwitchModelSource.ts     （独立）
DELETE: services/openclawConflictDetector.ts （独立）

（utils 孤儿）
DELETE: utils/credentialCrypto.ts （独立）
DELETE: utils/safeExec.ts         （独立）
DELETE: utils/message.ts          （独立）
DELETE: utils/previewUtils.ts     （独立）
DELETE: utils/configureConsole.ts （独立）

（task/ 目录整体删除 —— 前置消费点改造）
前置 MODIFY（必须先做,否则 TS 报错）：
  - src/index.ts: 删 workerTaskManager import + .clear() 调用
  - process/bridge/applicationBridge.ts: 删 IWorkerTaskManager import + 参数 + .clear()
  - process/bridge/index.ts: 删 BridgeInitDeps.workerTaskManager
  - process/utils/initBridge.ts: 删 wiring
  - process/utils/tray.ts: getRunningTasksCount → return 0
  - process/pet/petConfirmManager.ts: 改用 ipcBridge.confirmation.confirm/remove
  - process/pet/petManager.ts: 清理残留 import
  │
  └── DELETE: process/task/ 目录（10 个文件,~600 行）
```

### 6.2 推荐 commit 分组（每组各自 `bunx tsc --noEmit` 通过）

| Commit | 内容                                                                                                                                   |      行数 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------: |
| C1     | `bridge/index.ts` 先行 MODIFY + 4 个纯 no-op bridge 删除（authBridge / remoteAgentBridge / shellBridge / taskBridge）                  |      ~400 |
| C2     | `workspaceSnapshotBridge` + `WorkspaceSnapshotService` 联合删 + `bridge/index.ts` 同步                                                 |      ~500 |
| C3     | `speechToTextBridge` + `bridge/services/SpeechToTextService` + `mainLogger` 联合删 + `bridge/index.ts` 同步（§7.2 级联)                |      ~320 |
| C4     | ConversationService 四件套（singleton / Impl / IConvSvc / SqliteConvRepo）联合删                                                       |      ~345 |
| C5     | initAgent + openclawUtils 联合删（依赖 C4）                                                                                            |      ~444 |
| C6     | 零消费者孤儿：ccSwitchModelSource / openclawConflictDetector / credentialCrypto / safeExec / message / previewUtils / configureConsole |      ~871 |
| C7     | `process/task/` 目录整体删除 —— 先改 6 个消费点（§4.9.3）,再删 10 个文件                                                               |      ~600 |
| C8     | **MODIFY 瘦身**：`systemSettingsBridge` 删 11 处 no-op + `applicationBridgeCore` 删 3 行（§7.4 / §7.5）                                | ~-93 净减 |
| C9     | **MOVE**：`process/agent/remote/types.ts` → `common/types/remoteAgentTypes.ts`,更新 5 处 import,删空 `process/agent/` 目录（§7.3）     |     ~0 净 |

**总：9 个 commit,净删 ~3579 行**（§5.2 DELETE 合计 3579 行 + C8 额外瘦身 ~93 行）。

## 7. 风险与待决策项（NEEDS-DECISION）

### 7.1 `task/` 目录整体 —— **已决策：DELETE**

2026-05-12 复审已给出完整替换方案,详见 §4.9.2 / §4.9.3 / §4.9.4。本节保留作为决策记录：

- **原开放问题**：是否删除整套 factory/manager/busyGuard 抽象？
- **决策**：**DELETE 整目录**（10 个文件,~600 行）。
- **前置工作**：§4.9.3 列出的 7 个前端文件小改动（改 petConfirmManager / tray / index.ts / applicationBridge / bridge/index.ts / initBridge / petManager）。
- **后端可选增补**：新增 `GET /api/conversations/active-count` 路由（§4.9.4）,使 tray badge 显示真实数据；短期硬编码 `0` 也可接受。

### 7.2 `utils/mainLogger.ts` —— **已决策：DELETE**

- **证据**：
  ```
  $ grep -rn "mainLog\|mainError\|mainWarn\|mainLogger" packages/desktop/src/ --include='*.ts' --include='*.tsx' | grep -v "mainLogger.ts"
  packages/desktop/src/process/bridge/services/SpeechToTextService.ts:14 / :121 / :147 / :154 / :165 / :176
  ```
  唯一外部消费者就是 `SpeechToTextService`（DELETE 对象）。删除 SpeechToTextService 后,`mainLogger.ts` 归零消费。
- **决策**：**一并 DELETE**（43 行)。`console.log/warn/error` + electron-log（`configureConsoleLog.ts`）已覆盖主进程日志需求。
- **纳入 §5.2 DELETE 明细**：作为 `SpeechToTextService` 级联项的级联项（串联顺序：`speechToTextBridge` → `SpeechToTextService` → `mainLogger`）。

### 7.3 `process/agent/remote/types.ts` —— **已决策：MOVE（MODIFY,非 DELETE）**

- **证据**：该文件有真实跨进程消费者,**不能 DELETE**:
  ```
  $ grep -rn "from.*@process/agent/remote/types\|from.*process/agent/remote/types" packages/desktop/src/
  renderer/pages/settings/AgentSettings/RemoteAgentManagement.tsx:8
  common/adapter/ipcBridge.ts:818,819,823,824,826 (5 处 import('@process/agent/remote/types') 类型引用)
  ```
  renderer 和 adapter 层通过 `@process/agent/remote/types` 导入 `RemoteAgentConfig` / `RemoteAgentInput` 作为**类型契约**。
- **决策**：**MODIFY —— 从 `process/agent/remote/types.ts` 搬到 `common/types/remoteAgentTypes.ts`**,更新 5 处 `@process/agent/remote/types` 引用,然后删除空的 `process/agent/` 目录。
- **理由**：类型定义放在 `process/` 层违反分层原则(renderer 不应依赖 process 路径);`common/` 是 renderer + process 共享的正确位置。
- **纳入 §5.3 MODIFY 明细**：新增"Move `process/agent/remote/types.ts` → `common/types/remoteAgentTypes.ts`,5 处导入更新"。

### 7.4 `bridge/systemSettingsBridge.ts` —— **已决策：瘦身(MODIFY)**

- **文件整体结构**（基于 `adapter/ipcBridge.ts:978-1009` 实地对照):
  - **11 处 HTTP no-op `.provider()` 注册**(整体可删)：`getCloseToTray` / `setCloseToTray` / `getNotificationEnabled` / `setNotificationEnabled` / `getCronNotificationEnabled` / `setCronNotificationEnabled` / `getKeepAwake` 的 getter 部分 / `getSaveUploadToWorkspace` / `setSaveUploadToWorkspace` / `getAutoPreviewOfficeFiles` / `setAutoPreviewOfficeFiles`
  - **2 处带本地副作用的 provider**(必须保留): `setKeepAwake.provider`(调用 `power.preventDisplaySleep()` 控制 Electron powerSaveBlocker); `changeLanguage.provider`(主进程 i18n 广播 + keepAwake 副作用重触发)
  - **8 处真 IPC `buildProvider`**(整体保留): `getPetEnabled` / `setPetEnabled` / `getPetSize` / `setPetSize` / `getPetDnd` / `setPetDnd` / `getPetConfirmEnabled` / `setPetConfirmEnabled`
- **决策**：**MODIFY —— 删除 11 处 HTTP no-op `.provider()` 块,保留带本地副作用的 2 处 + 8 处 pet 真 IPC**。预计净减 ~90 行。
- **纳入 §5.3 MODIFY 明细**：新增"瘦身 systemSettingsBridge.ts,删除 11 处 HTTP no-op provider 注册"。

### 7.5 `bridge/applicationBridgeCore.ts` —— **已决策：瘦身(MODIFY)**

- **证据**(`applicationBridgeCore.ts:19-21`)：
  ```ts
  ipcBridge.application.systemInfo.provider(() => {
    return Promise.resolve(getSystemDir());
  });
  ```
  对照 `adapter/ipcBridge.ts:345-356`,`application.systemInfo` 是 `withResponseMap(httpGet('/api/system/info'), ...)` → **no-op**。
  同文件第 23-32 / 34-43 行的 `updateSystemInfo` / `getPath` 是 `buildProvider` 真 IPC,必须保留。
- **决策**：**MODIFY —— 删除 `systemInfo.provider(...)` 3 行**。
- **纳入 §5.3 MODIFY 明细**：新增"瘦身 applicationBridgeCore.ts,删除 systemInfo no-op provider"。

### 7.6 `initStorage.ts` 里的 `runLegacyDatabaseMigrations` 调用时机 —— **超出范围**

- **问题**：`runLegacyDatabaseMigrations` 每次启动都跑一次(`initStorage.ts:587`);老用户早已迁完。
- **决策**：**不在本次清理做**。这是长期启动性能优化,不影响本审计的 DELETE 安全性。留作 future-work。

### 7.7 `services/WorkspaceSnapshotService.ts` 里 `cleanupStaleSnapshots()` 的遗留数据 —— **决策：release notes 提醒**

- **问题**：删掉该 service 后,本地磁盘可能残留老 snapshot 目录(`~/Library/Application Support/<AionUi>/.aionui-snapshots/*`)。
- **决策**：**不阻塞删除**。两种处理择一,或都做:
  1. Release notes 提醒老用户手动清理残留目录。
  2. 后端 `aionui-file` 启动时增加一次性 cleanup pass,扫描 `.aionui-snapshots/` 并删除(单独的后端任务,不属本审计范围)。

## 8. 与 2026-05-08 三份文档的关系

### 8.1 N1 已覆盖（不重复）

以下 7 个文件**已经在 `feat/backend-migration` 的 N1 工作中删除**（实地 `ls` 确认不存在）。本审计**不重复列出**：

- `process/bridge/bedrockBridge.ts`
- `process/bridge/previewHistoryBridge.ts`
- `process/services/previewHistoryService.ts`
- `process/bridge/pptPreviewBridge.ts`
- `process/bridge/officeWatchBridge.ts`
- `process/bridge/documentBridge.ts`
- `process/services/conversionService.ts`

### 8.2 本审计**扩展** N1 的范围

N1 只覆盖 7 个文件 + `bridge/index.ts` 5 处 init 引用的移除。本审计额外提出：

- **14 个纯 no-op bridge / service 文件**（§4.1 / §4.2 / §4.3 / §4.6）
- **7 个级联文件**（`IConversationService.ts` / `conversationServiceSingleton.ts` / `SqliteConversationRepository.ts` / `initAgent.ts` / `openclawUtils.ts` / `SpeechToTextService.ts` / `WorkspaceSnapshotService.ts`）
- **UC-B 保留名单需修正**：`ccSwitchModelSource.ts` + `previewUtils.ts` 在 `2026-05-08-cleanup-and-test-rewrite-design.md` §UC-B 中保留的理由已**完全失效**（对应的 `process/acp/*` / `process/agent/acp/*` / `task/AcpAgentManager.ts` 已全部删除）。

### 8.3 明确不与 N1 / N2 / N3 / N4 / N5 冲突

- **测试（N2 / N3 / N4）**：本审计不触动 `tests/**`。如果删除某个 source 文件后对应 test 需要失效，由执行清理的 agent 同时在该 commit 里删 test（N2 里程碑的本份工作）。
- **UC-A 范围**：本审计**全部**在 `process/` 层内（`common/` / `renderer/` / `preload/` 不碰），符合 UC-A "清理而非重构"的底线。
- **CI 恢复（N5）**：不影响 —— CI 在 N5 里解注释 `bunx vitest run` 的动作由 `feat/cleanup-and-test-rewrite` 分支末端执行。

### 8.4 对 `2026-05-08-cleanup-and-test-rewrite-design.md` 的修正提议

1. §UC-B 中 `ccSwitchModelSource.ts` 和 `previewUtils.ts` 的保留条目应**改为可删**（附本审计 §4.3.5 / §4.6.18 的 grep 证据）。
2. §附录 A（UC-B 二次 grep 结果）第 663-680 行的"结论：仍被 task 模块使用"和"仍被 agent/acp 模块使用"应更新为"2026-05-12 复审：相关 task/acp 文件已随 backend 迁移删除；本条保留失效，改为 DELETE"。
3. §附录 B 不需要改动（路由映射表本身仍然准确）。

## 9. 下一步

1. 把本审计文档作为新建 milestone N6（或沿用 N1 扩展）的 requirements 输入。
2. 由 plan-writer 基于本文档的 §5 / §6 / §7 产出一份可执行的 plan（分 6 个 commit，每个 commit 独立 tsc 通过）。
3. plan 通过评审后，由 executor 落地；handoff 遵循 `2026-05-08-cleanup-team-playbook.md` UC-F 硬约束（原始命令输出、真实验证）。
4. NEEDS-DECISION 的 7 项，由 team-lead 在 plan-review 时逐一拍板，不留"以后再决定"。

## 附录 A：完整文件清单 × 分类一览

| #   | 相对路径                                                    | 行数 | 分类                                                         |
| --- | ----------------------------------------------------------- | ---: | ------------------------------------------------------------ |
| 1   | `process/index.ts`                                          |   29 | KEEP                                                         |
| 2   | `process/backend/binaryResolver.ts`                         |   60 | KEEP                                                         |
| 3   | `process/backend/index.ts`                                  |    1 | KEEP                                                         |
| 4   | `process/agent/remote/types.ts`                             |   51 | **MODIFY**（搬迁到 `common/types/remoteAgentTypes.ts`,§7.3） |
| 5   | `process/bridge/applicationBridge.ts`                       |  199 | KEEP                                                         |
| 6   | `process/bridge/applicationBridgeCore.ts`                   |   44 | **MODIFY**（瘦身,删 systemInfo no-op 3 行,§7.5）             |
| 7   | `process/bridge/authBridge.ts`                              |   59 | **DELETE**                                                   |
| 8   | `process/bridge/dialogBridge.ts`                            |   28 | KEEP                                                         |
| 9   | `process/bridge/feedbackBridge.ts`                          |  104 | KEEP                                                         |
| 10  | `process/bridge/index.ts`                                   |   59 | **MODIFY**                                                   |
| 11  | `process/bridge/notificationBridge.ts`                      |   73 | KEEP                                                         |
| 12  | `process/bridge/remoteAgentBridge.ts`                       |   21 | **DELETE**                                                   |
| 13  | `process/bridge/shellBridge.ts`                             |  273 | **DELETE**                                                   |
| 14  | `process/bridge/speechToTextBridge.ts`                      |   14 | **DELETE**                                                   |
| 15  | `process/bridge/systemSettingsBridge.ts`                    |  206 | **MODIFY**（瘦身,删 11 处 HTTP no-op provider,§7.4）         |
| 16  | `process/bridge/taskBridge.ts`                              |   45 | **DELETE**                                                   |
| 17  | `process/bridge/updateBridge.ts`                            |  666 | KEEP                                                         |
| 18  | `process/bridge/webuiBridge.ts`                             |  107 | KEEP                                                         |
| 19  | `process/bridge/windowControlsBridge.ts`                    |   91 | KEEP                                                         |
| 20  | `process/bridge/workspaceSnapshotBridge.ts`                 |   68 | **DELETE**                                                   |
| 21  | `process/bridge/services/SpeechToTextService.ts`            |  260 | **DELETE** (级联)                                            |
| 22  | `process/pet/petConfirmManager.ts`                          |  384 | KEEP                                                         |
| 23  | `process/pet/petEventBridge.ts`                             |   89 | KEEP                                                         |
| 24  | `process/pet/petIdleTicker.ts`                              |  164 | KEEP                                                         |
| 25  | `process/pet/petManager.ts`                                 |  691 | KEEP                                                         |
| 26  | `process/pet/petStateMachine.ts`                            |  137 | KEEP                                                         |
| 27  | `process/pet/petTypes.ts`                                   |  110 | KEEP                                                         |
| 28  | `process/resources/builtinMcp/constants.ts`                 |   31 | KEEP                                                         |
| 29  | `process/resources/builtinMcp/imageGenServer.ts`            |  136 | KEEP                                                         |
| 30  | `process/services/autoUpdaterService.ts`                    |  335 | KEEP                                                         |
| 31  | `process/services/ccSwitchModelSource.ts`                   |  236 | **DELETE**                                                   |
| 32  | `process/services/ConversationServiceImpl.ts`               |  160 | **DELETE**                                                   |
| 33  | `process/services/conversationServiceSingleton.ts`          |   18 | **DELETE**                                                   |
| 34  | `process/services/IConversationService.ts`                  |   58 | **DELETE**                                                   |
| 35  | `process/services/openclawConflictDetector.ts`              |  208 | **DELETE**                                                   |
| 36  | `process/services/WorkspaceSnapshotService.ts`              |  433 | **DELETE** (级联)                                            |
| 37  | `process/services/i18n/index.ts`                            |   88 | KEEP                                                         |
| 38  | `process/services/database/IConversationRepository.ts`      |   39 | KEEP                                                         |
| 39  | `process/services/database/SqliteConversationRepository.ts` |  109 | **DELETE**                                                   |
| 40  | `process/services/database/migrations.ts`                   | 1392 | KEEP                                                         |
| 41  | `process/services/database/runLegacyDatabaseMigrations.ts`  |   86 | KEEP                                                         |
| 42  | `process/services/database/schema.ts`                       |  154 | KEEP                                                         |
| 43  | `process/services/database/drivers/BetterSqlite3Driver.ts`  |   49 | KEEP                                                         |
| 44  | `process/services/database/drivers/ISqliteDriver.ts`        |   15 | KEEP                                                         |
| 45  | `process/task/AgentFactory.ts`                              |   25 | **DELETE** (§4.9)                                            |
| 46  | `process/task/ConversationBusyGuard.ts`                     |   96 | **DELETE** (§4.9)                                            |
| 47  | `process/task/IAgentEventEmitter.ts`                        |   23 | **DELETE** (§4.9)                                            |
| 48  | `process/task/IAgentFactory.ts`                             |   28 | **DELETE** (§4.9)                                            |
| 49  | `process/task/IAgentManager.ts`                             |   30 | **DELETE** (§4.9)                                            |
| 50  | `process/task/IpcAgentEventEmitter.ts`                      |   53 | **DELETE** (§4.9)                                            |
| 51  | `process/task/IWorkerTaskManager.ts`                        |   19 | **DELETE** (§4.9)                                            |
| 52  | `process/task/WorkerTaskManager.ts`                         |  123 | **DELETE** (§4.9)                                            |
| 53  | `process/task/agentTypes.ts`                                |   17 | **DELETE** (§4.9)                                            |
| 54  | `process/task/workerTaskManagerSingleton.ts`                |   86 | **DELETE** (§4.9)                                            |
| 55  | `process/utils/analyticsId.ts`                              |   41 | KEEP                                                         |
| 56  | `process/utils/appMenu.ts`                                  |   77 | KEEP                                                         |
| 57  | `process/utils/configureChromium.ts`                        |  389 | KEEP                                                         |
| 58  | `process/utils/configureConsole.ts`                         |   21 | **DELETE**                                                   |
| 59  | `process/utils/configureConsoleLog.ts`                      |   81 | KEEP                                                         |
| 60  | `process/utils/credentialCrypto.ts`                         |  109 | **DELETE**                                                   |
| 61  | `process/utils/deepLink.ts`                                 |   78 | KEEP                                                         |
| 62  | `process/utils/ensureAdminUser.ts`                          |   78 | KEEP                                                         |
| 63  | `process/utils/index.ts`                                    |   18 | KEEP                                                         |
| 64  | `process/utils/initAgent.ts`                                |  414 | **DELETE** (级联)                                            |
| 65  | `process/utils/initBridge.ts`                               |   15 | KEEP                                                         |
| 66  | `process/utils/initStorage.ts`                              |  633 | KEEP                                                         |
| 67  | `process/utils/mainLogger.ts`                               |   43 | **DELETE**（级联,§7.2）                                      |
| 68  | `process/utils/mainWindowLifecycle.ts`                      |   39 | KEEP                                                         |
| 69  | `process/utils/message.ts`                                  |  143 | **DELETE**                                                   |
| 70  | `process/utils/migrateAssistants.ts`                        |  270 | KEEP (UC-B)                                                  |
| 71  | `process/utils/openclawUtils.ts`                            |   30 | **DELETE** (级联)                                            |
| 72  | `process/utils/previewUtils.ts`                             |   84 | **DELETE**                                                   |
| 73  | `process/utils/resetPasswordCLI.ts`                         |   70 | KEEP                                                         |
| 74  | `process/utils/runBackendMigrations.ts`                     |   93 | KEEP (UC-B)                                                  |
| 75  | `process/utils/safeExec.ts`                                 |  173 | **DELETE**                                                   |
| 76  | `process/utils/tray.ts`                                     |  296 | KEEP                                                         |
| 77  | `process/utils/utils.ts`                                    |  460 | KEEP                                                         |
| 78  | `process/utils/webuiConfig.ts`                              |  336 | KEEP                                                         |
| 79  | `process/utils/zoom.ts`                                     |  136 | KEEP                                                         |

（`process/resources/skills/` 目录只含 `.DS_Store`，不计）

---

**文档结束。**
