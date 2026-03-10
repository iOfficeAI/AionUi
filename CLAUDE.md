# AionUi - Claude Guide

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

**NEVER add any AI-related signatures to commits.** This includes:

- `Co-Authored-By: Claude` or any AI attribution
- `Generated with Claude` or similar markers

This is a strict rule. Violating this will pollute the git history.

## Architecture Notes

Three process types: Main (`src/process/`), Renderer (`src/renderer/`), Worker (`src/worker/`).

- `src/process/` — no DOM APIs
- `src/renderer/` — no Node.js APIs
- Cross-process communication must go through the IPC bridge (`src/preload.ts`)

See [docs/tech/architecture.md](docs/tech/architecture.md) for IPC, WebUI, and Cron details.

## Internationalization

When adding user-facing text or creating components with text, use the **i18n** skill. Translation files: `src/renderer/i18n/locales/*.json`.
