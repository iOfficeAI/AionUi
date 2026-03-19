# Main Process Decoupling — Phase 2 Design

**Date:** 2026-03-18
**Branch:** zynx/refactor/main-process-decouple-phase2
**Depends on:** Phase 1 (PR #1402, **merged**)
**Goal:** Decouple all remaining main-process modules so that every business-logic class can be unit-tested without Electron, SQLite, or any singleton.

---

## Phase 1 Recap

Phase 1 (5 PRs, PR #1402) established the foundation:

| Artifact                       | Location                                               |
| ------------------------------ | ------------------------------------------------------ |
| `IAgentManager`                | `src/process/task/IAgentManager.ts`                    |
| `IWorkerTaskManager`           | `src/process/task/IWorkerTaskManager.ts`               |
| `IAgentFactory`                | `src/process/task/IAgentFactory.ts`                    |
| `IAgentEventEmitter`           | `src/process/task/IAgentEventEmitter.ts`               |
| `IConversationRepository`      | `src/process/database/IConversationRepository.ts`      |
| `IConversationService`         | `src/process/services/IConversationService.ts`         |
| `SqliteConversationRepository` | `src/process/database/SqliteConversationRepository.ts` |
| `ConversationServiceImpl`      | `src/process/services/ConversationServiceImpl.ts`      |
| `WorkerTaskManager`            | `src/process/task/WorkerTaskManager.ts`                |
| `AgentFactory`                 | `src/process/task/AgentFactory.ts`                     |
| `IpcAgentEventEmitter`         | `src/process/task/IpcAgentEventEmitter.ts`             |

`conversationBridge.ts` was refactored to depend on `IConversationService` + `IWorkerTaskManager` via constructor injection.

---

## Remaining Coupling — Current State

The following modules still contain direct singleton or `getDatabase()` calls that prevent unit testing:

| Module                         | Coupling problem                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `WorkerTaskManager`            | Calls `getDatabase()` and `ProcessChat` directly in `getOrBuildTask`                                                         |
| `taskBridge.ts`                | Imports `workerTaskManager` singleton                                                                                        |
| `geminiConversationBridge.ts`  | Imports `workerTaskManager` singleton                                                                                        |
| `acpConversationBridge.ts`     | Imports `workerTaskManager` singleton                                                                                        |
| `CronService.ts`               | Depends on 6 singletons: `ipcBridge`, `getDatabase()`, `workerTaskManager`, `cronStore`, `cronBusyGuard`, `showNotification` |
| `cronBridge.ts`                | Imports `cronService` singleton                                                                                              |
| `channelBridge.ts`             | Calls `getDatabase()` directly for channel/user/session data                                                                 |
| `databaseBridge.ts`            | Calls `getDatabase()` and `ProcessChat` directly                                                                             |
| `extensionsBridge.ts`          | Calls `getDatabase()` and imports `workerTaskManager` singleton                                                              |
| `applicationBridge.ts`         | Imports `workerTaskManager` singleton directly                                                                               |
| `conversationBridge.ts`        | Line 125 still calls `getDatabase()` in `listAllConversations` path                                                          |
| `conversationService.ts` (old) | Still referenced by some modules; should be removed                                                                          |

---

## Design Principles

All principles from Phase 1 remain in force:

- **No DI frameworks** — pure constructor injection only
- **Interfaces between every layer** — no layer imports a concrete class from the layer below
- **Zero behavior change** — this refactor is invisible to users
- **Each PR independently reviewable and mergeable**

---

## Phase 2: 6 PR Plan

### PR-A: WorkerTaskManager — inject `IConversationRepository`

**Problem:** `WorkerTaskManager.getOrBuildTask` calls `getDatabase()` and `ProcessChat` directly to look up a conversation when the in-memory cache misses.

**Solution:** Add `IConversationRepository` to the constructor. The repository handles both DB lookup and file-storage fallback internally, or the singleton wiring handles the fallback.

#### Interface change — add `listAllConversations`

The existing interface already provides `getConversation(id)`. Two additions are needed in this PR:

1. **`listAllConversations()`** — currently `conversationBridge.ts` line 125 calls `getDatabase()` directly in its `listAllConversations` handler. Add this method to `IConversationRepository` so the bridge can use the injected repo instead.

```typescript
export interface IConversationRepository {
  // ...existing methods...
  listAllConversations(): TChatConversation[];
}
```

`SqliteConversationRepository` implements it via the existing DB query.

2. **Fix `conversationBridge.ts` line 125** — replace the `getDatabase()` call with `this.repo.listAllConversations()`. This closes the last remaining coupling in `conversationBridge`.

The `ProcessChat` file-storage fallback can be moved into `SqliteConversationRepository` or into a thin `FallbackConversationRepository` decorator — whichever is simpler.

#### `WorkerTaskManager` constructor (after PR-A)

```typescript
constructor(
  private readonly factory: IAgentFactory,
  private readonly repo: IConversationRepository,
) {}
```

`getOrBuildTask` becomes:

```typescript
async getOrBuildTask(id: string, options?: BuildConversationOptions): Promise<IAgentManager> {
  if (!options?.skipCache) {
    const existing = this.getTask(id);
    if (existing) return existing;
  }

  const conversation = this.repo.getConversation(id);
  if (conversation) return this._buildAndCache(conversation, options);

  return Promise.reject(new Error(`Conversation not found: ${id}`));
}
```

The `ProcessChat` file-storage fallback is handled by a new `FallbackConversationRepository` that wraps `SqliteConversationRepository` and falls back to `ProcessChat`:

```typescript
// src/process/database/FallbackConversationRepository.ts
export class FallbackConversationRepository implements IConversationRepository {
  constructor(private readonly db: IConversationRepository) {}

  getConversation(id: string): TChatConversation | undefined {
    return this.db.getConversation(id);
    // Note: ProcessChat fallback is async; handled via lazy migration in databaseBridge
  }
  // ...delegates all other methods to this.db
}
```

#### Singleton wiring (`workerTaskManagerSingleton.ts`)

```typescript
import { SqliteConversationRepository } from '@process/database/SqliteConversationRepository';

const repo = new SqliteConversationRepository();
export const workerTaskManager = new WorkerTaskManager(agentFactory, repo);
```

#### New tests

**`tests/unit/WorkerTaskManager.test.ts`**

- `getOrBuildTask` returns cached task without hitting repo on second call
- `getOrBuildTask` hits repo on cache miss and builds task correctly
- `getOrBuildTask` **[failure path]** rejects with error when repo returns `undefined`
- `getOrBuildTask` **[failure path]** rejects when `skipCache` is set and repo returns `undefined`

**`tests/unit/conversationBridge.test.ts`** (new assertions)

- `listAllConversations` returns data from injected repo — no `getDatabase()` call
- `listAllConversations` **[failure path]** returns empty array when repo returns `[]`

**Coverage target:** `WorkerTaskManager.ts` ≥ 80%, `conversationBridge.ts` ≥ 80%

---

### PR-B: Bridge layer — inject `IWorkerTaskManager`

**Problem:** `taskBridge`, `geminiConversationBridge`, `acpConversationBridge`, and `extensionsBridge` import the `workerTaskManager` singleton directly.

**Solution:** Change each `init*` function signature to accept `workerTaskManager: IWorkerTaskManager` as a parameter. The call-sites in `initBridge.ts` pass the singleton.

#### File-by-file changes

**`taskBridge.ts`**

```typescript
// Before
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
export function initTaskBridge(): void { ... }

// After
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
export function initTaskBridge(workerTaskManager: IWorkerTaskManager): void { ... }
```

**`geminiConversationBridge.ts`**

```typescript
// Before
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
export function initGeminiConversationBridge(): void { ... }

// After
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
export function initGeminiConversationBridge(workerTaskManager: IWorkerTaskManager): void { ... }
```

**`acpConversationBridge.ts`** — same pattern. Note that `acpConversationBridge` also does `instanceof AcpAgentManager` checks; these remain valid because the concrete type is still injected via the singleton at startup. The bridge only needs the `IWorkerTaskManager` interface for `getTask` / `getOrBuildTask` lookups — the `instanceof` casts are downcasts that are safe at the call site.

**`applicationBridge.ts`**

```typescript
// Before
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
export function initApplicationBridge(): void { ... }

// After
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
export function initApplicationBridge(workerTaskManager: IWorkerTaskManager): void { ... }
```

**`initBridge.ts`** (call site)

```typescript
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';

initTaskBridge(workerTaskManager);
initGeminiConversationBridge(workerTaskManager);
initAcpConversationBridge(workerTaskManager);
initApplicationBridge(workerTaskManager);
```

#### New tests

**`tests/unit/taskBridge.test.ts`**

- `stopAll` stops every running task and returns correct stopped count
- `getRunningCount` returns zero when no tasks are active
- `getRunningCount` **[failure path]** returns correct count after a task throws during stop

**`tests/unit/geminiConversationBridge.test.ts`**

- `confirmMessage` routes the confirmation payload to the correct task
- `confirmMessage` **[failure path]** returns error response when task is not found in manager

**`tests/unit/acpConversationBridge.test.ts`**

- `getMode` **[failure path]** returns `{ initialized: false }` when no task exists for the conversation

**`tests/unit/applicationBridge.test.ts`**

- Handler triggers task lookup via injected `workerTaskManager`
- **[failure path]** handler returns error when `workerTaskManager.getTask` returns `undefined`

**Coverage target:** `taskBridge.ts`, `geminiConversationBridge.ts`, `applicationBridge.ts` ≥ 80%

---

### PR-C: CronService — full decoupling

**Problem:** `CronService` directly references 6 singletons, making it impossible to unit test any of its scheduling or retry logic.

#### New interfaces

**`src/process/services/cron/ICronRepository.ts`**

```typescript
import type { CronJob } from './CronStore';

export interface ICronRepository {
  insert(job: CronJob): void;
  update(jobId: string, updates: Partial<CronJob>): void;
  delete(jobId: string): void;
  getById(jobId: string): CronJob | null;
  listAll(): CronJob[];
  listEnabled(): CronJob[];
  listByConversation(conversationId: string): CronJob[];
  deleteByConversation(conversationId: string): number;
}
```

**`src/process/services/cron/ICronEventEmitter.ts`**

```typescript
import type { CronJob } from './CronStore';

export interface ICronEventEmitter {
  emitJobCreated(job: CronJob): void;
  emitJobUpdated(job: CronJob): void;
  emitJobRemoved(jobId: string): void;
  showNotification(params: { title: string; body: string; conversationId: string }): Promise<void>;
}
```

**`src/process/services/cron/ICronJobExecutor.ts`**

```typescript
import type { CronJob } from './CronStore';

export interface ICronJobExecutor {
  /** Returns true if the conversation already has an active run in progress. */
  isConversationBusy(conversationId: string): boolean;
  /** Execute the job's payload against the target conversation. */
  executeJob(job: CronJob): Promise<void>;
  /** Register a callback to fire once the conversation becomes idle. */
  onceIdle(conversationId: string, callback: () => Promise<void>): void;
  /** Mark the conversation as busy/not-busy. */
  setProcessing(conversationId: string, busy: boolean): void;
}
```

#### New implementations

**`SqliteCronRepository`** — wraps the existing `CronStore` singleton:

```typescript
export class SqliteCronRepository implements ICronRepository {
  insert(job: CronJob): void {
    cronStore.insert(job);
  }
  update(jobId: string, updates: Partial<CronJob>): void {
    cronStore.update(jobId, updates);
  }
  // ...delegates all methods
}
```

**`IpcCronEventEmitter`** — wraps `ipcBridge.cron.*` + `showNotification`:

```typescript
export class IpcCronEventEmitter implements ICronEventEmitter {
  emitJobCreated(job: CronJob): void {
    ipcBridge.cron.onJobCreated.emit(job);
  }
  emitJobUpdated(job: CronJob): void {
    ipcBridge.cron.onJobUpdated.emit(job);
  }
  emitJobRemoved(jobId: string): void {
    ipcBridge.cron.onJobRemoved.emit({ jobId });
  }
  async showNotification(params): Promise<void> {
    return showNotification(params);
  }
}
```

**`WorkerTaskManagerJobExecutor`** — wraps `workerTaskManager` + `cronBusyGuard`:

```typescript
export class WorkerTaskManagerJobExecutor implements ICronJobExecutor {
  constructor(
    private readonly taskManager: IWorkerTaskManager,
    private readonly busyGuard: CronBusyGuard
  ) {}

  isConversationBusy(conversationId: string): boolean {
    return this.busyGuard.isProcessing(conversationId);
  }

  async executeJob(job: CronJob): Promise<void> {
    // Existing task-get + sendMessage logic extracted from CronService
  }

  onceIdle(conversationId: string, callback: () => Promise<void>): void {
    this.busyGuard.onceIdle(conversationId, callback);
  }

  setProcessing(conversationId: string, busy: boolean): void {
    this.busyGuard.setProcessing(conversationId, busy);
  }
}
```

#### `CronService` constructor (after PR-C)

```typescript
class CronService {
  constructor(
    private readonly repo: ICronRepository,
    private readonly emitter: ICronEventEmitter,
    private readonly executor: ICronJobExecutor,
    private readonly conversationRepo: IConversationRepository
  ) {}
}
```

All `cronStore.*` calls → `this.repo.*`
All `ipcBridge.cron.*` / `showNotification` calls → `this.emitter.*`
All `workerTaskManager.*` / `cronBusyGuard.*` calls → `this.executor.*`
All `getDatabase().getConversation(...)` calls → `this.conversationRepo.getConversation(...)`

#### Singleton wiring

```typescript
// src/process/services/cron/cronServiceSingleton.ts
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { cronBusyGuard } from './CronBusyGuard';
import { SqliteConversationRepository } from '@process/database/SqliteConversationRepository';

export const cronService = new CronService(
  new SqliteCronRepository(),
  new IpcCronEventEmitter(),
  new WorkerTaskManagerJobExecutor(workerTaskManager, cronBusyGuard),
  new SqliteConversationRepository()
);
```

#### New tests (`tests/unit/CronService.test.ts`)

Core scenarios to test (using mock implementations of all 4 interfaces).

Ordered highest-risk first (Rule 5):

- `executeJob()` **[failure path]** skips execution and stops retrying when conversation is busy and retries exceed `maxRetries`
- `executeJob()` **[failure path]** schedules a retry timer when conversation is busy and retries are within limit
- `handleSystemResume()` **[failure path]** inserts missed-job messages for jobs that fired while system was asleep
- `init()` **[failure path]** removes orphan jobs whose conversation no longer exists in repo
- `executeJob()` calls `executor.executeJob`, updates job state, and emits completion
- `init()` starts timers for all enabled jobs at correct intervals
- `addJob()` inserts into repo and emits `jobCreated`
- `addJob()` **[failure path]** throws when conversation already has a scheduled job
- `updateJob()` restarts timer when `enabled` flips from `false` to `true`
- `removeJob()` stops timer and emits `jobRemoved`

**Coverage target:** `CronService.ts` ≥ 80%

---

### PR-D: Channel repository layer

**Problem:** `channelBridge.ts` calls `getDatabase()` directly for channel plugin config, user authorization, and session data. This is fine for the bridge layer but prevents testing any business logic that may evolve there.

**Scope note:** `channelBridge` is currently a thin delegation layer with minimal logic — the actual channel business logic lives in `ChannelManager` and `PairingService`. Therefore, PR-D introduces a `IChannelRepository` to make the DB-calling parts mockable, but does NOT move all channel business logic into a service class. That would be a future PR.

#### New interface

**`src/process/database/IChannelRepository.ts`**

```typescript
export interface IChannelRepository {
  getChannelPlugins(): IChannelPluginConfig[];
  getPendingPairingRequests(): IChannelPairingRequest[];
  getChannelUsers(): IChannelUser[];
  deleteChannelUser(userId: string): void;
  getChannelSessions(): IChannelSession[];
}
```

#### New implementation

**`SqliteChannelRepository`** — wraps `getDatabase()` channel methods.

#### `channelBridge.ts` change

```typescript
// Before
export function initChannelBridge(): void { const db = getDatabase(); ... }

// After
export function initChannelBridge(channelRepo: IChannelRepository): void { ... }
```

The `getChannelManager()` and `getPairingService()` calls remain as-is since those services have their own encapsulation.

#### New tests (`tests/unit/channelBridge.test.ts`)

- `getPluginStatus` returns combined list from repo + extension registry
- `getAuthorizedUsers` returns repo data
- `revokeUser` calls `repo.deleteChannelUser`
- `getPendingPairings` returns repo data

**Coverage target:** `channelBridge.ts` (DB-touching paths) ≥ 70%

---

### PR-E: databaseBridge + extensionsBridge decoupling

**Problem:**

- `databaseBridge.ts` calls `getDatabase()` and `ProcessChat` directly
- `extensionsBridge.ts` calls `getDatabase()` and imports `workerTaskManager` singleton (used in the activity snapshot builder)

#### `databaseBridge.ts` change

Replace `getDatabase()` and `ProcessChat` with `IConversationRepository` (already exists):

```typescript
export function initDatabaseBridge(repo: IConversationRepository): void {
  ipcBridge.database.getConversationMessages.provider(({ conversation_id, page, pageSize }) => {
    const result = repo.getMessages(conversation_id, page ?? 0, pageSize ?? 10000);
    return Promise.resolve(result.data);
  });

  ipcBridge.database.getUserConversations.provider(async ({ page, pageSize }) => {
    // Lazy migration logic stays; but now uses repo.getUserConversations()
    // ProcessChat fallback handled separately by migration utility
    const result = repo.getUserConversations(undefined, (page ?? 0) * (pageSize ?? 10000), pageSize ?? 10000);
    return result.data;
  });
  // ...
}
```

Note: The `searchConversationMessages` call uses a method not in `IConversationRepository`. Two options:

1. Add `searchMessages` to `IConversationRepository`
2. Keep the direct `getDatabase()` call only for search (acceptable; search is read-only)

**Chosen approach:** Add `searchMessages` to `IConversationRepository` in this PR.

#### `extensionsBridge.ts` change

The activity snapshot builder (`buildActivitySnapshot`) uses both `getDatabase()` and `workerTaskManager`. Extract it into a testable class:

```typescript
// src/process/bridge/services/ActivitySnapshotBuilder.ts
export class ActivitySnapshotBuilder {
  constructor(
    private readonly repo: IConversationRepository,
    private readonly taskManager: IWorkerTaskManager,
  ) {}

  build(): IExtensionAgentActivitySnapshot { ... }
}
```

`initExtensionsBridge` receives both dependencies:

```typescript
export function initExtensionsBridge(
  repo: IConversationRepository,
  taskManager: IWorkerTaskManager,
): void { ... }
```

#### New tests

**`tests/unit/databaseBridge.test.ts`**

- `getConversationMessages` returns data from mocked repo
- `getUserConversations` returns merged and sorted conversation list

**`tests/unit/extensionsBridge.test.ts`** (ActivitySnapshotBuilder)

- `build()` returns correct `totalConversations` count
- `build()` correctly maps running task status to activity state
- `build()` groups conversations by agent backend

**Coverage target:** `databaseBridge.ts` ≥ 80%, `ActivitySnapshotBuilder.ts` ≥ 80%

---

### PR-F: Cleanup — remove old `conversationService.ts` + coverage audit

**Problem:** The old `src/process/services/conversationService.ts` still exists alongside the new `ConversationServiceImpl`. Any remaining references must be migrated and the old file deleted.

#### Steps

1. `grep -r "conversationService" src/` — find all remaining references
2. Migrate each reference to `ConversationServiceImpl` / `IConversationService`. Confirmed references beyond `src/process/` include:
   - `src/channels/actions/SystemActions.ts`
   - `src/channels/gateway/ActionExecutor.ts`

   Both files must be updated to depend on `IConversationService` injected at startup via `initBridge.ts`.

3. Delete `src/process/services/conversationService.ts`
4. Update `vitest.config.ts` `coverage.include` to add all Phase 2 new files:
   - `src/process/database/FallbackConversationRepository.ts`
   - `src/process/services/cron/ICronRepository.ts`
   - `src/process/services/cron/ICronEventEmitter.ts`
   - `src/process/services/cron/ICronJobExecutor.ts`
   - `src/process/services/cron/SqliteCronRepository.ts`
   - `src/process/services/cron/IpcCronEventEmitter.ts`
   - `src/process/services/cron/WorkerTaskManagerJobExecutor.ts`
   - `src/process/database/IChannelRepository.ts`
   - `src/process/database/SqliteChannelRepository.ts`
   - `src/process/bridge/services/ActivitySnapshotBuilder.ts`
5. Run `bun run test:coverage` — verify all new files ≥ 80%
6. Run `bun run test:integration` and `bun run test:e2e` as regression gate

---

## Dependency Graph

```
PR-A  WorkerTaskManager + IConversationRepository
  │
  └── PR-B  Bridge layer inject IWorkerTaskManager
              │
              └── PR-C  CronService (depends on IWorkerTaskManager + IConversationRepository)
                          │
                          └── PR-D  Channel repository layer
                                      │
                                      └── PR-E  databaseBridge + extensionsBridge
                                                  │
                                                  └── PR-F  Cleanup + coverage audit
```

Each PR is independently deployable. PRs with no shared-file conflicts (e.g., PR-D and PR-E) may be developed in parallel if needed.

---

## Architecture After Phase 2

```
initBridge.ts  (wires all singletons, passes via constructor injection)
       │
       ├── conversationBridge  ──▶  IConversationService
       │                              IWorkerTaskManager
       │
       ├── taskBridge          ──▶  IWorkerTaskManager
       │
       ├── geminiConvBridge    ──▶  IWorkerTaskManager
       │
       ├── acpConvBridge       ──▶  IWorkerTaskManager
       │
       ├── applicationBridge   ──▶  IWorkerTaskManager
       │
       ├── cronBridge          ──▶  ICronService (thin wrapper)
       │
       ├── channelBridge       ──▶  IChannelRepository
       │                              ChannelManager (already encapsulated)
       │
       ├── databaseBridge      ──▶  IConversationRepository
       │
       └── extensionsBridge    ──▶  IConversationRepository
                                      IWorkerTaskManager


CronService
       ├── ICronRepository        ◀── SqliteCronRepository
       ├── ICronEventEmitter      ◀── IpcCronEventEmitter
       ├── ICronJobExecutor       ◀── WorkerTaskManagerJobExecutor
       └── IConversationRepository ◀── SqliteConversationRepository


WorkerTaskManager
       ├── IAgentFactory          ◀── AgentFactory
       └── IConversationRepository ◀── SqliteConversationRepository
```

---

## Interface Inventory After Phase 2

| Interface                 | Location                     | Implementation(s)                                                |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `IConversationRepository` | `src/process/database/`      | `SqliteConversationRepository`, `FallbackConversationRepository` |
| `IConversationService`    | `src/process/services/`      | `ConversationServiceImpl`                                        |
| `IWorkerTaskManager`      | `src/process/task/`          | `WorkerTaskManager`                                              |
| `IAgentManager`           | `src/process/task/`          | `BaseAgentManager` subclasses                                    |
| `IAgentFactory`           | `src/process/task/`          | `AgentFactory`                                                   |
| `IAgentEventEmitter`      | `src/process/task/`          | `IpcAgentEventEmitter`                                           |
| `ICronRepository`         | `src/process/services/cron/` | `SqliteCronRepository`                                           |
| `ICronEventEmitter`       | `src/process/services/cron/` | `IpcCronEventEmitter`                                            |
| `ICronJobExecutor`        | `src/process/services/cron/` | `WorkerTaskManagerJobExecutor`                                   |
| `IChannelRepository`      | `src/process/database/`      | `SqliteChannelRepository`                                        |

---

## Testing Strategy

### Writing quality tests (Test Quality Rules)

Coverage percentage is a floor, not a goal. Follow these rules for every PR:

1. **Describe behavior, not code structure** — test names must describe what the system does, not which method it calls.
2. **Every `describe` block must cover at least one failure path** — what happens when a dependency returns `undefined`, throws, or returns an empty list?
3. **One behavior per `it()`** — more than 3 `expect()` calls in one test signals it is testing too much.
4. **Self-check**: mentally delete the core logic the test targets; if the test still passes, rewrite it.
5. **Start from risk** — list the scenarios most likely to produce production bugs for each module and write those first. Coverage is the outcome, not the starting point.

### Mock approach per interface

```typescript
// Pattern used in all unit tests
const mockRepo: IConversationRepository = {
  getConversation: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getMessages: vi.fn(),
  insertMessage: vi.fn(),
  getUserConversations: vi.fn(),
  listAllConversations: vi.fn(),
  searchMessages: vi.fn(),
};
```

### Coverage targets

| File                                        | Target                                                 |
| ------------------------------------------- | ------------------------------------------------------ |
| `WorkerTaskManager.ts`                      | ≥ 80%                                                  |
| `conversationBridge.ts`                     | ≥ 80%                                                  |
| `CronService.ts`                            | ≥ 80%                                                  |
| `taskBridge.ts`                             | ≥ 80%                                                  |
| `geminiConversationBridge.ts`               | ≥ 80%                                                  |
| `applicationBridge.ts`                      | ≥ 80%                                                  |
| `databaseBridge.ts`                         | ≥ 80%                                                  |
| `ActivitySnapshotBuilder.ts`                | ≥ 80%                                                  |
| All new `I*.ts` interface files             | 100% (interfaces have no runtime code)                 |
| All new `Sqlite*.ts` / `Ipc*.ts` impl files | ≥ 70% (thin delegation, mostly tested via integration) |

### Regression gate

Before merging each PR:

```bash
bun run test              # all unit tests pass
bunx tsc --noEmit         # no TypeScript errors
bun run lint:fix          # Prettier-clean
bun run test:coverage     # new files ≥ 80%
bun run test:integration  # integration tests pass
```

---

## Files NOT Modified in Phase 2

- `src/renderer/` — untouched
- `src/worker/` — untouched
- `src/channels/core/ChannelManager.ts` — untouched (already encapsulated)
- `src/channels/pairing/PairingService.ts` — untouched
- `src/extensions/` — untouched
- Database schema — untouched
- `src/common/` — untouched

---

## Rollback Strategy

Each PR is independently revertable:

- No schema changes
- No user-visible behavior changes
- Old singletons continue to be created at the leaf nodes; only the wiring changes
- Integration and E2E tests are the regression gate between PRs
