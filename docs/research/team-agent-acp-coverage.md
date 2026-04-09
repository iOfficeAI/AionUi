# Team Mode Agent ACP 覆盖调研报告

**日期：** 2026-04-07
**作者：** 架构-阿构
**代码基：** `fix/team-mcp-injection-stability` 分支

---

## 1. 背景与目标

AionUi Team Mode 当前通过两处硬编码白名单，将可加入团队的 agent 类型限定为 4 种（`claude`, `codex`, `codebuddy`, `gemini`）。然而项目实际支持 20 种 agent 后端（`AcpBackendAll` + 独立协议类型），白名单严重限制了 Team Mode 的可用范围。

本报告目标：
1. 建立完整 Agent 类型清单和 ACP 支持矩阵
2. 分析 Team Mode 接入限制的根因
3. 提出短中长期扩展方案并评估风险

---

## 2. Agent 类型体系（源码确认）

### 2.1 高层 AgentType 枚举

定义于 `src/process/task/agentTypes.ts:9`：

```
'gemini' | 'acp' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'aionrs'
```

这是任务层（Task）感知的对话类型，决定走哪个 AgentManager。

### 2.2 ACP 后端类型（AcpBackendAll）

定义于 `src/common/types/acpTypes.ts:57-78`，共 **20 种**：

| Backend ID | 名称 | enabled | CLI 命令 | ACP 启动参数 |
|---|---|---|---|---|
| `claude` | Claude Code | true | `claude` | `--experimental-acp` |
| `gemini` | Google CLI | **false** | `gemini` | - |
| `qwen` | Qwen Code | true | `npx @qwen-code/qwen-code` | `--acp` |
| `iflow` | iFlow CLI | true | `iflow` | `--experimental-acp` |
| `codex` | Codex | true | `npx @zed-industries/codex-acp@0.9.5` | (默认，无 flag) |
| `codebuddy` | CodeBuddy | true | `npx @tencent-ai/codebuddy-code@2.70.1` | `--acp` |
| `goose` | Goose | true | `goose` | `acp` (子命令) |
| `auggie` | Augment Code | true | `auggie` | `--acp` |
| `kimi` | Kimi CLI | true | `kimi` | `acp` (子命令) |
| `opencode` | OpenCode | true | `opencode` | `acp` (子命令) |
| `droid` | Factory Droid | true | `droid` | `exec --output-format acp` |
| `copilot` | GitHub Copilot | true | `copilot` | `--acp --stdio` |
| `qoder` | Qoder CLI | true | `qodercli` | `--acp` |
| `vibe` | Mistral Vibe | true | `vibe-acp` | (无 flag) |
| `openclaw-gateway` | OpenClaw | true | `openclaw` | `gateway` |
| `nanobot` | Nano Bot | true | `nanobot` | - |
| `cursor` | Cursor Agent | true | `agent` | `acp` (子命令) |
| `kiro` | Kiro | true | `kiro-cli` | `acp` (子命令) |
| `remote` | Remote Agent | true | (无 CLI) | WebSocket URL |
| `aionrs` | Aion CLI | true | `aionrs` | - |
| `custom` | Custom Agent | true | (用户配置) | - |

> **注意**：`gemini` 在 `ACP_BACKENDS_ALL` 中 `enabled: false`，实际未通过 ACP 路由（走独立的 GeminiAgentManager + Google API）。调研原始数据将 gemini 列为"非 ACP 协议"之一，需要修正：gemini 的后端条目是 ACP 配置，但运行时 AgentType 为 `'gemini'`，由独立管理器处理。

---

## 3. 协议分层分析

### 3.1 三类通信协议

**类型 A：标准 ACP（JSON-RPC over stdio）**

通过 `AcpConnection` 管理，调用 `session/new`、`session/load`、`session/prompt` 等方法。MCP 工具可通过 `session/new { mcpServers }` 注入。

后端：`claude`, `qwen`, `iflow`, `codex`, `codebuddy`, `goose`, `auggie`, `kimi`, `opencode`, `droid`, `copilot`, `qoder`, `vibe`, `cursor`, `kiro`, `custom`（共 15 种，含 custom）

