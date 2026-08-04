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
