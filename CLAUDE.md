@AGENTS.md

---

# Agent self-notes（agent 自用，跟上面 AGENTS.md 不同：AGENTS.md 是给所有 contributor 的规范，本节是 agent 在工作中**验证过且不易猜到**的事实/踩坑）

> 容量约束：AGENTS.md (~136 行) + 本节合计 ≤ 300 行；接近时把本节拆出去到 `docs/agents/notes.md` 用 `@docs/agents/notes.md` 引用。
> 跨 Electron 项目通用的事实不写这里，去看/写 `~/.claude/topics/electron.md`。

## 已验证的事实

### CI / Codecov
- 仓库根有两份 codecov 配置：`codecov.yml`（无点）和 `.codecov.yml`（有点）。**生效的是 `codecov.yml`**（Codecov 优先无点版本）。
- `codecov.yml` 中 patch 和 project 都写了 `informational: true` —— **`codecov/patch` 和 `codecov/project` 永远 pass，不会阻塞合并**。Codecov bot 评论里的 ❌ 只是它自己的视觉打分，不影响 CI 状态。
- `codecov.yml` patch target = 50%，但因 informational 实际不强制。
- 全局 GitHub Codecov 默认不是 80%；80% 是 Codecov 网站 UI 推荐值或某些项目自己写死的，跟工具默认无关。

### 构建
- 构建 deb 必须先把 bundled bun 链到 PATH，否则 `scripts/build-with-builder.js` 调 `bunx electron-vite build` 时找不到 `bunx`：
  ```bash
  mkdir -p /tmp/aionui-bin
  ln -sf /home/cheat/AionUi/resources/bundled-bun/linux-x64/bun /tmp/aionui-bin/bun
  ln -sf /home/cheat/AionUi/resources/bundled-bun/linux-x64/bun /tmp/aionui-bin/bunx
  PATH="/tmp/aionui-bin:$PATH" npm run build-deb
  ```
- 输出：`out/AionUi-<version>-linux-amd64.deb`
- **打 release 前必须 native rebuild**（关键包：`better-sqlite3`）。具体命令见 `~/.claude/topics/electron.md`。AionUi 当前用 Electron 37 内置 Node 22。

### Push / PR / OAuth scope
- 用户 gh token scopes 只有 `gist, read:org, repo`，**没有 `workflow` scope**。
- 推送到 fork 的分支若包含 `.github/workflows/*.yml` 的新增/修改会被 GitHub 拒绝（"refusing to allow an OAuth App to create or update workflow ..."）。
- fork/main 比 origin/main 落后多个版本，不含 `.github/workflows/release-distribute.yml`，所以基于 fork 派生的分支也都缺该文件。
- 后果：开 PR 到 iOfficeAI/AionUi 时 diff 会显示该 workflow 文件被"删除"。这是 token scope 限制——必须在 PR 描述里告诉 reviewer 忽略。

### 测试
- 项目用 vitest。命令：`npx vitest run <files>`。
- 跑全量测试不要直接动，挑修改路径相关的测试集运行即可。
- 关键 dom 测试集合（白屏/UI 类改动后建议跑这套）：
  ```
  tests/unit/chat/messageHistory.test.ts
  tests/unit/chat/sendboxHistory.dom.test.tsx
  tests/unit/renderer/components/layout/Layout.resize.dom.test.tsx
  tests/unit/renderer/hooks/useResizableSider.dom.test.tsx
  tests/unit/renderer/platformSendBoxes.dom.test.tsx
  tests/unit/useGeminiMessage.dom.test.ts
  ```

### Lint / 格式
- `npm run format` = `oxfmt`（项目脚本里就一个字）。提交前必跑，否则 prek 会卡 Code Quality。
- 本地装 prek：`npm install -g @j178/prek`，跑 `prek run --from-ref origin/main --to-ref HEAD` 模拟 CI。
- 本地 oxlint 版本可能比 CI 低，会报 "`no-await-thenable` rule not found"——CI 用 oxlint 1.56.0+，本地报错可忽略。

