# Remote Agent 功能需求文档

## 1. 背景

当前 AionUi 的 Agent 体系全部基于**本地 CLI 进程**：通过 `ForkTask` 派生子进程，使用 ACP JSON-RPC 协议（stdin/stdout）通信。唯一的"远程"形态是 OpenClaw Gateway（WebSocket），但它也依赖本地 CLI 启动或本地网关配置。

现在需要支持用户添加**纯远程 Agent**——通过 URL 连接到远端 ACP 兼容服务，无需本地安装任何 CLI。

## 2. 现有架构关键点

| 层次         | 文件                                                           | 职责                                                              |
| ------------ | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| 类型定义     | `src/process/task/agentTypes.ts`                               | `AgentType` 联合类型（gemini/acp/codex/openclaw-gateway/nanobot） |
| 管理接口     | `src/process/task/IAgentManager.ts`                            | `sendMessage`, `stop`, `confirm`, `kill`                          |
| 基类         | `src/process/task/BaseAgentManager.ts`                         | 继承 `ForkTask`，管理确认流程和 yolo 模式                         |
| 工厂         | `src/process/task/IAgentFactory.ts`                            | 按 `AgentType` 注册/创建 `IAgentManager`                          |
| 会话存储     | `src/common/config/storage.ts`                                 | `TChatConversation` 联合类型，每种 Agent 有不同的 `extra` 字段    |
| 助手配置存储 | `ConfigStorage['assistants']`                                  | `AcpBackendConfig[]`，当前仅支持本地 CLI 自定义                   |
| 数据库       | `src/process/services/database/schema.ts`                      | `conversations` 表，`type` 字段限定为 5 种                        |
| UI 设置      | `src/renderer/pages/settings/AgentSettings/CustomAcpAgent.tsx` | 自定义 Agent 增删改查                                             |

## 3. 需求定义

### 3.1 用户故事

> 作为用户，我希望能够添加一个远程 Agent 配置（包括连接 URL、可选的认证 Token、自定义名称和头像），然后像使用本地 Agent 一样与其对话。

### 3.2 Remote Agent 配置字段

| 字段               | 类型     | 必填     | 说明                                                   |
| ------------------ | -------- | -------- | ------------------------------------------------------ |
| `id`               | `string` | 自动生成 | UUID，唯一标识                                         |
| `name`             | `string` | 是       | 用户自定义名称，显示在 Agent 列表中                    |
| `avatar`           | `string` | 否       | emoji 或图片路径，默认提供一个                         |
| `protocol`         | `string` | 是       | 协议类型：`'openclaw'`（第一期仅支持 openclaw）        |
| `url`              | `string` | 是       | 远程 Agent 服务地址（支持 `http(s)://` 和 `ws(s)://`） |
| `authType`         | `string` | 是       | 认证类型：`'bearer'` / `'password'` / `'none'`         |
| `authToken`        | `string` | 否       | Bearer Token 或密码                                    |
| `description`      | `string` | 否       | 用户备注描述                                           |
| `deviceId`         | `string` | 自动生成 | Ed25519 公钥指纹，每个远程 Agent 独立                  |
| `devicePublicKey`  | `string` | 自动生成 | Ed25519 公钥 PEM                                       |
| `devicePrivateKey` | `string` | 自动生成 | Ed25519 私钥 PEM                                       |
| `deviceToken`      | `string` | 自动存储 | Gateway 签发的设备令牌，握手成功后自动写回             |
| `status`           | `string` | 自动     | `'unknown'` / `'connected'` / `'pending'` / `'error'`  |

### 3.3 通信协议

第一期仅支持 **OpenClaw Gateway Protocol**（WebSocket），后续可扩展其他协议。

