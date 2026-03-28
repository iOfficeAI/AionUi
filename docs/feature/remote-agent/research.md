# Remote Agent 生态调研报告

> 调研日期：2026-03-24
> 目的：为 AionUi 支持远程 Agent 连接提供协议选型和认证方案参考

## 1. 调研范围

调研对象为当前主流的开源可自建、可远程部署的 AI Agent 项目，重点关注 **Gateway 层面的网络协议**和**认证机制**，不涉及 LLM Provider 配置。

## 2. 项目概览

### 2.1 "Claw" 家族

| 项目      | Stars | 语言       | 仓库                                                                | 定位                                                  |
| --------- | ----: | ---------- | ------------------------------------------------------------------- | ----------------------------------------------------- |
| OpenClaw  |  332k | TypeScript | [openclaw/openclaw](https://github.com/openclaw/openclaw)           | 个人 AI 助手，多渠道消息接入，Gateway 控制面板        |
| ZeroClaw  | 28.5k | Rust       | [zeroclaw-labs/zeroclaw](https://github.com/zeroclaw-labs/zeroclaw) | OpenClaw 的 Rust 重写，极低资源占用，附带硬件外设支持 |
| PicoClaw  | 25.9k | Go         | [sipeed/picoclaw](https://github.com/sipeed/picoclaw)               | 超轻量级，面向 $10 嵌入式硬件，Go 原生实现            |
| NanoClaw  | 25.1k | TypeScript | [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw)           | OpenClaw 的轻量替代，容器隔离，Claude Agent SDK       |
| MicroClaw |   592 | Rust       | [microclaw/microclaw](https://github.com/microclaw/microclaw)       | NanoClaw 启发，Rust 实现，MCP 协议                    |

### 2.2 其他主流远程 Agent 项目

| 项目      | Stars | 语言       | 仓库                                                                    | 定位                            |
| --------- | ----: | ---------- | ----------------------------------------------------------------------- | ------------------------------- |
| Nanobot   |  1.2k | Go         | [nanobot-ai/nanobot](https://github.com/nanobot-ai/nanobot)             | MCP Host，YAML 配置 Agent       |
| OpenHands |   69k | Python     | [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands)           | 全功能 AI 编程助手，K8s 部署    |
| Coder     |  10k+ | Go         | [coder/coder](https://github.com/coder/coder)                           | 远程开发工作区，WireGuard 隧道  |
| Daytona   |  14k+ | TypeScript | [daytonaio/daytona](https://github.com/daytonaio/daytona)               | 远程开发环境 + AI Agent 沙箱    |
| Tabby     |  28k+ | Rust       | [TabbyML/tabby](https://github.com/TabbyML/tabby)                       | 自建 AI 编程助手                |
| E2B       |  11k+ | TS/Go      | [e2b-dev/E2B](https://github.com/e2b-dev/E2B)                           | AI Agent 沙箱基础设施           |
| Plandex   |  12k+ | Go         | [plandex-ai/plandex](https://github.com/plandex-ai/plandex)             | 自建客户端-服务器架构编程 Agent |
| Bolt.diy  |  15k+ | TypeScript | [stackblitz-labs/bolt.diy](https://github.com/stackblitz-labs/bolt.diy) | 浏览器内 AI 全栈开发            |

### 2.3 不可自建 / 仅本地项目（作为参考）

| 项目                    | 备注                                             |
| ----------------------- | ------------------------------------------------ |
| Claude Code             | HTTPS 出站轮询，Anthropic 中继，不可自建 Gateway |
| Cursor Background Agent | 私有云 VM，WorkOS OAuth2，不可自建               |
| Windsurf                | 无远程 Agent 模式                                |
| Amp (Sourcegraph)       | 私有云 CLI，不开源                               |
| Aider                   | 纯本地 CLI，无服务端                             |

## 3. Gateway 协议对比

### 3.1 核心对比表

| 项目          | Gateway 协议                        | 监听地址                     | 流式传输           | 消息格式                    | 远程暴露方式                                    |
| ------------- | ----------------------------------- | ---------------------------- | ------------------ | --------------------------- | ----------------------------------------------- |
| **OpenClaw**  | WebSocket                           | `ws://127.0.0.1:18789`       | WS 原生流          | 自定义 JSON (req/res/event) | Tailscale Serve/Funnel, SSH 隧道                |
| **ZeroClaw**  | HTTP + WS + SSE                     | `127.0.0.1:42617`            | SSE / WS           | 自定义 JSON                 | Cloudflare Tunnel / Tailscale / ngrok / OpenVPN |
| **PicoClaw**  | HTTP (WebUI) + 渠道原生             | `:18800` (WebUI)             | 渠道依赖           | JSON                        | Docker `-public` flag                           |
| **NanoClaw**  | 无独立 Gateway                      | —                            | 平台依赖           | —                           | 纯消息渠道 (WhatsApp/Telegram/etc.)             |
| **MicroClaw** | MCP (stdio/streamable_http)         | 渠道依赖                     | MCP 流             | JSON-RPC                    | Docker                                          |
| **Nanobot**   | HTTP + SSE                          | `0.0.0.0:8080`               | SSE `?stream=true` | JSON-RPC                    | Dockerfile / Railway                            |
| **OpenHands** | HTTP REST + WebSocket (Socket.IO)   | `:3000`                      | WS 原生流          | REST + Socket.IO 事件       | Docker / K8s VPC                                |
| **Coder**     | HTTP + WS + WireGuard + DERP + dRPC | `:3000` (控制面板)           | WS / dRPC          | REST + dRPC (protobuf)      | WireGuard 隧道 + DERP 中继                      |
| **Daytona**   | HTTP REST + SSH Gateway             | `:3000` (API), `:2222` (SSH) | HTTP 轮询          | REST (OpenAPI)              | REST API + SSH Gateway                          |
| **Tabby**     | HTTP REST (OpenAPI)                 | `:8080`                      | SSE                | REST (OpenAPI)              | 单容器部署                                      |
| **E2B**       | HTTP REST + Connect RPC             | 云端                         | Connect RPC 流     | REST + Protobuf             | Terraform (AWS/GCP)                             |
| **Plandex**   | HTTP REST                           | 自定义                       | HTTP 流            | REST                        | Docker                                          |
| **Bolt.diy**  | HTTP                                | `:5173`                      | HTTP 流            | HTTP                        | Docker / Netlify / Vercel                       |

### 3.2 协议模式归类

**模式 A — WebSocket 控制面板**

代表：OpenClaw, ZeroClaw, OpenHands

- 双向实时通信，天然支持流式输出和服务器主动推送
- 适合需要持续交互的 Agent 会话（思考块、工具调用、权限请求）
- 需要维护连接状态、心跳、重连逻辑

**模式 B — HTTP REST + SSE**

代表：Nanobot, Tabby, Plandex, Daytona

- 无状态请求 + 服务器单向推送
- 实现简单、HTTP 基础设施兼容性好（代理、CDN、负载均衡）
- SSE 仅支持服务器到客户端方向，客户端发送需额外 HTTP 请求

**模式 C — HTTP + WebSocket 混合**

代表：OpenHands, Coder, ZeroClaw

- REST 用于管理 API（创建/查询/删除会话）
- WebSocket 用于实时会话通信
- 兼顾管理和实时性，但复杂度较高

**模式 D — 加密隧道**

代表：Coder (WireGuard + DERP)

- 企业级安全，穿越 NAT
- 复杂度高，适合大规模多用户场景
- 非 AionUi 目标场景

**模式 E — MCP 协议**

代表：Nanobot, MicroClaw, Goose

- JSON-RPC over stdio 或 HTTP
- 标准化工具调用协议，可组合
- 仅关注工具调用，不含完整会话管理

**模式 F — 出站轮询**

代表：Claude Code Remote

- Agent 主动出站拉取任务，无需入站端口
- 最安全（零攻击面），但依赖中继服务
- 不适合自建场景

## 4. 认证机制对比

### 4.1 核心对比表

| 项目          | Gateway 级认证                          | Token 传递方式         | 会话维持               | 附加安全                                        |
| ------------- | --------------------------------------- | ---------------------- | ---------------------- | ----------------------------------------------- |
| **OpenClaw**  | DM Pairing 配对码 / Password            | WS 握手 Header         | Session Key (WS)       | Tailscale 身份头                                |
| **ZeroClaw**  | DM Pairing / Password                   | WS/HTTP Header         | Session (WS)           | Autonomy Levels, 命令白名单, 速率限制, 路径禁止 |
| **PicoClaw**  | 各渠道 Bot Token                        | 渠道依赖               | 渠道依赖               | —                                               |
| **NanoClaw**  | 各平台 Bot Token                        | 平台 API               | —                      | OS 级容器隔离                                   |
| **Nanobot**   | `Mcp-Session-Id` Header                 | HTTP Header            | Session ID             | 无内建用户认证                                  |
| **OpenHands** | Keycloak OAuth2/OIDC                    | JWT Cookie             | JWT (access + refresh) | Keycloak RBAC                                   |
| **Coder**     | OAuth2 (GitHub/OIDC) / API Key          | HTTP Header / Cookie   | Session Token          | WireGuard mTLS                                  |
| **Daytona**   | Bearer Token + OIDC                     | `Authorization` Header | Token                  | SSH 用户名传 Token                              |
| **Tabby**     | JWT + Password (Argon2) + OAuth2 + LDAP | `Authorization` Header | JWT (access + refresh) | RBAC                                            |
| **E2B**       | API Key                                 | `Authorization` Header | —                      | —                                               |
| **Plandex**   | Server Auth + API Key                   | HTTP Header            | —                      | —                                               |

### 4.2 认证模式归类

| 模式                             | 代表                             | 适用场景               | 复杂度 |
| -------------------------------- | -------------------------------- | ---------------------- | :----: |
| **Bearer Token (静态 API Key)**  | Daytona, E2B, Plandex, Nanobot   | 个人自建、机器对机器   |   低   |
| **JWT (自签发/自验证)**          | Tabby, OpenHands, AionUi WebUI   | 需要过期/刷新的场景    |   中   |
| **OAuth2 / OIDC**                | OpenHands, Coder, Daytona, Tabby | 多用户、企业 SSO       |   高   |
| **DM Pairing (配对码)**          | OpenClaw, ZeroClaw               | 个人助手设备绑定       |   中   |
| **WS 握手 + Challenge-Response** | OpenClaw (设备认证)              | 安全性要求高的设备配对 |  中高  |

## 5. 对 AionUi 的关键结论

### 5.1 协议选型

**推荐：WebSocket 优先（模式 A），HTTP SSE 作为未来扩展（模式 B）**

理由：

1. **现有基础**：AionUi 已有完整的 OpenClaw Gateway WS 连接实现（`OpenClawGatewayConnection.ts`），包含重连、心跳、Session Key
2. **ACP 兼容**：现有 ACP JSON-RPC 消息格式天然适配 WS 双向通信
3. **行业主流**：OpenClaw (332k)、ZeroClaw (28.5k)、OpenHands (69k) 均以 WS 为主
4. **功能需求**：思考块、工具调用、权限请求等需要双向实时推送，WS 是最佳选择

### 5.2 认证选型

**推荐：Bearer Token 为第一期，预留 OAuth2 扩展口**

理由：

1. Bearer Token 覆盖绝大多数自建场景（Daytona、E2B、Tabby 均如此）
2. 实现简单，WS 握手时通过 HTTP Header 或首条消息传入
3. AionUi 已有 JWT 认证基础（WebUI），可在第二期复用

### 5.3 远程 OpenClaw 优先

OpenClaw 的 Gateway WS 协议已被 AionUi 实现过一次（本地模式），远程模式的核心差异仅在于：

- 连接地址从本地变为远程 URL
- 需要通过公网认证（Token / Tailscale）
- 需要处理更不稳定的网络环境（超时、重连）

### 5.4 可扩展性

不同 Agent 的 Gateway 协议差异主要在消息格式，传输层趋同（WS/HTTP）。建议：

- 传输层抽象为 `IRemoteTransport` 接口（WS / SSE 实现）
- 消息适配层将不同 Agent 协议转换为 AionUi 内部 ACP 格式
- 认证层抽象为 `IAuthProvider` 接口（Bearer / OAuth2 / Custom）

## 6. 参考链接

- [OpenClaw 文档](https://docs.openclaw.ai)
- [ZeroClaw 架构](https://github.com/zeroclaw-labs/zeroclaw/blob/master/docs/architecture.md)
- [NanoClaw 规格](https://github.com/qwibitai/nanoclaw/blob/main/docs/SPEC.md)
- [PicoClaw 文档](https://docs.picoclaw.io)
- [Nanobot](https://github.com/nanobot-ai/nanobot)
- [OpenHands](https://github.com/OpenHands/OpenHands)
- [Coder 架构](https://github.com/coder/coder)
- [Daytona](https://github.com/daytonaio/daytona)
- [Tabby](https://github.com/TabbyML/tabby)
- [E2B](https://github.com/e2b-dev/E2B)
