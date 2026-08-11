# Hub Backend 测试指南

## 测试分层

| 层级 | 名称             | 测什么              | 关注点         | 运行环境            |
| ---- | ---------------- | ------------------- | -------------- | ------------------- |
| L1   | Integration Test | 主进程安装链路      | 数据流转正确性 | 本地 + CI           |
| L2   | E2E Test         | UI 交互流程         | 用户体验正确性 | 本地（需 Electron） |
| L3   | Smoke Test       | 真实 Backend 连通性 | ACP 协议可用性 | 仅本地              |

---

## L1 Integration Test

**文件**: `tests/integration/hub-install-flow.test.ts`

**测试的完整链路**:

```
HubIndexManager 加载 index
  → HubInstaller.install() 下载解压
    → lifecycle onInstall 执行（安装 CLI）
      → ExtensionRegistry.hotReload()
        → AcpDetector.refreshAll() 检测新 Backend
          → AcpConnection.connect() 完成 handshake
            → sendPrompt() 收到 response
```

**关注点**:

- Extension manifest 解析是否正确
- onInstall 钩子是否成功安装 CLI
- hotReload 后新 extension 是否被识别
- AcpDetector 是否检测到新 Backend
- ACP JSON-RPC 协议 handshake 是否完整
- **集成链路测试**: 上述环节作为一条完整链路执行，而非逐步隔离

**使用的 fixture**:

- `tests/fixtures/fake-acp-cli/` — 最小 ACP JSON-RPC CLI，支持 initialize / session/new / session/prompt
- `tests/fixtures/fake-extension/` — 测试用 extension，声明 acpAdapters，onInstall 钩子将 fake CLI 放到 PATH

**运行**:

```bash
bun run test:integration
# 或单独运行
bunx vitest run tests/integration/hub-install-flow.test.ts
```

---

## L2 E2E Test

**文件**: `tests/e2e/specs/hub-backend-install.e2e.ts`

**测试的 UI 流程**:

```
设置页 → Agent 页 → 本地 Agent Tab
  → 点击"从市场安装"
    → Hub 弹窗打开，列表加载
      → 验证 card 状态（Install / Installed / Retry）
        → 点击 Install，状态流转（Installing → Installed）
          → 关闭弹窗，验证新 Backend 出现在列表
            → 选择新 Backend，验证可发起会话
```

**关注点**:

- 用户操作路径是否完整覆盖
- 状态展示是否正确（每张 card 单独验证）
- 安装后列表是否自动刷新
- 弹窗打开 / 关闭交互
- 边界场景：install_failed 时的 Retry 按钮

**运行**:

```bash
# 需要 Electron 环境
bun run test:e2e
# 或单独运行
bunx playwright test tests/e2e/specs/hub-backend-install.e2e.ts --config playwright.config.ts
```

> **注意**: L2 需要 Electron 二进制。如果 Electron 未安装，先运行 `node node_modules/electron/install.js`。

---

## L3 Smoke Test

**文件**: `tests/integration/acp-smoke.test.ts`

**测试流程**:

```
检查 CLI 是否在 PATH 上
  → 不存在则 skip（不 fail）
  → 存在则 spawn CLI + ACP handshake
    → initialize → session/new → session/prompt
      → 验证收到 response chunk
        → disconnect，验证进程正常退出
```

**关注点**:

- 真实 Backend CLI 的 ACP 协议兼容性
- handshake 是否正常完成
- 是否能收到流式 response
- 进程是否正常退出，无残留

**覆盖的 Backend**:

| Backend      | 命令            | ACP 参数 | 备注                  |
| ------------ | --------------- | -------- | --------------------- |
| fake-acp-cli | `node index.js` | —        | 始终运行              |
| claude       | `claude`        | `--acp`  | 需 `ACP_SMOKE_REAL=1` |
| codex        | `codex`         | `--acp`  | 需 `ACP_SMOKE_REAL=1` |
| goose        | `goose`         | `acp`    | 需 `ACP_SMOKE_REAL=1` |

**运行**:

```bash
# 默认只跑 fake CLI（无需真实 Backend）
bunx vitest run tests/integration/acp-smoke.test.ts

# 启用真实 Backend 冒烟（需要本地已安装对应 CLI + API key）
ACP_SMOKE_REAL=1 bunx vitest run tests/integration/acp-smoke.test.ts
```

> **注意**: L3 仅在本地运行，不上 CI。真实 Backend 测试需要本地安装 CLI 并配置好 API key。

---

## 添加新 Backend 时的测试清单

当 Hub 新增一个 Backend extension 时，按以下步骤验证：

### 1. L1 — 验证安装链路

无需修改测试代码。L1 使用 fixture extension 验证通用安装链路，与具体 Backend 无关。

### 2. L3 — 添加真实 Backend 冒烟

在 `tests/integration/acp-smoke.test.ts` 的 `realBackends` 数组中添加新 Backend：

```typescript
const realBackends = [
  { name: 'claude', cmd: 'claude', args: ['--acp'] },
  { name: 'codex', cmd: 'codex', args: ['--acp'] },
  { name: 'goose', cmd: 'goose', args: ['acp'] },
  // 新增:
  { name: 'new-backend', cmd: 'new-backend', args: ['--acp'] },
];
```

然后本地运行：

```bash
ACP_SMOKE_REAL=1 bunx vitest run tests/integration/acp-smoke.test.ts
```

### 3. L2 — 验证 UI 流程

启动 dev 环境，手动走一遍 UI 流程确认无误后，运行 E2E 测试：

```bash
bun run test:e2e
```

---

## 基础设施

### fake-acp-cli

**位置**: `tests/fixtures/fake-acp-cli/`

最小 ACP JSON-RPC 2.0 CLI 实现，通过 stdin/stdout 通信：

- `initialize` → 返回 capabilities + models
- `session/new` → 返回 sessionId
- `session/prompt` → 返回流式 text chunks + end_turn
- `session/cancel` → 取消当前 prompt

用于 L1 和 L3（fake CLI 部分），避免依赖真实 Backend。

### fake-extension

**位置**: `tests/fixtures/fake-extension/`

测试用 extension：

- `aion-extension.json` — 声明 `contributes.acpAdapters`，声明 `lifecycle.onInstall`
- `scripts/install.js` — onInstall 钩子，将 fake-acp-cli 放到临时 PATH（Unix: symlink, Windows: .cmd wrapper）

### 跨平台兼容性

所有测试已处理跨平台差异：

| 差异点                 | 处理方式                               |
| ---------------------- | -------------------------------------- |
| symlink 权限 (Windows) | Windows 用 .cmd wrapper 替代           |
| shebang (Windows)      | 统一用 `spawn('node', [path])`         |
| 进程信号 (Windows)     | `child.kill()` 跨平台，SIGKILL 仅 Unix |
| CLI 检测               | `where` (Windows) / `which` (Unix)     |
| 路径分隔符             | 统一用 `path.join()` + `os.tmpdir()`   |