**类型 B：WebSocket 协议**

使用 `OpenClawGatewayConnection`（`ws` 库）。协议帧格式：`{type:"req"|"res"|"event", id, method, params}`。不走 ACP JSON-RPC，无 `session/new` 方法，无法复用当前 MCP 注入路径。

后端：`openclaw-gateway`, `remote`（共 2 种）

**类型 C：独立私有协议**

- `nanobot`：每条消息 spawn 一个 CLI 进程（`nanobot agent -m "<msg>" --session <id>`），无持久连接，无 MCP 概念
- `aionrs`：JSON Lines 协议（换行符分隔的 JSON 事件流），自定义 event 类型（`ready`, `text_delta`, `tool_call` 等），不兼容 ACP
- `gemini`：独立 GeminiAgentManager + Google API，Worker Thread 模式，MCP 注入走 `start()` 参数（已实现但被策略禁用）

共 3 种（`nanobot`, `aionrs`, `gemini`）

### 3.2 协议分布

```
ACP（stdio JSON-RPC）  — 15 种  — 可复用 MCP 注入路径
WebSocket             — 2 种   — 需独立 MCP 注入机制
私有协议              — 3 种   — 短期不可接入
```

---

## 4. Team Mode 白名单根因分析

### 4.1 两处独立白名单

**白名单 1**（spawn 门控）：`src/process/team/TeamMcpServer.ts:366`

```typescript
const TEAM_ALLOWED = new Set(['claude', 'codex', 'gemini', 'codebuddy']);
```

作用：`spawn_agent` 工具调用时，若 `agent_type` 不在此集合中，直接抛错。这是 leader agent 触发 spawn 时的硬门控。

**白名单 2**（UI 过滤）：`src/process/team/TeammateManager.ts:169`

```typescript
const TEAM_ALLOWED_BACKENDS = new Set(['claude', 'codex', 'gemini', 'codebuddy']);
```

作用：构建 leader 的 wake payload 时，`availableAgentTypes` 只展示白名单内的已检测 agent。leader 的 prompt 里看不到其他 agent 类型，因此 leader 不会尝试 spawn 它们。

### 4.2 根因

两处白名单都是 **策略限制，不是技术限制**。原始注释明确写明：`// Team mode whitelist: only verified backends that support MCP tool injection`。

技术层面：
- `AcpConnection.loadSession()` 在当前分支已支持 `mcpServers` 参数（`fix/team-mcp-injection-stability` 修复了 session/load 硬编码 `mcpServers: []` 的问题）
- `session/new { mcpServers }` 对所有 ACP 后端是通用参数，其他 ACP CLI 是否实际接受此参数需逐一验证
- gemini 的 MCP 注入代码已在 `GeminiAgentManager.ts:350-360` 实现，被白名单策略屏蔽

### 4.3 白名单外的 4 种 ACP 后端（当前已验证支持 ACP 的主要后端）

当前白名单内 4 种的验证状态：
- `claude`：官方 ACP bridge，`session/new mcpServers` 完整支持，团队功能已验证
- `codex`：通过 `codex-acp` 桥接，`session/load` MCP 修复在当前分支进行中
- `codebuddy`：Tencent CodeBuddy，通过 `--acp` 启动，MCP 注入有待验证
- `gemini`：白名单内但走独立管理器，实际 MCP 注入走不同路径

---

## 5. ACP 支持矩阵

| Agent | 协议 | session/new mcpServers | Team 白名单 | 接入障碍 |
|---|---|---|---|---|
| claude | ACP stdio | 支持（已验证） | **在内** | 无 |
| codex | ACP stdio | 支持（修复中） | **在内** | session/load 路径修复进行中 |
| codebuddy | ACP stdio | 待验证 | **在内** | 无已知阻塞 |
| gemini | 独立管理器 | 已实现（策略禁用） | **在内** | 仅策略限制 |
| qwen | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| iflow | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| goose | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| auggie | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| kimi | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| opencode | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| droid | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| copilot | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| qoder | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| vibe | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| cursor | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| kiro | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| custom | ACP stdio | 待验证 | 不在 | 需验证 + 解除白名单 |
| openclaw-gateway | WebSocket | 不适用（协议不同） | 不在 | 需新 MCP 注入机制 |
| remote | WebSocket | 不适用（协议不同） | 不在 | 需新 MCP 注入机制 |
| nanobot | 私有（per-msg spawn） | 不适用 | 不在 | 协议根本不支持 |
| aionrs | 私有（JSON Lines） | 不适用 | 不在 | 需开发 JSON Lines MCP 注入 |

