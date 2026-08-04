# 发布安全档案

本文记录 CSBU WorkMate 的发布事故、根因和强制门禁。执行正式发布前必须阅读本文和 [bump-version 技能](../../.claude/skills/bump-version/SKILL.md)。

## 2026-08-03：v2.1.48 跨平台构建失败

### 事故经过

- `v2.1.48` 在源码检查通过后创建了正式标签。
- 该版本同时升级到 Electron 42；发布矩阵随后在 macOS x64、macOS ARM64 和 Linux ARM64 的 Electron 原生模块重建阶段失败。
- 标签发布后才发现兼容性问题，说明 lint、TypeScript、单元测试和普通 PR 门禁不能替代原生桌面打包验证。
- 修复通过独立 PR 将 Electron 恢复到 37 兼容线，并发布新补丁版本 `v2.1.49`。`v2.1.48` 标签保留为失败历史，没有删除、移动或覆盖。
- `v2.1.49` 六个平台桌面构建与五个平台 Web CLI 构建全部成功，但工作流生成的 Release 默认仍为草稿；手动发布草稿后，公共下载页面才真正可用。

### 根因

1. Electron 重大版本升级没有在生产标签前完成六平台原生构建验证。
2. 将“标签已推送”或“工作流已启动”误当成“版本已发布”会过早结束发布操作。
3. `.github/workflows/build-and-release.yml` 明确使用 `draft: true`，所以即使 Create Release 作业成功，仍必须检查并发布草稿。
4. 同时配置 `origin` 和 `upstream` 时，未显式传递 `--repo` 的 `gh` 命令可能查询或操作错误仓库。

## 2026-08-03：Windows 通知触发主进程原生崩溃

### 事故经过与根因

- Electron 37.10.3 主进程运行约 11 分 39 秒后，在创建 Windows toast 通知时以 `0xC0000005` 退出。
- WinDbg 使用 Electron 37.10.3 官方 PDB 符号化后，异常栈为
  `FileVersionInfoWin::GetValue → product_name → GetApplicationName → GetAppUserModelID → WindowsToastNotification::Initialize`。
- 发布构建曾主动删除应用、安装器和卸载器的 `VERSIONINFO`。Electron 随后读取缺失的 `ProductName`，在
  `FileVersionInfoWin::GetValue` 中解引用空指针并访问 `0x28`。
- 品牌名称字符串本身不是根因；删除品牌和版本资源才是直接触发条件。

### 强制门禁

- Windows 应用、安装器和卸载器必须保留 `CompanyName`、`FileVersion`、`ProductName` 和 `ProductVersion`。
- 禁止使用 Resource Hacker、`!packhdr` 或其他发布步骤删除 `VERSIONINFO`。
- 主进程应在创建通知前显式设置 AppUserModelID，但该设置不能替代保留可执行文件版本资源。

## 强制门禁

### 生产标签前

- 工作区必须干净，`main` 必须与 `origin/main` 同步。
- 显式确认 WorkMate 版本、AionCore 固定版本、Electron、`electronRebuild.electronVersion` 和 electron-builder。
- AionCore Release 必须公开，并包含六个平台归档及校验文件。
- Electron、原生模块或打包工具有变更时，必须拆分为独立 PR，并先使用候选版本完成六平台桌面构建；不得让正式生产标签成为第一次跨平台验证。
- 正式标签必须是从已通过主分支门禁的合并提交创建的新版本号。

### 标签推送后

必须持续跟踪 `build-and-release.yml`，直至全部完成：

- Code Quality；
- macOS x64/ARM64；
- Windows x64/ARM64；
- Linux x64/ARM64；
- 五个平台 Web CLI 打包及冒烟测试；
- Create Release。

任何必要任务失败，都不能发布残缺 Release。修复后递增版本号；禁止删除、覆盖或重新指向已经推送的正式标签。

### Release 完成定义

同时满足以下条件才允许宣布发布完成：

- 工作流最终结论为 `success`；
- Release 的 `isDraft` 为 `false`，`publishedAt` 非空；
- 公共链接格式为 `/releases/tag/vX.Y.Z`，不能是 `untagged-*` 草稿链接；
- 所有资产状态为 `uploaded`；
- 至少核对 Windows 安装包、macOS 两种架构、Linux 两种架构、自动更新元数据、校验文件、Web CLI 压缩包和 `install-web.sh`。

常用核验命令：

```bash
gh run view --repo suoak/AionUi <run-id> --json status,conclusion,url,jobs
gh release view --repo suoak/AionUi vX.Y.Z \
  --json url,isDraft,isPrerelease,publishedAt,assets
gh release edit --repo suoak/AionUi vX.Y.Z --draft=false
```

## 已验证的恢复基线

- CSBU WorkMate：`v2.1.49`
- AionCore：`v0.1.60`
- Electron：`^37.10.3`
- `electronRebuild.electronVersion`：`^37.10.3`
- 成功流水线：[v2.1.49 Build and Release](https://github.com/suoak/AionUi/actions/runs/30797482661)
- 公共版本：[CSBU WorkMate v2.1.49](https://github.com/suoak/AionUi/releases/tag/v2.1.49)
- Core 版本：[AionCore v0.1.60](https://github.com/suoak/AionCore/releases/tag/v0.1.60)

以上版本是本次事故后的已验证基线，不代表依赖永远不能升级；升级时必须重新通过完整门禁。
