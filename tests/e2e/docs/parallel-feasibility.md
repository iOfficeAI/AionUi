# E2E Test Parallel Execution Feasibility

**Author**: assistant-engineer-2  
**Date**: 2026-04-21  
**Purpose**: Investigate whether Assistant E2E tests and Skills E2E tests can run in parallel

---

## Executive Summary

**Conclusion**: ❌ **Cannot run in parallel** (current architecture)

**Reason**: Shared singleton Electron app instance + shared database + explicit `workers: 1` configuration

**Recommendation**: Keep sequential execution. If parallel needed in future, requires architectural refactoring (see Solutions section).

---

## Current Architecture Analysis

### 1. Playwright Configuration

**File**: `playwright.config.ts`

```typescript
fullyParallel: false,  // Electron tests share one app instance
workers: 1,            // Must be 1: tests share a singleton Electron app instance
```

**Critical constraint**: Playwright explicitly enforces `workers: 1` with comment explaining singleton architecture.

### 2. Electron App Singleton Pattern

**File**: `tests/e2e/fixtures.ts:26-28`

```typescript
// Singleton – one app per test worker
let app: ElectronApplication | null = null;
let mainPage: Page | null = null;
```

**Design**: One Electron app instance shared across ALL test files in the worker. The app:

- Launches once at worker startup
- Persists across all `test.describe()` blocks
- Closes only when worker exits
- Reuses same `BrowserWindow` and renderer process

**Rationale** (from `tests/e2e/README.md:48-50`):

> One Electron instance shared across all tests. Restarting costs ~25-30 seconds, so tests reuse the same app process.

### 3. Shared Resources

#### 3.1 Database

**Path resolution** (`src/process/utils/utils.ts:getDataPath()` + backend `--data-dir`):

```typescript
return path.join(getDataPath(), 'aionui.db');
```

**userData directory** (`src/process/utils/configureChromium.ts:18-26`):

- Dev mode: `~/Library/Application Support/AionUi-Dev/` (macOS)
- Database: `{userData}/config/aionui.db`
- Shared by all E2E tests

**Conflict scenario**: If Assistant tests and Skills tests run in parallel workers:

1. Both access same `aionui.db` file
2. SQLite allows multiple readers, but writes lock the entire database
3. Test data pollution: Assistant test creates custom assistant → Skills test sees it

#### 3.2 Extension State File

**File**: `tests/e2e/fixtures.ts:29-30`

```typescript
const e2eStateSandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-state-'));
const e2eStateFile = path.join(e2eStateSandboxDir, 'extension-states.json');
```

**Environment variable** (L113):

```typescript
AIONUI_EXTENSION_STATES_FILE: process.env.AIONUI_EXTENSION_STATES_FILE || e2eStateFile;
```

**Current isolation**: Each worker creates unique temp directory → **no conflict** (✅ parallel-safe for this resource)

#### 3.3 Network Ports

**CDP disabled** (`tests/e2e/fixtures.ts:117`):

```typescript
AIONUI_CDP_PORT: '0';
```

**Result**: No port binding conflicts → **parallel-safe** (✅)

---

## Why Parallel Execution Fails

| Resource              | Isolation Level     | Conflict Type              | Impact                                  |
| --------------------- | ------------------- | -------------------------- | --------------------------------------- |
| Electron app instance | Worker-scoped       | Single instance            | 2 workers → 2 apps compete for userData |
| SQLite database       | Global (userData)   | File lock + data pollution | Write contention + test interference    |
| Extension state file  | Worker temp dir     | ✅ No conflict             | -                                       |
| Network ports         | None (CDP disabled) | ✅ No conflict             | -                                       |

**Critical bottleneck**: `workers: 1` enforced + shared `aionui.db` → parallel execution impossible without refactoring.

---

## Solutions (Future Work)

### Option 1: Multi-Instance Mode (Recommended)

**Approach**: Isolate userData per worker using environment variables

**Implementation**:

1. Extend `AIONUI_E2E_TEST` to include worker ID:
   ```typescript
   AIONUI_E2E_TEST_WORKER_ID: process.env.PLAYWRIGHT_WORKER_INDEX || '0';
   ```
2. Modify `getDevAppName()` to return worker-specific name:
   ```typescript
   const workerId = process.env.AIONUI_E2E_TEST_WORKER_ID || '0';
   return `AionUi-E2E-Worker-${workerId}`;
   ```
3. Each worker gets isolated:
   - `~/Library/Application Support/AionUi-E2E-Worker-0/config/aionui.db`
   - `~/Library/Application Support/AionUi-E2E-Worker-1/config/aionui.db`
4. Update `playwright.config.ts`:
   ```typescript
   workers: 2,  // or process.env.CI ? 1 : 2
   fullyParallel: true
   ```

**Cost**: ~50-60 seconds total (2 workers × 25-30s startup), but parallel → net time ≈ 30s

### Option 2: Test Sharding

**Approach**: Run Assistant and Skills tests in separate Playwright invocations

**Implementation**:

```bash
# Sequential npm scripts
bun run test:e2e:assistants  # Matches tests/e2e/specs/assistant-*.e2e.ts
bun run test:e2e:skills      # Matches tests/e2e/specs/skills-*.e2e.ts
```

**Pros**: No code changes, explicit separation  
**Cons**: Still sequential, no speedup

### Option 3: Database Isolation Per Test File

**Approach**: Pass unique database path via environment variable per spec

**Complexity**: High (requires main process to read `AIONUI_DATABASE_PATH`, conflicts with userData convention)

**Not recommended**: Breaks Electron's standard paths, hard to maintain

---

## Recommendation for Gate 3 Implementation

**Keep sequential execution**:

1. Assistant tests and Skills tests run in same worker (current `workers: 1`)
2. Total runtime = sum of both modules (~2-5 minutes typical)
3. No risk of test interference

**If parallel needed later**:

- Implement **Option 1** (Multi-Instance Mode) as part of separate infrastructure task
- Requires changes to:
  - `src/common/platform/index.ts` (`getDevAppName`)
  - `tests/e2e/fixtures.ts` (worker ID injection)
  - `playwright.config.ts` (workers count)
- Estimated effort: 2-3 hours implementation + testing

---

## References

- `playwright.config.ts:8-10` — Singleton architecture comment
- `tests/e2e/fixtures.ts:26-28` — App singleton declaration
- `tests/e2e/README.md:42-50` — Shared instance design rationale
- `src/process/utils/utils.ts` — `getDataPath()` database directory resolution
- `src/process/utils/configureChromium.ts:18-26` — userData isolation in dev mode
- `src/common/platform/index.ts` — `getDevAppName()` implementation
