# Chisl - Project Guide

All contributors (human and AI) must follow [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## Code Conventions

### File & Directory Structure

- **Directory size limit**: A single directory must not exceed **10** direct children (files + subdirectories). Split by responsibility when approaching this limit.

See [docs/contributing/file-structure.md](docs/contributing/file-structure.md) for complete rules. Agents must also follow the `architecture` skill (`.claude/skills/architecture/SKILL.md`) when creating files or modules.

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
- Arco theme overrides go in `packages/desktop/src/renderer/styles/arco-override.css`; component-scoped Arco overrides use CSS Module with `:global()`
- Global styles only in `packages/desktop/src/renderer/styles/`

Formatting rules (Oxfmt, Prettier-compatible):

- Single-element arrays that fit on one line → inline: `[{ id: 'a', value: 'b' }]`
- Trailing commas required in multi-line arrays/objects
- Single quotes for strings

### TypeScript

- Strict mode enabled — no `any`, no implicit returns
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`
- Prefer `type` over `interface` (per Oxlint config)
- English for code comments; JSDoc for public functions

### Internationalization (i18n)

All user-facing text must use i18n keys — never hardcode strings. Languages and modules are defined in `packages/desktop/src/common/config/i18n-config.json`.

See the `i18n` skill (`.claude/skills/i18n/SKILL.md`) for complete workflow, key naming, and validation steps.

## Architecture

Two process types — never mix their APIs:

| Process  | Path                             | Restriction     |
| -------- | -------------------------------- | --------------- |
| Main     | `packages/desktop/src/process/`  | No DOM APIs     |
| Renderer | `packages/desktop/src/renderer/` | No Node.js APIs |

Cross-process communication must go through the IPC bridge (`packages/desktop/src/preload/`).
See [docs/architecture/overview.md](docs/architecture/overview.md) for details.

## Testing

**Framework**: Vitest 4 (`vitest.config.ts`). Coverage target ≥ 80%.

```bash
bun run test              # run all tests
bun run test:coverage     # with coverage report
```

See the `testing` skill (`.claude/skills/testing/SKILL.md`) for complete workflow and quality rules.

## Workflow

### During Development

Auto-fix as you edit:

```bash
bun run lint:fix       # auto-fix lint issues (oxlint)
bun run format         # auto-format all files (oxfmt)
bunx tsc --noEmit      # verify no type errors
```

If your changes touch `packages/desktop/src/renderer/`, `locales/`, or `packages/desktop/src/common/config/i18n`, also run:

```bash
bun run i18n:types
node scripts/check-i18n.js
```

### Pushing

Use plain `git` commands:

```bash
git add <files>
git commit -m "<type>(<scope>): <subject>"
git push
```

`just push` (which chains lint → format-check → typecheck → test → git push) is
available but **not required**. Run the individual checks above during
development as needed; the user prefers the plain git workflow.

> **Note for AI agents**: project lint output contains many pre-existing
> _warnings_ which do NOT indicate failure. Judge success by exit code, not by
> output volume.

### Before PR (optional stricter check)

`prek` replicates the **exact CI pipeline** (includes end-of-file, trailing whitespace checks on all file types):

```bash
# One-time setup
npm install -g @j178/prek

# Run
prek run --from-ref origin/main --to-ref HEAD
```

> `prek` is read-only — it reports but does not fix. If it reports issues, run the auto-fix commands above, commit, then re-run.

The `oss-pr` skill runs this automatically during PR creation.

### Commit & PR Format

Commit format: `<type>(<scope>): <subject>` in English. Types: feat, fix, refactor, chore, docs, test, style, perf.

**NEVER add AI signatures** (Co-Authored-By, Generated with, etc.).

For pull request creation, see the `oss-pr` skill (`.claude/skills/oss-pr/SKILL.md`).

## Skills Index

| Skill             | Purpose                                                                               | Triggers                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **architecture**  | File & directory structure conventions for all process types                          | Creating files, adding modules, architectural decisions                                    |
| **i18n**          | Internationalization workflow and standards                                           | Adding user-facing text, modifying `locales/` or `packages/desktop/src/common/config/i18n` |
| **testing**       | Testing workflow and quality standards                                                | Writing tests, adding features, before claiming completion                                 |
| **oss-pr**        | Full commit + PR workflow: branch management, quality checks, issue linking, PR       | Creating pull requests, after committing, `/oss-pr`                                        |
| **bump-version**  | Version bump workflow: update package.json, checks, branch, PR, tag release           | Bumping version, `/bump-version`                                                           |
| **pr-review**     | Local PR code review with full project context, no truncation limits                  | Reviewing a PR, user says "review PR", `/pr-review`                                        |
| **pr-fix**        | Fix all issues from a pr-review report, create a follow-up PR, and verify each fix    | After pr-review, user says "fix all issues", `/pr-fix`                                     |
| **pr-verify**     | Verify and merge bot:ready-to-merge PRs with impact analysis and test supplementation | Verifying PRs, merging ready PRs, `/pr-verify`                                             |
| **pr-ship**       | End-to-end PR lifecycle: create, CI wait, review, fix, merge in one invocation        | `/pr-ship`, after development is done, resume shepherding a PR                             |
| **pr-automation** | PR automation orchestrator: poll PRs, review, fix, and merge via label state machine  | Invoked by daemon script (`pr-automation.sh`), `/pr-automation`                            |

> Skills are located in `.claude/skills/` and contain project conventions that apply to **all** agents and contributors.
