# E2E Testing Guide

## Quick Start

### 1. Build the App

E2E tests launch Electron directly (`electron .`), loading pre-built files from `out/`. **Source code changes require a rebuild before tests can pick them up.**

```bash
# Full build (main + preload + renderer)
bunx electron-vite build
```

> `bun run start` (`electron-vite dev`) uses Vite's HMR and hot-reloads automatically.
> E2E tests do NOT use Vite dev server — they load static files from `out/`.

### 2. Run Tests

```bash
# All E2E tests
bun run test:e2e

# Specific test file
npx playwright test --config playwright.config.ts tests/e2e/specs/team-workspace-migration.e2e.ts --reporter=list
```

### 3. View Results

```bash
# Open HTML report
npx playwright show-report tests/e2e/report
```

Screenshots, traces, and videos are saved to `tests/e2e/results/`.

---

## Architecture

### App Lifecycle

```
Playwright launches Electron app (singleton per worker)
    → App loads out/main/index.js
    → Main process creates BrowserWindow
    → Renderer loads out/renderer/index.html (HashRouter)
    → Tests interact with the renderer page
    → App persists across ALL test files (no restart between describes)
    → App closes when worker exits
```

**Key design decision:** One Electron instance shared across all tests. Restarting costs ~25-30 seconds, so tests reuse the same app process.

### Two Launch Modes

| Mode                      | Trigger                   | What it runs                   | Use case          |
| ------------------------- | ------------------------- | ------------------------------ | ----------------- |
| **Dev** (default locally) | `E2E_DEV=1` or no env var | `electron .` from project root | Local development |
| **Packaged**              | `E2E_PACKAGED=1` or CI    | Built app from `out/`          | CI pipelines      |

Both modes load pre-built files from `out/`. The difference is packaged mode uses `NODE_ENV=production` and the platform-specific executable.

### Directory Structure

```
tests/e2e/
├── fixtures.ts         # Electron app launch, page fixture, singleton management
├── helpers/
│   ├── index.ts        # Re-exports all helpers
│   ├── bridge.ts       # invokeBridge() — IPC communication with main process
│   ├── navigation.ts   # Route helpers (navigateTo, goToGuid, goToSettings)
│   ├── conversation.ts # Chat helpers (sendMessage, waitForAiReply, selectAgent)
│   ├── selectors.ts    # CSS selectors for UI elements
│   ├── assertions.ts   # Custom assertions (expectBodyContainsAny, error collector)
│   ├── extensions.ts   # Extension snapshot helpers
│   ├── assistantSettings.ts # Assistant CRUD helpers
│   ├── teamConfig.ts   # TEAM_SUPPORTED_BACKENDS whitelist
│   └── screenshots.ts  # Manual screenshot helper
├── specs/
│   ├── README.md       # Team E2E spec (rules for team tests)
│   ├── app-launch.e2e.ts
│   ├── team-create.e2e.ts
│   ├── team-workspace-migration.e2e.ts
│   └── ...             # ~30+ test files
├── results/            # Test artifacts (gitignored)
├── report/             # HTML report (gitignored)
└── screenshots/        # Manual screenshots (gitignored)
```

---

## Writing Tests

### Basic Pattern

```ts
import { test, expect } from '../fixtures';
import { invokeBridge, navigateTo } from '../helpers';

test.describe('Feature Name', () => {
  test('what it should do', async ({ page, electronApp }) => {
    // 1. Navigate
    await navigateTo(page, '#/some-route');

    // 2. Interact
    const input = page.locator('textarea').first();
    await input.fill('Hello');
    await input.press('Enter');

    // 3. Assert UI
    await expect(page.locator('text=Hello')).toBeVisible({ timeout: 10_000 });

    // 4. Assert backend (optional)
    const data = await invokeBridge(page, 'some.bridge-key', { param: 'value' });
    expect(data.field).toBe('expected');
  });
});
```

### Key Helpers

| Helper                           | Purpose                                            | Import from  |
| -------------------------------- | -------------------------------------------------- | ------------ |
| `invokeBridge(page, key, data)`  | Call main process IPC                              | `../helpers` |
| `navigateTo(page, hash)`         | Navigate via sidebar UI                            | `../helpers` |
| `waitForAiReply(page)`           | Wait for AI response (handles Shadow DOM)          | `../helpers` |
| `selectAgent(page, backend)`     | Select agent pill by backend                       | `../helpers` |
| `sendMessageFromGuid(page, msg)` | Send message and get conversation ID               | `../helpers` |
| `deleteConversation(page, id)`   | Delete conversation by ID (cleanup)                | `../helpers` |
| `MODE_SELECTOR`                  | Mode selector pill `[data-testid="mode-selector"]` | `../helpers` |
| `modeMenuItemByValue(value)`     | Mode dropdown item `[data-mode-value="..."]`       | `../helpers` |

### invokeBridge Rules

