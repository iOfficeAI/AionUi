# AionUi WebUI 配置指南

本指南介绍如何启动、配置和保护 AionUi 的 WebUI —— 可以作为桌面应用的附属模式
运行,也可以在没有桌面环境的服务器 / 容器上独立运行。

> GitHub wiki 页
> [`WebUI-Configuration-Guide`](https://github.com/iOfficeAI/AionUi/wiki/WebUI-Configuration-Guide)
> 的草案替换。发布前先保留在仓库内。

## 我在哪种模式下?

WebUI 有两种完全不同的形态,**默认不共享数据**:

| 模式                         | 启动方式                                                                           | 数据目录                                                                                      | 使用场景                                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **桌面内置 WebUI**           | 已安装的 `AionUi` 应用(`AionUi --webui`、桌面窗口里的设置开关,或设置页 WebUI 开关) | 与桌面应用相同的 `userData`,通过 `$HOME` 下的 CLI 安全软链访问(`~/.aionui` / `~/.aionui-dev`) | 你希望一个 AionUi 实例既能从桌面窗口打开,又能通过浏览器(同网段手机、另一块屏幕等)访问。三条桌面路径——纯 IPC、桌面开启 WebUI、`--webui` 无头——共享同一个 SQLite 数据库、计划任务、会话和管理员密码。 |
| **独立 WebUI(`aionui-web`)** | 仓库里 `bun run webui`,或未来发布的 `aionui-web` CLI tarball                       | 默认 `~/.aionui-web[-dev[-2]]`,**绝不**指向桌面应用的 userData                                | 无头 Linux/macOS/Windows(服务器、容器、Termux)。无需安装 Electron 桌面应用。                                                                                                                        |

想让两种模式共享数据,用 `--data-dir` 显式指向桌面的目录 —— 详见
[两种模式间共享数据](#两种模式间共享数据)。

---

## 使用场景(点击跳转)

根据你的使用场景选择:

- **[跨网络访问](#跨网络访问)**(推荐):启动 → 浏览器打开 → Tailscale 连接
- **[局域网访问](#局域网访问)**:启动 → `--remote` → 手机访问 IP
- **[仅本地使用](#仅本地快速入门)**:启动 → 打开 `http://localhost:25808`
- **[服务器部署](#服务器部署)**:后台服务启动 → LAN/WAN 访问
- **[独立模式(无 Electron)](#独立-webui无-electron)**:`bun run webui` / `aionui-web start`

---

## 快速命令参考

桌面内置 WebUI(已安装的 AionUi 应用):

| 平台                 | 本地访问                                                 | **局域网访问(`--remote`)**                                        |
| :------------------- | :------------------------------------------------------- | :---------------------------------------------------------------- |
| **Windows**          | `AionUi.exe --webui`                                     | `AionUi.exe --webui --remote`                                     |
| **macOS**            | `/Applications/AionUi.app/Contents/MacOS/AionUi --webui` | `/Applications/AionUi.app/Contents/MacOS/AionUi --webui --remote` |
| **Linux(桌面用户)**  | `AionUi --webui`                                         | `AionUi --webui --remote`                                         |
| **Linux(root 用户)** | `sudo AionUi --webui --no-sandbox`                       | `sudo AionUi --webui --remote --no-sandbox`                       |
| **Android(Termux)**  | `AionUi --no-sandbox --webui`                            | `AionUi --no-sandbox --webui --remote`                            |

独立 WebUI:

```bash
bun run webui                       # dev,默认端口
bun run webui --remote              # dev,允许局域网
bun run webui --port 8080           # 自定义端口
bun run webui --data-dir /path      # 自定义工作目录

aionui-web resetpass                # 重置管理员密码(tarball)
bun run resetpass                   # 重置管理员密码(仓库 dev)
AionUi --resetpass                  # 重置管理员密码(桌面内置)
```

> **`--no-sandbox` 仅在 Electron 进程以 root 身份运行或在 Proot/Termux 容器内
> (Android)运行时才需要加**。不加的话 Chromium 拒绝启动,进程立即退出。桌面
> 普通用户和非 sudo 的 Linux 用户**不要**加这个参数。

---

## 桌面内置 WebUI

### 仅本地快速入门

最简单的路径——桌面应用只在 `localhost` 上启动 WebUI。

1. **打开 AionUi**(通过 DMG / 安装程序 / AppImage 安装)。
2. **打开设置页**,点击 **WebUI**。
3. 打开 **启用 WebUI**。
4. 点击显示的 URL(例如 `http://localhost:25808`),或在本机任意浏览器打开。

首次启动时应用会显示一个随机生成的管理员密码——**请立即复制**,登录时会用到。
复制过一次后,UI 会把密码遮掩掉。

### 局域网访问

1. 在 WebUI 设置页,同时打开 **允许局域网访问**。
2. 面板现在会显示两个 URL:
   - `本地:http://localhost:25808`
   - `网络:http://192.168.x.x:25808`
3. 在同一个 Wi-Fi 下的其他设备(手机、平板、另一台笔记本)上打开 `网络:` URL。

命令行等价于上面命令表里的 `--remote` 选项。

> **只在你信任的网络里开启局域网访问**。登录页使用了 bcrypt 哈希和速率限制,
> 但任何 LAN 上的设备都能访问到。

### 跨网络访问

如果要从完全不同的网络访问(家 → 办公室、移动数据等),推荐使用 **Tailscale**:

1. 在主机和客户端设备上都安装 [Tailscale](https://tailscale.com)。
2. 用同一个账号登录两边。
3. 在 WebUI 设置页打开 **允许局域网访问**。
4. 在客户端打开 `http://100.x.y.z:25808`,其中 `100.x.y.z` 是主机的 Tailscale IP。

完整步骤(HTTPS、Cloudflare Tunnel、反向代理)见 wiki 的
[远程互联网访问教程](https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide-Chinese)。

### 通过命令行启动 WebUI

有时设置开关不方便(无头服务器、脚本启动等)。`--webui` 参数以无头 WebUI 模式
启动 AionUi——不开窗口,只启动 HTTP 服务。

**Windows:**

```cmd
AionUi.exe --webui
AionUi.exe --webui --remote

:: 当 `AionUi.exe` 不在 PATH 上时使用完整路径
"C:\Program Files\AionUi\AionUi.exe" --webui
```

**macOS:**

```bash
/Applications/AionUi.app/Contents/MacOS/AionUi --webui
/Applications/AionUi.app/Contents/MacOS/AionUi --webui --remote
```

**Linux(普通用户):**

```bash
AionUi --webui
AionUi --webui --remote
```

**Linux(root 用户):**

```bash
sudo AionUi --webui --no-sandbox
sudo AionUi --webui --remote --no-sandbox
```

> root 下需要 `--no-sandbox`,因为 Chromium 拒绝以 root 启动自带的沙箱。Android
> 上的 Termux/Proot Ubuntu 也同样需要(见下文)。

Linux 上的备选路径:

- 完整安装路径:`/usr/bin/AionUi --webui`
- AppImage 直接运行:`./AionUi-*.AppImage --webui`

### Android(Termux)

Android 上通过 Proot Ubuntu 容器运行 Electron 二进制。**只支持 WebUI 模式** ——
桌面窗口需要 X server,Android 没有。

> 社区原创教程作者
> [@Manamama](https://github.com/Manamama):
> [Running AionUi WebUI on Android](https://gist.github.com/Manamama/b4f903c279b5e73bdad4c2c0a58d5ddd)
> · 讨论:[#217](https://github.com/iOfficeAI/AionUi/issues/217)

环境要求:Android 7.0+,约 5 GB 空闲存储,从
[F-Droid](https://f-droid.org/en/packages/com.termux/) 安装 Termux(Play Store
版本过旧)。

```bash
# Step 1:安装 Proot Ubuntu
pkg update -y
pkg install proot-distro -y
proot-distro install ubuntu
proot-distro login ubuntu

# Step 2:系统依赖
apt update
apt install -y wget libgtk-3-0 libnss3 libasound2 libgbm1 libxshmfence1 ca-certificates

# Step 3:安装 AionUi
wget https://github.com/iOfficeAI/AionUi/releases/download/v1.5.2/AionUi_1.5.2_arm64.deb
apt install -y ./AionUi_*.deb
which AionUi

# Step 4:启动
AionUi --no-sandbox --webui            # 仅本地
AionUi --no-sandbox --webui --remote   # 局域网

# Step 5:设备浏览器打开 http://localhost:25808
```

从 Termux 主 shell 一行启动(跳过显式的 `proot-distro login`):

```bash
proot-distro login ubuntu -- bash -c "AionUi --no-sandbox --webui --remote"
```

**预期会出现的 D-Bus / X server 警告**(可以忽略——WebUI 不需要它们):

```
[WARNING] Could not connect to session bus...
[ERROR] Failed to connect to the bus...
[WARNING] Multiple instances of the app detected...
```

**建议:**

- 使用轻量浏览器(Chrome / Firefox Focus)。
- 关闭后台应用释放内存。
- 长会话期间插着电源。
- 端口已占用?加 `--port 8080`(或任意空闲端口)。
- 权限不足?`chmod +x /opt/AionUi/aionui`。

### 默认端口

WebUI 默认端口在**生产构建**是 `25808`,在 `bun start` 的 **dev 构建**是
`25809`,带 `AIONUI_MULTI_INSTANCE=1` 的**第二 dev 实例**是 `25810`。可以通过
`--port` 或 `$AIONUI_PORT` 覆盖。

---

## 独立 WebUI(无 Electron)

适合"不能/不想装 Electron 桌面应用"的场景:Linux 服务器、Docker、Termux,或者
只是想在源码目录下快速开一个开发实例。

独立服务由 `@aionui/web-host` 包提供,通过 `scripts/webui.ts`(`bun run webui`)
或打包的 `aionui-web` CLI tarball 启动。

### `aionui-web` tarball(GitHub Release)

每次 AionUi 发版会发布一组独立归档文件,供不想装 Electron 桌面应用的用户使用:

```
aionui-web-<ver>-darwin-arm64.tar.gz
aionui-web-<ver>-darwin-x86_64.tar.gz
aionui-web-<ver>-linux-arm64.tar.gz
aionui-web-<ver>-linux-x86_64.tar.gz
aionui-web-<ver>-win-x86_64.tar.gz
install-web.sh
```

每个 tarball 解开后的目录结构:

```
aionui-web/
├── aionui-web              ← bun 编译的单文件可执行
├── package.json            ← 运行时读 `version`
├── bundled-aionui-backend/<plat-arch>/aionui-backend[.exe]
└── static/                 ← SPA 静态资源
```

**推荐用 `install-web.sh` 安装(处理 .sha256 校验、macOS `com.apple.quarantine`
清理、`~/.local/bin/aionui-web` symlink)**:

```bash
# 安装 latest
curl -fsSL https://github.com/iOfficeAI/AionUi/releases/latest/download/install-web.sh | bash

# 锁定具体版本
curl -fsSL https://github.com/iOfficeAI/AionUi/releases/download/v1.9.26/install-web.sh | bash

# 自定义安装目录
curl -fsSL .../install-web.sh | INSTALL_DIR=/opt/aionui-web bash

# 查看参数
curl -fsSL .../install-web.sh -o install-web.sh
bash install-web.sh --help
```

安装完 `aionui-web` 会加入 `$PATH`:

```bash
aionui-web               # 等价 `aionui-web start`,默认端口 25808
aionui-web --remote      # 绑定 0.0.0.0 供局域网访问
aionui-web --port 8080   # 自定义端口
aionui-web resetpass     # 重置管理员密码(见下文)
aionui-web version
aionui-web help
```

**手动解压 tarball**(如果 `install-web.sh` 不适用于你的环境):

> ⚠️ **macOS 用户注意**:**必须用终端 `tar -xzf` 解压**,不要在 Finder 里
> 双击 `.tar.gz`。Finder 自带的 Archive Utility 会把父 tarball 的 quarantine
> xattr 传播到每个解压出的文件,导致首次启动被 Gatekeeper 拦住报
> "aionui-web" is damaged and can't be opened。终端 tar 解压出来的文件不带
> quarantine xattr,Gatekeeper 不拦。

```bash
tar -xzf aionui-web-1.9.26-darwin-arm64.tar.gz
cd aionui-web
./aionui-web                         # ⚠️ 必须在终端里跑(见下条)
```

> ⚠️ **首次启动必须在终端里跑**:首次启动时自动生成的 admin 密码通过
> **stdout** 打印,Finder 双击启动的话看不到。如果不小心 Finder 双击了第一次,
> 后续可以在终端里跑 `./aionui-web resetpass` 重置一次密码(会打印新密码)。

### 仓库内 `bun run webui`

```bash
bun install             # 首次
bun run package         # 构建 out/renderer/(至少跑过一次)
bun run webui
```

输出:

```
[webui] work dir   : /Users/you/.aionui-web-dev
[webui] static dir : /.../AionUi/out/renderer
[webui] backend bin: /Users/you/.cargo/bin/aionui-backend
[webui] launching  : port=25809 allowRemote=false
...
AionUi WebUI is ready
  Local  : http://127.0.0.1:25809

Initial admin password: <12 位随机>
(首次登录后请修改)
```

### CLI 参数

| 参数                | 环境变量                                                                   | 默认                                                                           | 说明                                                                  |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `--port <n>`        | `AIONUI_PORT` / `PORT`                                                     | prod `25808` / dev `25809` / multi-dev `25810`                                 | 监听端口                                                              |
| `--remote`          | `AIONUI_ALLOW_REMOTE` / `AIONUI_REMOTE` = `1`,或 `AIONUI_HOST` = `0.0.0.0` | 关闭(仅 localhost)                                                             | 绑定到 `0.0.0.0`,允许 LAN 客户端访问                                  |
| `--data-dir <path>` | `AIONUI_DATA_DIR`                                                          | `~/.aionui-web[-dev[-2]]`                                                      | 工作目录——SQLite DB、`webui.config.json`、`logs/`、对话历史           |
| —                   | `AIONUI_LOG_DIR`                                                           | `<data-dir>/logs`                                                              | 覆盖 backend 日志目录                                                 |
| —                   | `AIONUI_STATIC_DIR`                                                        | `<repo>/out/renderer`                                                          | 覆盖静态资源目录。用于指向预构建好的 renderer 其他位置                |
| —                   | `AIONUI_BACKEND_BIN`                                                       | `resources/bundled-aionui-backend/<plat>-<arch>/aionui-backend` → `$PATH` 查找 | `aionui-backend` 可执行文件的绝对路径                                 |
| —                   | `NODE_ENV=production`                                                      | —                                                                              | 切到生产默认值:数据目录 `~/.aionui-web`(无 `-dev` 后缀)、端口 `25808` |
| —                   | `AIONUI_MULTI_INSTANCE=1`                                                  | —                                                                              | 仅 dev 的第二隔离实例。工作目录 `~/.aionui-web-dev-2`,端口 `25810`    |

### 独立模式下重置密码

tarball(打包好的 `aionui-web` 可执行):

```bash
aionui-web resetpass                        # 默认 ~/.aionui-web
aionui-web resetpass --data-dir /path       # 指定工作目录
AIONUI_DATA_DIR=/path aionui-web resetpass  # 环境变量等价
```

仓库内开发(`scripts/webui.ts` 启动器):

```bash
bun run resetpass                        # 默认 ~/.aionui-web-dev
bun run resetpass --data-dir /path       # 指定工作目录
AIONUI_DATA_DIR=/path bun run resetpass  # 环境变量等价
```

两种形式都输出一个新的 12 位随机密码,并轮换存储的 bcrypt 哈希和会话密钥,
使所有已激活的浏览器会话失效。

### 两种模式间共享数据

默认独立模式和桌面内置模式**不共享数据**:

|                       | 桌面内置                                                                | 独立                              |
| --------------------- | ----------------------------------------------------------------------- | --------------------------------- |
| 默认工作目录(macOS)   | `~/.aionui[-dev]` → `~/Library/Application Support/AionUi[-Dev]/aionui` | `~/.aionui-web[-dev]`             |
| 默认工作目录(Linux)   | `~/.aionui[-dev]` → `~/.config/AionUi[-Dev]/aionui`                     | `~/.aionui-web[-dev]`             |
| 默认工作目录(Windows) | `%APPDATA%\AionUi[-Dev]\aionui`                                         | `%USERPROFILE%\.aionui-web[-dev]` |

想共享——显式"让一边指向另一边的目录":

```bash
# 独立模式读取桌面应用的 DB(前提是桌面应用至少启动过一次,符号链接已创建):
bun run webui --data-dir ~/.aionui-dev

# 反过来:让桌面应用用自定义路径(不推荐,macOS 上桌面应用依赖 CLI 安全软链
# 结构来避开 "Application Support" 里的空格)。
```

> macOS 上桌面内置模式在 `~/.aionui[-dev]` 处创建软链,避开 Application Support
> 的空格导致 CLI 工具失败。如果你**在还没装桌面应用之前**先跑了独立模式,独立
> 启动器有意选用 `~/.aionui-web*`(而不是 `~/.aionui*`),避免不小心以"真实目录"
> 占据软链位置、给未来安装的桌面应用埋下"CLI 无法启动"的雷。详见
> `scripts/webui.ts` 顶部的注释块。

---

## 身份认证

### 初始凭据

每个 WebUI 实例首次启动时会创建管理员用户:

- **用户名:**`admin`
- **密码:**随机 12 位字母数字,打印到控制台

桌面设置页在你第一次复制之前也会显示原文,复制后就遮掩了。

### 安全特性

- **密码哈希:**`bcrypt`(10 轮盐,与旧 webserver 一致)。
- **会话 Cookie:**`aionui-session`,HMAC-SHA256 签名的 opaque token,
  `HttpOnly`,本地绑定时 `SameSite=Strict`,`--remote` 时 `SameSite=Lax`。
- **会话 TTL:**24 小时。
- **登录速率限制:**每 IP 15 分钟 5 次尝试。
- **CSRF 防护:**会话 Cookie `HttpOnly` + `SameSite`;登录接口还会携带由
  渲染器设置的 CSRF cookie。
- **密码重置会轮换会话密钥**,使所有已存在的 token 失效。

### 目前仅单用户

WebUI 只有一个用户 `admin`。多用户支持在规划中,当前版本暂未实现。`--resetpass`
的 `username` 参数为未来兼容保留——现在永远是 `admin`。

### 在浏览器里改密码

登录后打开浏览器 UI 的 设置 → WebUI 页面,可以:

- 查看并复制当前密码(一次;之后遮掩)。
- 点 **重置**,生成新的随机密码。
- 点 **修改**,设置自定义密码(至少 8 位)。

任一操作都会使现有会话 token 失效,你需要重新登录。

### 通过 CLI 改密码

桌面内置:

```cmd
:: Windows
AionUi.exe --resetpass
"C:\Program Files\AionUi\AionUi.exe" --resetpass
```

```bash
# macOS
/Applications/AionUi.app/Contents/MacOS/AionUi --resetpass

# Linux
AionUi --resetpass
```

独立(tarball):

```bash
aionui-web resetpass
aionui-web resetpass --data-dir /custom/work/dir
```

独立(仓库 dev):

```bash
bun run resetpass
bun run resetpass --data-dir /custom/work/dir
```

以上方式都会把新密码打印到 stdout。**立即复制**——明文不会被保留。

---

## Channels(Telegram / Lark / 企微 / ...)

WebUI 设置页里有一个 **Channels** 区块,用于把 AionUi 接入外部聊天平台
(Telegram、飞书、企微、钉钉等)。与 WebUI 模式无关——不管用桌面窗口、浏览器
还是两者都用,Channels 都能工作。

1. 设置 → WebUI → 滚动到 **Channels**。
2. **添加 Channel** → 选择平台。
3. 提供该平台特有的凭据(bot token、webhook URL、App ID 等)。
4. 连上以后,就可以从对应平台与你的 AionUi agent 聊天。

Channels 是可选的。只需要浏览器 UI 的话可以跳过。

---

## 服务器部署

把 AionUi 跑成后台服务,自动重启、开机自启。

### Linux —— systemd(推荐)

```bash
sudo nano /etc/systemd/system/aionui-webui.service
```

```ini
[Unit]
Description=AionUi WebUI Service
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME
ExecStart=/usr/bin/AionUi --webui --remote
Restart=on-failure
RestartSec=10
# root 运行的话取消下面三行的注释:
# ExecStart=/usr/bin/AionUi --webui --remote --no-sandbox
# User=root
# Environment="AIONUI_PORT=8080"   # 自定义端口

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable aionui-webui.service
sudo systemctl start aionui-webui.service
sudo systemctl status aionui-webui.service
```

管理命令:

```bash
sudo journalctl -u aionui-webui.service -f      # 跟踪日志
sudo systemctl restart aionui-webui.service      # 重启
sudo systemctl stop aionui-webui.service         # 停止
```

获取访问 URL:

```bash
sudo journalctl -u aionui-webui.service | grep "WebUI"
```

### Linux —— 为独立 `bun run webui` 写 systemd unit

如果你倾向在服务器上直接从 Git 仓库跑独立服务(例如容器内部):

```ini
[Service]
Type=simple
User=aionui
WorkingDirectory=/srv/AionUi
ExecStart=/usr/local/bin/bun run webui --remote --port 8080
Environment="AIONUI_DATA_DIR=/srv/aionui-data"
Environment="AIONUI_BACKEND_BIN=/usr/local/bin/aionui-backend"
Restart=on-failure
RestartSec=10
```

### macOS —— LaunchAgent

`~/Library/LaunchAgents/com.aionui.webui.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.aionui.webui</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/AionUi.app/Contents/MacOS/AionUi</string>
    <string>--webui</string>
    <string>--remote</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.aionui.webui.plist
launchctl start com.aionui.webui
```

---

## 故障排查

### 端口已占用

启动器不会自动选空闲端口。用 `--port` 或 `$AIONUI_PORT`:

```bash
AionUi --webui --port 8080
# 或
bun run webui --port 8080
```

### 浏览器打不开

1. 进程真的在监听吗?
   ```bash
   lsof -i :25808 -iTCP -sTCP:LISTEN
   netstat -an | grep 25808
   ```
2. 换个浏览器;清缓存(`Ctrl/Cmd + Shift + Delete`)。
3. 局域网访问确保启动时加了 `--remote`,或 "允许局域网访问" 开关打开了。
4. 检查防火墙是否拦截了端口(见下文)。

### 防火墙

**Windows(PowerShell 管理员):**

```powershell
New-NetFirewallRule -DisplayName "AionUi WebUI" -Direction Inbound `
  -Protocol TCP -LocalPort 25808 -Action Allow
```

**Linux(UFW):**

```bash
sudo ufw allow 25808/tcp
```

**macOS:**系统设置 → 网络 → 防火墙 → 选项 → 将 AionUi 可执行文件加入允许列表。

### 找不到 AionUi 可执行文件

```cmd
:: Windows
where AionUi.exe
```

```bash
# macOS
mdfind -name AionUi.app

# Linux
which AionUi
find / -name AionUi 2>/dev/null
```

### 查看日志

桌面内置 WebUI:

- macOS:`~/Library/Logs/AionUi/`
- Linux:`~/.config/AionUi/logs/`(被 systemd 管理时在 journal 里)
- Windows:`%APPDATA%\AionUi\logs\`

独立模式:

```bash
bun run webui 2>&1 | tee /tmp/aionui-webui.log
```

日志目录是 `$AIONUI_DATA_DIR/logs`(或 `$AIONUI_LOG_DIR` 指定的路径)。

### `/api/system/info` 返回的路径怪怪的

`/api/system/info` 返回 backend 视角的 `work_dir` / `cache_dir` / `log_dir`。
期望值:

| 模式               | `work_dir`                                 | `cache_dir`              | `log_dir`         |
| ------------------ | ------------------------------------------ | ------------------------ | ----------------- |
| 桌面内置(任何路径) | `~/.aionui[-dev]`(macOS 上是软链)          | `~/.aionui-config[-dev]` | 平台日志目录      |
| 独立               | `<--data-dir>`(默认 `~/.aionui-web[-dev]`) | 同上                     | `<work-dir>/logs` |

如果桌面内置 WebUI 返回的却是带空格的 `~/Library/Application Support/AionUi-Dev`,
那么 backend 内的 CLI 工具(claude、gemini、qwen)可能启动失败。这是软链损坏了,
见下面的"CLI 安全软链损坏"。

### CLI 安全软链损坏

macOS 上桌面应用把 `~/.aionui[-dev]` 做成指向
`~/Library/Application Support/AionUi[-Dev]/aionui` 的软链,避免 agent 卡在
路径空格上。

如果这个软链被替换成了真实目录(例如,旧版本独立启动器以前也默认用这个位置),
桌面应用就会回退到带空格的原始路径,agent 子进程会开始出问题。修复方法:

```bash
# 1. 完全退出桌面应用。
# 2. 备份现有数据。
mv ~/.aionui-dev ~/.aionui-dev.bak-$(date +%Y%m%d)
# 3. 重新打开桌面应用——启动时它会重新创建软链。
```

如果备份目录里有独特数据,在删除之前把它合并到
`~/Library/Application Support/AionUi-Dev/aionui/`。

### ACP `initialize` 握手 30 秒超时

backend 通过 ACP 协议为每个会话启动 CLI 子进程(claude / gemini / codex /
qwen / ...)。如果它们启动失败,第一条消息会以 502 超时。

最常见原因:CLI 不在进程的 `PATH` 上。独立模式现在会把 `~/.nvm/versions/node/*/bin`
全部 prepend 到 `PATH` 再启动 backend;如果你用另一个 Node 版本装了某个 CLI,
确保那个版本的 `bin/` 在 `PATH` 上(桌面应用已经做了)。

如果日志里看到:

```
Superset: gemini not found in PATH. Install it and ensure it is on PATH, then retry.
```

那是 `~/.superset/bin` 的 wrapper 在报错。把 `PATH` 指向真实 CLI,或者重装 CLI。

---

## 命令行选项总结

桌面内置(`AionUi` 二进制):

| 选项                              | 说明                                          |
| --------------------------------- | --------------------------------------------- |
| `--webui`                         | 以 WebUI 模式启动(不开窗口)                   |
| `--remote`                        | 绑定到 `0.0.0.0`,允许 LAN 客户端访问          |
| `--port <n>` / `--webui-port <n>` | 覆盖监听端口                                  |
| `--resetpass [username]`          | 重置管理员密码                                |
| `--no-sandbox`                    | 禁用 Chromium 沙箱(root Linux、Termux 必须加) |

独立(`bun run webui` / `aionui-web`):

| 选项 / 环境变量                          | 说明                      |
| ---------------------------------------- | ------------------------- |
| `--port <n>` / `$AIONUI_PORT`            | 覆盖监听端口              |
| `--remote` / `$AIONUI_ALLOW_REMOTE=1`    | 绑定到 `0.0.0.0`          |
| `$AIONUI_HOST=0.0.0.0`                   | 开启 LAN 绑定的另一种方式 |
| `--data-dir <path>` / `$AIONUI_DATA_DIR` | 覆盖工作目录              |
| `$AIONUI_LOG_DIR`                        | 覆盖日志目录              |
| `$AIONUI_STATIC_DIR`                     | 覆盖静态资源目录          |
| `$AIONUI_BACKEND_BIN`                    | backend 二进制的绝对路径  |
| `$NODE_ENV=production`                   | 切到生产默认值            |
| `$AIONUI_MULTI_INSTANCE=1`               | 启用第二个隔离的 dev 实例 |

Resetpass CLI(独立):

| 选项 / 环境变量                          | 说明                              |
| ---------------------------------------- | --------------------------------- |
| `[username]`                             | 位置参数,预留(当前永远是 `admin`) |
| `--data-dir <path>` / `$AIONUI_DATA_DIR` | 要重置密码的工作目录              |

---

## 最佳实践

### 开发

- 日常开发用 `bun start` + 设置开关;数据放在 `~/.aionui-dev`。
- 需要隔离的第二个实例用 `bun run webui`,指向临时目录
  (`--data-dir /tmp/aionui-scratch`)。

### 生产

- 除非局域网完全可信,否则一定在防火墙 / VPN 后面跑。
- 用 systemd / LaunchAgent 管理服务,实现自动重启。
- 定期旋转管理员密码(`--resetpass`)。
- 保持 AionUi 更新——发布里会带安全修复。

### 局域网

- 仅在网络可信时用 `--remote`。
- iOS 上的手机:把页面 URL 钉到主屏,PWA 风格图标。

---

## 相关资源

- [入门指南](https://github.com/iOfficeAI/AionUi/wiki/Getting-Started-Chinese)
- [LLM 配置](https://github.com/iOfficeAI/AionUi/wiki/LLM-Configuration-Chinese)
- [多 Agent(ACP)配置](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup-Chinese)
- [MCP 配置](https://github.com/iOfficeAI/AionUi/wiki/MCP-Configuration-Guide-Chinese)
- [远程互联网访问教程](https://github.com/iOfficeAI/AionUi/wiki/Remote-Internet-Access-Guide-Chinese)
- [FAQ](https://github.com/iOfficeAI/AionUi/wiki/FAQ-Chinese)
