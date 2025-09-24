# 任务：应用内自动更新

**输入**: 来自 `/specs/002-app-auto-update/` 的设计文档
**先决条件**: plan.md ✓, research.md ✓, data-model.md ✓

## 执行流程 (main)
```
1. 加载 plan.md
   → ✓ 发现：TypeScript/Electron 桌面应用，使用 electron-updater
2. 加载可选设计文档：
   → ✓ data-model.md: 5个实体（版本信息、更新包等）
   → ✓ research.md: electron-updater 集成，多平台支持
3. 按类别生成任务：
   → 设置：依赖安装、TypeScript 配置、构建配置
   → 测试：契约验证、集成场景测试
   → 核心：实体模型、更新管理器、IPC 桥接
   → 集成：UI 组件、设置页面、通知集成
   → 完善：错误处理、性能优化、文档
4. 应用任务规则：
   → 不同文件 = 标记 [P] 并行
   → 相同文件 = 顺序执行（无 [P]）
   → 测试先于实现（TDD）
5. 按顺序编号任务（T001、T002...）
6. 生成依赖关系图
7. 创建并行执行示例
8. 验证任务完整性
9. 返回：成功（任务准备执行）
```

## 格式：`[ID] [P?] 描述`
- **[P]**: 可以并行运行（不同文件，无依赖）
- 描述中包含确切的文件路径

## 阶段 3.1：设置
- [ ] T001 安装 electron-updater、semver 依赖包 
- [ ] T002 [P] 创建 src/common/updateTypes.ts 类型定义
- [ ] T003 [P] 更新 electron-builder.yml 配置发布设置
- [ ] T004 [P] 更新 package.json 脚本支持发布配置
- [ ] T005 [P] 创建更新相关的 ESLint 和 TypeScript 配置

## 阶段 3.2：测试优先 (TDD) ⚠️ 必须在 3.3 之前完成
**关键：这些测试必须编写并且必须失败，然后才能进行任何实现**
- [ ] T006 [P] 手动更新检查契约测试 tests/contracts/test_manual_update_check.ts
- [ ] T007 [P] 强制更新契约测试 tests/contracts/test_forced_update.ts
- [ ] T008 [P] 下载进度契约测试 tests/contracts/test_download_progress.ts  
- [ ] T009 [P] 版本比较集成测试 tests/integration/test_version_comparison.ts
- [ ] T010 [P] 更新安装集成测试 tests/integration/test_update_installation.ts
- [ ] T011 [P] 强制更新启动检查集成测试 tests/integration/test_forced_update_startup.ts
- [ ] T012 [P] 多平台更新集成测试 tests/integration/test_cross_platform.ts

## 阶段 3.3：核心实现（仅在测试失败后）
- [ ] T013 [P] 版本信息模型（含最低版本要求）src/common/models/VersionInfo.ts
- [ ] T014 [P] 更新包模型 src/common/models/UpdatePackage.ts
- [ ] T015 [P] 更新会话模型 src/common/models/UpdateSession.ts
- [ ] T016 [P] 强制更新配置模型 src/common/models/ForceUpdateConfig.ts
- [ ] T017 [P] 扩展现有存储系统 src/common/storage.ts
- [ ] T018 [P] 扩展现有 IPC 桥接 src/common/ipcBridge.ts  
- [ ] T019 更新 IPC 桥接实现 src/process/bridge/updateBridge.ts
- [ ] T020 主进程更新管理器 src/process/services/UpdateManager.ts
- [ ] T021 版本检查器服务（含强制更新检查）src/common/services/VersionChecker.ts
- [ ] T022 强制更新检查器服务 src/common/services/ForceUpdateChecker.ts
- [ ] T023 下载管理器服务 src/common/services/DownloadManager.ts

## 阶段 3.4：UI 集成
- [ ] T024 [P] 更新检查 Hook src/renderer/hooks/useAutoUpdate.ts
- [ ] T025 [P] 渲染进程更新服务 src/renderer/services/UpdateService.ts
- [ ] T026 [P] 更新状态组件 src/renderer/components/update/UpdateStatus.tsx
- [ ] T027 [P] 更新进度组件 src/renderer/components/update/UpdateProgress.tsx  
- [ ] T028 [P] 更新对话框组件 src/renderer/components/update/UpdateDialog.tsx
- [ ] T029 [P] 强制更新对话框组件 src/renderer/components/update/ForceUpdateDialog.tsx
- [ ] T030 扩展关于页面集成更新功能 src/renderer/pages/settings/About.tsx
- [ ] T031 应用启动时强制更新检查集成 src/renderer/App.tsx
- [ ] T032 更新 i18n 翻译文件添加更新相关文本

