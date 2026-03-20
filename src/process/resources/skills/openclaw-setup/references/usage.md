# OpenClaw 使用指南

## 创建和管理 Agent

### 列出所有 Agent

```bash
openclaw agents list
```

### 添加新 Agent

```bash
openclaw agents add <agent-name> --workspace ~/.openclaw/workspace-<name>
```

### 设置 Agent 身份

```bash
openclaw agents set-identity --agent main --name "My Assistant" --emoji "🦞"
```

### 从文件加载身份

```bash
openclaw agents set-identity --workspace ~/.openclaw/workspace --from-identity
```

## 与 Agent 对话

### 基本对话

```bash
openclaw agent --message "帮我总结今天的任务"
```

### 指定 Agent

```bash
openclaw agent --agent <agent-id> --message "执行某个任务"
```

### 指定思考模式

```bash
openclaw agent --message "复杂任务" --thinking high
```

### 发送到渠道并回复

```bash
openclaw agent --to +1234567890 --message "状态更新" --deliver
```

## 发送消息

### 发送到电话号码

```bash
openclaw message send --to +1234567890 --message "Hello from OpenClaw"
```

### 发送到渠道

```bash
openclaw message send --channel telegram --to @username --message "Hello"
```

## 渠道管理

### 登录渠道

```bash
openclaw channels login
```

### 查看渠道状态

```bash
openclaw channels status
```

### 深度检查（探测连接）

```bash
openclaw channels status --probe
```

## 工作区管理

### 创建工作区

```bash
openclaw setup --workspace ~/.openclaw/workspace
```

### 工作区文件结构

默认工作区位置：`~/.openclaw/workspace`

重要文件：

- `AGENTS.md` - Agent 指令和技能列表
- `SOUL.md` - Agent 身份和边界
- `USER.md` - 用户信息
- `TOOLS.md` - 工具配置
- `memory/` - 记忆系统（每日日志）

### 初始化工作区模板

```bash
cp docs/reference/templates/AGENTS.md ~/.openclaw/workspace/AGENTS.md
cp docs/reference/templates/SOUL.md ~/.openclaw/workspace/SOUL.md
cp docs/reference/templates/TOOLS.md ~/.openclaw/workspace/TOOLS.md
```

## 自动化任务

### Cron 任务

```bash
openclaw cron add "0 9 * * *" --message "每日晨报"
```

### Webhooks

配置 webhook 接收外部触发：

```bash
openclaw webhooks add <name> --url <webhook-url>
```

### Gmail Pub/Sub

配置 Gmail 触发器（需要额外设置）：
参考文档：https://docs.openclaw.ai/automation/gmail-pubsub

## 更新和升级

### 更新 OpenClaw

```bash
npm install -g openclaw@latest
```

或使用 pnpm：

```bash
pnpm add -g openclaw@latest
```

### 更新后运行 Doctor

```bash
openclaw doctor
```

这会：

- 检查配置迁移需求
- 修复过时的配置
- 检查服务状态

### 开发渠道切换

```bash
openclaw update --channel stable|beta|dev
```
