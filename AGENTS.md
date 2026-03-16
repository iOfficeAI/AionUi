# AionUi - Project Guide

## Tech Stack

Key choices that affect how code is written:

- **Electron 37** + **electron-vite 5** — multi-process desktop app, not a web app
- **React 19** + **TypeScript 5.8** (strict mode)
- **Vitest 4** — test framework
- **Arco Design 2** + **UnoCSS 66** — UI and styling
- **Zod** — data validation at boundaries

## Development Commands

```bash
# Development
bun run start              # Start dev environment
bun run webui              # Start WebUI server

# Code Quality
bun run lint               # Run ESLint
bun run lint:fix           # Auto-fix lint issues
bun run format             # Format with Prettier

# Testing
bun run test               # Run all tests (run before every commit)
bun run test:watch         # Watch mode
bun run test:coverage      # Coverage report
bun run test:integration   # Integration tests only
bun run test:e2e           # E2E tests (Playwright)
```

## Code Conventions

### Naming

- **Components**: PascalCase (`Button.tsx`, `Modal.tsx`)
- **Utilities**: camelCase (`formatDate.ts`)
- **Constants**: UPPER_SNAKE_CASE
- **Unused params**: prefix with `_`

### TypeScript

- Strict mode enabled
- Use path aliases: `@/*`, `@process/*`, `@renderer/*`, `@worker/*`
- Prefer `type` over `interface` (per ESLint config)

### React

- Functional components only
- Hooks: `use*` prefix
- Event handlers: `on*` prefix
- Props type: `${ComponentName}Props`

### Styling

- UnoCSS atomic classes preferred
- CSS modules for component-specific styles: `*.module.css`
- Use Arco Design semantic colors

### Comments

- English for code comments
- JSDoc for function documentation

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

## Code Quality

**Run `bun run lint:fix` after editing any `.ts` / `.tsx` file** — Prettier is enforced in CI and formatting errors block merges.

**Run `bunx tsc --noEmit` to verify there are no type errors** — TypeScript strict mode is enabled and type errors block merges.

Common Prettier rules to follow (avoids needing a fix pass):
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

## Architecture Notes

Three process types: Main (`src/process/`), Renderer (`src/renderer/`), Worker (`src/worker/`).

- `src/process/` — no DOM APIs
- `src/renderer/` — no Node.js APIs
- Cross-process communication must go through the IPC bridge (`src/preload.ts`)

See [docs/tech/architecture.md](docs/tech/architecture.md) for IPC, WebUI, and Cron details.

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
