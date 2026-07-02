# ACP Agent Skill 发现机制调研

调研日期：2026-06-29

## 调研范围

本文调研 `agent_metadata` 表中 `agent_type = 'acp'` 的 agent，重点确认：

- AionCore 如何判断 ACP agent 是否支持原生 skill 目录。
- agent 在什么时候扫描 skill 目录。
- 会话开始后临时新增 skill 是否可以被当前会话识别。

简要结论：

- ACP 协议本身没有定义标准的 skill 加载方法。
- AionCore 通过 `agent_metadata.native_skills_dirs` 判断 ACP backend 是否走原生 skill 目录。
- 会话中新增 skill 是否可用，取决于底层 agent CLI 自己的扫描或热加载能力。
- AionCore 当前只会重新链接会话创建时写入 `extra.skills` 的 skill 快照，因此产品层还没有完整支持“会话中由用户临时新增 skill”。

## ACP 协议边界

ACP v1 定义了 `session/new`、`session/load`、`session/resume`、`session/prompt` 等会话生命周期方法。`session/new` 和 `session/resume` 可以携带 workspace root、MCP servers 等上下文，但协议里没有一等的 `skill` 对象，也没有标准的“加载 skill”方法。

ACP 支持通过 `_meta` 字段和自定义扩展方法做 vendor 扩展，也支持 agent 通过 `available_commands_update` 更新 slash commands。它们是通用扩展点，不是跨 agent 可移植的 skill 加载协议。

资料来源：

- https://agentclientprotocol.com/protocol/v1/schema
- https://agentclientprotocol.com/get-started/introduction

## AionCore 当前链路

### 判断来源

`agent_metadata.native_skills_dirs` 是 ACP backend 是否使用原生 skill 目录的开关。

相关代码：

- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-db/migrations/001_initial_schema.sql`
  - Lines 153-168 定义 `native_skills_dirs` 字段。
  - Lines 191-327 seed 初始 ACP builtin agent。
- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-conversation/src/service.rs`
  - Lines 3210-3233：ACP agent 从 `agent_metadata` 查询 native skill dirs。
- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-common/src/enums.rs`
  - Lines 68-93：注释明确说明 ACP vendors 的 skill dirs 由 `agent_metadata` 管理；非 ACP 的 `Aionrs` 使用 `.aionrs/skills`。

### 会话创建时链接

创建会话时，AionCore 会计算 `initial_skills`，写入 `extra.skills`，并且只在 `initial_skills` 非空时把 skill 链接到 workspace 中。

相关代码：

- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-conversation/src/service.rs`
  - Lines 884-885：计算 `initial_skills`。
  - Lines 887-919：对支持原生 skill 目录的 agent 创建 workspace skill 链接。
  - Lines 922-927：把 `extra.skills` 写入会话。

这意味着：如果初始 skill 为空，AionCore 当前不会主动创建顶层 native skill 目录，例如 `.claude/skills`。

### 每轮发送前重新链接

发送消息和 warmup 前，AionCore 会重新确保 workspace skill links 存在，但它读取的是 session context 中的 skill 列表，而这个列表来自不可变的 `extra.skills` 快照。

相关代码：

- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-conversation/src/session_context.rs`
  - Lines 68-72：从 `extra.skills` 解析 skill 列表。
- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-conversation/src/service.rs`
  - Lines 2530-2556：发送消息前调用 `ensure_workspace_skill_links`。
  - Lines 2919-2971：重新链接 `context.skills`。
  - Lines 3206-3208：`context_skill_names(context)` 只返回 `context.skills`。
- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-conversation/src/service.rs`
  - Lines 1740-1752：拒绝会话创建后修改 `extra.skills`。

### Prompt injection fallback

如果 ACP agent 没有配置 native skill dirs，AionCore 会走 prompt injection。

相关代码：

- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-ai-agent/src/capability/first_message_injector.rs`
  - Lines 12-21：说明 native support 和 injected skills 的区别。
  - Lines 24-30：native skill discovery 使用 light mode；否则使用 heavy mode 注入 skill index。
- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-conversation/src/stream_relay.rs`
  - Lines 784-801：skill body 加载请求会被过滤到允许的 skill 列表内。
- `/Users/zhoukai/Documents/github/aioncore/crates/aionui-conversation/src/turn_orchestrator.rs`
  - Lines 309-317：`inject_skills` 会进入当前 turn，但 `allowed_skill_names` 仍然来自 context 快照。

## Builtin ACP Agent 清单

最终 builtin ACP 行来自 `001_initial_schema.sql` 和 `011_add_openclaw_acp_agent.sql`。后续迁移调整了 command 和 capability，但没有清空 seed 中已有的 `native_skills_dirs`。

| Backend     | Agent       | `native_skills_dirs` | 外部资料确认                                                             | 当前会话新增 skill                                        |
| ----------- | ----------- | -------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `claude`    | Claude Code | `.claude/skills`     | Claude Code 文档确认                                                     | 支持，但要求顶层 `.claude/skills` 在 session 启动时已存在 |
| `codex`     | Codex CLI   | `.codex/skills`      | OpenAI 当前文档写的是 `.agents/skills`，不是 `.codex/skills`             | 路径可能不匹配，需要结合 ACP adapter 和 Codex 版本复核    |
| `gemini`    | Gemini CLI  | `.gemini/skills`     | Gemini 文档确认 `.gemini/skills` 和 `/skills reload`                     | 可以支持，但通常需要触发 `/skills reload`                 |
| `qwen`      | Qwen        | `.qwen/skills`       | Qwen 文档确认 `.qwen/skills`                                             | 文档说明需要重启，不能承诺当前会话原生热加载              |
| `codebuddy` | CodeBuddy   | `.codebuddy/skills`  | CodeBuddy 文档确认 `.codebuddy/skills`                                   | 未确认热加载；文档只说明 `/skills` 展示已加载 skill       |
| `droid`     | Droid       | `.factory/skills`    | Factory 文档确认 `.factory/skills`                                       | 未确认热加载；文档只说明发现和调用方式                    |
| `goose`     | Goose       | `.goose/skills`      | 本轮未确认                                                               | 未知                                                      |
| `kimi`      | Kimi        | `.kimi/skills`       | 本轮未确认                                                               | 未知                                                      |
| `opencode`  | OpenCode    | `.opencode/skills`   | OpenCode 文档确认 `.opencode/skills`、`.claude/skills`、`.agents/skills` | 未确认热加载；文档只说明发现和按需加载                    |
| `vibe`      | Vibe        | `.vibe/skills`       | Mistral 文档确认 `.vibe/skills` 和 `.agents/skills`                      | 未确认热加载；文档只说明发现路径                          |
| `cursor`    | Cursor      | `.cursor/skills`     | 本轮未确认                                                               | 未知                                                      |
| `auggie`    | Auggie      | `NULL`               | AionCore 行没有 native dir                                               | 只能走 prompt injection                                   |
| `copilot`   | Copilot     | `NULL`               | AionCore 行没有 native dir                                               | 只能走 prompt injection                                   |
| `qoder`     | Qoder       | `NULL`               | AionCore 行没有 native dir                                               | 只能走 prompt injection                                   |
| `kiro`      | Kiro        | `NULL`               | AionCore 行没有 native dir                                               | 只能走 prompt injection                                   |
| `hermes`    | Hermes      | `NULL`               | AionCore 行没有 native dir                                               | 只能走 prompt injection                                   |
| `snow`      | Snow        | `NULL`               | AionCore 行没有 native dir                                               | 只能走 prompt injection                                   |
| `openclaw`  | OpenClaw    | `NULL`               | AionCore 行没有 native dir                                               | 只能走 prompt injection                                   |

## Agent 扫描 skill 目录的时机

### Claude Code

Claude Code 是最明确支持会话中插入 skill 的 agent。

官方文档说明：Claude Code 会自动监听所有 skill 目录中的 `SKILL.md` 变化；如果在 `~/.claude/skills/`、项目 `.claude/skills/` 或通过 `--add-dir` 加入的 `.claude/skills/` 中新增、修改、删除 skill，变更会在当前 session 生效。文档同时说明：如果 Claude Code 启动时顶层 skill 目录不存在，启动后再创建这个顶层目录需要重启 Claude Code 才能被检测到。

对 AionCore 的含义：

- 如果 `.claude/skills` 在 Claude session 启动前已经存在，那么下一轮 prompt 前插入新的 skill 软链，理论上可以在当前会话生效。
- 如果会话初始没有 skill，AionCore 没有创建 `.claude/skills`，之后再创建这个顶层目录可能不会被 Claude Code watcher 发现，需要重启。

资料来源：

- https://code.claude.com/docs/en/skills

### Codex CLI

OpenAI 当前 Codex skills 文档说明：Codex 会自动检测 skill 变化，支持 symlinked skill folders，并扫描 repo、user、admin、system 等位置。当前公开文档中的 repo 路径是 `.agents/skills`，不是 `.codex/skills`。

对 AionCore 的含义：

- 当前 builtin `codex` 行配置的是 `.codex/skills`，这和 OpenAI 当前公开文档不一致。
- 如果要支持 Codex 原生 skill，建议补充 `.agents/skills`，或者先确认 `@zed-industries/codex-acp` 对应 Codex 版本实际读取的目录。

资料来源：

- https://developers.openai.com/codex/skills

### Gemini CLI

Gemini CLI 文档说明：skills 在 session start 时从 built-in、extension、user、workspace 四个层级发现。workspace skills 可以放在 `.gemini/skills/` 或 `.agents/skills/`。getting-started 文档说明 `/skills reload` 可以在不重启 session 的情况下刷新 skill 列表。

对 AionCore 的含义：

- 链接到 `.gemini/skills` 是可行的。
- 如果要在当前会话新增 skill，需要触发 `/skills reload`，或者引导 agent/user 执行 reload。
- 可以考虑把 `.agents/skills` 也加入 Gemini 的 native dirs，提升兼容性。

资料来源：

- https://geminicli.com/docs/cli/skills/
- https://geminicli.com/docs/cli/tutorials/skills-getting-started/

### Qwen Code

Qwen Code 文档说明：个人 skills 位于 `~/.qwen/skills/`，项目 skills 位于 `.qwen/skills/`，skill 变更会在下一次 Qwen Code 启动时生效；如果 Qwen Code 已在运行，需要重启才能加载更新。

对 AionCore 的含义：

- 软链插入可以为下一次 session 准备 skill 文件。
- 它不能可靠支持同一会话内的原生热加载；如果要临时可用，应走 prompt injection 或新建会话。

资料来源：

- https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/

### CodeBuddy

CodeBuddy 文档说明：项目 skills 位于 `.codebuddy/skills/`，用户 skills 位于 `~/.codebuddy/skills/`；skill 可以由 AI 自动选择，也可以手动调用，`/skills` 会展示当前加载的 skills。

对 AionCore 的含义：

- AionCore 当前 `.codebuddy/skills` 配置与文档一致。
- 本轮查到的文档没有说明运行中新增 skill 是否会被自动检测。

资料来源：

- https://www.codebuddy.ai/docs/cli/skills

### Droid

Factory Droid 文档说明：skills 位于 `<repo>/.factory/skills/`、`~/.factory/skills/`，也兼容 `<repo>/.agent/skills/`。skill 可以通过 `/skill-name` 调用，也可以在相关任务中自动触发。

对 AionCore 的含义：

- AionCore 当前 `.factory/skills` 配置与文档一致。
- 本轮查到的文档没有说明运行中新增 skill 是否会被自动检测。

资料来源：

- https://docs.factory.ai/cli/configuration/skills

### OpenCode

OpenCode 文档说明：会查找项目 `.opencode/skills/<name>/SKILL.md`、global `~/.config/opencode/skills`、Claude-compatible `.claude/skills` 和 agent-compatible `.agents/skills`。它会从当前工作目录向上查找到 git worktree。

对 AionCore 的含义：

- AionCore 当前 `.opencode/skills` 配置匹配其中一个文档路径。
- 可以考虑额外加入 `.agents/skills` 或 `.claude/skills` 提升兼容性。
- 本轮查到的文档没有说明 live watcher 或 reload 行为。

资料来源：

- https://opencode.ai/docs/skills/

### Vibe

Mistral Vibe 文档说明：CLI 会从 `skill_paths`、受信任目录中的项目 `./.vibe/skills/` 或 `./.agents/skills/`、以及用户 `~/.vibe/skills/` 发现 skills。

对 AionCore 的含义：

- AionCore 当前 `.vibe/skills` 配置与文档一致。
- 可以考虑额外加入 `.agents/skills` 提升兼容性。
- 本轮查到的文档没有说明 live watcher 或 reload 行为。

资料来源：

- https://docs.mistral.ai/vibe/code/cli/skills

## 当前产品缺口

针对 issue 3455 中“会话开始后添加新 skill”的问题，底层能力是部分具备的，但产品链路还没闭合。

已经具备：

- AionCore 可以通过 `link_workspace_skills` 在 workspace 中创建 skill 软链。
- AionCore 会在发送消息和 warmup 前重新确保创建时快照里的 skill links。
- AionUi 的 send message 参数里已经有 `inject_skills` 字段。

缺口：

- `extra.skills` 创建后不可修改。
- `ensure_workspace_skill_links` 当前忽略 `request.inject_skills`。
- `[LOAD_SKILL: ...]` middleware 的 `allowed_skill_names` 当前忽略 `request.inject_skills`。
- 初始 skill 为空时，不会预创建 native 顶层目录。
- 没有建模 agent-specific reload policy：Claude 可以监听已存在目录，Gemini 有 `/skills reload`，Qwen 需要重启。

## 支持建议

可以支持“会话中临时添加 skill”，但应该按 agent capability 处理，而不是作为 ACP 通用能力承诺。

1. 会话创建时，只要 agent 有 `native_skills_dirs`，即使 `initial_skills` 为空，也预创建 native skill 目录。这是满足 Claude Code watcher 规则的关键。
2. 每次发送消息时，把 `conversation.extra.skills` 和 `request.inject_skills` 合并，并在 dispatch prompt 前把合并后的 skill set 链接到 workspace。
3. 把 `request.inject_skills` 纳入 `allowed_skill_names`，让 middleware 可以加载本轮临时注入 skill 的正文。
4. 增加 per-backend reload policy：
   - `claude`：prompt 前完成软链即可；前提是顶层目录在 session 启动时已存在。
   - `gemini`：prompt 前完成软链，并触发或提示 `/skills reload`。
   - `qwen`：不要承诺同会话原生热加载；用 prompt injection 或新会话。
   - 未确认热加载的 native agent：可以创建软链，但 UI/能力矩阵里标记为 best-effort。
5. 考虑更新 `agent_metadata.native_skills_dirs`，补充已被文档确认的兼容路径：
   - Codex：`.agents/skills`
   - Gemini：`.gemini/skills`、`.agents/skills`
   - OpenCode：`.opencode/skills`、`.agents/skills`，可选 `.claude/skills`
   - Vibe：`.vibe/skills`、`.agents/skills`
   - Droid：`.factory/skills`，可选 `.agent/skills`

## 结论

对 Claude Code 来说，答案基本是“可以支持”：只要 AionCore 在 session 启动前确保 `.claude/skills` 存在，那么会话中插入新的 skill 目录或软链，应该能被当前 session 识别。

对整个 ACP agent 集合来说，不能说 ACP 本身支持动态 skill 加载。AionCore 能在会话中创建文件和软链，但最终是否生效由各 agent 的扫描机制决定。产品上应该做 capability matrix，而不是把它描述为 ACP 的统一特性。
