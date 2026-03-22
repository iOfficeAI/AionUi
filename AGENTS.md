# AionUi - Project Guide

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

Common Oxfmt rules (Prettier-compatible, avoid a fix pass):

- Single-element arrays that fit on one line → inline: `[{ id: 'a', value: 'b' }]`
- Trailing commas required in multi-line arrays/objects
- Single quotes for strings

## Git Conventions

Commit format: `<type>(<scope>): <subject>` in English. Types: feat, fix, refactor, chore, docs, test, style, perf. **NEVER add AI signatures** (Co-Authored-By, Generated with, etc.).

See the `commit` skill (`.claude/skills/commit/SKILL.md`) for complete workflow, quality gates, and rules. For pull request creation, see the `pr` skill (`.claude/skills/pr/SKILL.md`).

## Skills Index

Detailed rules and guidelines are organized into Skills for better modularity:

| Skill            | Purpose                                                                            | Triggers                                                           |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **architecture** | File & directory structure conventions for all process types                       | Creating files, adding modules, architectural decisions            |
| **i18n**         | Internationalization workflow and standards                                        | Adding user-facing text, creating components with user-facing text |
| **testing**      | Testing workflow and quality standards                                             | Writing tests, adding features, before claiming completion         |
| **commit**       | Structured git commit workflow with quality checks                                 | Committing code, `/commit`, `/oss-pr`                              |
| **pr**           | Pull request workflow: ensure issue exists, push branch, open PR                   | Creating pull requests, after committing, `/oss-pr`                |
| **pr-review**    | Local PR code review with full project context, no truncation limits               | Reviewing a PR, user says "review PR", `/pr-review`                |
| **pr-fix**       | Fix all issues from a pr-review report, create a follow-up PR, and verify each fix | After pr-review, user says "fix all issues", `/pr-fix`             |

> Skills are located in `.claude/skills/` and contain project conventions that apply to **all** agents and contributors. Every agent working in this repository must read and follow the relevant skill files when the task matches their scope.

## Internationalization

All user-facing text must use i18n keys — never hardcode strings. Languages and modules are defined in `src/common/config/i18n-config.json`.

See the `i18n` skill (`.claude/skills/i18n/SKILL.md`) for complete workflow, key naming, and validation steps.
