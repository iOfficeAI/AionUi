# AionUi - Project Guide

## Code Conventions

### Naming

- **Components**: PascalCase (`Button.tsx`, `Modal.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Constants**: UPPER_SNAKE_CASE
- **Unused params**: prefix with `_`

### TypeScript

- Strict mode enabled — no `any`, no implicit returns
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`, `@worker/*`
- Prefer `type` over `interface` (per ESLint config)
- English for code comments; JSDoc for public functions

### Architecture

Three process types — never mix their APIs:

- `src/process/` — main process, no DOM APIs
- `src/renderer/` — renderer, no Node.js APIs
- `src/worker/` — fork workers, no Electron APIs

Cross-process communication must go through the IPC bridge (`src/preload.ts`).
See [docs/tech/architecture.md](docs/tech/architecture.md) for details.

## Testing

**Framework**: Vitest 4 (`vitest.config.ts`)

**Structure**:
- `tests/unit/` - Individual functions, utilities, components
- `tests/integration/` - IPC, database, service interactions
- `tests/regression/` - Regression test cases
- `tests/e2e/` - End-to-end tests (Playwright, `playwright.config.ts`)

**Two test environments**:
- `node` (default) - main process, utilities, services
- `jsdom` - files named `*.dom.test.ts`

**Workflow rules**:
- Run `bun run test` before every commit
- New features must include corresponding test cases
- When modifying logic, update affected existing tests
- New source files added to feature areas must be included in coverage config (`vitest.config.ts` → `coverage.include`)

**Coverage target**: ≥ 80% for all files listed in `coverage.include`. Run `bun run test:coverage` to verify before opening a PR.

### Test Quality Rules

Coverage percentage is a floor, not a goal. A test only has value if it would **fail when the behavior it describes breaks**.

**1. Describe behavior, not code structure**

```typescript
// Wrong — describes implementation
it('should call repo.getConversation', ...)

// Correct — describes behavior
it('should return cached task without hitting repo on second call', ...)
it('should reject with error when conversation does not exist', ...)
```

**2. Every describe block must cover at least one failure path**

Happy-path-only tests leave the most dangerous code untested. For every module, ask:
- What happens when the dependency returns `undefined` / throws?
- What happens at the boundary (empty list, max retries reached, past timestamp)?

**3. One behavior per test**

Keep each `it()` focused. More than 3 `expect()` calls in one test is a signal it is testing too much at once.

**4. Self-check before committing**

After writing a test, mentally delete the core logic it targets. If the test would still pass, rewrite it — it is not guarding anything.

**5. Start from risk, not from coverage gaps**

Before writing tests for a module, list the scenarios most likely to produce bugs in production. Write those first. Coverage is the outcome of that process, not the starting point.

## Code Quality

Run these after every edit — all three are enforced in CI and block merges:

```bash
bun run lint:fix       # after editing .ts / .tsx
bun run format         # after editing .css / .json / .md
bunx tsc --noEmit      # verify no type errors
```

Common Prettier rules (avoid a fix pass):
- Single-element arrays that fit on one line → inline: `[{ id: 'a', value: 'b' }]`
- Trailing commas required in multi-line arrays/objects
- Single quotes for strings

## Git Conventions

### Commit Messages

- **Language**: English
- **Format**: `<type>(<scope>): <subject>`
- **Types**: feat, fix, refactor, chore, docs, test, style, perf

Examples:

```
feat(cron): implement scheduled task system
fix(webui): correct modal z-index issue
chore: remove debug console.log statements
```

### No AI Signature (MANDATORY)

**NEVER add any AI-related signatures to commits or PRs.** This includes:

- `Co-Authored-By: <any AI tool name>` or similar attribution lines
- `Generated with <AI tool>` or similar markers in commit messages or PR descriptions
- Any other AI-generated footer or byline

This is a strict rule that applies to all AI coding assistants. Violating this will pollute the git history.

## Internationalization

Translation files: `src/renderer/i18n/locales/<lang>/<module>.json`. Always use i18n keys for user-facing text — never hardcode strings in components.

Supported languages: `en-US` (reference), `zh-CN`, `zh-TW`, `ja-JP`, `ko-KR`, `tr-TR`.

When adding or modifying user-facing text, **always update all language files**. After changes, run the i18n validation script to verify completeness:

```bash
node scripts/check-i18n.js
```

This script checks: directory structure, missing keys across locales, empty translations, invalid `t()` key usages, and type definition sync. **Fix all errors before committing.**

If you added new i18n keys, also regenerate the type definitions:

```bash
bun run i18n:types
```
