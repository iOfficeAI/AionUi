# 开发指南

## 前置条件

- **Node.js** 22 或更高版本
- **bun** — 包管理器和运行时（[安装](https://bun.sh)）
- **Rust stable + Cargo** — 构建本地 GEACore 后端所必需（[安装](https://rustup.rs)）
- **Python** 3.11 或更高版本（用于编译原生模块）
- **prek** — PR 代码检查工具（`npm install -g @j178/prek`）

在 Windows 上，请安装 Rust MSVC 工具链。如果 Rust 因缺少原生构建工具而编译失败，请通过 Visual Studio Installer 安装 **Microsoft C++ Build Tools**，然后重新打开终端。

## 仓库布局

GEAUi 的开发使用两个仓库：

- **GEACore**（`https://github.com/iOfficeAI/AionCore.git`）用于构建本地后端二进制文件：macOS/Linux 上为 `aioncore`，Windows 上为 `aioncore.exe`。
- **GEAUi**（`https://github.com/iOfficeAI/AionUi.git`）用于启动 Electron 桌面应用，并自动启动后端二进制文件。

建议尽可能将两个仓库放在同一级目录：

```text
workspace/
|-- AionCore/
`-- AionUi/
```

桌面开发服务器会从 `bun run start` 继承的 `PATH` 中查找后端。请先安装 GEACore，确认在同一个终端中能够找到该二进制文件，然后再启动 GEAUi。

## 快速开始

### 1. 克隆两个仓库

```bash
git clone https://github.com/iOfficeAI/AionCore.git
git clone https://github.com/iOfficeAI/AionUi.git
```

除非维护者要求测试其他分支，否则两个仓库都使用 `main` 分支。

### 2. 构建并安装 GEACore

请在 `AionCore` 仓库中运行以下命令。

#### macOS / Linux

```bash
cd AionCore
cargo clean
cargo install --path crates/aionui-app --locked

# 如有需要，让当前 Shell 能找到 Cargo 安装的二进制文件。
export PATH="$HOME/.cargo/bin:$PATH"

# 验证 AionUi 能否找到后端。
which aioncore
aioncore --help
```

如果 `which aioncore` 没有输出，请将 `export PATH="$HOME/.cargo/bin:$PATH"` 添加到 Shell 配置文件（`~/.zshrc`、`~/.bashrc` 或当前 Shell 对应的配置文件），重新打开终端后再次验证。

#### Windows PowerShell

```powershell
cd AionCore
cargo clean
cargo install --path crates/aionui-app --locked

# 如有需要，让当前 PowerShell 会话能找到 Cargo 安装的二进制文件。
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# 验证 AionUi 能否找到后端。
where.exe aioncore
aioncore --help
```

如果 `where.exe aioncore` 没有输出，请确认 `%USERPROFILE%\.cargo\bin` 已加入用户的 `Path`，重新打开 PowerShell 窗口后再次验证。

### 3. 启动 GEAUi

请在能够找到 `aioncore` 的终端中，从 `AionUi` 仓库运行以下命令。

```bash
cd AionUi

# 安装依赖
bun install

# 以开发模式启动 Electron 桌面应用
bun run start
```

启动过程中，GEAUi 会自动启动 `aioncore`，并将后端端口传给渲染进程。无需在另一个终端中单独启动 GEACore。

## 更新本地后端

拉取或修改 GEACore 后，请重新安装后端二进制文件并重启 GEAUi：

```bash
cd ../AionCore
cargo install --path crates/aionui-app --locked --force

cd ../AionUi
bun run start
```

以相同的 GEACore 包版本重新构建本地改动时，请使用 `--force`；否则 Cargo 可能继续保留已经安装的二进制文件。

## 后端启动故障排查

### `Cannot find "aioncore" binary`

GEAUi 无法从 `bun run start` 继承的 `PATH` 中找到后端。

请在启动 GEAUi 的同一个终端中检查：

```bash
# macOS / Linux
which aioncore

# Windows PowerShell
where.exe aioncore
```

如果命令失败，请将 Cargo 的二进制目录添加到 `PATH`，然后从新打开的终端启动 GEAUi。

### 在终端中可以运行 `aioncore`，但 GEAUi 仍然找不到它

请确保从能够执行 `aioncore --help` 的同一个终端环境运行 `bun run start`。IDE 终端和通过图形界面启动的 Shell 可能继承不同的 `PATH`；更新 `PATH` 后，请重启 IDE，或者从终端启动 IDE。

### 后端改动没有生效

退出 GEAUi，使用 `cargo install --path crates/aionui-app --locked --force` 重新安装 GEACore，然后再次启动 GEAUi。开发过程中，Electron 应用持有后端子进程，因此正在运行的 GEAUi 实例必须重启后才能使用新安装的二进制文件。

### Windows Rust 构建错误

请使用 Rust MSVC 工具链并安装 Microsoft C++ Build Tools。安装或更改工具链后，请重新打开 PowerShell 窗口，再次运行 GEACore 安装命令。

## 脚本参考

### 开发

| 命令                        | 说明                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| `bun start`                 | 以开发模式启动 Electron 桌面应用                                      |
| `bun run start:multi`       | 在已有实例旁启动第二个 Electron 实例（参见[多实例开发](#多实例开发)） |
| `bun run cli`               | `bun start` 的别名                                                    |
| `bun run webui`             | 以 WebUI 模式启动（基于浏览器，不打开 Electron 窗口）                 |
| `bun run webui:remote`      | 启用远程访问并以 WebUI 模式启动                                       |
| `bun run webui:prod`        | 以生产模式启动 WebUI                                                  |
| `bun run webui:prod:remote` | 以生产模式启动 WebUI，并启用远程访问                                  |
| `bun run resetpass`         | 通过 CLI 重置用户密码                                                 |

### 构建与分发

| 命令                      | 说明                                               |
| ------------------------- | -------------------------------------------------- |
| `bun run package`         | 将所有进程（main、preload、renderer）构建到 `out/` |
| `bun run make`            | `bun run package` 的别名                           |
| `bun run dist`            | 为当前平台构建并打包可分发版本                     |
| `bun run dist:mac`        | 为 macOS 构建可分发版本                            |
| `bun run dist:win`        | 为 Windows 构建可分发版本                          |
| `bun run dist:linux`      | 为 Linux 构建可分发版本                            |
| `bun run build-mac`       | 同时为 arm64 和 x64 构建 macOS 可分发版本          |
| `bun run build-mac:arm64` | 仅为 Apple Silicon 构建 macOS 可分发版本           |
| `bun run build-mac:x64`   | 仅为 Intel 构建 macOS 可分发版本                   |
| `bun run build-win`       | 构建 Windows 可分发版本                            |
| `bun run build-win:arm64` | 为 ARM64 构建 Windows 可分发版本                   |
| `bun run build-win:x64`   | 为 x64 构建 Windows 可分发版本                     |
| `bun run build-deb`       | 构建 Linux（`.deb`）可分发版本                     |
| `bun run build`           | `bun run build-mac` 的别名                         |

### 独立服务器（非 Electron）

| 命令                               | 说明                                     |
| ---------------------------------- | ---------------------------------------- |
| `bun run build:renderer:web`       | 为独立 Web 部署构建渲染进程              |
| `bun run build:server`             | 将独立服务器包构建到 `dist-server/`      |
| `bun run server:start`             | 以开发模式运行独立服务器                 |
| `bun run server:start:remote`      | 启用远程访问并运行独立服务器             |
| `bun run server:start:prod`        | 以生产模式运行独立服务器                 |
| `bun run server:start:prod:remote` | 以生产模式运行独立服务器，并启用远程访问 |
| `bun run server:resetpass`         | 通过独立服务器 CLI 重置密码              |
| `bun run server:resetpass:prod`    | 通过独立服务器 CLI 重置密码（生产环境）  |

### 代码质量

| 命令                   | 说明                           |
| ---------------------- | ------------------------------ |
| `bun run lint`         | 检查 lint 问题（oxlint，只读） |
| `bun run lint:fix`     | 自动修复 lint 问题             |
| `bun run format`       | 自动格式化代码（oxfmt）        |
| `bun run format:check` | 检查格式但不修改文件           |
| `bun run i18n:types`   | 为 i18n 键生成 TypeScript 类型 |

### 测试

| 命令                         | 说明                         |
| ---------------------------- | ---------------------------- |
| `bun run test`               | 运行全部单元测试（vitest）   |
| `bun run test:watch`         | 以监听模式运行测试           |
| `bun run test:coverage`      | 运行测试并生成覆盖率报告     |
| `bun run test:contract`      | 运行契约测试                 |
| `bun run test:integration`   | 运行集成测试                 |
| `bun run test:bun`           | 运行 Bun 专用数据库驱动测试  |
| `bun run test:e2e`           | 运行端到端测试（Playwright） |
| `bun run test:packaged:i18n` | 对打包产物运行 i18n 集成测试 |
| `bun run test:packaged:bun`  | 运行 Bun 打包集成测试        |

### 调试

| 命令                         | 说明                       |
| ---------------------------- | -------------------------- |
| `bun run debug:perf`         | 启用性能监控并启动应用     |
| `bun run debug:perf:report`  | 根据采集的数据生成性能报告 |
| `bun run debug:mcp`          | 调试 MCP 服务器连接        |
| `bun run debug:mcp:list`     | 列出已配置的 MCP 服务器    |
| `bun run debug:mcp:validate` | 验证 MCP 服务器配置        |
| `bun run debug:custom-agent` | 调试自定义 Agent 连接      |

## 多实例开发

如果存在两个仓库副本（例如 `AionUi` 和 `AionUi-refactor`），并且需要同时运行它们，可以使用以下命令启动第二个实例：

```bash
bun run start:multi
```

该命令会设置 `AIONUI_MULTI_INSTANCE=1`，从而：

- 跳过 Electron 单实例锁
- 使用独立的 userData 目录（`AionUi-Dev-2`），避免数据库和配置冲突
- 隔离数据/配置符号链接路径（`~/.aionui-dev-2`、`~/.aionui-config-dev-2`）
- 自动递增 Vite renderer、CDP 和 WebUI 代理端口，避免端口冲突

> **注意：** 多实例 WebUI 默认使用 25810 端口（而不是 25809）。在浏览器中访问第二个实例的 WebUI 时，请使用**无痕/隐私窗口**。两个实例共享 `localhost` Cookie 容器，但 JWT 密钥不同；如果复用同一个浏览器会话，会导致身份验证失败。

## 代码检查（prek）

项目使用 [prek](https://github.com/j178/prek)（pre-commit 的 Rust 实现）进行代码检查，配置文件为 `.pre-commit-config.yaml`：

```bash
# 安装 prek
npm install -g @j178/prek

# 安装 Git 钩子（可选，提交前自动检查）
prek install

# 对暂存文件运行检查
prek run

# 检查相对于 main 的改动（与 CI 相同）
prek run --from-ref origin/main --to-ref HEAD
```

## 构建系统

GEAUi 使用 **electron-vite** 进行快速打包：

- **主进程**：使用 Vite 打包（ESM）
- **渲染进程**：使用 Vite 打包（React + TypeScript）
- **Preload 脚本**：使用 Vite 打包

构建产物输出到 `out/` 目录：

- `out/main/` - 主进程代码
- `out/renderer/` - 渲染进程代码
- `out/preload/` - Preload 脚本

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **React 19** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 快速打包工具（通过 electron-vite 使用）
- **UnoCSS** - 原子化 CSS 引擎
- **better-sqlite3** - 本地数据库
- **vitest** - 测试框架
