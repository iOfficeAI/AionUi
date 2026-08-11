# AionUi WebUI 配置指南

## 概述

AionUi 支持 WebUI 模式，允许通过浏览器访问应用。这对于远程使用 OpenClaw 非常有用。AionUi 提供三种远程连接方式，满足不同场景的需求。

**重要**：WebUI 配置应通过 AionUi 设置界面完成，无需使用命令行。本指南将引导你如何在设置界面中完成配置。

## 三种远程连接方式

| 连接方式                    | 使用场景                     | 描述                                            | 难度        |
| --------------------------- | ---------------------------- | ----------------------------------------------- | ----------- |
| **1. 局域网连接**           | 同一 WiFi/LAN 的设备访问     | 手机和电脑在同一 WiFi，启用"允许远程访问"       | ⭐ 简单     |
| **2. 远程软件 (Tailscale)** | 跨网络访问（如办公室到家庭） | 使用 VPN 软件如 Tailscale，无需公网 IP 或服务器 | ⭐ 非常简单 |
| **3. 服务器部署**           | 多用户访问、24/7 运行        | 部署在云服务器，通过公网 IP 直接访问            | ⭐⭐ 中等   |

### 如何选择？

- **同一 WiFi 使用** → 选择 **局域网连接**
- **办公室访问家庭，或手机使用流量** → 选择 **远程软件 (Tailscale)**
- **需要多用户访问或 24/7 运行** → 选择 **服务器部署**

---

## 默认配置

- **默认端口**：25808
- **本地访问地址**：`http://localhost:25808`
- **远程访问地址**：`http://<LAN_IP>:25808`（需要启用"允许远程访问"）
- **默认用户名**：`admin`
- **初始密码**：首次启动时自动生成，在设置界面中显示

---

## 快速开始：通过设置界面配置 WebUI

### 打开 WebUI 设置界面

**方式 1：通过设置按钮（推荐）**

1. 在 AionUi 主界面，点击左下角的**设置图标**（齿轮图标）
2. 在设置菜单中，点击 **"WebUI"** 选项
3. 进入 WebUI 配置界面

**方式 2：通过快捷键**

- 在 AionUi 主界面，使用快捷键打开设置（具体快捷键请查看 AionUi 帮助文档）

**方式 3：通过路由（WebUI 模式）**

- 如果已在 WebUI 模式下，访问：`http://<服务器地址>:25808/#/settings/webui`

### 配置步骤

#### Step 1: 启用 WebUI

1. 在 WebUI 设置界面中，找到 **"启用 WebUI"** 开关
2. 将开关切换到**开启**状态
3. 等待几秒钟，WebUI 服务启动后，会显示 **"✓ 运行中"** 状态

#### Step 2: 启用远程访问（如果需要）

1. 在 **"允许远程访问"** 选项中，将开关切换到**开启**状态
2. 如果 WebUI 正在运行，系统会自动重启以应用新设置

#### Step 3: 获取访问信息

WebUI 启动后，设置界面会显示：

1. **访问地址**：
   - **本地访问**：`http://localhost:25808`（仅本机访问）
   - **网络访问**：`http://<局域网IP>:25808`（如果启用了远程访问）

2. **登录信息**：
   - **用户名**：`admin`（可点击复制）
   - **密码**：首次启动时会显示初始密码（可点击复制）
   - 如果密码已隐藏，点击密码旁边的**重置图标**可以重置密码并显示新密码

3. **二维码登录**（如果启用了远程访问）：
   - 使用手机扫描二维码，即可在手机浏览器中自动登录
   - 二维码有效期 5 分钟，过期后点击"刷新二维码"获取新的二维码

---

## 方式 1：局域网连接（LAN Connection）

### 适用场景

- 手机和电脑在同一 WiFi
- 同一局域网内的设备访问
- 临时远程访问

### 配置步骤

#### Step 1: 打开 WebUI 设置界面

1. 在 AionUi 主界面，点击左下角的**设置图标**
2. 点击 **"WebUI"** 选项

#### Step 2: 启用 WebUI 和远程访问

1. 将 **"启用 WebUI"** 开关切换到**开启**状态
2. 将 **"允许远程访问"** 开关切换到**开启**状态
3. 等待服务启动完成

#### Step 3: 复制访问地址

1. 在设置界面中，找到 **"访问地址"** 部分
2. 复制**网络访问地址**（格式：`http://<局域网IP>:25808`）
3. 如果看不到网络访问地址，说明"允许远程访问"未启用，请返回 Step 2

#### Step 4: 在远程设备上访问

1. 确保远程设备与 AionUi 电脑在同一 WiFi 网络
2. 在远程设备的浏览器中，粘贴并访问复制的地址
3. 使用设置界面中显示的**用户名**和**密码**登录

---

## 方式 2：远程软件 (Tailscale) - 跨网络访问

### 适用场景

- 从办公室访问家庭的 AionUi
- 从手机（使用流量）访问家庭的 AionUi
- 需要跨网络访问，但不想配置公网 IP

### 优势