- **传输层**：WebSocket（`ws(s)://`）
- **消息格式**：OpenClaw Gateway Protocol v3（`connect.challenge` → `connect` → `hello-ok`，然后 `chat.send` / `sessions.*` 等 RPC 方法）
- **认证方式**：
  - `auth.token`：Bearer Token（从 `remote_agents.auth_token` 读取）
  - `device`：Ed25519 设备身份签名（每个远程 Agent 独立生成密钥对，存 DB）
  - Gateway 签发的 `deviceToken` 在 `hello-ok` 后自动写回 DB，后续连接优先使用

### 3.4 OpenClaw 配对流程

远程 OpenClaw Gateway 对新设备有**配对审批**机制。第一次连接时 Gateway 可能拒绝设备，要求管理员在 Gateway 端批准。

用户体验流程：

1. 用户在设置页填写 URL + Token，点击保存
2. 系统尝试完整 OpenClaw 握手（challenge → sign → connect）
3. 三种结果：
   - **hello-ok**：设备被接受，保存配置（含 deviceToken），关闭弹窗
   - **待审批**：Gateway 返回配对错误（`recommendedNextStep: 'wait_then_retry'` 或消息含 `pairing required`），弹窗切换为"等待审批"状态，每 5 秒重试握手，最长轮询 5 分钟（与 Gateway 审批过期窗口对齐），超时后提示过期
   - **其他错误**（token 错误、网络不通等）：显示错误提示，留在弹窗

用户取消等待审批时，配置仍保存（status 标记为 `pending`），后续可重新触发配对。

```
用户点击「保存」
        │
        ▼
  保存配置到数据库
  (生成 Ed25519 keypair)
        │
        ▼
  调用 handshake({ id })
        │
        ▼
  OpenClawGatewayConnection
  connect.challenge → 签名 → connect
        │
        ├─────────────────────────────┐
        ▼                             ▼
   hello-ok                     error: pairing required
   (已配对/自动批准)            (新设备待审批)
        │                             │
        ▼                             ▼
  保存 deviceToken              status = 'pending'
  status = 'connected'          Modal 显示「等待审批」
  关闭弹窗 ✓                    倒计时 5 分钟
                                      │
                                每 5 秒重试 handshake
                                      │
                          ┌───────────┼───────────┐
                          ▼           ▼           ▼
                     hello-ok      仍然         超时
                     (已批准)      pending      5 分钟
                          │           │           │
                          ▼           ▼           ▼
                    status =      继续轮询    Modal 显示
                    'connected'               「已过期」
                    关闭弹窗 ✓                用户可重试
```

### 3.5 设备身份隔离

每个远程 Agent 配置拥有**独立的 Ed25519 密钥对**，不共享本地 `~/.openclaw/identity/` 下的设备身份。理由：

- 避免与本地 OpenClaw Gateway 安装冲突
- 多个远程 Agent 连接不同 Gateway 时需要独立身份
- 设备身份存数据库，跟随远程 Agent 配置生命周期管理

> **注意**：设备身份（Ed25519 密钥对 + device token）是 OpenClaw Gateway Protocol 特有的认证机制。其他协议（zeroclaw、picoclaw 等）有各自的认证方式，`device_*` 字段对它们不适用（保持 NULL）。

### 3.6 功能范围

| 功能           | 说明                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| 添加远程 Agent | 在设置页面填写 URL/Token/名称/头像，保存时执行完整 OpenClaw 握手（含配对审批等待） |
| 编辑远程 Agent | 修改已保存的配置                                                                   |
| 删除远程 Agent | 删除配置及关联数据                                                                 |
| 连接测试       | 添加/编辑时可测试 WebSocket 连通性（轻量级，不走完整握手）                         |
| 配对握手       | 保存时执行完整 OpenClaw 握手，处理三种结果：成功 / 待审批（轮询）/ 错误            |
| 发起会话       | 在 Guid 页面选择远程 Agent 后创建会话                                              |
| 消息收发       | 支持文本、思考块、工具调用、权限请求等完整 OpenClaw Gateway 会话流                 |
| 会话恢复       | 支持通过 sessionKey 恢复断线会话                                                   |
| 状态显示       | 显示连接状态（连接中/已连接/待审批/断开/错误）                                     |

