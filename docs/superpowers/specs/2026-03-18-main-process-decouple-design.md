# Main Process Decoupling Design

**Date:** 2026-03-18
**Branch:** refactor/chore/refactor-architecture
**Goal:** Decouple main process modules via interfaces for independent testability and long-term maintainability.

---

## Background

The main process currently has four coupling problems:

1. **Bridge layer contains business logic** — `conversationBridge.ts` is 597 lines with message migration, integrity checks, and direct DB calls mixed into IPC handlers.
2. **No `IAgentManager` interface** — `sendMessage` in the bridge uses `if (task.type === 'gemini') ... else if (task.type === 'acp') ...` type guards. Every new agent type requires changes in multiple bridge files.
3. **`BaseAgentManager` directly calls `ipcBridge`** — Agent managers should not know about the IPC layer.
4. **Worker protocol is implicit strings** — Message types like `'stop.stream'` and `'send.message'` are untyped string conventions with no compile-time safety.

---

## Design Principles

- **No new frameworks** — Manual constructor injection only. No DI containers.
- **Interfaces between every layer** — Each layer depends only on the interface above/below it.
- **Behavior unchanged** — This refactor does not change any user-facing behavior.
- **Incremental delivery** — Split into 5 PRs, each independently reviewable and mergeable.

---

## Architecture Overview

```
Bridge Layer        (thin IPC router)
       │ depends on
       ▼
IConversationService    IWorkerTaskManager
       │ implemented by        │ implemented by
       ▼                       ▼
ConversationService     WorkerTaskManager
       │ depends on            │ depends on
       ▼                       ▼
IConversationRepository   IAgentFactory
       │ implemented by        │ implemented by
       ▼                       ▼
SqliteConversationRepo    AgentFactory
                                │ creates
                                ▼
                         IAgentManager
                          (implemented by BaseAgentManager subclasses)
                                │ depends on
                                ▼
                         IAgentEventEmitter
                          (implemented by IpcAgentEventEmitter)
```

---

## Shared Types

Location: `src/process/task/agentTypes.ts`

All interface files import from this single shared module to avoid circular imports.

```typescript
export type AgentType = 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot';
export type AgentStatus = 'pending' | 'running' | 'finished';

export interface BuildConversationOptions {
  /** Force yolo mode (auto-approve all tool calls) */
  yoloMode?: boolean;
  /** Skip task cache — create a new isolated instance */
  skipCache?: boolean;
}
```

---

## Interface Definitions

### `IConversationRepository`

Location: `src/process/database/IConversationRepository.ts`

> All methods are synchronous (better-sqlite3 driver). The service layer is async to allow future migration.

```typescript
import type { TChatConversation } from '@/common/storage';
import type { TMessage } from '@/common/chatLib';

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  hasMore: boolean;
};

export interface IConversationRepository {
  getConversation(id: string): TChatConversation | undefined;
  createConversation(conversation: TChatConversation): void;
  updateConversation(id: string, updates: Partial<TChatConversation>): void;
  deleteConversation(id: string): void;
  getMessages(id: string, page: number, pageSize: number): PaginatedResult<TMessage>;
  insertMessage(message: TMessage): void;
  // cursor-based: if cursor provided, offset is ignored; if neither provided, starts from beginning
  getUserConversations(cursor?: string, offset?: number, limit?: number): PaginatedResult<TChatConversation>;
}
```

Implementation: `SqliteConversationRepository` — wraps existing `getDatabase()` calls.

---

### `IConversationService`

Location: `src/process/services/IConversationService.ts`

```typescript
import type { TChatConversation, TProviderWithModel, ConversationSource } from '@/common/storage';
import type { AcpBackendAll } from '@/common/storage';

export interface CreateConversationParams {
  type: 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot';
  id?: string;
  name?: string;
  model: TProviderWithModel;
  source?: ConversationSource;
  channelChatId?: string;
  extra: {
    workspace?: string;
    customWorkspace?: boolean;
    defaultFiles?: string[];
    backend?: AcpBackendAll;
    cliPath?: string;
    webSearchEngine?: 'google' | 'default';
    agentName?: string;
    contextFileName?: string;
    presetRules?: string;
    enabledSkills?: string[];
    presetAssistantId?: string;
    sessionMode?: string;
    isHealthCheck?: boolean;
    [key: string]: unknown;
  };
}

export interface MigrateConversationParams {
  conversation: TChatConversation;
  sourceConversationId?: string;
  migrateCron?: boolean;
}

export interface IConversationService {
  createConversation(params: CreateConversationParams): Promise<TChatConversation>;
  deleteConversation(id: string): Promise<void>;
  updateConversation(id: string, updates: Partial<TChatConversation>, mergeExtra?: boolean): Promise<void>;
  getConversation(id: string): Promise<TChatConversation | undefined>;
  createWithMigration(params: MigrateConversationParams): Promise<TChatConversation>;
}
```

