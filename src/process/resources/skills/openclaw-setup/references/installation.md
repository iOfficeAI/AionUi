# OpenClaw 安装指南

## 系统要求

- **Node.js**: 版本 ≥ 22（必需）
- **操作系统**: macOS、Linux、Windows (WSL2 强烈推荐)
- **包管理器**: npm、pnpm 或 bun（推荐 npm 或 pnpm）

## 检查 Node.js 版本

```bash
node --version
```

如果版本低于 22，需要先升级 Node.js。

## 安装方式

### 方式 1：使用官方安装脚本（推荐）

**macOS/Linux:**

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

**Windows (PowerShell):**

```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

### 方式 2：npm 全局安装

```bash
npm install -g openclaw@latest
```

或使用 pnpm：

```bash
pnpm add -g openclaw@latest
```

### 方式 3：从源码构建（开发）

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm ui:build  # 首次运行会自动安装 UI 依赖
pnpm build
```

## 验证安装

```bash
openclaw --version
```

## 安装后下一步

安装完成后，运行新手引导向导：

```bash
openclaw onboard --install-daemon
```

这会引导你完成 Gateway 配置、模型认证、渠道设置等。
