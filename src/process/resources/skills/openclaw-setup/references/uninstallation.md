# OpenClaw 卸载指南

## 概述

本指南提供完全卸载 OpenClaw 的步骤，包括：

- 停止所有运行中的服务
- 卸载 npm 全局包
- 删除配置文件和目录
- 移除系统服务（launchd/systemd）
- 清理环境变量

## 卸载前准备

### 1. 停止所有 OpenClaw 进程

**停止 Gateway 服务：**

```bash
# 检查 Gateway 状态
openclaw gateway status

# 停止 Gateway
openclaw gateway stop
```

**检查并停止所有相关进程：**

```bash
# macOS/Linux
ps aux | grep openclaw | grep -v grep

# 如果发现进程，手动停止
killall openclaw  # macOS/Linux
```

### 2. 检查系统服务状态

**macOS (launchd):**

```bash
# 检查服务状态
launchctl list | grep openclaw

# 如果服务正在运行，先卸载服务
launchctl unload ~/Library/LaunchAgents/com.openclaw.gateway.plist 2>/dev/null
```

**Linux (systemd):**

```bash
# 检查服务状态
systemctl --user status openclaw-gateway

# 停止并禁用服务
systemctl --user stop openclaw-gateway
systemctl --user disable openclaw-gateway
```

## 完整卸载步骤

### 步骤 1：卸载 npm 全局包

```bash
# 使用 npm 卸载
npm uninstall -g openclaw

# 如果使用 pnpm 安装的
pnpm remove -g openclaw

# 如果使用 bun 安装的
bun remove -g openclaw
```

**验证卸载：**

```bash
openclaw --version
# 应该显示 "command not found" 或类似错误
```

### 步骤 2：删除配置文件和数据目录

**删除主配置目录：**

```bash
rm -rf ~/.openclaw
```

**检查并删除其他可能的位置：**

```bash
# 检查是否有其他配置目录
ls -la ~ | grep -i openclaw
ls -la ~ | grep -i clawd

# 如果存在，删除它们
rm -rf ~/clawd  # 如果存在旧版本的工作区
```

### 步骤 3：移除系统服务配置

**macOS (launchd):**

```bash
# 删除 LaunchAgent 配置文件
rm -f ~/Library/LaunchAgents/com.openclaw.gateway.plist

# 清理 launchctl 环境变量（如果设置过）
launchctl unsetenv OPENCLAW_GATEWAY_TOKEN 2>/dev/null
launchctl unsetenv OPENCLAW_GATEWAY_PASSWORD 2>/dev/null
```

**Linux (systemd):**

```bash
# 删除 systemd 服务文件
rm -f ~/.config/systemd/user/openclaw-gateway.service

# 重新加载 systemd
systemctl --user daemon-reload
```

### 步骤 4：清理日志文件

**macOS:**

```bash
rm -f ~/Library/Logs/openclaw-gateway.log
```

**Linux:**

```bash
# systemd 日志会自动清理，无需手动删除
```

### 步骤 5：清理环境变量（可选）

检查 shell 配置文件（`.zshrc`, `.bash_profile`, `.bashrc`）中是否有 OpenClaw 相关的环境变量：

```bash
# 检查环境变量
grep -i openclaw ~/.zshrc ~/.bash_profile ~/.bashrc 2>/dev/null

# 如果找到，手动编辑文件删除相关行
```

常见环境变量：

- `OPENCLAW_CONFIG_PATH`
- `OPENCLAW_STATE_DIR`
- `OPENCLAW_PROFILE`

### 步骤 6：清理端口占用（如果仍有进程）

```bash
# 检查端口 18789 是否被占用
lsof -i :18789  # macOS
ss -ltnp | grep 18789  # Linux

# 如果发现进程，停止它
kill -9 <PID>
```

## 验证卸载完成

执行以下检查，确认 OpenClaw 已完全卸载：

```bash
# 1. 检查命令是否还存在
which openclaw
# 应该返回空或 "not found"

# 2. 检查配置目录是否已删除
ls -la ~/.openclaw
# 应该返回 "No such file or directory"

# 3. 检查系统服务是否已移除
# macOS
launchctl list | grep openclaw
# 应该返回空

# Linux
systemctl --user list-unit-files | grep openclaw
# 应该返回空

# 4. 检查进程是否还在运行
ps aux | grep openclaw | grep -v grep
# 应该返回空
```

## 卸载脚本（可选）

可以创建一个卸载脚本来自动执行上述步骤：

**macOS/Linux:**

```bash
#!/bin/bash
echo "正在卸载 OpenClaw..."

# 停止服务
openclaw gateway stop 2>/dev/null
killall openclaw 2>/dev/null

# 卸载 npm 包
npm uninstall -g openclaw 2>/dev/null

# 删除配置目录
rm -rf ~/.openclaw
rm -rf ~/clawd

# macOS: 删除 LaunchAgent
if [ -f ~/Library/LaunchAgents/com.openclaw.gateway.plist ]; then
    launchctl unload ~/Library/LaunchAgents/com.openclaw.gateway.plist 2>/dev/null
    rm -f ~/Library/LaunchAgents/com.openclaw.gateway.plist
fi

# Linux: 删除 systemd 服务
if [ -f ~/.config/systemd/user/openclaw-gateway.service ]; then
    systemctl --user stop openclaw-gateway 2>/dev/null
    systemctl --user disable openclaw-gateway 2>/dev/null
    rm -f ~/.config/systemd/user/openclaw-gateway.service
    systemctl --user daemon-reload
fi

# 清理日志
rm -f ~/Library/Logs/openclaw-gateway.log

echo "OpenClaw 卸载完成！"
```

## 注意事项

1. **备份重要数据**：卸载前，如果需要保留配置或工作区数据，请先备份：

   ```bash
   cp -r ~/.openclaw ~/.openclaw.backup
   ```

2. **多实例安装**：如果使用环境变量配置了多个实例，需要分别清理每个实例的配置目录。

3. **环境变量**：如果手动设置了环境变量，需要从 shell 配置文件中删除。

4. **残留进程**：如果卸载后仍有进程在运行，可能需要重启终端或系统。

## 故障排查

### 问题：卸载后命令仍然可用

**可能原因：**

- npm 包未完全卸载
- 有多个安装位置

**解决方法：**

```bash
# 检查所有可能的安装位置
which -a openclaw

# 手动删除找到的路径
# 然后重新卸载 npm 包
npm uninstall -g openclaw
```

### 问题：服务仍在运行

**解决方法：**

```bash
# 强制停止所有相关进程
pkill -9 openclaw

# 检查并清理系统服务
# macOS
launchctl list | grep openclaw
launchctl remove com.openclaw.gateway 2>/dev/null

# Linux
systemctl --user stop openclaw-gateway
systemctl --user disable openclaw-gateway
```

### 问题：配置文件无法删除

**可能原因：**

- 文件权限问题
- 文件被锁定

**解决方法：**

```bash
# 检查文件权限
ls -la ~/.openclaw

# 修改权限后删除
chmod -R 755 ~/.openclaw
rm -rf ~/.openclaw
```

## 参考资源

- [OpenClaw GitHub 仓库](https://github.com/openclaw/openclaw)
- [OpenClaw 官方文档](https://docs.openclaw.ai)