## 阶段 3.5：完善
- [ ] T033 [P] 更新错误处理 src/common/errors/UpdateErrors.ts
- [ ] T034 [P] 单元测试更新配置 tests/unit/test_update_config.ts
- [ ] T035 [P] 单元测试版本比较 tests/unit/test_version_comparison.ts
- [ ] T036 [P] 单元测试强制更新逻辑 tests/unit/test_forced_update.ts
- [ ] T037 [P] 性能测试更新下载 tests/performance/test_download_speed.ts
- [ ] T038 [P] 更新用户文档 docs/features/auto-update.md
- [ ] T039 代码重构和优化
- [ ] T040 端到端测试验证（含强制更新场景）

## 依赖关系
- 测试（T006-T012）必须在实现（T013-T023）之前
- T013-T017 模型和 T018 桥接接口必须在 T019-T023 实现之前
- T018 IPC 桥接接口阻塞 T019 桥接实现
- T019 IPC 桥接实现阻塞 T020 更新管理器
- T020 更新管理器阻塞所有 UI 组件（T024-T032）
- T031 应用启动检查需要 T022 强制更新检查器服务
- 实现阶段必须在完善阶段（T033-T040）之前

## 并行执行示例
```bash
# 启动 T006-T012 测试任务：
Task: "手动更新检查契约测试 tests/contracts/test_manual_update_check.ts"
Task: "强制更新契约测试 tests/contracts/test_forced_update.ts"
Task: "下载进度契约测试 tests/contracts/test_download_progress.ts"
Task: "版本比较集成测试 tests/integration/test_version_comparison.ts"
Task: "强制更新启动检查集成测试 tests/integration/test_forced_update_startup.ts"

# 启动 T013-T017 模型任务：
Task: "版本信息模型（含最低版本要求）src/common/models/VersionInfo.ts"
Task: "更新包模型 src/common/models/UpdatePackage.ts"
Task: "更新会话模型 src/common/models/UpdateSession.ts"
Task: "强制更新配置模型 src/common/models/ForceUpdateConfig.ts"
Task: "扩展现有存储系统 src/common/storage.ts"
```

## 平台特定任务

### Windows 平台
- [ ] T034 [P] 配置 NSIS 安装器支持 windows/installer.nsi
- [ ] T035 [P] Windows 代码签名配置 scripts/sign-windows.js
- [ ] T036 [P] Windows 增量更新测试 tests/platform/test_windows_delta.ts

### macOS 平台
- [ ] T037 [P] 配置 DMG 分发设置 build/dmg-background.png
- [ ] T038 [P] macOS 代码签名和公证 scripts/notarize-macos.js
- [ ] T039 [P] macOS Sparkle 兼容测试 tests/platform/test_macos_sparkle.ts

### Linux 平台
- [ ] T040 [P] AppImage 自更新配置 build/appimage-builder.yml
- [ ] T041 [P] Linux 权限处理 src/platform/linux/permissions.ts
- [ ] T042 [P] Linux 分发测试 tests/platform/test_linux_appimage.ts

## 注意事项
- [P] 任务 = 不同文件，无依赖关系
- 在实现前验证测试失败
- 每个任务后提交代码
- 避免：模糊任务、相同文件冲突

## 任务生成规则
*在 main() 执行期间应用*

1. **来自契约**:
   - 每个更新操作 → 契约测试任务 [P]
   - 每个 API 端点 → 实现任务

2. **来自数据模型**:
   - 每个实体 → 模型创建任务 [P]
   - 关系 → 服务层任务

3. **来自用户故事**:
   - 每个场景 → 集成测试 [P]
   - 快速开始场景 → 验证任务

4. **排序**:
   - 设置 → 测试 → 模型 → 服务 → UI → 完善
   - 依赖关系阻止并行执行

## 验证清单
*由 main() 在返回前检查*

- [x] 所有契约都有对应的测试
- [x] 所有实体都有模型任务
- [x] 所有测试都在实现之前
- [x] 并行任务真正独立
- [x] 每个任务指定确切的文件路径
- [x] 没有任务修改与其他 [P] 任务相同的文件

## 特殊配置任务

### CI/CD 集成（基于现有 GitHub Actions）
- [ ] T043 [P] 扩展现有 GitHub Actions 工作流 .github/workflows/build-and-release.yml
- [ ] T044 [P] 更新构建脚本支持自动更新 scripts/build-with-builder.js  
- [ ] T045 [P] 配置更新服务器检测 scripts/update-server-check.js

### 监控和分析
- [ ] T046 [P] 更新使用统计收集 src/common/analytics/UpdateAnalytics.ts
- [ ] T047 [P] 错误报告集成 src/common/reporting/UpdateErrorReporter.ts
- [ ] T048 [P] 更新性能监控 src/common/monitoring/UpdatePerformance.ts

这个任务列表遵循 Spec-Kit 的 TDD 原则，确保在实现任何功能之前先创建失败的测试，并且任务已优化为并行执行以提高开发效率。