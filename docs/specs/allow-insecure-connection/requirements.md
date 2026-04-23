# 允许不安全连接 — 需求

## 背景

`rejectUnauthorized: false` 被硬编码在两处 WebSocket 连接中，导致所有远程 Agent 连接都跳过 TLS 证书校验：

- `src/process/agent/openclaw/OpenClawGatewayConnection.ts:108` — 主连接
- `src/process/bridge/remoteAgentBridge.ts:84` — 测试连接

这存在中间人攻击（MITM）风险。需要将其改为用户可配置的选项。

## 需求

1. 用户可以在每个远程 Agent 上单独配置是否跳过 TLS 证书校验。
2. 默认安全：新建 Agent 默认开启证书校验。
3. 仅在 `wss://` 连接时提供该选项（`ws://` 无 TLS，无需此选项）。
4. 测试连接（Test Connection）同样遵守该配置。

## 默认行为变更

升级后已有 Agent 默认安全（开启证书校验）。之前连接自签证书服务的 Agent 会断连，需用户手动开启开关。