### tsconfig
- `tsconfig.json` **没开 `strict` 和 `noImplicitReturns`**。函数声明返回 `T` 但实际隐式返回 `undefined` 编译能过——**这是真实 bug 源**（见下文 transformMessage 教训）。

## 踩过的坑 / 教训

### 白屏 root cause 模式（每次 AI 回复白屏）
- `src/common/chat/chatLib.ts: transformMessage()` 声明返回 `TMessage`，但 `request_trace / info / system / acp_model_info / acp_context_usage / available_commands / 默认 case` 都是 `break;` 隐式返回 `undefined`。
- 各 platform message hook（`useAionrsMessage` / `useGeminiMessage` / `useAcpMessage`）的 default case 把 `transformMessage(msg)` 直接喂给 `addOrUpdateMessage`。
- `useAddOrUpdateMessage` 不检查 undefined → push `{message: undefined}` 进队列 → `flush` 中 `item.message.conversation_id` 抛 "Cannot read properties of undefined (reading 'conversation_id')" → 被 ErrorBoundary 抓 → 白屏。
- 关键症状：**aionrs 上每次新 turn 必发 `request_trace`，所以稳定复现**；其他 platform 因为显式处理了 request_trace 不会立刻炸但仍有同类风险。
- 根因修复：在入口 `useAddOrUpdateMessage` 加 `if (!message) return`，并把 `transformMessage` 返回类型如实改成 `TMessage | undefined`。

### AgentModeSelector 权限模式 UI 不刷新
- aionrs 后端每次 setMode 都广播 `config_changed`，AionrsSendBox 的 `onConfigChanged` 调 `setDynamicModes(mergeWithCapabilities(...))`，**`mergeWithCapabilities` 每次返回新数组引用**。
- AgentModeSelector 单个 useEffect 同时依赖 `[initialMode, modes, defaultMode]` → modes 引用变化触发 → 把 currentMode 回退到 stale 的 `initialMode` prop → UI 显示老值。
- 修复：拆成两个 effect，"parent 驱动的 initialMode 同步" 与 "modes 变化时仅当 currentMode 已不在新列表中才回退" 分开。

### 上游同步状态（更新时维护）
- 截至 2026-04-30：origin/main 是 `e01a16d47`（v1.9.23）；fork/main 是 `ed8a6bcd3`（v1.9.21 时代）；当前工作分支 `cheats1314/fix-aionui-v1.9.22-full-no-workflow`。
- 工作分支首个大 commit 是 squashed v1.9.22 迁移（`7b87fbb7c`），后续是修 bug 的小 commit。
- 开 PR 前最好先把 1.9.22→1.9.23 的小改动（package.json 版本、readme WeChat QR wx-6→wx-7、resources/wx-*.png）拉一次，避免 PR diff 出现"反向删除上游变更"的噪音。

## 架构决策 / 长期方向

### 定时任务绑定模型
- 旧实现依赖 `conversation.extra.cronJobId` 的**单值绑定**：一个会话只能绑一个定时任务，已绑定的会话再绑别的任务会冲突；微信等远程通道绑定的会话顶部也缺一致的定时任务入口。
- 用户的方向：**多对多绑定 + 统一 UI 一键绑定 + 远程通道一致入口**。后续不要再用一次性数据库手改，要走产品级关联表/UI。
- 做这块功能时回头核对：当前代码里 `cronJobId` 是不是仍是单值字段？

## 项目内的用户偏好
- 修 bug 之前用户要求**先彻查根因，不要一上来就改防护**（"原因不清楚彻查之前不要进行修复"）。
- 提 PR 时希望**整合所有 commit 内容到 PR 描述**，按类别整理。
- 用户用 cc-switch 管理 Claude provider；Claude Code 官方账号登录路径要在 cc-switch 里手动选 "Anthropic Official" provider 才生效。