---

## 6. 扩展方案

### 6.1 短期（2 周内）：扩展 ACP 白名单至全部 ACP stdio 后端

**方案描述：**

在 `TeamMcpServer.ts` 和 `TeammateManager.ts` 将白名单替换为基于协议类型的动态判断：

```typescript
// 替代硬编码 Set，改为运行时检查
import { ACP_BACKENDS_ALL } from '@/common/types/acpTypes';

function isTeamCompatibleBackend(agentType: string): boolean {
  const config = ACP_BACKENDS_ALL[agentType as AcpBackend];
  // 当前阶段：只接受有 cliCommand 的 ACP stdio 后端（排除 webchat/websocket 类型）
  return !!(config?.enabled && config?.cliCommand && !isWebSocketBackend(agentType));
}
```

或更保守的做法：扩展白名单为 `ACP_ROUTED_PRESET_TYPES`，不写死字符串。

**前置条件：**
1. 当前分支 `fix/team-mcp-injection-stability` 合并完成（session/load mcpServers 修复）
2. 每个新增 backend 手动验证 `session/new { mcpServers }` 是否实际注入工具（CLI 侧不一定实现了此参数）

**风险：**
- **P1 风险**：部分 ACP 后端可能实现了 ACP 协议但忽略 `mcpServers` 参数，MCP 注入会静默失败（当前已有此问题的可观测性缺口）
- **P2 风险**：不同 ACP CLI 的工具调用格式可能不一致，团队工具响应解析可能有问题
- **缓解**：先只放开 `qwen`（已知 `--acp` 标准兼容度高），其余逐步验证

**改动量：** 小，2 处白名单修改 + 验证测试

### 6.2 中期（1 个月内）：ACP 后端 Team 兼容性自动检测

**方案描述：**

在 `AcpConnection.newSession()` 阶段，解析 `session/new` 的响应，检查 backend 是否确认了 MCP 工具列表（即 MCP 注入是否成功）。将检测结果写入 `AcpDetector` 的 backend 能力缓存，Team Mode 根据缓存决定是否允许该 backend 加入团队。

```
session/new { mcpServers: [team_tools] }
  → 响应中包含 tools 确认 → 标记 teamCompatible: true
  → 响应中无工具确认    → 标记 teamCompatible: false，降级或提示用户
```

**价值：** 彻底去掉静态白名单，Team Mode 可用性跟随 CLI 版本自动演进，不需要代码改动。

**风险：**
- `session/new` 响应格式因 backend 不同而异，能力检测逻辑复杂
- 需要为每个 backend 维护"什么样的响应算作 MCP 确认"的判断逻辑
- 首次连接延迟增加（需要完成 session/new 后才知道是否支持）

**依赖：** 短期方案先落地，中期在此基础上自动化

### 6.3 长期（季度级）：非 ACP 后端接入

#### WebSocket 后端（openclaw-gateway, remote）

`OpenClawGatewayConnection` 的握手和消息协议与 ACP JSON-RPC 完全不同（无 `session/new`，无 mcpServers 参数），需要为这两个后端实现独立的 MCP 注入路径：

- **可行路径**：在 `OpenClawGatewayManager` 中，握手完成后，通过 WebSocket 协议发送 MCP 工具定义（若 OpenClaw 协议本身支持）
- **替代路径**：为 OpenClaw/Remote 实现一个 stdio proxy，将 MCP 工具翻译成 OpenClaw 可理解的 tool 格式
- **复杂度**：高，需要与 OpenClaw Gateway 协议深度集成
- **建议**：视 OpenClaw 协议版本迭代决定是否推进，短期内不投入

#### Nanobot

Nanobot 是 per-message spawn 模式（无持久进程），每条消息独立启动 CLI，没有 session 概念。MCP 注入需要在每次 spawn 时通过 CLI 参数传入。