| Allowed                                                 | Forbidden                                         |
| ------------------------------------------------------- | ------------------------------------------------- |
| **Setup:** read initial state (`team.list`, `team.get`) | **Trigger operations** (add member, send message) |
| **Assert:** verify backend matches UI                   | Operations MUST go through UI interaction         |
| **Cleanup:** delete test data (`team.remove`)           |                                                   |

### Timeout Guidelines

| Operation                                | Timeout            |
| ---------------------------------------- | ------------------ |
| UI element visibility                    | 5,000 - 15,000ms   |
| Navigation + settle                      | 10,000ms           |
| AI response (single model)               | 120,000ms          |
| Team operations (leader inference + MCP) | 60,000 - 120,000ms |
| Member initialization                    | 60,000ms           |

### Mocking Native Dialogs (Electron)

```ts
// Mock file open dialog
await electronApp.evaluate(async ({ dialog }, targetPath) => {
  dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [targetPath] });
}, '/path/to/target');
```

### Shadow DOM

AI message text renders inside Shadow DOM (`.markdown-shadow`). Use the `waitForAiReply()` helper which handles this automatically. If you need raw access:

```ts
const text = await page.evaluate(() => {
  const el = document.querySelector('.message-item.text.justify-start:last-child');
  const shadow = el?.querySelector('.markdown-shadow');
  return shadow?.shadowRoot?.textContent?.trim() ?? '';
});
```

### Screenshots

```ts
// Manual screenshot (saved to tests/e2e/results/)
await page.screenshot({ path: 'tests/e2e/results/my-step.png' });
```

Failed tests automatically get screenshots attached to the HTML report.

---

## Environment Variables

| Variable         | Default                     | Purpose                      |
| ---------------- | --------------------------- | ---------------------------- |
| `E2E_PACKAGED=1` | unset (dev mode)            | Use packaged app from `out/` |
| `E2E_DEV=1`      | unset                       | Force dev mode               |
| `TEAM_AGENT`     | all (`claude,codex,gemini`) | Filter team leader types     |
| `CI`             | unset                       | Auto-selects packaged mode   |

Variables set automatically during test launch:

| Variable                     | Value | Purpose                  |
| ---------------------------- | ----- | ------------------------ |
| `AIONUI_E2E_TEST`            | `1`   | App recognizes test mode |
| `AIONUI_DISABLE_AUTO_UPDATE` | `1`   | No update checks         |
| `AIONUI_DISABLE_DEVTOOLS`    | `1`   | No DevTools windows      |
| `AIONUI_CDP_PORT`            | `0`   | CDP disabled             |

---

## NPM Scripts

| Command                           | Scope                    |
| --------------------------------- | ------------------------ |
| `bun run test:e2e`                | All E2E tests            |
| `bun run test:e2e:team`           | All `team-*.e2e.ts`      |
| `bun run test:e2e:team:create`    | Team creation only       |
| `bun run test:e2e:team:lifecycle` | Add + fire members       |
| `bun run test:e2e:team:whitelist` | Agent whitelist dropdown |
| `bun run test:e2e:team:comm`      | Message sending          |

### Examples

```bash
# Run all E2E locally (dev mode, requires build first)
bunx electron-vite build && bun run test:e2e

# Run only team tests with list reporter
bun run test:e2e:team

# Run specific test file
npx playwright test --config playwright.config.ts tests/e2e/specs/app-launch.e2e.ts

# Only test gemini leader type
TEAM_AGENT=gemini bun run test:e2e:team

# Run in packaged mode (CI-like)
E2E_PACKAGED=1 bun run test:e2e
```

---

## Troubleshooting

### Tests fail with stale UI / old behavior

**Cause:** Source changes not rebuilt.

```bash
bunx electron-vite build
```

### `Bridge invoke timeout: xxx`

**Cause:** The IPC provider for `xxx` doesn't exist or wasn't registered.

- Check `src/common/adapter/ipcBridge.ts` for the endpoint definition
- Check the corresponding bridge file (e.g., `src/process/bridge/teamBridge.ts`) for `.provider()` registration
- Rebuild: `bunx electron-vite build`

### App launches but page is blank

**Cause:** Renderer build is missing or corrupted.

```bash
bunx electron-vite build
```

### Tests are flaky with AI responses

- Increase timeout (AI inference varies by load)
- Use `expect.poll()` instead of fixed `waitForTimeout()`
- Add retry logic for MCP confirmation dialogs (see `autoApproveMcpDialogs` pattern)

### Leftover test data in sidebar

```bash
# Clean via database
sqlite3 "~/Library/Application Support/AionUi-Dev/aionui/aionui.db" \
  "DELETE FROM teams WHERE name LIKE 'E2E%';"
```

Or add cleanup at test start:

```ts
const teams = await invokeBridge(page, 'team.list', { userId: 'system_default_user' });
for (const t of teams) {
  if (t.name.startsWith('E2E')) {
    await invokeBridge(page, 'team.remove', { id: t.id }).catch(() => {});
  }
}
```