### 3.7 不在范围内（Out of Scope）

- 远程 Agent 的服务端实现
- 文件系统操作代理（`fs/read_text_file`、`fs/write_text_file` 等需本地权限的操作需明确策略，本期可先拒绝或提示用户）
- 多用户/团队共享远程 Agent

## 4. 技术设计方向（初步）

### 4.1 类型扩展

```typescript
// agentTypes.ts
export type AgentType = 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote';
```

### 4.2 会话 extra 字段

```typescript
// storage.ts - TChatConversation 新增一个分支
IChatConversation<
  'remote',
  {
    workspace?: string;
    url: string;
    authToken?: string;
    agentName: string;
    agentAvatar?: string;
    remoteAgentId: string; // 关联 ConfigStorage 中的配置 ID
    sessionId?: string; // 远程 session ID，用于恢复
    enabledSkills?: string[];
    presetAssistantId?: string;
    pinned?: boolean;
    pinnedAt?: number;
  }
>;
```

### 4.3 存储

```typescript
// ConfigStorage 新增
'remote.agents'?: RemoteAgentConfig[];
```

### 4.4 新增 Manager

`RemoteAgentManager` —— **不继承 `ForkTask`**（无需派生子进程），直接实现 `IAgentManager`，内部维护 WebSocket/HTTP 连接。

### 4.5 数据库

`conversations` 表的 `type` CHECK 约束需要新增 `'remote'`。

### 4.6 UI 变更

- **Settings > Agent Settings**：新增 "Remote Agents" 区域，支持 CRUD
- **Guid 页面**：Agent 选择列表中展示已配置的远程 Agent
- **会话面板**：显示连接状态指示器

## 5. 已确认问题

> 以下问题已在调研和设计阶段确认，详见 [调研报告](./research.md) 和 [实现方案](./design.md)。

1. **文件操作策略**：远程 Agent 请求 `fs/read_text_file` / `fs/write_text_file` 时，**逐次确认**。复用现有 `addConfirmation` / `confirm` 机制（`BaseAgentManager` 已有），远程 Agent 的工具调用权限请求走与本地相同的审批流程。Phase 3 可加白名单机制。
2. **协议版本**：**第一期不需要协商**。OpenClaw Gateway 的 `HelloOk` 响应已包含 `protocol` 版本信息（当前 v3），`RemoteAgentCore` 可从中读取但无需协商。Phase 2 引入 `IProtocolAdapter` 时再考虑版本协商。
3. **重连策略**：**复用现有策略**。`OpenClawGatewayConnection` 已内置指数退避重连（最多 10 次，间隔递增），`RemoteAgentCore` 直接使用该传输层，无需额外实现。
4. **超时配置**：**第一期全局默认值**（连接 30s，请求 60s），不开放用户配置。Phase 3 可开放为 `remote_agents` 表的可选字段。
5. **多协议支持**：**第一期仅 OpenClaw Gateway Protocol（WebSocket）**。Phase 2 引入 `IProtocolAdapter` 时可扩展 ZeroClaw 等其他协议。
6. **设备身份存储**：**存数据库，不共享本地 `~/.openclaw/identity/`**。每个远程 Agent 创建时自动生成独立 Ed25519 密钥对并存入 `remote_agents` 表，避免与本地 OpenClaw 安装冲突。Gateway 签发的 `deviceToken` 也写回同一条 DB 记录。
7. **配对审批**：**保存时触发完整握手**。若 Gateway 返回"待审批"错误码，UI 进入等待状态并每 5s 轮询重试，**最长 5 分钟**（与 Gateway 审批过期窗口对齐）。超时后提示过期，用户可取消等待（配置仍保存，status 标记为 `pending`）。
