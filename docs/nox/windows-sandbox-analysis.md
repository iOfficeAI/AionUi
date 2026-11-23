# Nox Desk 沙箱 Windows 移植难度分析

## 当前实现依赖

### 1. @anthropic-ai/sandbox-runtime@0.0.67
**核心依赖**：macOS Seatbelt（`sandbox-exec`）

```javascript
// launcher.mjs 第 96 行
if (process.platform !== 'darwin') 
  unavailable(`platform ${process.platform} is not supported by this build`);
```

**问题**：
- SRT 官方只支持 **macOS**（使用 Seatbelt）
- 最新版本 0.0.83 仍然是 macOS only
- npm 包描述提到 `bubblewrap`（Linux 沙箱），但未正式支持

### 2. 沙箱核心功能
当前通过 Seatbelt 实现：
- **文件系统隔离**：
  - 拒绝读：`~/.ssh`, `~/.aws`, `~/Library/Application Support/Nox Desk` 等
  - 拒绝写：shell 配置文件（`~/.zshrc`, `~/.bashrc`），`~/bin` 等
  - 允许读写：当前 workspace 和临时目录

- **网络隔离**：
  - 拒绝直接 loopback 连接（防止调用 aioncore HTTP API）
  - 只允许通过指定的过滤代理端口和 MCP 桥接端口
  - 所有外部网络必须经过过滤代理

- **进程隔离**：
  - 无法执行任意系统命令
  - 无法修改系统配置

## Windows 沙箱方案对比

### 方案 A：等待 SRT 官方支持 Windows
**优点**：
- 保持架构一致
- Anthropic 官方维护，安全性有保障

**缺点**：
- **没有时间表**：SRT 目前无 Windows 支持计划
- npm 描述中提到 `bubblewrap`（Linux），但没有 Windows
- 可能需要等待数月甚至更久

**可行性**：❌ 短期不可行

---

### 方案 B：使用 Windows AppContainer
**原理**：Windows 10+ 的轻量级沙箱机制

**类似项目**：
- Chromium/Edge 的渲染进程沙箱
- Windows Sandbox（系统内置）

**实现难度**：🔴 **非常困难**
1. 需要用 C++/C# 写原生启动器（Node.js 无法直接创建 AppContainer）
2. 配置复杂：
   - 文件系统重定向（类似 Seatbelt 的 deny/allow 规则）
   - 网络权限配置（必须显式授予 loopback 和特定端口）
   - 进程权限降级
3. 需要深入了解 Windows 安全模型
4. 维护成本高（Windows API 频繁变化）

