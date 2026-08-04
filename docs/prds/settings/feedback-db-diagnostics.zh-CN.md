# 用户反馈数据库诊断

状态：草稿
日期：2026-07-07

## 目标

Sentry 中的用户反馈已经包含 `type=user-feedback`、用户选择的模块、描述、日志和截图。真实反馈样本表明，这些信息通常不足以诊断会话、模型和团队问题：日志可能显示某个回合失败，却不一定包含最终持久化的会话状态、消息状态、选中的 Provider/模型、ACP 会话配置或团队积压情况。

诊断附件应当向反馈报告增加一份小型且隐私安全的数据库快照。不得上传 SQLite 数据库文件、任意 SQL 查询结果、提示词、消息内容、Provider API Key 或原始错误消息。

## 职责归属

GEAUi 只负责组织反馈流程：

- 捕获 `route_at_open` 和 `route_at_submit`
- 发送用户选择的模块
- 发送反馈入口明确提供的安全 ID，例如 `conversation_id`、`provider_id`、`team_id`、`agent_id` 或 `mcp_server_id`
- 调用 aionCore 的 `GET /api/system/diagnostics/feedback-report`
- 支持 gzip 时，将返回的 JSON 附加为 `db-diagnostics.json.gz`；否则附加为 `db-diagnostics.json`

所有诊断逻辑均由 aionCore 负责：

- 路由、模块和 Profile 解析
- 合并由路由、模块和显式提示推导出的 Profile
- SQL 选择
- 用户隔离
- 脱敏和字段白名单
- 响应 Schema

GEAUi 主进程不得读取 SQLite，也不得暴露 `feedback:collect-db-diagnostics`。

## Profile 解析

路由上下文比用户选择的模块更可信，因为用户可能选错模块。用户选择的模块仍然是有价值的意图信息。aionCore 必须使用以下各项的并集：

- 提交反馈时的路由
- 打开反馈时的路由
- 用户选择的模块
- 显式 Profile 提示
- `global-summary`

示例：如果用户在 `#/conversations/conv-1` 打开反馈并选择 `system-settings`，附件至少应包含 `conversation-session`、`model-auth`、`mcp-tools` 和 `global-summary`。

## 当前 aionCore Profile

### `conversation-session`

详细查询键：`conversation_id`

适用于 Sentry 中出现的以下情况：

- 日志显示 `UserLlmProviderAuthFailed` 的 Provider 身份验证失败
- OpenCode 模式/模型确认超时
- 回合完成但输出为空或被隐藏
- 需要结合消息元数据和附件数量分析的图片/文件输入问题

允许输出：

- 当前会话的 ID、标题、类型、状态、来源、模型 Provider ID、模型 ID、时间戳和名称长度
- 与报告会话时间相近、处于同一用户范围内的近期会话；当前窗口为 24 小时，最多 20 行，包括标题、ID、状态、模型/Provider ID、消息数量和最新错误代码
- 按类型、状态和隐藏状态统计的消息数量
- 最近消息的元数据：ID、消息 ID、类型、状态、位置、内容字节长度、文本长度、附件/图片/工具调用数量
- 最近错误的元数据：错误代码、归属方、是否可重试、解决方式类型/目标、是否建议反馈
- ACP 会话元数据：Agent ID/来源/状态、是否存在会话 ID、运行时当前模式/模型，以及模式、模型、effort 等非敏感配置选项
- Agent 元数据统计：可用模式、模型、命令和配置选项数量，最近检查状态/错误代码
- Assistant 快照元数据和数组数量

绝不输出原始 `messages.content`、提示词、原始 `session_config`、`rules_content`、Provider API Key 或原始错误消息。

### `model-auth`

详细查询键：`provider_id`，也可以从 `conversation_id` 推导。

允许输出：

- Provider ID、平台、名称、启用状态
- `api_key_configured` 布尔值
- 仅 Base URL 的 Host
- 模型数量、禁用模型数量、不健康模型数量
- 能力数量和时间戳

绝不输出 `api_key_encrypted`、完整 URL、URL 查询字符串、Bearer Token 或 Bedrock 配置。

### `agent-team`

详细查询键：`team_id`，也可以从 `conversation_id` 推导。

允许输出：

- 团队 ID、名称长度、工作区模式、会话模式、Agent 数量、Leader Agent ID、Agent 版本和时间戳
- 按状态统计的任务数量
- 按类型和已读状态统计的邮箱消息数量

绝不输出工作区绝对路径、任务主题/描述、邮箱内容或邮箱摘要。

### `mcp-tools`

详细查询键：`mcp_server_id`

允许输出：

- Server ID、名称、启用状态、是否内置、传输类型
- 工具数量
- 最近测试状态和最近连接时间戳
- 传输配置字节长度和原始 JSON 字节长度

绝不输出原始传输配置、原始 JSON、Header、环境变量值或 Token。

### `global-summary`

始终作为低成本上下文包含在内。

允许输出：

- 当前用户的会话数量
- 当前用户会话中的消息数量
- Provider 数量
- Agent 数量
- 活跃 MCP Server 数量

## 隐私要求

响应应保留诊断价值，同时排除真正存在隐私或凭据风险的少数数据类别：

- 不包含原始数据库文件
- 不允许前端执行任意 SQL
- 不包含 `providers.api_key_encrypted`
- 不包含 `users.password_hash`、`users.jwt_secret` 或 `users.email`
- 不包含 OAuth 或远程 Agent Token
- 不包含原始提示词或消息内容
- 不包含原始错误消息
- 不包含带有用户信息或查询字符串的完整 URL

允许包含会话标题，因为需要通过它将数据库快照与截图和 Sentry 反馈关联起来。不会仅因标题中出现通用的 `sk-...`、`token` 或 `bearer` 字符形态而单独脱敏。

aionCore 响应包含一个 `privacy` 块：

```json
{
  "raw_content_included": false,
  "api_keys_included": false
}
```

测试必须断言：具有代表性的 Provider API Key、加密 Provider Key、原始提示词文本和原始错误消息不会出现在序列化后的诊断响应中。
