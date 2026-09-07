# 贡献指南

> **English version**: [CONTRIBUTING.md](CONTRIBUTING.md)

## 前置条件

环境搭建请参考 [docs/contributing/development.md](docs/contributing/development.md)，你需要：

- Node.js 22+
- [bun](https://bun.sh)
- [Rust stable + Cargo](https://rustup.rs)，用于构建本地 GEACore 后端
- [prek](https://github.com/j178/prek)（`npm install -g @j178/prek`）

## 规则一：原子化 PR

每个 PR 只能包含**一个不可再拆的 feature 或一个 bug fix**。

**判断方法：** 问自己（或 AI）：_"这个 diff 能否拆成多个独立可合并的 PR？"_ 如果能，提交前必须拆分。

### 示例

**可接受（单个 PR）：**

- 一个根因的 bug 修复，即使涉及多个文件（例如修复 toast 在 modal 和聊天层的 z-index 问题）
- 一个完整的功能（例如团队创建弹窗及其表单校验）

**必须拆分成多个 PR：**

- 团队聊天滚动修复 + Sentry 用户追踪 + Office 预览性能优化 = 3 个 PR
- 多个不相关的 bug 修复打包在一起（例如标题栏导航修复 + i18n 缺失 key + 语音输入 UI 修复）
- 独立的技术层（例如 IPC 桥接重构 + 渲染进程组件 + Worker 进程变更，分属不相关的功能）

## 规则二：Commit 和 PR 标题格式

Commit message 和 PR 标题必须使用英文 Conventional Commit 格式：

```text
<type>(<scope>): <subject>
```

`type` 必须使用以下取值之一：

| Type       | 含义       | Changelog 可见性 |
| ---------- | ---------- | ---------------- |
| `feat`     | 新用户功能 | 可见             |
| `fix`      | Bug 修复   | 可见             |
| `perf`     | 性能优化   | 可见             |
| `refactor` | 代码重构   | 可见             |
| `docs`     | 文档       | 可见             |
| `style`    | 格式或样式 | 隐藏             |
| `chore`    | 维护工作   | 隐藏             |
| `test`     | 测试       | 隐藏             |
| `ci`       | CI 配置    | 隐藏             |
| `build`    | 构建系统   | 隐藏             |

示例：

- `fix(preview): restore local html loading`
- `feat(workspace): add file preview shortcuts`
- `docs(contributing): document pr title format`

## 规则三：Push 前必须通过本地检查

CI 会在这些检查失败时拒绝你的 PR。**推送前**在本地运行，节省时间。

### 推荐流程

```bash
# 开发过程中快速反馈
just quick-check

# 运行与本次改动最接近的定向测试
bunx vitest run <test-file>

# 最终提交只运行一次完整本地门禁，通过后自动推送
just push <remote> <branch>
```

`just quick-check` 会运行格式检查、严格 lint、类型检查和 i18n 校验，但不会运行完整单元测试。开发过程中将它和最接近本次改动的定向测试配合使用；最终提交再由 `just push` 运行快速门禁和完整单元测试，通过后调用 `git push`。当前分支已有 upstream 时可省略 `<remote> <branch>`。

创建 PR 后使用 `just watch-pr <PR 编号>` 连续等待检查结果，不再反复手工轮询 GitHub。该命令默认从 `origin` 解析仓库；只有 PR 位于其他已配置远端时，才传入第二个远端名称参数。

个人 Fork 无法使用 GitHub 仅面向组织仓库的原生 merge queue。合并已得到明确授权时，可使用 `just integrate-pr <PR 编号>` 作为安全失败的本地替代：命令只接受目标为 `main`、已开放且非 Draft 的 PR，在当前 clone 内串行执行，先更新分支，等待至少一项 required check，再用已验收的精确 head commit 做 squash merge。该命令会修改远端状态并合并 PR，只读监控时不得运行；本地锁只能协调共用同一 clone 的操作者，不能跨机器。若 `main` 或 PR head 发生变化，应重新执行并由分支保护要求新一轮检查。

只有门禁失败、需要定位或修复时，才单独运行下面的命令：

```bash
bun run format          # 修复格式
bun run lint:fix        # 修复可自动修复的 lint 问题
bunx tsc --noEmit       # 定位类型错误
bun run i18n:types      # 重新生成 i18n 类型
node scripts/check-i18n.js
bunx vitest run         # 复现单元测试失败
```

### 常见失败及修复

| 失败类型  | 修复方法                                               |
| --------- | ------------------------------------------------------ |
| 格式错误  | `bun run format`（自动修复）                           |
| Lint 错误 | `bun run lint:fix` 修复可自动修复的部分，其余手动修复  |
| 类型错误  | 修复 TypeScript 问题，重新运行 `bunx tsc --noEmit`     |
| i18n 错误 | 检查缺失的 key，运行 `bun run i18n:types` 重新生成类型 |
| 测试失败  | 修复失败的测试或实现，重新运行 `bunx vitest run`       |

## 规则四：保持 Required CI Context 完整

修改 Pull Request workflow 时：

- 读取当前生效的 GitHub ruleset，按精确 job 名称覆盖每个 required status-check context。
- Required checks 只保留一套权威 workflow；不得依赖路径过滤让 required workflow 不触发，否则 GitHub 可能让对应状态停在 `Expected`。
- 文件分类必须安全回退：API 失败、文件列表为空或路径无法识别时运行完整 CI。
- 交付前验证四条路线：纯代码、纯文档、代码与文档混合、分类失败。

## 规则五：Agent 管理的 PR 跟进

用户明确要求 Agent 提交 PR 时：

1. 解析并说明 push remote 与 PR base。默认目标为用户个人 Fork；官方/upstream 目标必须由用户当轮明确授权。
2. 只提交和推送本次目标文件，以 **Ready for review** 而非 Draft 状态创建 PR，并一次写好最终标题、说明、关联 Issue 和验证证据。
3. 持续监控 required checks、审查意见、未解决 thread、冲突和可合并状态；有明确问题时在同一分支做聚焦修复，并持续更新同一 PR。
4. Required checks 全部通过、没有未解决的阻断审查或 thread、分支已更新且可合并、最终 diff 已审计时，自动合并 PR。
5. 重新查询已合并 PR，并按 `docs/agents/issue-tracker.md` 收口关联 Issue。

权限、外部依赖或必须由人决定的事项阻止继续时，报告精确阻塞条件，不得降低或绕过门禁。

## 执行方式

不符合规则时，维护者可能：

1. **关闭并要求重新提交**（首选）—— 正确重提后你保留全部署名。
2. **Cherry-pick 有价值的部分** —— 你的作者信息保留在 git 历史中，但原 PR 显示为 "Closed" 而非 "Merged"。

代码风格、依赖选择、文档润色由维护者在合并后处理。你的 PR 只需聚焦功能变更本身。

## 本地构建与发布产物

日常使用 `bun run build` 只编译客户端，不生成安装包。需要 Mac 安装包时使用 `bun run dist:mac`，默认只生成本机架构的 DMG；可用 `build-mac:arm64` 或 `build-mac:x64` 指定架构。Windows 使用 `build-win:x64` 或 `build-win:arm64` 生成 EXE。

正式发布只构建 macOS、Windows 的 x64 和 arm64 安装包（DMG / EXE），不附带 ZIP、Linux 包或 Web CLI 包。保留 Windows 更新元数据；macOS 通过 DMG 手动安装，不发布依赖 ZIP 的自动更新元数据。GEA 自动更新仍由现有服务策略关闭。构建失败后的重试沿用原始目标，避免额外生成 ZIP。