**参考**：
- [AppContainer Isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation)
- [Chromium Sandbox Design](https://chromium.googlesource.com/chromium/src/+/master/docs/design/sandbox.md)

**开发时间估算**：1-2 个月（全职）

---

### 方案 C：使用 Docker Desktop（WSL2）
**原理**：在 WSL2 中运行 Linux 容器，用 Docker 沙箱

**流程**：
```
aioncore (Windows) 
  → launcher.mjs (Windows)
  → docker run --network=custom --volume=workspace (WSL2)
  → claude-code-acp (Linux in container)
```

**优点**：
- Linux 容器沙箱成熟（cgroups, namespaces）
- 可以复用 macOS 的网络策略（过滤代理 + MCP 桥接）
- 相对容易实现

**缺点**：
- **依赖 Docker Desktop**（需要用户安装，WSL2 + Hyper-V）
- 性能开销（虚拟化层）
- 文件系统路径转换复杂（Windows `C:\` ↔ WSL `/mnt/c/`）
- Docker Desktop 商业许可问题（企业使用需付费）

**实现难度**：🟡 **中等**

**开发时间估算**：2-3 周

---

### 方案 D：降级为进程隔离（无真沙箱）
**原理**：只用过滤代理 + MCP 桥接，不用操作系统沙箱

**保留的防护**：
- ✅ 过滤代理：控制网络白名单
- ✅ MCP 桥接：token 不进入 agent 进程
- ✅ 身份注入：「Nox 助手」规则
- ❌ 文件系统隔离：**无**
- ❌ loopback 阻断：**无**（agent 可以调用 aioncore HTTP API）
- ❌ 进程权限降级：**无**

**风险**：
- Agent 可以读取 `~/.ssh`, `~/.aws` 等敏感文件
- Agent 可以修改 shell 配置文件（如 PowerShell profile）
- Agent 可以调用 aioncore HTTP API（可能泄露其他会话数据）

**适用场景**：
- 仅用于内部员工（非客户）
- 配合企业 DLP/EDR 监控
- 明确告知用户风险

**实现难度**：🟢 **简单**（只需移除沙箱检查）

**开发时间**：1-2 天

---

### 方案 E：Windows Sandbox (WSandbox)
**原理**：使用 Windows 10/11 Pro+ 内置的 Windows Sandbox

**流程**：
```
aioncore → 启动 Windows Sandbox 虚拟机
         → 在虚拟机中运行 claude-code-acp
         → 通过 RDP 或网络通信
```

**优点**：
- 系统内置，无需额外依赖
- 完全隔离（轻量级 VM）

**缺点**：
- **仅 Windows 10/11 Pro/Enterprise**（家庭版不支持）
- 性能开销大（完整 VM，不是容器）
- 通信复杂（需要网络桥接或共享文件夹）
- 每次启动需要 10-20 秒

**实现难度**：🔴 **困难**

---

## 推荐方案

### 短期（1-2 个月内发布）：**方案 D + 明确风险提示**

**实现**：
1. launcher.mjs 移除 `platform !== 'darwin'` 检查
2. 在 Windows 上跳过 `SandboxManager.wrapWithSandbox`，直接启动 `claude-code-acp`
3. 保留过滤代理和 MCP 桥接
4. 在安装/首次运行时显示风险提示：
   > ⚠️ Windows 版本暂不支持文件系统沙箱，请勿在不受信任的环境下运行。
5. 记录所有 agent 文件操作日志，便于审计

**优点**：
- 开发成本最低（1-2 天）
- 核心功能可用（对话、文件操作、知识库）
- 网络隔离仍然有效（token 不泄露）

**缺点**：
- 安全性低于 macOS 版
- 仅适合内部使用或可信用户

---

### 中期（3-6 个月）：**方案 C（Docker）或等待 SRT 官方**

**方案 C（Docker）** 适合：
- 企业客户已部署 Docker Desktop
- 对性能要求不高
- 需要真沙箱

**等待 SRT 官方** 适合：
- 愿意等待 Anthropic 更新
- 需要与 macOS 一致的架构

---

## Windows 特殊考虑

### 1. 路径差异
- macOS/Linux: `/Users/lushi/Documents`
- Windows: `C:\Users\lushi\Documents`
- 需要适配 `path.sep` 和 `path.resolve`

### 2. 权限模型
- macOS: POSIX 权限（chmod 0700）
- Windows: ACL（Access Control Lists）
- `fs.chmodSync` 在 Windows 上部分功能无效

### 3. 进程管理
- macOS: SIGTERM, SIGINT
- Windows: 需要用 `taskkill` 或 process.kill('SIGTERM') 可能不生效

### 4. shell
- macOS: `/bin/bash`
- Windows: `cmd.exe` 或 `powershell.exe`
- `shellQuote` 函数需要重写（Windows 引号规则不同）

---

## 总结

| 方案           | 安全性 | 开发时间 | 依赖                 | 推荐度 |
| -------------- | ------ | -------- | -------------------- | ------ |
| A. 等待 SRT    | ⭐⭐⭐⭐⭐ | 未知     | 无                   | ⬜     |
| B. AppContainer| ⭐⭐⭐⭐  | 1-2 月   | 原生开发             | 🟡     |
| C. Docker      | ⭐⭐⭐⭐  | 2-3 周   | Docker Desktop       | 🟡     |
| D. 进程隔离    | ⭐⭐    | 1-2 天   | 无                   | 🟢（短期）|
| E. WSandbox    | ⭐⭐⭐⭐⭐ | 3-4 周   | Windows 10/11 Pro+   | 🔴     |

**建议**：
1. **立即**：方案 D（进程隔离），配合风险提示，满足内部测试
2. **3 个月后**：评估 Docker 方案或等待 SRT 官方支持
3. **长期**：如果 SRT 仍无 Windows 支持，考虑投入开发 AppContainer 方案
