# 实施计划：应用内自动更新

**分支**: `feat/app-auto-update` | **日期**: 2025-01-22 | **规格**: [app-auto-update-spec.md](./spec.md)
**输入**: 来自 `/specs/002-app-auto-update/spec.md` 的功能规格

## 执行流程 (/plan 命令范围)
```
1. 加载功能规格
   → ✓ 已加载应用内自动更新规格，包含12个功能需求
2. 填写技术上下文（扫描需要澄清项）
   → ✓ 检测到项目类型：单一项目（Electron 桌面应用）
   → ✓ 架构决策：选项1（src/ 布局）
3. 基于宪章文档内容填写宪章检查部分
   → ✓ 宪章要求已分析
4. 评估宪章检查部分
   → ✓ 未检测到违规
   → ✓ 更新进度跟踪：初始宪章检查
5. 执行阶段 0 → research.md
   → ✓ 已完成：所有需要澄清项已解决
6. 执行阶段 1 → contracts, data-model.md, quickstart.md
   → ✓ 已完成：所有设计工件已创建
7. 重新评估宪章检查部分
   → ✓ 已完成：无宪章违规，遵循所有原则
8. 规划阶段 2 → 描述任务生成方法（不创建 tasks.md）
   → ✓ 已完成：任务生成策略已记录
9. 停止 - 准备执行 /tasks 命令
```

## 技术上下文

### 项目类型识别
**检测到**: 单一 Electron 项目
- 根目录存在 `package.json` 和 `electron` 依赖
- 开发使用 Electron Forge，生产构建使用 Electron Builder
- TypeScript + React 架构
- 现有 IPC 桥接模式
- GitHub Actions CI/CD 自动化构建

### 目录结构决策
**选择**: 遵循现有项目架构模式
```
src/
├── common/
│   ├── updateTypes.ts              # 更新相关类型定义（与 acpTypes.ts 模式一致）
│   ├── ipcBridge.ts                # 扩展现有桥接，添加更新相关接口
│   ├── storage.ts                  # 扩展现有存储系统添加更新配置
│   ├── models/
│   │   ├── VersionInfo.ts          # 版本信息模型
│   │   ├── UpdatePackage.ts        # 更新包模型
│   │   └── UpdateSession.ts        # 更新会话模型
│   └── services/
│       ├── VersionChecker.ts       # 版本检查服务
│       └── DownloadManager.ts      # 下载管理服务
├── process/
│   ├── bridge/
│   │   └── updateBridge.ts         # 更新 IPC 桥接具体实现
│   └── services/
│       └── UpdateManager.ts        # 主进程更新管理器
└── renderer/
    ├── pages/settings/
    │   └── About.tsx               # 扩展现有关于页面（集成更新功能）
    ├── components/update/
    │   ├── UpdateStatus.tsx        # 更新状态组件（嵌入关于页面）
    │   ├── UpdateProgress.tsx      # 更新进度组件
    │   └── UpdateDialog.tsx        # 更新对话框
    ├── hooks/
    │   └── useAutoUpdate.ts        # 更新相关 Hook
    └── services/
        └── UpdateService.ts        # 渲染进程更新服务
```

## 宪章检查

### I. 多代理 AI 集成 ✅
- **合规性**: 更新功能不直接涉及 AI 代理，但遵循模块化原则
- **影响**: 更新后需确保所有 AI 代理功能正常工作
- **测试要求**: 更新后验证 Gemini、Claude、Qwen 代理功能

### II. 模块化架构优先 ✅  
- **IPC 桥接**: 新增 `updateBridge` 遵循现有桥接模式
- **独立模块**: UpdateManager 作为独立可测试组件
- **接口分离**: 更新 UI 组件与业务逻辑清晰分离
- **共享工具**: 复用现有的存储和通知系统

### III. 用户体验卓越 ✅
- **直观界面**: 在现有"关于"页面集成更新功能
- **进度反馈**: 实时显示下载和安装进度
- **错误处理**: 友好的错误信息和恢复选项
- **响应式**: 不阻塞主界面的后台更新

### IV. 安全和隐私优先 ✅
- **本地存储**: 更新配置和历史记录本地保存
- **签名验证**: 强制验证所有更新包的数字签名
- **HTTPS传输**: 所有更新下载使用安全连接
- **权限隔离**: 更新进程与主应用隔离

### V. 开发体验和可维护性 ✅
- **TypeScript**: 严格类型检查所有更新相关代码
- **代码规范**: 遵循现有 ESLint 和 Prettier 配置
- **模块化提交**: 按功能模块提交代码变更
- **文档完善**: 更新相关的架构决策文档

## 技术决策

### 核心更新框架
- **electron-updater**: 作为主要的更新管理库
  - 理由：官方推荐，成熟稳定，支持增量更新和多平台
  - 支持自动下载、安装和重启
  - 内置签名验证和安全检查

### 构建系统集成
- **开发环境**: Electron Forge 用于开发编译
  - 现有项目已使用，保持开发一致性
  - 提供良好的开发体验和热重载
- **生产构建**: Electron Builder 用于 CI/CD 构建
  - 现有 electron-builder.yml 配置已完善
  - GitHub Actions 自动化构建和发布
  - 支持代码签名和公证（macOS）
