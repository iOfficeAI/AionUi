# Usage Stats 设置页重整说明

## 背景

PR #2946 最初创建时，统计数据解析、后端 API、WebHost 远程脱敏和前端设置页都还在同一个仓库语境里。当前项目已经拆成 AionUi 前端仓库和 AionCore 后端仓库，AionCore 侧已经提供 `GET /api/analytics/agent-usage`，并通过 `x-aionui-webui-remote` 判断 WebUI 远程访问场景。

## 本次 AionUi 范围

- 在设置页新增 `Usage` 入口和 `/settings/usage` 路由。
- 新增 `UsageStats` 页面，用于展示 token 趋势、组成、工具/项目/模型排行和 session 列表。
- 在 `ipcBridge.analytics.getAgentUsage` 中对齐 AionCore 的 snake_case 查询参数和响应结构。
- 在 WebHost 反向代理中剥离客户端伪造的 `x-aionui-webui-remote`，仅在 remote mode 下由服务端注入。
- 补齐 `usageStats` i18n 模块，包括当前配置里的 `pt-BR`。

## 不再携带的旧内容

旧 PR 中的大段实现计划、后端迁移建议和 aionrs 提案不再作为本次 AionUi diff 的主体。后端实现已经进入 AionCore，新的前端 PR 应保持可 review 的前端切片。

## 验证

```bash
bun run test
bun --cwd packages/web-host test
just check
```