Implementation: `ConversationService` — contains all business logic currently scattered across bridge handlers (message migration, integrity checks, cron cleanup, channel cleanup).

---

### `IAgentManager`

Location: `src/process/task/IAgentManager.ts`

```typescript
import type { IConfirmation } from '@/common/chatLib';
import type { AgentType, AgentStatus } from './agentTypes';

export interface IAgentManager {
  readonly type: AgentType;
  readonly status: AgentStatus | undefined; // readonly on interface; implementation mutates via this.status
  readonly workspace: string;
  readonly conversation_id: string;

  sendMessage(data: unknown): Promise<void>;
  stop(): Promise<void>;
  confirm(msgId: string, callId: string, data: unknown): void;
  getConfirmations(): IConfirmation[];
  kill(): void;
}
```

`BaseAgentManager` and all subclasses implement this interface. The bridge only refers to `IAgentManager`, eliminating all `task.type === 'gemini'` type guards.

---

### `IWorkerTaskManager`

Location: `src/process/task/IWorkerTaskManager.ts`

```typescript
import type { IAgentManager } from './IAgentManager';
import type { BuildConversationOptions } from './agentTypes';

export interface IWorkerTaskManager {
  getTask(id: string): IAgentManager | undefined;
  getOrBuildTask(id: string, options?: BuildConversationOptions): Promise<IAgentManager>;
  addTask(id: string, task: IAgentManager): void;
  kill(id: string): void;
  clear(): void;
  listTasks(): Array<{ id: string; type: string }>;
}
```

Implementation: `WorkerTaskManager` — refactored from `WorkerManage`, delegates agent creation to `IAgentFactory`.

---

### `IAgentFactory`

Location: `src/process/task/IAgentFactory.ts`

```typescript
import type { TChatConversation } from '@/common/storage';
import type { IAgentManager } from './IAgentManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';

export type AgentCreator = (conversation: TChatConversation, options?: BuildConversationOptions) => IAgentManager;

export interface IAgentFactory {
  register(type: AgentType, creator: AgentCreator): void;
  /**
   * Creates an agent for the given conversation.
   * @throws {UnknownAgentTypeError} if conversation.type has no registered creator.
   */
  create(conversation: TChatConversation, options?: BuildConversationOptions): IAgentManager;
}

export class UnknownAgentTypeError extends Error {
  constructor(type: string) {
    super(`No agent creator registered for type: ${type}`);
    this.name = 'UnknownAgentTypeError';
  }
}
```

Implementation: `AgentFactory` — replaces the `switch (conversation.type)` in `WorkerManage.buildConversation`. Each agent type registers its own creator function at startup.

---

### `IAgentEventEmitter`

Location: `src/process/task/IAgentEventEmitter.ts`

```typescript
import type { IConfirmation } from '@/common/chatLib';

/** Discriminated union of all events an agent can emit to the renderer */
export type AgentMessageEvent =
  | { type: 'text'; data: { content: string; msg_id: string } }
  | { type: 'tool_group'; data: unknown[] }
  | { type: 'status'; data: { status: string } }
  | { type: string; data: unknown }; // agent-specific extensions

export interface IAgentEventEmitter {
  emitConfirmationAdd(conversationId: string, data: IConfirmation): void;
  emitConfirmationUpdate(conversationId: string, data: IConfirmation): void;
  emitConfirmationRemove(conversationId: string, confirmationId: string): void;
  emitMessage(conversationId: string, event: AgentMessageEvent): void;
}
```

Production implementation: `IpcAgentEventEmitter` — calls `ipcBridge` internally.
Test implementation: `MockAgentEventEmitter` — records calls for assertion.