- **构建桥接**: 通过 scripts/build-with-builder.js 协调
  - Forge 打包 → Builder 分发的工作流已建立
  - 保持现有构建流程，仅添加更新配置

### 发布策略
- **GitHub Releases**: 基于现有 CI/CD 流程
  - 利用现有的 build-and-release.yml 工作流
  - 自动创建标签和发布版本
  - 支持 draft 模式手动发布控制
- **构建产物分发**: 
  - Windows: NSIS 安装器 (.exe) + MSI 包
  - macOS: DMG 镜像 + ZIP 归档（支持 x64/arm64）
  - Linux: DEB 包 + AppImage（支持多架构）
- **代码签名**: 集成现有签名流程
  - macOS: 使用现有证书和公证配置
  - Windows: 计划添加代码签名支持

### 平台特定实现
```typescript
// Windows: NSIS 安装器 + 增量更新
export interface WindowsUpdateConfig {
  installerType: 'nsis';
  differentialDownload: true;
  signatureVerification: 'required';
}

// macOS: DMG 分发 + Sparkle 兼容
export interface MacOSUpdateConfig {
  installerType: 'dmg';
  codeSigningIdentity: string;
  notarization: true;
}

// Linux: AppImage 自包含更新
export interface LinuxUpdateConfig {
  installerType: 'appimage';
  updateMode: 'self-contained';
}
```

### 存储方案
**决策**: 扩展现有 electron-store 配置
```typescript
export interface UpdateStorageSchema {
  'update.config': UpdateConfiguration;
  'update.history': UpdateHistory[];
  'update.cache': {
    lastCheckTime: number;
    cachedVersionInfo: VersionInfo;
  };
}
```

## 集成点分析

### 现有架构兼容性
- **IPC 桥接**: 扩展现有 `@office-ai/platform` 桥接系统
- **设置页面**: 集成到现有设置页面结构（关于页面）
- **通知系统**: 复用现有的应用内通知框架
- **存储系统**: 使用现有的 ConfigStorage 模式
- **CI/CD 集成**: 基于现有 GitHub Actions 工作流

### 现有构建系统分析
```yaml
# 当前 CI/CD 流程 (.github/workflows/build-and-release.yml)
1. 代码质量检查 (code-quality)
   - TypeScript 检查, ESLint, Prettier
2. 跨平台构建 (build) 
   - macOS, Windows, Linux 并行构建
   - 使用 electron-builder 生成分发包
3. 自动标签创建 (create-tag)
   - 基于 package.json 版本号创建 Git 标签
4. GitHub Releases 发布 (release)
   - 需要手动审批 (environment: release)
   - 创建 draft 版本供手动发布
```

### 依赖关系更新
```json
{
  "dependencies": {
    "electron-updater": "^6.1.7",
    "semver": "^7.5.4"
  },
  "devDependencies": {
    "@types/semver": "^7.5.6"
  }
}
```

### 构建配置更新

#### electron-builder.yml 扩展
```yaml
# 添加更新配置到现有配置
publish:
  provider: github
  owner: ${env.GITHUB_REPOSITORY_OWNER:-aionui}
  repo: ${env.GITHUB_REPOSITORY_NAME:-AionUi}
  publishAutoUpdate: true  # 启用自动更新
  
# 平台特定更新配置
win:
  publisherName: "AionUi"
  verifyUpdateCodeSignature: true
  
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
  
linux:
  category: Utility
```

#### package.json 脚本更新
```json
{
  "scripts": {
    "dist:release": "node scripts/build-with-builder.js auto --publish=always",
    "dist:draft": "node scripts/build-with-builder.js auto --publish=never"
  }
}
```
```

## 阶段 2 任务生成策略

### 任务分类方法
1. **设置阶段**: 依赖安装、配置更新、类型定义
2. **测试优先**: 契约测试、集成测试（TDD 方法）
3. **核心实现**: 实体模型、更新管理器、IPC 桥接
4. **UI 集成**: 设置页面、进度组件、通知集成
5. **完善阶段**: 错误处理、性能优化、文档

### 并行化策略
- 不同文件的组件可并行开发（标记 [P]）
- 类型定义和测试可以并行创建
- UI 组件之间相对独立
- 平台特定代码可以并行实现

### 依赖关系管理
```
设置 → 测试 → 模型 → 管理器 → UI → 完善
     ↓      ↓     ↓      ↓     ↓
   并行   并行  并行   并行  集成
```

## 风险评估

### 技术风险
- **平台兼容性**: 不同平台的更新机制差异
- **权限问题**: 某些平台需要管理员权限
- **网络问题**: 下载中断和重试机制

### 缓解策略
- 充分的平台测试
- 优雅的权限请求处理
- 健壮的网络错误恢复

## 验收标准

### 功能验收
- [ ] 所有平台均可检查和下载更新
- [ ] 增量更新正常工作，减少下载量
- [ ] 更新失败时能够回滚
- [ ] 用户界面友好且响应迅速

### 性能验收
- [ ] 更新检查响应时间 < 3秒
- [ ] 后台下载不影响应用性能
- [ ] 增量更新减少下载量 ≥ 60%

### 安全验收
- [ ] 所有更新包通过签名验证
- [ ] 网络传输使用 HTTPS
- [ ] 敏感信息加密存储

**准备阶段 2**: 任务分解现在可以开始，使用 `/tasks` 命令生成具体的开发任务。