# 构建脚本文档

本目录包含用于在不同平台和架构上构建、打包 GEAUi 的脚本。

## 脚本概览

| 脚本                      | 行数 | 用途                                    |
| ------------------------- | ---- | --------------------------------------- |
| `build-with-builder.js`   | 116  | 协调 Electron Forge 和 electron-builder |
| `rebuildNativeModules.js` | 219  | **统一的原生模块重建工具**              |
| `beforeBuild.js`          | 38   | 打包前原生模块重建钩子                  |
| `afterPack.js`            | 67   | 打包后验证（仅 Linux）                  |
| `afterSign.js`            | 47   | macOS 代码签名和公证                    |

**总计**：487 行（优化前为 711 行）

## 架构

### 构建流程

```
npm run dist:*
    ↓
build-with-builder.js
    ↓
    ├─→ Electron Forge（webpack 编译）
    ↓
electron-builder
    ↓
    ├─→ beforeBuild.js → rebuildNativeModules.js（所有平台）
    ├─→ 打包应用
    ├─→ afterPack.js → rebuildNativeModules.js（仅 Linux）
    └─→ afterSign.js（仅 macOS）
```

## 原生模块重建策略

### `rebuildNativeModules.js`——统一重建工具

这是负责所有原生模块重建的核心模块，提供以下能力：

#### 函数

1. **`rebuildWithElectronRebuild(options)`**
   - 使用方：`beforeBuild.js`
   - 重建源码目录中的所有原生模块
   - 模块：`better-sqlite3`

2. **`rebuildSingleModule(options)`**
   - 使用方：`afterPack.js`
   - 重建已打包应用中的单个模块
   - 策略：先尝试 prebuild-install，失败后回退到 electron-rebuild

3. **`verifyModuleBinary(moduleRoot, moduleName)`**
   - 验证重建后是否存在原生二进制文件

4. **辅助工具**：
   - `normalizeArch()`：规范化架构名称
   - `getModulesToRebuild()`：获取特定平台的模块列表
   - `buildEnvironment()`：创建重建所需的环境变量

### 平台特定行为

#### Windows

- **重建模块**：`better-sqlite3`
- **跳过模块**：`node-pty`（使用预构建二进制文件）
- **环境**：MSVS 2022、Windows SDK 10.0.19041.0

#### macOS

- **重建模块**：`better-sqlite3`
- **执行时机**：仅 `beforeBuild` 钩子
- **构建后操作**：代码签名和公证

#### Linux

- **重建模块**：`better-sqlite3`
- **执行时机**：
  - `beforeBuild`：在源码目录中重建
  - `afterPack`：在已打包应用中重建 `better-sqlite3`
- **策略**：先下载预构建二进制文件，不可用时再编译

## 使用示例

### 为指定平台构建

```bash
# 为 macOS 构建
npm run dist:mac

# 为 Windows 构建
npm run dist:win

# 为 Linux 构建
npm run dist:linux
```

### 手动重建原生模块

```javascript
const { rebuildWithElectronRebuild } = require('./scripts/rebuildNativeModules');

rebuildWithElectronRebuild({
  platform: 'linux',
  arch: 'arm64',
  electronVersion: '37.3.1',
});
```

### 在已打包应用中重建单个模块

```javascript
const { rebuildSingleModule } = require('./scripts/rebuildNativeModules');

rebuildSingleModule({
  moduleName: 'better-sqlite3',
  moduleRoot: '/path/to/app.asar.unpacked/node_modules/better-sqlite3',
  platform: 'linux',
  arch: 'arm64',
  electronVersion: '37.3.1',
});
```

## 为什么需要两个重建阶段？

### beforeBuild（所有平台）

- 在**源码目录**（`node_modules/`）中重建模块
- 确保正确的二进制文件被打包
- 对所有模块使用 `electron-rebuild`

### afterPack（仅 Linux）

- 在**已打包应用**（`app.asar.unpacked/`）中重建 `better-sqlite3`
- 处理交叉编译问题
- 使用 `prebuild-install` 加快构建（下载预构建二进制文件）

## 故障排查

### 打包后找不到模块

**症状**：`Error: Cannot find module 'better-sqlite3'`

**解决方法**：检查：

1. 模块是否位于 `packages/desktop/electron-builder.yml` 的 `files` 部分
2. 模块是否位于 `packages/desktop/electron-builder.yml` 的 `asarUnpack` 部分
3. 构建期间是否成功运行 `beforeBuild.js`
4. Linux：是否成功运行 `afterPack.js`

### 原生模块导致应用启动时崩溃

**症状**：应用因段错误或二进制不兼容错误而崩溃。

**解决方法**：

1. 确认目标架构与构建架构一致
2. 检查 `beforeBuild.js` 是否针对正确架构进行了重建
3. Linux ARM64：确认 `afterPack.js` 已重建该模块

### 交叉编译失败

**症状**：跨架构构建期间，原生模块重建失败。

**解决方法**：

- Windows：`node-pty` 出现这种情况符合预期（它使用预构建二进制文件）
- macOS/Linux：确认已安装目标架构所需的构建工具
- 考虑改为在目标原生架构上构建

## 优化历史

### 1.0 版本（优化前）