`BaseAgentManager` receives `IAgentEventEmitter` via constructor injection, removing all direct `ipcBridge` references from the agent layer.

---

### Worker Protocol Types

Location: `src/worker/WorkerProtocol.ts`

```typescript
// Messages sent from main process to worker
export type MainToWorkerMessage =
  | { type: 'start'; data: unknown }
  | { type: 'stop.stream'; data: Record<string, never> }
  | { type: 'send.message'; data: unknown };

// Events sent from worker to main process
export type WorkerToMainEvent =
  | { type: 'complete'; data: unknown }
  | { type: 'error'; data: unknown }
  | { type: string; data: unknown; pipeId?: string };
```

Agent-specific message variants (e.g., `'gemini.message'`, `'reload.context'`) are defined in each agent's own protocol file (e.g., `src/worker/gemini.protocol.ts`) and composed into the union there. This keeps the base protocol minimal while preserving type safety per agent.

---

## Implementation Plan (5 PRs)

### PR 1: Shared types + interface definitions only

- Add `src/process/task/agentTypes.ts` (shared types)
- Add all 5 interface files (pure TypeScript types, zero runtime code)
- Add `src/worker/WorkerProtocol.ts` type definitions
- No behavior change, no logic moved

### PR 2: Repository + Service layer

- Add `SqliteConversationRepository` implementing `IConversationRepository`
- Refactor `ConversationService` to depend on `IConversationRepository` (injected)
- Move business logic from `conversationBridge.ts` into `ConversationService` (migration, cron cleanup, channel cleanup)
- Bridge `conversationBridge.ts` becomes a thin router calling `IConversationService`

### PR 3: Agent event emitter injection

- Add `IpcAgentEventEmitter` implementing `IAgentEventEmitter`
- Inject `IAgentEventEmitter` into `BaseAgentManager` constructor
- Remove all direct `ipcBridge` calls from `BaseAgentManager`
- `BaseAgentManager` declares `implements IAgentManager`

### PR 4: AgentFactory + WorkerTaskManager

- Add `AgentFactory` implementing `IAgentFactory`
- Each agent type calls `agentFactory.register(...)` at startup
- Refactor `WorkerManage` into `WorkerTaskManager` implementing `IWorkerTaskManager`
- `WorkerTaskManager` delegates to `IAgentFactory`, removing the `switch (conversation.type)` block

### PR 5: Bridge cleanup + Worker protocol types

- Replace remaining type guards in bridges with `IAgentManager` interface calls
- Apply `WorkerProtocol.ts` types to `ForkTask` and worker scripts
- Remove dead code

---

## Testing Strategy

Each layer can be tested in isolation by injecting mocks.

| Layer                 | Mock                                         | Representative test cases                                                                                                   |
| --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `conversationBridge`  | `IConversationService`, `IWorkerTaskManager` | `remove` cleans up cron jobs; `sendMessage` routes to correct agent                                                         |
| `ConversationService` | `IConversationRepository`                    | `createWithMigration` copies all messages from source; `deleteConversation` removes associated cron jobs when count matches |
| `WorkerTaskManager`   | `IAgentFactory`, `IAgentManager`             | returns cached task on second call; calls `factory.create` on cache miss; `kill` removes task from list                     |
| `BaseAgentManager`    | `IAgentEventEmitter`                         | `addConfirmation` calls `emitConfirmationAdd`; yolo mode auto-confirms first option                                         |
| `AgentFactory`        | —                                            | throws `UnknownAgentTypeError` for unregistered type; returns correct manager for each registered type                      |

---

## Rollback Strategy

Each PR is independently revertable. The old implementation is only deleted after the new one is fully wired in and passing tests. The existing integration and E2E tests (`bun run test:integration`, `bun run test:e2e`) serve as the regression gate between PRs — all tests must pass before merging each PR into the refactor branch.

If a regression is found after merging to `main`, the PR can be reverted cleanly since behavior is unchanged and no schema migrations are involved.

---

## Files NOT Changed

- `src/renderer/` — untouched
- `src/channels/` — untouched
- `src/extensions/` — untouched
- `src/webserver/` — untouched
- `src/worker/*.ts` worker scripts — only type annotations added in PR 5
- Database schema — untouched
