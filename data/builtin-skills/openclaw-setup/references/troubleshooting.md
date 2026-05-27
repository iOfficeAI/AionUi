# OpenClaw 故障排除指南

## 使用 Doctor 命令（主要诊断工具）

`openclaw doctor` 是 OpenClaw 的健康检查和修复工具。

### 基本诊断

```bash
openclaw doctor
```

这会检查：

- 配置文件健康状态
- Gateway 服务状态
- 认证配置
- 渠道连接状态
- Skills 状态
- 配置迁移需求

### 自动修复

```bash
openclaw doctor --repair
```

自动应用推荐的修复（包括重启服务）。

### 深度扫描

```bash
openclaw doctor --deep
```

扫描系统服务，查找额外的 Gateway 安装。

### 非交互模式

```bash
openclaw doctor --non-interactive
```

仅应用安全迁移，跳过需要人工确认的操作。

## 常见问题诊断

### 问题 1：Gateway 无法启动

**检查步骤：**

1. 检查配置文件是否存在：

   ```bash
   cat ~/.openclaw/openclaw.json
   ```

2. 检查 `gateway.mode` 是否设置：

   ```bash
   openclaw config get gateway.mode
   ```

   如果未设置，运行：

   ```bash
   openclaw config set gateway.mode local
   ```

3. 检查端口是否被占用：

   ```bash
   # macOS
   lsof -i :18789

   # Linux
   ss -ltnp | grep 18789
   ```

4. 查看 Gateway 日志：

   ```bash
   # macOS (如果使用 launchd)
   tail -f ~/Library/Logs/openclaw-gateway.log

   # Linux (如果使用 systemd)
   journalctl --user -u openclaw-gateway -f
   ```

### 问题 2：认证失败

**检查步骤：**

1. 运行 doctor 检查认证健康：

   ```bash
   openclaw doctor
   ```

2. 检查 API 密钥环境变量：

   ```bash
   echo $ANTHROPIC_API_KEY
   echo $OPENAI_API_KEY
   ```

3. 检查配置文件中的认证设置：

   ```bash
   openclaw config get agents.defaults.model
   ```

4. 重新配置认证：
   ```bash
   openclaw configure --section models
   ```

### 问题 3：渠道连接失败

**检查步骤：**

1. 检查渠道状态：

   ```bash
   openclaw channels status
   ```

2. 检查渠道配置：

   ```bash
   openclaw config get channels
   ```

3. 重新登录渠道：
   ```bash
   openclaw channels login
   ```

### 问题 4：配置文件权限问题

如果配置文件权限过宽，doctor 会警告并修复：

```bash
openclaw doctor --repair
```

或手动修复：

```bash
chmod 600 ~/.openclaw/openclaw.json
```

### 问题 5：服务未运行

**macOS (launchd):**

```bash
# 检查服务状态
launchctl list | grep openclaw

# 启动服务
launchctl load ~/Library/LaunchAgents/com.openclaw.gateway.plist

# 或使用 OpenClaw 命令
openclaw gateway install
```

**Linux (systemd):**

```bash
# 检查服务状态
systemctl --user status openclaw-gateway

# 启动服务
systemctl --user start openclaw-gateway

# 启用自动启动
systemctl --user enable openclaw-gateway
```

## 故障排除流程

当用户遇到问题时，按以下流程处理：

1. **确认安装状态**

   ```bash
   openclaw --version
   ```

2. **运行 Doctor 诊断**

   ```bash
   openclaw doctor
   ```

3. **检查 Gateway 状态**

   ```bash
   openclaw gateway status
   ```

4. **查看日志**
   - macOS: `./scripts/clawlog.sh` 或系统日志
   - Linux: `journalctl --user -u openclaw-gateway`

5. **检查配置文件**

   ```bash
   cat ~/.openclaw/openclaw.json
   ```

6. **如果问题持续，建议用户：**
   - 查看最新 GitHub README
   - 访问 docs.openclaw.ai
   - 在 Discord 社区寻求帮助

## macOS：launchctl 环境变量覆盖

如果之前运行过 `launchctl setenv OPENCLAW_GATEWAY_TOKEN ...`（或 `...PASSWORD`），该值会覆盖配置文件，并可能导致持续的"未授权"错误。

```bash
launchctl getenv OPENCLAW_GATEWAY_TOKEN
launchctl getenv OPENCLAW_GATEWAY_PASSWORD

launchctl unsetenv OPENCLAW_GATEWAY_TOKEN
launchctl unsetenv OPENCLAW_GATEWAY_PASSWORD
```
