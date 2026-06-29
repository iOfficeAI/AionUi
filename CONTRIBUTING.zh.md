# 贡献指南

> **English version**: [CONTRIBUTING.md](CONTRIBUTING.md)

## 前置条件

环境搭建请参考 [docs/contributing/development.md](docs/contributing/development.md)，你需要：

- Node.js 22+
- [bun](https://bun.sh)
- [Rust stable + Cargo](https://rustup.rs)，用于构建本地 AionCore 后端
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

### 逐步执行

```bash
# 1. 格式化（必须运行 — 覆盖 .ts, .tsx, .css, .json, .md）
bun run format

# 2. Lint 检查（如果没改 .ts/.tsx 文件可跳过）
bun run lint

# 3. 类型检查（如果没改 .ts/.tsx 文件可跳过）
bunx tsc --noEmit

# 4. i18n 校验（仅当修改了 src/renderer/、locales/ 或 src/common/config/i18n/ 下的文件时）
bun run i18n:types
node scripts/check-i18n.js

# 5. 测试
bunx vitest run
```

### 一条命令替代

完全复刻 CI 质量检查，再跑测试：

```bash
prek run --from-ref origin/main --to-ref HEAD
bunx vitest run
```

> `prek` 以只读模式运行 format-check + lint + tsc。如果报错，先运行上面的自动修复命令，再重新运行 prek。

### 常见失败及修复

| 失败类型  | 修复方法                                               |
| --------- | ------------------------------------------------------ |
| 格式错误  | `bun run format`（自动修复）                           |
| Lint 错误 | `bun run lint:fix` 修复可自动修复的部分，其余手动修复  |
| 类型错误  | 修复 TypeScript 问题，重新运行 `bunx tsc --noEmit`     |
| i18n 错误 | 检查缺失的 key，运行 `bun run i18n:types` 重新生成类型 |
| 测试失败  | 修复失败的测试或实现，重新运行 `bunx vitest run`       |

## 执行方式

不符合规则时，维护者可能：

1. **关闭并要求重新提交**（首选）—— 正确重提后你保留全部署名。
2. **Cherry-pick 有价值的部分** —— 你的作者信息保留在 git 历史中，但原 PR 显示为 "Closed" 而非 "Merged"。

代码风格、依赖选择、文档润色由维护者在合并后处理。你的 PR 只需聚焦功能变更本身。
