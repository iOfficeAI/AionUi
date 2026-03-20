# OpenClaw 配置管理

## 配置文件位置

### 主要配置文件

- **配置文件**: `~/.openclaw/openclaw.json`
- **工作区**: `~/.openclaw/workspace`（默认）
- **凭证**: `~/.openclaw/credentials/`
- **会话**: `~/.openclaw/agents/<agentId>/sessions/`
- **状态**: `~/.openclaw/`（整个目录）

### 环境变量

- `OPENCLAW_CONFIG_PATH` - 配置文件路径
- `OPENCLAW_STATE_DIR` - 状态目录路径
- `OPENCLAW_PROFILE` - 配置 profile 名称
- `ANTHROPIC_API_KEY` - Anthropic API 密钥
- `OPENAI_API_KEY` - OpenAI API 密钥

## 配置管理命令

### 查看配置

```bash
openclaw config get <key>
```

例如：

```bash
openclaw config get gateway.mode
openclaw config get agents.defaults.model
```

### 设置配置

```bash
openclaw config set <key> <value>
```

例如：

```bash
openclaw config set gateway.mode local
openclaw config set gateway.port 18789
```

### 交互式配置

```bash
openclaw configure
```

或配置特定部分：

```bash
openclaw configure --section models
openclaw configure --section gateway
openclaw configure --section channels
```

## 常用配置项

### Gateway 配置

```json5
{
  gateway: {
    mode: 'local', // 或 "remote"
    port: 18789,
    bind: '127.0.0.1', // 或 "0.0.0.0"
    auth: {
      token: 'your-token-here',
    },
  },
}
```

### Agent 配置

```json5
{
  agents: {
    defaults: {
      workspace: '~/.openclaw/workspace',
      model: 'anthropic/claude-opus-4-5',
      // 其他默认设置
    },
    list: [
      {
        id: 'main',
        identity: {
          name: 'OpenClaw',
          emoji: '🦞',
          avatar: 'avatars/openclaw.png',
        },
      },
    ],
  },
}
```

### 渠道配置示例

```json5
{
  channels: {
    telegram: {
      botToken: 'your-token',
      allowFrom: ['+1234567890'],
      dm: {
        policy: 'pairing', // 或 "open"
      },
    },
    whatsapp: {
      allowFrom: ['+1234567890'],
    },
  },
}
```

## 多实例配置

使用不同的配置文件和状态目录运行多个实例：

```bash
OPENCLAW_CONFIG_PATH=~/.openclaw/a.json \
OPENCLAW_STATE_DIR=~/.openclaw-a \
openclaw gateway --port 19001
```

## 配置文件权限

配置文件应该设置为仅所有者可读写：

```bash
chmod 600 ~/.openclaw/openclaw.json
```

`openclaw doctor` 会自动检查并修复权限问题。