- **技术可行性**：低。即使 nanobot 支持 `--mcp-server` 之类的 CLI 参数，每次 spawn 都需要重新建立 TCP 连接，开销大且不稳定
- **建议**：不接入 Team Mode

#### Aionrs（JSON Lines）

Aionrs 的 `ready` 事件包含 `capabilities: { mcp: boolean }`，说明协议层面已预留 MCP 能力字段。但具体 MCP 工具注入协议未在现有 `protocol.ts` 中定义。

- **技术可行性**：中。需要与 aionrs 二进制协商 JSON Lines MCP 注入格式
- **建议**：与 aionrs 开发方确认协议支持后评估

---

## 7. 风险汇总

| 风险 | 级别 | 描述 | 缓解 |
|---|---|---|---|
| MCP 注入静默失败 | P1 | 非 claude/codex 的 ACP 后端可能接受 `session/new { mcpServers }` 但不实际注册工具，LLM 自动降级 XML，功能表面正常，根因不可见 | 短期：手动验证每个后端；中期：session/new 响应检测 |
| 白名单与实际能力脱节 | P2 | 当前 codebuddy 在白名单内，但 MCP 注入能力未经系统验证 | 补充 codebuddy MCP 注入测试 |
| session/load mcpServers 修复未完成 | P1 | Codex resume 仍丢工具，当前分支修复中，需完成合并 | 追踪 fix/team-mcp-injection-stability 合并进度 |
| 扩展白名单后 spawn 成功但工具不可用 | P2 | 用户体验层面的不一致，leader 看到可用 agent 但实际无法正常协作 | 中期自动能力检测；短期限制仅放开高确信度 backend |
| cursor CLI 名称冲突 | P3 | `cliCommand: 'agent'` 可能与系统其他工具冲突，检测误判 | Cursor backend 暂不纳入 Team Mode |

---

## 8. 结论与行动建议

**结论：**

Team Mode 的 4-agent 限制是策略决策，不是技术架构障碍。ACP stdio 协议的 15 种后端理论上都可以通过相同路径注入 MCP 工具；实际可用性取决于各 ACP CLI 实现是否正确处理 `session/new { mcpServers }` 参数——这需要逐一验证，不能假设。

**推荐行动顺序：**

1. **立即**：完成 `fix/team-mcp-injection-stability` 分支的 session/load mcpServers 修复并合并（P1 在飞）
2. **下个迭代**：为 `qwen`（已知高兼容性）增加 Team Mode 支持，验证全链路，作为扩展模板
3. **并行**：在 `TeamMcpServer.ts` 补充 MCP 注入失败的可观测性（mainWarn + Renderer 提示），这是扩展白名单的前提——不能让注入失败静默
4. **后续**：基于验证结果，逐步将其他 ACP stdio 后端加入白名单；WebSocket 和私有协议后端暂不纳入

**不建议做的：**

- 一次性把全部 ACP 后端放进白名单，在 MCP 注入失败可观测性补全前这是埋雷
- 为 nanobot 开发 Team Mode 支持（per-message spawn 架构根本不适合持续协作场景）

---

## 9. 附：调研数据修正记录

以下是与原始调研数据相比的修正点：

| 项目 | 原始数据 | 修正后 |
|---|---|---|
| AcpBackendAll 总数 | "20+" | **精确 21 种**（含 custom），不含 custom 为 20 种 |
| gemini 的分类 | 非 ACP 协议（Google API） | 在 ACP_BACKENDS_ALL 中有定义但 enabled=false；运行时走独立 GeminiAgentManager；两种描述都部分正确，需区分"配置层"和"运行层" |
| 第 2 层"被白名单挡住的 ACP 后端"数量 | "13 种" | 精确数量为 **13 种**（qwen, goose, auggie, kimi, opencode, droid, copilot, qoder, vibe, cursor, kiro, iflow, custom）— 原始数据正确 |
| session/load 硬编码问题 | AcpConnection.ts:944 | 当前分支已修复为支持 options.mcpServers 参数（`src/process/agent/acp/AcpConnection.ts:948`） |