- 总计：5 个文件，共 711 行
- 重复内容：`beforeBuild` 和 `afterPack` 中都包含重建逻辑

### 2.0 版本（当前）

- 总计：5 个文件，共 487 行
- 减少：224 行（31%）
- 变更：
  - ✅ 删除 `release.sh`（67 行），改用 `npm version`
  - ✅ 创建 `rebuildNativeModules.js`（219 行），作为统一工具
  - ✅ 简化 `build-with-builder.js`：321 → 116 行
  - ✅ 简化 `beforeBuild.js`：95 → 38 行
  - ✅ 简化 `afterPack.js`：181 → 67 行

## 贡献

修改构建脚本时：

1. 提交前在**所有平台上测试**
2. 行为发生变化时**更新本文档**
3. **维护统一的重建工具**，避免重复实现逻辑
4. **保持错误消息清晰**，帮助用户排查问题

## 相关文件

- `/packages/desktop/electron-builder.yml` - electron-builder 配置
- `/forge.config.ts` - Electron Forge 配置
- `/.github/workflows/build-and-release.yml` - CI/CD 流程
- `/package.json` - 构建脚本和依赖

## 本地分层构建与审计

`bun run local <模式>`（或 `just local <模式>`）复用现有 Vite/MCP 内容缓存和打包链。本地普通开发不生成安装包，现有 CI 入口保持不变。

| 模式                                                             | 行为与边界                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `dev`                                                            | 启动 Electron/Vite 开发服务；不清理其他进程、不构建 Core、不打包                                                          |
| `focused --core /绝对路径/AionCore --crate aionui-common`        | `cargo test --locked -p <crate> --lib`；指定 `--test <name>` 可选择一个集成测试入口                                       |
| `wire`                                                           | 构建内置 MCP bundle，然后用独立 Node 子进程验证 stdio initialize、tools/list、关闭；不执行业务工具                        |
| `full`                                                           | `just gate`：完整客户端质量检查与测试；不构建安装包、不复用 CI 历史通过记录                                               |
| `build`                                                          | 仅编译客户端 Main/Preload/Renderer/MCP，校验输出；不编译或下载 Core、不打包                                               |
| `package`                                                        | 只打包本机架构 DMG/NSIS；要求当前输入与已有输出摘要匹配，否则拒绝并提示先执行 `build`；保留 Core 准备、能力检查和签名环节 |
| `release`                                                        | 依次执行 `full`、`build`、`package`；任何阶段失败立即停止，无发布或推送                                                   |
| `audit [--core /绝对路径/AionCore] [--compare /上次/audit.json]` | 只读列出占用、归属、可再生性、逻辑及实际分配空间变化，保存报告                                                            |
| `clean --target /精确/路径 [--core /绝对路径/AionCore]`          | 默认只检查；追加 `--execute` 才删除符合条件的生成缓存                                                                     |

构建模式支持 `--dry-run` 查看阶段。`build --force`、`wire --force` 强制重建对应输出；`focused --force` 使用该 Core 工作树 `target/local-force/<构建编号>` 下的新命名空间，不删除已有缓存。强制运行会额外占空间，之后普通 focused 仍使用原 target。

Core 默认使用规范化工作树路径下的 `target/`，通过显式 `--target-dir` 覆盖环境变量及 Cargo 配置中的共享 target。不同 Core 工作树隔离，同一个 Core 工作树的正常重复执行复用 Cargo 产物；sccache、Cargo registry、Bun 和下载缓存继续使用本机既有配置。不会复制依赖或 target，不自动扩大缓存容量。

每次执行的 `.workspace/local-build/<编号>/manifest.json` 包含源码提交与 dirty 输入摘要、工具链、平台、阶段结果、耗时、日志路径、缓存决策与磁盘变化。Cargo 缓存状态来自 `compiler-artifact.fresh`，不是从耗时推测。指定 `--core` 的源码身份与安装包实际下载的 Core 身份分别记录。安装包旁的 `<安装包>.build.json` 记录安装包 SHA-256，可与清单绑定核对；清单只证明列出的本地阶段，真实界面和业务验收需要额外证据。

清理仅接受审计中可再生的 `out/main`、`out/preload`、`out/renderer` 和 Core `target/debug`。安装包、运行资源、依赖、共享缓存、日志、源码、业务数据与 unknown 不进入删除范围。清理要求生成清单的完整输出摘要仍匹配（Core 在成功 focused 后记录），新增或修改 ignored 文件也会阻止删除。清理拒绝符号链接、Git 跟踪或非忽略文件、活动构建/客户端、打开文件、无法可靠完成的进程检查。macOS/Linux 支持清理，其他平台拒绝执行；安全检查可能保守阻止被其他工作树进程占用的系统。

同一工作树的编排与清理共用互斥锁：UI 使用 `.workspace/local-build/active.json`，Core 使用 `target/.aionui-local-build/active.json`，输出证明也保存在相邻目录。Core 记账文件不会污染源码摘要。异常退出留下锁时，先核实其中 PID 和相关子进程均已结束，再仅删除该锁后重试；不会自动按锁的时间判断过期。直接调用旧构建命令不参与新锁，清理仍执行现场进程和打开文件检查；不要同时在同一工作树启动外部构建与清理。
