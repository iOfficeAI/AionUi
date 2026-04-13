# AionUi - Project Guide

All contributors (human and AI) must follow [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. ([Chinese version](CONTRIBUTING.zh.md))

## Code Conventions

### File & Directory Structure

- **Directory size limit**: A single directory must not exceed **10** direct children (files + subdirectories). Split by responsibility when approaching this limit.

See [docs/conventions/file-structure.md](docs/conventions/file-structure.md) for complete rules on directory naming, page module layout, and shared vs private code placement. Agents working in this repository must also read and follow the `architecture` skill (`.claude/skills/architecture/SKILL.md`) when creating files, modules, or making structure decisions.

### Naming

- **Components**: PascalCase (`Button.tsx`, `Modal.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Hooks**: camelCase with `use` prefix (`useTheme.ts`)
- **Constants files**: camelCase (`constants.ts`) — values inside use UPPER_SNAKE_CASE
- **Type files**: camelCase (`types.ts`)
- **Style files**: kebab-case or `ComponentName.module.css`
- **Unused params**: prefix with `_`

### UI Library & Icons

- **Components**: `@arco-design/web-react` — no raw interactive HTML (`<button>`, `<input>`, `<select>`, etc.)
- **Icons**: `@icon-park/react`

### CSS

- Prefer **UnoCSS utility classes**; complex styles use **CSS Modules** (`ComponentName.module.css`)
- Colors must use **semantic tokens** from `uno.config.ts` or CSS variables — no hardcoded values
- Arco overrides go in the component's CSS Module via `:global()` — no global override files
- Global styles only in `src/renderer/styles/`

See [docs/conventions/file-structure.md](docs/conventions/file-structure.md) for full CSS and UI library rules.

### TypeScript

- Strict mode enabled — no `any`, no implicit returns
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`, `@worker/*`
- Prefer `type` over `interface` (per Oxlint config)
- English for code comments; JSDoc for public functions

### Architecture

Three process types — never mix their APIs:

- `src/process/` — main process, no DOM APIs
- `src/renderer/` — renderer, no Node.js APIs
- `src/process/worker/` — fork workers, no Electron APIs

Cross-process communication must go through the IPC bridge (`src/preload.ts`).
See [docs/tech/architecture.md](docs/tech/architecture.md) for details.

## Testing

**Framework**: Vitest 4 (`vitest.config.ts`). Run `bun run test` before every commit. Coverage target ≥ 80%.

See the `testing` skill (`.claude/skills/testing/SKILL.md`) for complete workflow, quality rules, and checklist.

## Code Quality

**During development** — auto-fix as you edit:

```bash
bun run lint:fix       # auto-fix lint issues in .ts / .tsx (oxlint)
bun run format         # auto-format .ts / .tsx / .css / .json / .md (oxfmt)
bunx tsc --noEmit      # verify no type errors
```

**Before every PR** — run the full CI check locally to catch everything CI catches (end-of-file, trailing whitespace, all file types):

```bash
# One-time setup
npm install -g @j178/prek

# Replicate exact CI check (read-only — does not auto-fix)
prek run --from-ref origin/main --to-ref HEAD
```

> Note: `prek` uses `lint` (check only) and `format:check` (check only) — it will fail if there are issues but won't fix them.
> If prek reports formatting or lint issues, run the auto-fix commands above first, then re-run prek to verify.

**i18n validation:** If your changes touch `src/renderer/`, `locales/`, or `src/common/config/i18n`, run:

```bash
bun run i18n:types
node scripts/check-i18n.js
```

Both commands must complete without errors before opening a PR. The `oss-pr` skill enforces this automatically.

Common Oxfmt rules (Prettier-compatible, avoid a fix pass):

- Single-element arrays that fit on one line → inline: `[{ id: 'a', value: 'b' }]`
- Trailing commas required in multi-line arrays/objects
- Single quotes for strings

## Git Conventions

Commit format: `<type>(<scope>): <subject>` in English. Types: feat, fix, refactor, chore, docs, test, style, perf. **NEVER add AI signatures** (Co-Authored-By, Generated with, etc.).

For pull request creation, see the `oss-pr` skill (`.claude/skills/oss-pr/SKILL.md`).

## Skills Index

Detailed rules and guidelines are organized into Skills for better modularity:

| Skill             | Purpose                                                                               | Triggers                                                                  |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **architecture**  | File & directory structure conventions for all process types                          | Creating files, adding modules, architectural decisions                   |
| **i18n**          | Internationalization workflow and standards                                           | Adding user-facing text, modifying `locales/` or `src/common/config/i18n` |
| **testing**       | Testing workflow and quality standards                                                | Writing tests, adding features, before claiming completion                |
| **oss-pr**        | Full commit + PR workflow: branch management, quality checks, issue linking, PR       | Creating pull requests, after committing, `/oss-pr`                       |
| **bump-version**  | Version bump workflow: update package.json, checks, branch, PR, tag release           | Bumping version, `/bump-version`                                          |
| **pr-review**     | Local PR code review with full project context, no truncation limits                  | Reviewing a PR, user says "review PR", `/pr-review`                       |
| **pr-fix**        | Fix all issues from a pr-review report, create a follow-up PR, and verify each fix    | After pr-review, user says "fix all issues", `/pr-fix`                    |
| **pr-verify**     | Verify and merge bot:ready-to-merge PRs with impact analysis and test supplementation | Verifying PRs, merging ready PRs, `/pr-verify`                            |
| **pr-automation** | PR automation orchestrator: poll PRs, review, fix, and merge via label state machine  | Invoked by daemon script (`pr-automation.sh`), `/pr-automation`           |

> Skills are located in `.claude/skills/` and contain project conventions that apply to **all** agents and contributors. Every agent working in this repository must read and follow the relevant skill files when the task matches their scope.

## PR 自动化流程

本仓库运行 PR 自动化 agent，定期处理 open PR（review、fix、合并）。

- **运行方式**：`scripts/pr-automation.sh` 作为 daemon 持续运行，每轮间隔 30 秒；日志默认写入 `~/Library/Logs/AionUi/`，可通过 `LOG_DIR=...` 覆盖
- **状态追踪**：通过 `bot:*` label（`bot:reviewing`、`bot:fixing`、`bot:ready-to-fix`、`bot:ci-waiting`、`bot:needs-human-review`、`bot:ready-to-merge`、`bot:done`）
- **详细说明**：[docs/conventions/pr-automation.md](docs/conventions/pr-automation.md)

## Internationalization

All user-facing text must use i18n keys — never hardcode strings. Languages and modules are defined in `src/common/config/i18n-config.json`.

See the `i18n` skill (`.claude/skills/i18n/SKILL.md`) for complete workflow, key naming, and validation steps.