- ⭐ 非常简单：安装软件，登录即可
- 🔒 安全：使用 VPN 加密连接
- 🚀 快速：无需配置防火墙或端口转发
- 📱 移动友好：支持手机、平板等设备

### 配置步骤

#### Step 1: 在 AionUi 电脑上配置 WebUI

1. **打开 WebUI 设置界面**：
   - 在 AionUi 主界面，点击左下角的**设置图标**
   - 点击 **"WebUI"** 选项

2. **启用 WebUI**：
   - 将 **"启用 WebUI"** 开关切换到**开启**状态
   - **注意**：使用 Tailscale 时，**不需要**启用"允许远程访问"（Tailscale 会处理网络）

3. **记录访问信息**：
   - 记录显示的**本地访问地址**（`http://localhost:25808`）
   - 记录**用户名**和**密码**

#### Step 2: 在 AionUi 电脑上安装并登录 Tailscale

1. 访问 [Tailscale 官网](https://tailscale.com/) 下载并安装
2. 登录 Tailscale 账户（首次使用需要注册）
3. 确保 Tailscale 显示"Connected"状态

#### Step 3: 获取 Tailscale IP

1. 在 AionUi 电脑上，打开 Tailscale 应用
2. 查看显示的 Tailscale IP 地址（例如：`100.x.x.x`）
3. 组合访问 URL：`http://<Tailscale_IP>:25808`

#### Step 4: 在远程设备上安装并登录 Tailscale

1. 在手机或其他远程设备上安装 Tailscale
2. 使用相同的 Tailscale 账户登录
3. 确保显示"Connected"状态

#### Step 5: 在远程设备浏览器中访问

1. 打开浏览器
2. 访问 `http://<Tailscale_IP>:25808`（使用 Step 3 中的地址）
3. 使用设置界面中显示的**用户名**和**密码**登录

### 常见命令

```bash
# 查看 Tailscale 状态
tailscale status

# 查看 Tailscale IP
tailscale ip

# 查看所有设备
tailscale status --json
```

---

## 方式 3：服务器部署（Server Deployment）

### 适用场景

- 需要多用户访问
- 需要 24/7 运行
- 部署在云服务器上
- 通过公网 IP 或域名访问

### 前置要求

- 云服务器（Linux/macOS）
- 公网 IP 或域名
- 防火墙配置权限

---

### Linux 服务器部署（推荐）

#### Step 1: 在服务器上安装 AionUi

按照 AionUi 安装指南在服务器上安装 AionUi 应用。

#### Step 2: 通过设置界面配置 WebUI

1. **打开 WebUI 设置界面**：
   - 如果服务器有图形界面，直接打开 AionUi 应用
   - 如果服务器无图形界面，需要通过 SSH 端口转发或 VNC 访问图形界面

2. **配置 WebUI**：
   - 点击左下角的**设置图标**
   - 点击 **"WebUI"** 选项
   - 将 **"启用 WebUI"** 开关切换到**开启**状态
   - 将 **"允许远程访问"** 开关切换到**开启**状态

3. **记录访问信息**：
   - 记录显示的**网络访问地址**（`http://<服务器IP>:25808`）
   - 记录**用户名**和**密码**

#### Step 3: 配置防火墙

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 25808/tcp
sudo ufw reload

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=25808/tcp
sudo firewall-cmd --reload

# 或使用 iptables
sudo iptables -A INPUT -p tcp --dport 25808 -j ACCEPT
```

#### Step 4: 配置开机自启（可选）

如果需要 AionUi 开机自启，可以配置 systemd 服务。但建议通过 AionUi 设置界面管理 WebUI，而不是通过命令行。

#### Step 5: 获取访问地址

1. 获取服务器公网 IP：

   ```bash
   curl ifconfig.me
   # 或
   curl ipinfo.io/ip
   ```

2. 访问地址：`http://<公网IP>:25808`

3. 如果配置了域名，可以使用：`http://<域名>:25808`

---

### macOS 服务器部署

#### Step 1: 在服务器上安装 AionUi

按照 AionUi 安装指南在 macOS 服务器上安装 AionUi 应用。

#### Step 2: 通过设置界面配置 WebUI

1. 打开 AionUi 应用
2. 点击左下角的**设置图标**
3. 点击 **"WebUI"** 选项
4. 将 **"启用 WebUI"** 和 **"允许远程访问"** 开关切换到**开启**状态

#### Step 3: 配置防火墙

```bash
# 允许端口 25808
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /Applications/AionUi.app/Contents/MacOS/AionUi
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /Applications/AionUi.app/Contents/MacOS/AionUi
```

---

## 设置界面功能说明

### WebUI 服务配置

- **启用 WebUI**：启动/停止 WebUI 服务
- **允许远程访问**：启用后，允许局域网内的其他设备访问
- **访问地址**：显示本地和网络访问地址（可点击复制）

### 登录信息

- **用户名**：默认 `admin`（可点击复制）
- **密码**：
  - 首次启动时显示初始密码（可点击复制）
  - 如果密码已隐藏，点击**重置图标**可以重置密码并显示新密码
  - 点击**修改密码**可以设置自定义密码

### 二维码登录

- 仅在启用远程访问时显示
- 使用手机扫描二维码，即可在手机浏览器中自动登录
- 二维码有效期 5 分钟，过期后点击"刷新二维码"

### Channels 配置

- 配置 Telegram、Lark 等聊天平台的 Bot Token
- 实现通过 IM 应用访问 AionUi

---

## 故障排查

### WebUI 无法启动

1. **检查端口是否被占用**：
   - 在设置界面中，如果启动失败，通常会显示错误信息
   - 如果端口被占用，可以修改配置文件中的端口（见下方"自定义端口"）

2. **检查防火墙设置**：
   - Linux: `sudo ufw status` 或 `sudo firewall-cmd --list-all`
   - macOS: 系统偏好设置 > 安全性与隐私 > 防火墙
   - Windows: 控制面板 > Windows Defender 防火墙

### 无法远程访问

1. **确认已启用"允许远程访问"**：
   - 在 WebUI 设置界面中，检查"允许远程访问"开关是否已开启

2. **检查防火墙设置**（见上方）

3. **确认设备在同一局域网**（局域网连接方式）

4. **检查 IP 地址是否正确**：
   - 在设置界面中查看显示的"网络访问地址"

5. **检查云服务器安全组规则**（服务器部署方式）

### 忘记密码

1. **在设置界面中重置**：
   - 在 WebUI 设置界面中，找到"登录信息"部分
   - 点击密码旁边的**重置图标**
   - 新密码会显示在界面上，可以点击复制

### Tailscale 相关问题

**Q: Tailscale 显示未连接？**

- 检查网络连接
- 确认 Tailscale 账户已登录
- 重启 Tailscale 服务

**Q: 无法通过 Tailscale IP 访问？**

- 确认两端设备都已登录 Tailscale
- 检查 Tailscale 状态：`tailscale status`
- 确认 AionUi WebUI 已在设置界面中启用

---

## 自定义端口

如果需要使用非默认端口（25808），可以通过配置文件设置：

### 配置文件位置

| 平台    | 配置文件位置                                             |
| ------- | -------------------------------------------------------- |
| Windows | `%APPDATA%/AionUi/webui.config.json`                     |
| macOS   | `~/Library/Application Support/AionUi/webui.config.json` |
| Linux   | `~/.config/AionUi/webui.config.json`                     |

### 配置示例

```json
{
  "port": 8080,
  "allowRemote": true
}
```

**注意**：修改配置文件后，需要在设置界面中重启 WebUI 服务才能生效。

---

## 安全建议

### 基本安全

1. **修改初始密码**：首次启动后，在设置界面中立即修改密码
2. **使用强密码**：密码至少 8 位，包含字母、数字和特殊字符
3. **定期更新密码**：建议定期更换密码

### 远程访问安全

1. **仅在受信任的网络中使用远程访问**
2. **使用 Tailscale**：跨网络访问时，Tailscale 提供加密连接，更安全
3. **配置防火墙**：仅允许必要的 IP 地址访问
4. **使用 HTTPS**：生产环境建议配置 HTTPS（需要反向代理如 Nginx）

### 服务器部署安全

1. **配置防火墙规则**：仅开放必要端口
2. **使用强密码**：避免使用默认或弱密码
3. **定期更新**：保持 AionUi 和系统更新
4. **监控日志**：定期检查访问日志
5. **考虑使用反向代理**：使用 Nginx 等反向代理，配置 SSL/TLS

### Tailscale 的优势

- 🔒 **加密连接**：所有流量都经过加密
- 🛡️ **零信任网络**：只有授权设备可以访问
- 🚀 **无需配置**：无需配置防火墙或端口转发
- 📱 **跨平台**：支持 Windows、macOS、Linux、iOS、Android

---

## 与 OpenClaw 集成

启动 WebUI 后，可以通过浏览器访问 AionUi，然后：

1. **在首页找到 OpenClaw 入口**（ACP 代理列表）
2. **直接与 OpenClaw 对话**
3. **享受完整的 AionUi 界面功能**：
   - 文件预览和管理
   - 多对话管理
   - 完整的工具和技能支持

---

## 相关资源

- [AionUi Wiki - Remote Internet Access Guide](https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide)
- [AionUi Wiki - WebUI Configuration Guide](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide)
- [Tailscale 官方文档](https://tailscale.com/kb/)

---

## 快速参考

### 设置界面操作

1. **打开设置**：点击 AionUi 左下角的**设置图标** → 点击 **"WebUI"**
2. **启用 WebUI**：将"启用 WebUI"开关切换到**开启**状态
3. **启用远程访问**：将"允许远程访问"开关切换到**开启**状态（如果需要）
4. **复制访问地址**：点击访问地址旁边的**复制图标**
5. **复制密码**：点击密码旁边的**复制图标**（如果可见）
6. **重置密码**：点击密码旁边的**重置图标**

### 常用检查命令（仅用于故障排查）

```bash
# 检查端口
lsof -i :25808

# 检查进程
ps aux | grep AionUi

# 获取 IP 地址
ifconfig | grep "inet " | grep -v 127.0.0.1

# 测试连接
curl http://localhost:25808
```
