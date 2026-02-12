# OpenClaw 部署指南

## 运行新手引导向导（推荐）

这是**最推荐**的方式，会引导你完成所有配置：

```bash
openclaw onboard --install-daemon
```

向导会引导你配置：

- **Gateway 模式**：本地（local）或远程（remote）
- **模型认证**：Anthropic API 密钥（推荐）、OpenAI OAuth、或其他提供商
- **工作区位置**：默认 `~/.openclaw/workspace`
- **Gateway 设置**：端口（默认 18789）、绑定地址、认证令牌
- **渠道配置**：WhatsApp、Telegram、Discord、Slack 等
- **服务安装**：后台服务（launchd/systemd）

## 手动启动 Gateway（测试）

如果只想先测试，不安装服务：

```bash
openclaw gateway --port 18789 --verbose
```

## 检查 Gateway 状态

```bash
openclaw gateway status
```

## 检查服务是否运行

```bash
# macOS
launchctl list | grep openclaw

# Linux (systemd)
systemctl --user status openclaw-gateway

# 或检查端口
ss -ltnp | grep 18789  # Linux
lsof -i :18789        # macOS
```

## 服务管理

### macOS (launchd)

```bash
# 检查服务状态
launchctl list | grep openclaw

# 启动服务
launchctl load ~/Library/LaunchAgents/com.openclaw.gateway.plist

# 或使用 OpenClaw 命令
openclaw gateway install
```

### Linux (systemd)

```bash
# 检查服务状态
systemctl --user status openclaw-gateway

# 启动服务
systemctl --user start openclaw-gateway

# 启用自动启动
systemctl --user enable openclaw-gateway
```

## 查看日志

**Gateway 日志位置：**

- macOS: `~/Library/Logs/openclaw-gateway.log` 或系统日志
- Linux: `journalctl --user -u openclaw-gateway`

**使用脚本查看 macOS 日志：**

```bash
./scripts/clawlog.sh
```

## 远程 Gateway 部署

1. 在远程服务器上安装并运行 Gateway
2. 本地配置 `gateway.mode=remote`
3. 配置 `gateway.remote.url` 和认证
4. 使用 SSH 隧道或 Tailscale 连接

参考文档：https://docs.openclaw.ai/gateway/remote
