# CI/CD 设置指南

## 概述

这个项目配置了完整的 GitHub Actions CI/CD 流水线，支持自动构建、测试和发布到多个平台。

## 工作流说明

### 1. `build-and-release.yml` - 主构建和发布流

- **触发时机**: 仅推送到 `main` 分支
- **功能**:
  - 代码质量检查 (ESLint, Prettier, TypeScript)
  - 多平台构建 (macOS Intel/Apple Silicon, Windows, Linux)
  - 自动创建版本标签
  - 创建 Draft Release (需要手动审批和发布)
- **流程**:
  1. 代码质量检查
  2. 三平台并行构建
  3. 自动创建基于 package.json 版本的标签
  4. 等待环境审批
  5. 创建 Draft Release (需要手动编辑和发布)

## 必需的 GitHub Secrets 配置

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中配置以下 Secrets：

### macOS 应用签名 (可选，用于发布到 Mac App Store)

```
APPLE_ID=你的苹果开发者账号邮箱
APPLE_ID_PASSWORD=应用专用密码
TEAM_ID=苹果开发者团队ID
IDENTITY=签名证书名称
```

### GitHub Token

```
GH_TOKEN=你的Personal Access Token (github_pat_开头)
```

**注意**: 需要手动配置，因为需要 `contents: write` 权限来创建 releases。

### Environment Secrets

在 Settings → Environments → release 中也需要配置：

```
GH_TOKEN=相同的Personal Access Token
```

## 如何获取 Apple 签名配置

### 1. Apple ID App-Specific Password

1. 访问 [appleid.apple.com](https://appleid.apple.com)
2. 登录你的 Apple ID
3. 在"Sign-In and Security"部分点击"App-Specific Passwords"
4. 生成新的应用专用密码
5. 复制生成的密码作为 `APPLE_ID_PASSWORD`

### 2. Team ID

1. 访问 [Apple Developer Portal](https://developer.apple.com/account/)
2. 在"Membership Details"中找到 Team ID
3. 复制 Team ID 作为 `TEAM_ID`

### 3. 签名证书 Identity

1. 打开 Xcode 或 Keychain Access
2. 查看已安装的开发者证书
3. 证书名称类似："Developer ID Application: Your Name (TEAM_ID)"
4. 复制完整证书名称作为 `IDENTITY`

## 使用方法

### 推荐发布流程 (使用 release.sh)

1. 确保代码质量符合要求
2. 使用发布脚本升级版本:

   ```bash
   # 修复版本
   ./scripts/release.sh patch

   # 功能版本
   ./scripts/release.sh minor

   # 重大版本
   ./scripts/release.sh major

   # 预发布版本
   ./scripts/release.sh prerelease
   ```

3. 脚本会自动:
   - 运行代码质量检查
   - 升级版本号
   - 创建 git tag
   - 推送到 main 分支
4. GitHub Actions 自动触发构建
5. 在 Deployments 页面审批发布
6. 编辑 Draft Release 内容
7. 手动发布给用户

### 直接推送发布

1. 手动修改 `package.json` 中的版本号
2. 提交并推送到 `main` 分支
3. GitHub Actions 将自动构建并创建 Draft Release

### 版本管理规范

- `patch`: 修复bug (1.0.0 → 1.0.1)
- `minor`: 新功能 (1.0.0 → 1.1.0)
- `major`: 重大更新 (1.0.0 → 2.0.0)
- `prerelease`: 预发布版本 (1.0.0 → 1.0.1-beta.0)

## 构建产物

成功构建后，将生成以下文件：

### macOS

- `.dmg` 文件 (Intel 和 Apple Silicon 版本)
- 应用程序包

### Windows

- `.exe` NSIS 安装程序 (x64/arm64)
- `.zip` 便携版应用 (x64/arm64)

### Linux

- `.deb` 安装包 (x64/arm64/armv7l)
- `.AppImage` 便携式应用 (x64/arm64/armv7l)

## 故障排查

### 常见问题

1. **Release创建失败 (403错误)**
   - 检查 GH_TOKEN 是否正确配置
   - 确认 token 格式为 `github_pat_` 开头
   - 验证 repository 和 environment 中都有 GH_TOKEN

2. **macOS 签名失败**
   - 检查 Apple ID 和密码是否正确
   - 确认 Team ID 和证书名称准确
   - 验证苹果开发者账号状态

3. **构建超时 (Windows)**
   - Windows 构建通常最慢 (可能40分钟+)
   - 考虑禁用 MSI target 加速构建

4. **重复tag错误**
   - CI/CD 会检查并跳过已存在的 tag
   - 如果手动创建了 tag，CI/CD 不会重复创建

### 调试方法

1. 查看 GitHub Actions 日志
2. 本地运行相同的构建命令测试
3. 检查 package.json 中的构建脚本

## 安全建议

1. 定期更新 GitHub Actions 版本
2. 使用最小权限原则配置 Secrets
3. 定期审查和清理未使用的 Secrets
4. 监控构建日志，避免敏感信息泄露

## 进阶配置

### 自动更新检查

可以集成应用内自动更新功能，配合 GitHub Releases API 实现自动更新提醒。

### 多环境部署

可以扩展工作流支持开发、测试、生产环境的分别部署。

### 性能优化

- 使用构建缓存加速构建
- 并行构建不同平台
- 优化依赖安装速度
