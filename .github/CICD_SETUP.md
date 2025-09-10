# CI/CD 设置指南

## 概述

这个项目配置了完整的 GitHub Actions CI/CD 流水线，支持自动构建、测试和发布到多个平台。

## 工作流说明

### 1. `build-and-release.yml` - 主构建和发布流

- **触发时机**: 推送到 `main` 分支或创建版本标签
- **功能**:
  - 代码质量检查 (ESLint, Prettier, TypeScript)
  - 多平台构建 (macOS Intel/Apple Silicon, Windows, Linux)
  - 自动发布到 GitHub Releases

### 2. `pr-check.yml` - PR 检查流

- **触发时机**: 创建或更新 Pull Request
- **功能**: 快速代码质量检查，确保 PR 质量

### 3. `manual-release.yml` - 手动发布流

- **触发时机**: 手动触发
- **功能**:
  - 手动版本升级 (patch/minor/major/prerelease)
  - 选择性平台构建
  - 自定义发布说明

## 必需的 GitHub Secrets 配置

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中配置以下 Secrets：

### macOS 应用签名 (可选，用于发布到 Mac App Store)

```
APPLE_ID=你的苹果开发者账号邮箱
APPLE_ID_PASSWORD=应用专用密码
TEAM_ID=苹果开发者团队ID
IDENTITY=签名证书名称
```

### GitHub Token (已自动提供)

```
GITHUB_TOKEN (自动提供，无需手动设置)
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

### 自动发布

1. 确保代码质量符合要求
2. 推送代码到 `main` 分支
3. 创建版本标签: `git tag v1.0.0 && git push --tags`
4. GitHub Actions 将自动构建并发布

### 手动发布

1. 访问 GitHub 仓库的 Actions 页面
2. 选择 "Manual Release" 工作流
3. 点击 "Run workflow"
4. 选择版本类型和目标平台
5. 填写发布说明
6. 点击运行

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

- `.exe` 安装程序
- 便携版应用

### Linux

- `.deb` 安装包 (多架构支持)

## 故障排查

### 常见问题

1. **macOS 签名失败**
   - 检查 Apple ID 和密码是否正确
   - 确认 Team ID 和证书名称准确
   - 验证苹果开发者账号状态

2. **构建超时**
   - 检查依赖项是否过大
   - 考虑优化构建脚本

3. **Linux 构建失败**
   - 确认系统依赖已正确安装
   - 检查 electron-forge 配置

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
