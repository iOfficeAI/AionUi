# Main Process Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple the Electron main process modules via TypeScript interfaces and constructor injection to achieve independent testability per layer, without changing any user-facing behavior.

**Architecture:** Each layer depends only on an interface, not on a concrete class. Dependencies are passed via constructor injection (no DI framework). The 5 PRs are ordered so each builds on the previous without circular dependencies.

**Tech Stack:** Electron 37, TypeScript 5.8 strict mode, Vitest 4, better-sqlite3 (sync DB driver), `bun` as package manager/test runner.

**Spec:** `docs/superpowers/specs/2026-03-18-main-process-decouple-design.md`

**Branch:** `zynx/chore/main-process-decouple`

---

## Quick Reference: Commands

```bash
bun run test                              # run all tests
bun run test -- tests/unit/foo.test.ts   # run a single test file
bunx tsc --noEmit                         # type-check without building
bun run lint:fix                          # auto-fix lint issues
```

The `test` script is `vitest run`. Passing a file path after `--` routes it as a positional arg to vitest.

Existing mock pattern (copy this style — static `vi.mock` at file top, static imports):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyClass } from '../../src/process/...';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/test') } }));
// Then use MyClass directly in tests — no dynamic import needed
```

Path alias `@process/` resolves to `src/process/` in both source and test mocks. Use the alias form in `vi.mock` calls:

```typescript
vi.mock('@process/database', () => ({ getDatabase: vi.fn() }));
```

---

## PR 1 — Shared Types + Interface Definitions

> Pure TypeScript type files. Zero runtime code. No behavior change.
> After this PR: `bunx tsc --noEmit` passes, no test changes needed.

**Files created:**

- `src/process/task/agentTypes.ts`
- `src/process/task/IAgentManager.ts`
- `src/process/task/IAgentFactory.ts`
- `src/process/task/IAgentEventEmitter.ts`
- `src/process/task/IWorkerTaskManager.ts`
- `src/process/database/IConversationRepository.ts`
- `src/process/services/IConversationService.ts`
- `src/worker/WorkerProtocol.ts`

---

### Task 1.1: Shared agent types

**Files:**

- Create: `src/process/task/agentTypes.ts`

- [ ] **Create the file**

```typescript
// src/process/task/agentTypes.ts

export type AgentType = 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot';
export type AgentStatus = 'pending' | 'running' | 'finished';

export interface BuildConversationOptions {
  /** Force yolo mode (auto-approve all tool calls) */
  yoloMode?: boolean;
  /** Skip task cache — create a new isolated instance */
  skipCache?: boolean;
}
```

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/process/task/agentTypes.ts
git commit -m "feat(decouple): add shared agent types"
```

---

### Task 1.2: IConversationRepository

**Files:**

- Create: `src/process/database/IConversationRepository.ts`

- [ ] **Create the file**

```typescript
// src/process/database/IConversationRepository.ts
// All methods are synchronous (better-sqlite3 driver).
// The service layer is async to allow future migration.

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
  /**
   * If cursor is provided, offset is ignored.
   * If neither is provided, returns from the beginning.
   */
  getUserConversations(cursor?: string, offset?: number, limit?: number): PaginatedResult<TChatConversation>;
}
```

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/process/database/IConversationRepository.ts
git commit -m "feat(decouple): add IConversationRepository interface"
```

---

### Task 1.3: IConversationService

**Files:**

- Create: `src/process/services/IConversationService.ts`

- [ ] **Create the file**

```typescript
// src/process/services/IConversationService.ts

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

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/process/services/IConversationService.ts
git commit -m "feat(decouple): add IConversationService interface"
```

---

### Task 1.4: IAgentManager

**Files:**

- Create: `src/process/task/IAgentManager.ts`

- [ ] **Create the file**

```typescript
// src/process/task/IAgentManager.ts

import type { IConfirmation } from '@/common/chatLib';
import type { AgentType, AgentStatus } from './agentTypes';

export interface IAgentManager {
  readonly type: AgentType;
  /**
   * readonly on interface; the implementation class mutates its own this.status.
   */
  readonly status: AgentStatus | undefined;
  readonly workspace: string;
  readonly conversation_id: string;

  sendMessage(data: unknown): Promise<void>;
  stop(): Promise<void>;
  confirm(msgId: string, callId: string, data: unknown): void;
  getConfirmations(): IConfirmation[];
  kill(): void;
}
```

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/process/task/IAgentManager.ts
git commit -m "feat(decouple): add IAgentManager interface"
```

---

### Task 1.5: IAgentFactory + UnknownAgentTypeError

**Files:**

- Create: `src/process/task/IAgentFactory.ts`

- [ ] **Create the file**

```typescript
// src/process/task/IAgentFactory.ts

import type { TChatConversation } from '@/common/storage';
import type { IAgentManager } from './IAgentManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';

export type AgentCreator = (conversation: TChatConversation, options?: BuildConversationOptions) => IAgentManager;

export interface IAgentFactory {
  register(type: AgentType, creator: AgentCreator): void;
  /**
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

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/process/task/IAgentFactory.ts
git commit -m "feat(decouple): add IAgentFactory interface"
```

---

### Task 1.6: IAgentEventEmitter

**Files:**

- Create: `src/process/task/IAgentEventEmitter.ts`

- [ ] **Create the file**

```typescript
// src/process/task/IAgentEventEmitter.ts

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

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/process/task/IAgentEventEmitter.ts
git commit -m "feat(decouple): add IAgentEventEmitter interface"
```

---

### Task 1.7: IWorkerTaskManager

**Files:**

- Create: `src/process/task/IWorkerTaskManager.ts`

- [ ] **Create the file**

```typescript
// src/process/task/IWorkerTaskManager.ts

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

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Commit**

```bash
git add src/process/task/IWorkerTaskManager.ts
git commit -m "feat(decouple): add IWorkerTaskManager interface"
```

---

### Task 1.8: WorkerProtocol types

**Files:**

- Create: `src/worker/WorkerProtocol.ts`

- [ ] **Create the file**

```typescript
// src/worker/WorkerProtocol.ts

/** Messages sent from main process to worker */
export type MainToWorkerMessage =
  | { type: 'start'; data: unknown }
  | { type: 'stop.stream'; data: Record<string, never> }
  | { type: 'send.message'; data: unknown };

/**
 * Events sent from worker to main process.
 * Agent-specific variants (e.g. 'gemini.message') are defined in
 * src/worker/<agent>.protocol.ts and composed there.
 */
export type WorkerToMainEvent =
  | { type: 'complete'; data: unknown }
  | { type: 'error'; data: unknown }
  | { type: string; data: unknown; pipeId?: string };
```

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Run all tests (confirm nothing broken)**

```bash
bun run test
```

Expected: all existing tests pass.

- [ ] **Commit**

```bash
git add src/worker/WorkerProtocol.ts
git commit -m "feat(decouple): add WorkerProtocol type definitions"
```

---

## PR 2 — Repository + Service Layer

> Add `SqliteConversationRepository`. Create `ConversationServiceImpl` with injected repository. Move business logic out of `conversationBridge.ts` into the service. Bridge becomes a thin IPC router.

**Files created:**

- `src/process/database/SqliteConversationRepository.ts`
- `src/process/services/ConversationServiceImpl.ts`

**Files modified:**

- `src/process/bridge/conversationBridge.ts` — remove business logic, accept injected `IConversationService` + `IWorkerTaskManager`
- `src/process/initBridge.ts` — construct and inject dependencies

**Test files created:**

- `tests/unit/SqliteConversationRepository.test.ts`
- `tests/unit/ConversationServiceImpl.test.ts`

---

### Task 2.1: SqliteConversationRepository

**Files:**

- Create: `src/process/database/SqliteConversationRepository.ts`
- Create: `tests/unit/SqliteConversationRepository.test.ts`

- [ ] **Write the failing test first**

```typescript
// tests/unit/SqliteConversationRepository.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/test') } }));

const mockDb = {
  getConversation: vi.fn(),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getConversationMessages: vi.fn(),
  insertMessage: vi.fn(),
  getUserConversations: vi.fn(),
};
vi.mock('@process/database', () => ({ getDatabase: vi.fn(() => mockDb) }));

import { SqliteConversationRepository } from '../../src/process/database/SqliteConversationRepository';

describe('SqliteConversationRepository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getConversation returns data when DB succeeds', () => {
    const fakeConv = { id: 'c1', type: 'gemini' };
    mockDb.getConversation.mockReturnValue({ success: true, data: fakeConv });
    const repo = new SqliteConversationRepository();
    expect(repo.getConversation('c1')).toEqual(fakeConv);
    expect(mockDb.getConversation).toHaveBeenCalledWith('c1');
  });

  it('getConversation returns undefined when DB fails', () => {
    mockDb.getConversation.mockReturnValue({ success: false, data: null });
    const repo = new SqliteConversationRepository();
    expect(repo.getConversation('missing')).toBeUndefined();
  });

  it('getUserConversations maps to PaginatedResult shape', () => {
    mockDb.getUserConversations.mockReturnValue({ data: [{ id: 'c1' }], total: 1, hasMore: false });
    const repo = new SqliteConversationRepository();
    const result = repo.getUserConversations();
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });
});
```

- [ ] **Run test — expect FAIL**

```bash
bun run test -- tests/unit/SqliteConversationRepository.test.ts
```

Expected: FAIL — `SqliteConversationRepository` not found.

- [ ] **Implement SqliteConversationRepository**

```typescript
// src/process/database/SqliteConversationRepository.ts

import { getDatabase } from '@process/database';
import type { IConversationRepository, PaginatedResult } from './IConversationRepository';
import type { TChatConversation } from '@/common/storage';
import type { TMessage } from '@/common/chatLib';

export class SqliteConversationRepository implements IConversationRepository {
  private get db() {
    return getDatabase();
  }

  getConversation(id: string): TChatConversation | undefined {
    const result = this.db.getConversation(id);
    return result.success ? (result.data ?? undefined) : undefined;
  }

  createConversation(conversation: TChatConversation): void {
    this.db.createConversation(conversation);
  }

  updateConversation(id: string, updates: Partial<TChatConversation>): void {
    this.db.updateConversation(id, updates);
  }

  deleteConversation(id: string): void {
    this.db.deleteConversation(id);
  }

  getMessages(id: string, page: number, pageSize: number): PaginatedResult<TMessage> {
    const result = this.db.getConversationMessages(id, page, pageSize);
    return {
      data: result.data ?? [],
      total: result.total ?? 0,
      hasMore: result.hasMore ?? false,
    };
  }

  insertMessage(message: TMessage): void {
    this.db.insertMessage(message);
  }

  getUserConversations(cursor?: string, offset?: number, limit?: number): PaginatedResult<TChatConversation> {
    const result = this.db.getUserConversations(cursor, offset, limit);
    return {
      data: result.data ?? [],
      total: result.total ?? 0,
      hasMore: result.hasMore ?? false,
    };
  }
}
```

- [ ] **Run test — expect PASS**

```bash
bun run test -- tests/unit/SqliteConversationRepository.test.ts
```

- [ ] **Commit**

```bash
git add src/process/database/SqliteConversationRepository.ts tests/unit/SqliteConversationRepository.test.ts
git commit -m "feat(decouple): add SqliteConversationRepository"
```

---

### Task 2.2: ConversationServiceImpl — CRUD + migration methods

**Files:**

- Create: `src/process/services/ConversationServiceImpl.ts`
- Create: `tests/unit/ConversationServiceImpl.test.ts`

- [ ] **Write failing tests**

```typescript
// tests/unit/ConversationServiceImpl.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IConversationRepository } from '../../src/process/database/IConversationRepository';

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp'), isPackaged: false } }));
vi.mock('../../src/process/initStorage', () => ({ ProcessChat: { get: vi.fn(async () => []) } }));
vi.mock('../../src/process/services/cron/CronService', () => ({
  cronService: {
    listJobsByConversation: vi.fn(async () => []),
    removeJob: vi.fn(async () => {}),
    updateJob: vi.fn(async () => {}),
  },
}));

function makeRepo(overrides: Partial<IConversationRepository> = {}): IConversationRepository {
  return {
    getConversation: vi.fn(),
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    getMessages: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    insertMessage: vi.fn(),
    getUserConversations: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    ...overrides,
  };
}

import { ConversationServiceImpl } from '../../src/process/services/ConversationServiceImpl';

describe('ConversationServiceImpl.getConversation', () => {
  it('returns conversation from repo', async () => {
    const fakeConv = { id: 'c1', type: 'gemini' } as any;
    const repo = makeRepo({ getConversation: vi.fn(() => fakeConv) });
    const svc = new ConversationServiceImpl(repo);
    expect(await svc.getConversation('c1')).toEqual(fakeConv);
  });

  it('returns undefined when not found', async () => {
    const repo = makeRepo({ getConversation: vi.fn(() => undefined) });
    const svc = new ConversationServiceImpl(repo);
    expect(await svc.getConversation('missing')).toBeUndefined();
  });
});

describe('ConversationServiceImpl.deleteConversation', () => {
  it('calls repo.deleteConversation', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    await svc.deleteConversation('c1');
    expect(repo.deleteConversation).toHaveBeenCalledWith('c1');
  });
});

describe('ConversationServiceImpl.updateConversation', () => {
  it('calls repo.updateConversation with updates', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    await svc.updateConversation('c1', { name: 'new name' });
    expect(repo.updateConversation).toHaveBeenCalledWith('c1', { name: 'new name' });
  });

  it('merges extra when mergeExtra=true', async () => {
    const existing = { id: 'c1', extra: { workspace: '/ws', existing: true } } as any;
    const repo = makeRepo({ getConversation: vi.fn(() => existing) });
    const svc = new ConversationServiceImpl(repo);
    await svc.updateConversation('c1', { extra: { newField: 1 } } as any, true);
    expect(repo.updateConversation).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ extra: expect.objectContaining({ existing: true, newField: 1 }) })
    );
  });
});

describe('ConversationServiceImpl.createWithMigration', () => {
  it('creates conversation in repo', async () => {
    const repo = makeRepo({
      getMessages: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    });
    const svc = new ConversationServiceImpl(repo);
    const conv = { id: 'new', name: 'test' } as any;
    await svc.createWithMigration({ conversation: conv });
    expect(repo.createConversation).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
  });

  it('copies messages from source conversation', async () => {
    const msg = { id: 'msg1', conversation_id: 'src', content: 'hello' } as any;
    const repo = makeRepo({
      getMessages: vi
        .fn()
        .mockReturnValueOnce({ data: [msg], total: 1, hasMore: false }) // source first page
        .mockReturnValue({ data: [], total: 1, hasMore: false }), // integrity check calls
    });
    const svc = new ConversationServiceImpl(repo);
    await svc.createWithMigration({ conversation: { id: 'new' } as any, sourceConversationId: 'src' });
    expect(repo.insertMessage).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'new' }));
  });
});
```

- [ ] **Run tests — expect FAIL**

```bash
bun run test -- tests/unit/ConversationServiceImpl.test.ts
```

- [ ] **Implement ConversationServiceImpl (CRUD + migration)**

```typescript
// src/process/services/ConversationServiceImpl.ts

import type { IConversationService, CreateConversationParams, MigrateConversationParams } from './IConversationService';
import type { IConversationRepository } from '@process/database/IConversationRepository';
import type { TChatConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import { cronService } from './cron/CronService';

export class ConversationServiceImpl implements IConversationService {
  constructor(private readonly repo: IConversationRepository) {}

  async getConversation(id: string): Promise<TChatConversation | undefined> {
    return this.repo.getConversation(id);
  }

  async deleteConversation(id: string): Promise<void> {
    try {
      const jobs = await cronService.listJobsByConversation(id);
      for (const job of jobs) await cronService.removeJob(job.id);
    } catch (err) {
      console.warn('[ConversationServiceImpl] Failed to cleanup cron jobs:', err);
    }
    this.repo.deleteConversation(id);
  }

  async updateConversation(id: string, updates: Partial<TChatConversation>, mergeExtra?: boolean): Promise<void> {
    let finalUpdates = updates;
    if (mergeExtra && updates.extra) {
      const existing = this.repo.getConversation(id);
      if (existing) {
        finalUpdates = { ...updates, extra: { ...existing.extra, ...updates.extra } } as Partial<TChatConversation>;
      }
    }
    this.repo.updateConversation(id, finalUpdates);
  }

  async createWithMigration(params: MigrateConversationParams): Promise<TChatConversation> {
    const { conversation, sourceConversationId, migrateCron } = params;
    const conv = { ...conversation, createTime: Date.now(), modifyTime: Date.now() };
    this.repo.createConversation(conv);

    if (sourceConversationId) {
      // Copy all messages from source
      const pageSize = 10000;
      let page = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: messages, hasMore: more } = this.repo.getMessages(sourceConversationId, page, pageSize);
        for (const msg of messages) {
          this.repo.insertMessage({ ...msg, id: uuid(), conversation_id: conv.id });
        }
        hasMore = more;
        page++;
      }

      // Handle cron jobs
      try {
        const jobs = await cronService.listJobsByConversation(sourceConversationId);
        if (migrateCron) {
          for (const job of jobs) {
            await cronService.updateJob(job.id, {
              metadata: { ...job.metadata, conversationId: conv.id, conversationTitle: conv.name },
            });
          }
        } else {
          for (const job of jobs) await cronService.removeJob(job.id);
        }
      } catch (err) {
        console.error('[ConversationServiceImpl] Failed to handle cron jobs during migration:', err);
      }

      // Integrity check: delete source only if message counts match
      const sourceMsgs = this.repo.getMessages(sourceConversationId, 0, 1);
      const newMsgs = this.repo.getMessages(conv.id, 0, 1);
      if (sourceMsgs.total === newMsgs.total) {
        this.repo.deleteConversation(sourceConversationId);
      }
    }

    return conv;
  }

  // Implemented in Task 2.2b below
  async createConversation(_params: CreateConversationParams): Promise<TChatConversation> {
    throw new Error('Not yet implemented — see Task 2.2b');
  }
}
```

- [ ] **Run tests — expect PASS**

```bash
bun run test -- tests/unit/ConversationServiceImpl.test.ts
```

- [ ] **Commit**

```bash
git add src/process/services/ConversationServiceImpl.ts tests/unit/ConversationServiceImpl.test.ts
git commit -m "feat(decouple): add ConversationServiceImpl with repository injection"
```

---

### Task 2.2b: Implement createConversation in ConversationServiceImpl

**Files:**

- Modify: `src/process/services/ConversationServiceImpl.ts`
- Modify: `tests/unit/ConversationServiceImpl.test.ts`

The `createConversation` method needs to replicate what the existing `ConversationService.createConversation` does: call the appropriate `createXxxAgent` factory function to build the conversation object, then save it via the repository. These factory functions live in `src/process/initAgent.ts`.

- [ ] **Add failing test for createConversation**

Append to `tests/unit/ConversationServiceImpl.test.ts`:

```typescript
vi.mock('../../src/process/initAgent', () => ({
  createGeminiAgent: vi.fn(async () => ({ id: 'gen-id', type: 'gemini', name: 'test', extra: {} })),
  createAcpAgent: vi.fn(async () => ({ id: 'acp-id', type: 'acp', name: 'test', extra: {} })),
  createCodexAgent: vi.fn(async () => ({ id: 'codex-id', type: 'codex', name: 'test', extra: {} })),
  createOpenClawAgent: vi.fn(async () => ({ id: 'claw-id', type: 'openclaw-gateway', name: 'test', extra: {} })),
  createNanobotAgent: vi.fn(async () => ({ id: 'nano-id', type: 'nanobot', name: 'test', extra: {} })),
}));

describe('ConversationServiceImpl.createConversation', () => {
  it('creates and saves a gemini conversation', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    const result = await svc.createConversation({
      type: 'gemini',
      model: { provider: 'google', model: 'gemini-2.0-flash' } as any,
      extra: { workspace: '/ws' },
    });
    expect(result.type).toBe('gemini');
    expect(repo.createConversation).toHaveBeenCalledWith(expect.objectContaining({ type: 'gemini' }));
  });

  it('throws for unknown conversation type', async () => {
    const repo = makeRepo();
    const svc = new ConversationServiceImpl(repo);
    await expect(svc.createConversation({ type: 'unknown' as any, model: {} as any, extra: {} })).rejects.toThrow();
  });
});
```

- [ ] **Run — expect FAIL**

```bash
bun run test -- tests/unit/ConversationServiceImpl.test.ts
```

- [ ] **Implement createConversation**

Replace the stub in `ConversationServiceImpl.ts`:

```typescript
async createConversation(params: CreateConversationParams): Promise<TChatConversation> {
  const {
    createGeminiAgent,
    createAcpAgent,
    createCodexAgent,
    createOpenClawAgent,
    createNanobotAgent,
  } = await import('@process/initAgent')

  let conversation: TChatConversation

  switch (params.type) {
    case 'gemini':
      conversation = await createGeminiAgent(
        params.model,
        params.extra.workspace,
        params.extra.defaultFiles as string[] | undefined,
        params.extra.webSearchEngine,
        params.extra.customWorkspace,
        params.extra.contextFileName,
        params.extra.presetRules,
        params.extra.enabledSkills as string[] | undefined,
        params.extra.presetAssistantId,
        params.extra.sessionMode,
        params.extra.isHealthCheck
      )
      break
    case 'acp':
      conversation = await createAcpAgent(params as any)
      break
    case 'codex':
      conversation = await createCodexAgent(params as any)
      break
    case 'openclaw-gateway':
      conversation = await createOpenClawAgent(params as any)
      break
    case 'nanobot':
      conversation = await createNanobotAgent(params as any)
      break
    default:
      throw new Error(`Invalid conversation type: ${(params as any).type}`)
  }

  if (params.id) conversation.id = params.id
  if (params.name) conversation.name = params.name
  if (params.source) conversation.source = params.source
  if (params.channelChatId) conversation.channelChatId = params.channelChatId

  this.repo.createConversation(conversation)
  return conversation
}
```

- [ ] **Run — expect PASS**

```bash
bun run test -- tests/unit/ConversationServiceImpl.test.ts
```

- [ ] **Run all tests**

```bash
bun run test
```

- [ ] **Commit**

```bash
git add src/process/services/ConversationServiceImpl.ts tests/unit/ConversationServiceImpl.test.ts
git commit -m "feat(decouple): implement createConversation in ConversationServiceImpl"
```

---

### Task 2.3: Wire ConversationServiceImpl into conversationBridge

**Files:**

- Modify: `src/process/bridge/conversationBridge.ts`
- Modify: `src/process/initBridge.ts`

- [ ] **Change `initConversationBridge` to accept injected dependencies**

Update the function signature in `conversationBridge.ts`:

```typescript
// Before:
export function initConversationBridge(): void {

// After:
import type { IConversationService } from '@process/services/IConversationService'
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager'

export function initConversationBridge(
  conversationService: IConversationService,
  workerTaskManager: IWorkerTaskManager
): void {
```

Replace all direct `getDatabase()` calls and `WorkerManage.*` calls inside this bridge with calls to the injected interfaces. Key replacements:

| Before                                           | After                                                  |
| ------------------------------------------------ | ------------------------------------------------------ |
| `getDatabase().deleteConversation(id)`           | `await conversationService.deleteConversation(id)`     |
| `WorkerManage.kill(id)`                          | `workerTaskManager.kill(id)`                           |
| `WorkerManage.getTaskByIdRollbackBuild(id)`      | `workerTaskManager.getOrBuildTask(id)`                 |
| `db.createConversation(...)` + migration logic   | `await conversationService.createWithMigration(...)`   |
| `ConversationService.createConversation(params)` | `await conversationService.createConversation(params)` |

- [ ] **Update `initBridge.ts` to construct and inject dependencies**

```typescript
// src/process/initBridge.ts
import { SqliteConversationRepository } from '@process/database/SqliteConversationRepository';
import { ConversationServiceImpl } from '@process/services/ConversationServiceImpl';
import WorkerManage from '@process/WorkerManage';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

// Thin shim: adapts the existing WorkerManage module to IWorkerTaskManager.
// This shim is replaced in PR 4 when WorkerTaskManager is introduced.
const workerTaskManagerShim: IWorkerTaskManager = {
  getTask: (id) => WorkerManage.getTaskById(id) ?? undefined,
  getOrBuildTask: (id, opts) => WorkerManage.getTaskByIdRollbackBuild(id, opts),
  addTask: (id, task) => WorkerManage.addTask(id, task as any),
  kill: (id) => WorkerManage.kill(id),
  clear: () => WorkerManage.clear(),
  listTasks: () => WorkerManage.listTasks(),
};

const repo = new SqliteConversationRepository();
const conversationServiceImpl = new ConversationServiceImpl(repo);

// Pass injected instances to each bridge init function
initConversationBridge(conversationServiceImpl, workerTaskManagerShim);
// Other bridges unchanged for now
```

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Run all tests**

```bash
bun run test
```

Expected: all tests pass.

- [ ] **Commit**

```bash
git add src/process/bridge/conversationBridge.ts src/process/initBridge.ts
git commit -m "feat(decouple): wire ConversationServiceImpl into conversationBridge"
```

---

## PR 3 — Agent Event Emitter Injection

> Remove direct `ipcBridge` calls from `BaseAgentManager`. Inject `IAgentEventEmitter`. Declare `implements IAgentManager`.

**Files created:**

- `src/process/task/IpcAgentEventEmitter.ts`

**Files modified:**

- `src/process/task/BaseAgentManager.ts`
- All subclasses: `GeminiAgentManager.ts`, `AcpAgentManager.ts`, `CodexAgentManager.ts`, `OpenClawAgentManager.ts`, `NanoBotAgentManager.ts`

**Test files created:**

- `tests/unit/IpcAgentEventEmitter.test.ts`
- `tests/unit/BaseAgentManagerDecouple.test.ts`

---

### Task 3.1: IpcAgentEventEmitter

**Files:**

- Create: `src/process/task/IpcAgentEventEmitter.ts`
- Create: `tests/unit/IpcAgentEventEmitter.test.ts`

- [ ] **Write failing test**

```typescript
// tests/unit/IpcAgentEventEmitter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdd = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();
const mockMessage = vi.fn();

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp') } }));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      confirmation: {
        add: { emit: mockAdd },
        update: { emit: mockUpdate },
        remove: { emit: mockRemove },
      },
      message: { emit: mockMessage },
    },
  },
}));

import { IpcAgentEventEmitter } from '../../src/process/task/IpcAgentEventEmitter';

describe('IpcAgentEventEmitter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emitConfirmationAdd calls ipcBridge with conversationId merged', () => {
    const emitter = new IpcAgentEventEmitter();
    const data = { id: 'conf1', callId: 'call1', options: [] } as any;
    emitter.emitConfirmationAdd('conv1', data);
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'conv1', id: 'conf1' }));
  });

  it('emitConfirmationRemove passes id and conversationId', () => {
    const emitter = new IpcAgentEventEmitter();
    emitter.emitConfirmationRemove('conv1', 'conf1');
    expect(mockRemove).toHaveBeenCalledWith({ conversation_id: 'conv1', id: 'conf1' });
  });

  it('emitMessage calls ipcBridge.conversation.message.emit', () => {
    const emitter = new IpcAgentEventEmitter();
    emitter.emitMessage('conv1', { type: 'text', data: { content: 'hi', msg_id: 'm1' } });
    expect(mockMessage).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'conv1', type: 'text' }));
  });
});
```

- [ ] **Run — expect FAIL**

```bash
bun run test -- tests/unit/IpcAgentEventEmitter.test.ts
```

- [ ] **Implement IpcAgentEventEmitter**

```typescript
// src/process/task/IpcAgentEventEmitter.ts

import { ipcBridge } from '@/common';
import type { IAgentEventEmitter, AgentMessageEvent } from './IAgentEventEmitter';
import type { IConfirmation } from '@/common/chatLib';

export class IpcAgentEventEmitter implements IAgentEventEmitter {
  emitConfirmationAdd(conversationId: string, data: IConfirmation): void {
    ipcBridge.conversation.confirmation.add.emit({ ...data, conversation_id: conversationId });
  }

  emitConfirmationUpdate(conversationId: string, data: IConfirmation): void {
    ipcBridge.conversation.confirmation.update.emit({ ...data, conversation_id: conversationId });
  }

  emitConfirmationRemove(conversationId: string, confirmationId: string): void {
    ipcBridge.conversation.confirmation.remove.emit({
      conversation_id: conversationId,
      id: confirmationId,
    });
  }

  emitMessage(conversationId: string, event: AgentMessageEvent): void {
    ipcBridge.conversation.message.emit({ ...event, conversation_id: conversationId });
  }
}
```

- [ ] **Run — expect PASS**

```bash
bun run test -- tests/unit/IpcAgentEventEmitter.test.ts
```

- [ ] **Commit**

```bash
git add src/process/task/IpcAgentEventEmitter.ts tests/unit/IpcAgentEventEmitter.test.ts
git commit -m "feat(decouple): add IpcAgentEventEmitter"
```

---

### Task 3.2: Inject IAgentEventEmitter into BaseAgentManager

**Files:**

- Modify: `src/process/task/BaseAgentManager.ts`
- Modify: all subclass files (pass emitter through)
- Create: `tests/unit/BaseAgentManagerDecouple.test.ts`

- [ ] **Write failing test**

```typescript
// tests/unit/BaseAgentManagerDecouple.test.ts
import { describe, it, expect, vi } from 'vitest';
import type { IAgentEventEmitter } from '../../src/process/task/IAgentEventEmitter';
import type { IAgentManager } from '../../src/process/task/IAgentManager';

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp') },
  utilityProcess: { fork: vi.fn(() => ({ on: vi.fn(), postMessage: vi.fn(), kill: vi.fn() })) },
}));
vi.mock('../../src/process/utils/shellEnv', () => ({ getEnhancedEnv: vi.fn(() => ({})) }));

function makeMockEmitter(): IAgentEventEmitter {
  return {
    emitConfirmationAdd: vi.fn(),
    emitConfirmationUpdate: vi.fn(),
    emitConfirmationRemove: vi.fn(),
    emitMessage: vi.fn(),
  };
}

import BaseAgentManager from '../../src/process/task/BaseAgentManager';

describe('BaseAgentManager with injected emitter', () => {
  it('addConfirmation calls emitter.emitConfirmationAdd', () => {
    const emitter = makeMockEmitter();
    class TestAgent extends BaseAgentManager<unknown> {
      constructor() {
        super('gemini', {}, emitter);
      }
      public testAdd(data: any) {
        this.addConfirmation(data);
      }
    }
    const agent = new TestAgent();
    (agent as any).conversation_id = 'c1';
    const confirmation = { id: 'conf1', callId: 'call1', options: [] };
    agent.testAdd(confirmation);
    expect(emitter.emitConfirmationAdd).toHaveBeenCalledWith('c1', confirmation);
  });

  it('satisfies IAgentManager interface', () => {
    const emitter = makeMockEmitter();
    class TestAgent extends BaseAgentManager<unknown> {
      constructor() {
        super('gemini', {}, emitter);
      }
    }
    const agent: IAgentManager = new TestAgent();
    expect(agent.type).toBe('gemini');
  });
});
```

- [ ] **Run — expect FAIL**

```bash
bun run test -- tests/unit/BaseAgentManagerDecouple.test.ts
```

- [ ] **Modify BaseAgentManager**

Key changes:

1. Add `protected readonly emitter: IAgentEventEmitter` as third constructor parameter
2. Replace `ipcBridge.conversation.confirmation.add.emit(...)` → `this.emitter.emitConfirmationAdd(this.conversation_id, data)`
3. Replace `ipcBridge.conversation.confirmation.update.emit(...)` → `this.emitter.emitConfirmationUpdate(this.conversation_id, data)`
4. Replace `ipcBridge.conversation.confirmation.remove.emit(...)` → `this.emitter.emitConfirmationRemove(this.conversation_id, id)`
5. Add `implements IAgentManager` to the class declaration

- [ ] **Update subclass constructors**

Each subclass (`GeminiAgentManager`, `AcpAgentManager`, `CodexAgentManager`, `OpenClawAgentManager`, `NanoBotAgentManager`) calls `super(type, data)`. Update to pass the emitter:

```typescript
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
// In each subclass constructor:
super(type, data, new IpcAgentEventEmitter());
```

- [ ] **Run — expect PASS**

```bash
bun run test -- tests/unit/BaseAgentManagerDecouple.test.ts
```

- [ ] **Run all tests**

```bash
bun run test
```

- [ ] **Commit**

```bash
git add src/process/task/
git commit -m "feat(decouple): inject IAgentEventEmitter into BaseAgentManager"
```

---

## PR 4 — AgentFactory + WorkerTaskManager

> Replace `WorkerManage.buildConversation` switch/case with `AgentFactory`. Replace the `WorkerManage` module object with `WorkerTaskManager` class. Remove the `workerTaskManagerShim` introduced in PR 2.

**Files created:**

- `src/process/task/AgentFactory.ts`
- `src/process/task/WorkerTaskManager.ts`

**Files deleted:**

- `src/process/WorkerManage.ts`

**Files modified:**

- `src/process/initBridge.ts` — register agent creators, replace shim with real `WorkerTaskManager`

**Test files created:**

- `tests/unit/AgentFactory.test.ts`
- `tests/unit/WorkerTaskManager.test.ts`

---

### Task 4.1: AgentFactory

**Files:**

- Create: `src/process/task/AgentFactory.ts`
- Create: `tests/unit/AgentFactory.test.ts`

- [ ] **Write failing tests**

```typescript
// tests/unit/AgentFactory.test.ts
import { describe, it, expect, vi } from 'vitest';
import { AgentFactory } from '../../src/process/task/AgentFactory';
import { UnknownAgentTypeError } from '../../src/process/task/IAgentFactory';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

describe('AgentFactory', () => {
  it('creates agent using registered creator', () => {
    const factory = new AgentFactory();
    const mockAgent = { type: 'gemini', status: undefined, workspace: '', conversation_id: 'c1' } as any;
    const creator = vi.fn(() => mockAgent);
    factory.register('gemini', creator);

    const conv = { id: 'c1', type: 'gemini', extra: {} } as any;
    const result = factory.create(conv);

    expect(creator).toHaveBeenCalledWith(conv, undefined);
    expect(result).toBe(mockAgent);
  });

  it('throws UnknownAgentTypeError for unregistered type', () => {
    const factory = new AgentFactory();
    const conv = { id: 'c1', type: 'gemini', extra: {} } as any;
    expect(() => factory.create(conv)).toThrow(UnknownAgentTypeError);
  });

  it('latest registered creator wins', () => {
    const factory = new AgentFactory();
    const agent1 = { type: 'gemini' } as any;
    const agent2 = { type: 'gemini' } as any;
    factory.register('gemini', () => agent1);
    factory.register('gemini', () => agent2);
    const conv = { id: 'c1', type: 'gemini', extra: {} } as any;
    expect(factory.create(conv)).toBe(agent2);
  });
});
```

- [ ] **Run — expect FAIL**

```bash
bun run test -- tests/unit/AgentFactory.test.ts
```

- [ ] **Implement AgentFactory**

```typescript
// src/process/task/AgentFactory.ts

import type { TChatConversation } from '@/common/storage';
import type { IAgentFactory, AgentCreator } from './IAgentFactory';
import { UnknownAgentTypeError } from './IAgentFactory';
import type { IAgentManager } from './IAgentManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';

export class AgentFactory implements IAgentFactory {
  private creators = new Map<AgentType, AgentCreator>();

  register(type: AgentType, creator: AgentCreator): void {
    this.creators.set(type, creator);
  }

  create(conversation: TChatConversation, options?: BuildConversationOptions): IAgentManager {
    const creator = this.creators.get(conversation.type as AgentType);
    if (!creator) throw new UnknownAgentTypeError(conversation.type);
    return creator(conversation, options);
  }
}
```

- [ ] **Run — expect PASS**

```bash
bun run test -- tests/unit/AgentFactory.test.ts
```

- [ ] **Commit**

```bash
git add src/process/task/AgentFactory.ts tests/unit/AgentFactory.test.ts
git commit -m "feat(decouple): add AgentFactory"
```

---

### Task 4.2: WorkerTaskManager

**Files:**

- Create: `src/process/task/WorkerTaskManager.ts`
- Create: `tests/unit/WorkerTaskManager.test.ts`

- [ ] **Write failing tests**

```typescript
// tests/unit/WorkerTaskManager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));
vi.mock('@process/initStorage', () => ({ ProcessChat: { get: vi.fn(async () => []) } }));

const mockGetConversation = vi.fn();
vi.mock('@process/database/export', () => ({
  getDatabase: vi.fn(() => ({ getConversation: mockGetConversation })),
}));

import { WorkerTaskManager } from '../../src/process/task/WorkerTaskManager';

function makeFactory(agent?: any) {
  return { register: vi.fn(), create: vi.fn(() => agent ?? makeAgent()) };
}
function makeAgent(id = 'c1') {
  return {
    type: 'gemini' as const,
    status: undefined,
    workspace: '/ws',
    conversation_id: id,
    kill: vi.fn(),
    sendMessage: vi.fn(),
    stop: vi.fn(),
    confirm: vi.fn(),
    getConfirmations: vi.fn(() => []),
  };
}

describe('WorkerTaskManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns cached task on second call to getTask', () => {
    const mgr = new WorkerTaskManager(makeFactory() as any);
    const agent = makeAgent();
    mgr.addTask('c1', agent as any);
    expect(mgr.getTask('c1')).toBe(agent);
  });

  it('kill removes task from list and calls task.kill()', () => {
    const agent = makeAgent();
    const mgr = new WorkerTaskManager(makeFactory(agent) as any);
    mgr.addTask('c1', agent as any);
    mgr.kill('c1');
    expect(mgr.getTask('c1')).toBeUndefined();
    expect(agent.kill).toHaveBeenCalled();
  });

  it('getOrBuildTask calls factory.create on cache miss', async () => {
    const agent = makeAgent();
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mockGetConversation.mockReturnValue({ success: true, data: { id: 'c1', type: 'gemini', extra: {} } });

    const result = await mgr.getOrBuildTask('c1');
    expect(factory.create).toHaveBeenCalled();
    expect(result).toBe(agent);
  });

  it('getOrBuildTask returns cached task without calling factory', async () => {
    const agent = makeAgent();
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mgr.addTask('c1', agent as any);

    const result = await mgr.getOrBuildTask('c1');
    expect(factory.create).not.toHaveBeenCalled();
    expect(result).toBe(agent);
  });
});
```

- [ ] **Run — expect FAIL**

```bash
bun run test -- tests/unit/WorkerTaskManager.test.ts
```

- [ ] **Implement WorkerTaskManager**

```typescript
// src/process/task/WorkerTaskManager.ts

import type { IAgentFactory } from './IAgentFactory';
import type { IAgentManager } from './IAgentManager';
import type { IWorkerTaskManager } from './IWorkerTaskManager';
import type { BuildConversationOptions } from './agentTypes';
import { getDatabase } from '@process/database/export';
import { ProcessChat } from '@process/initStorage';
import type { TChatConversation } from '@/common/storage';

export class WorkerTaskManager implements IWorkerTaskManager {
  private taskList: Array<{ id: string; task: IAgentManager }> = [];

  constructor(private readonly factory: IAgentFactory) {}

  getTask(id: string): IAgentManager | undefined {
    return this.taskList.find((item) => item.id === id)?.task;
  }

  async getOrBuildTask(id: string, options?: BuildConversationOptions): Promise<IAgentManager> {
    if (!options?.skipCache) {
      const existing = this.getTask(id);
      if (existing) return existing;
    }

    const db = getDatabase();
    const dbResult = db.getConversation(id);
    if (dbResult.success && dbResult.data) {
      return this._buildAndCache(dbResult.data, options);
    }

    const list = (await ProcessChat.get('chat.history')) as TChatConversation[] | undefined;
    const conversation = list?.find((item) => item.id === id);
    if (conversation) return this._buildAndCache(conversation, options);

    return Promise.reject(new Error(`Conversation not found: ${id}`));
  }

  private _buildAndCache(conversation: TChatConversation, options?: BuildConversationOptions): IAgentManager {
    const task = this.factory.create(conversation, options);
    if (!options?.skipCache) {
      this.taskList.push({ id: conversation.id, task });
    }
    return task;
  }

  addTask(id: string, task: IAgentManager): void {
    const existing = this.taskList.find((item) => item.id === id);
    if (existing) {
      existing.task = task;
    } else {
      this.taskList.push({ id, task });
    }
  }

  kill(id: string): void {
    const index = this.taskList.findIndex((item) => item.id === id);
    if (index === -1) return;
    this.taskList[index]?.task.kill();
    this.taskList.splice(index, 1);
  }

  clear(): void {
    this.taskList.forEach((item) => item.task.kill());
    this.taskList = [];
  }

  listTasks(): Array<{ id: string; type: string }> {
    return this.taskList.map((t) => ({ id: t.id, type: t.task.type }));
  }
}
```

- [ ] **Run — expect PASS**

```bash
bun run test -- tests/unit/WorkerTaskManager.test.ts
```

- [ ] **Commit**

```bash
git add src/process/task/WorkerTaskManager.ts tests/unit/WorkerTaskManager.test.ts
git commit -m "feat(decouple): add WorkerTaskManager"
```

---

### Task 4.3: Register agent creators + replace shim in initBridge

**Files:**

- Modify: `src/process/initBridge.ts`

- [ ] **Replace shim with real WorkerTaskManager**

In `initBridge.ts`, replace the `workerTaskManagerShim` block with:

```typescript
import { AgentFactory } from '@process/task/AgentFactory';
import { WorkerTaskManager } from '@process/task/WorkerTaskManager';
import { IpcAgentEventEmitter } from '@process/task/IpcAgentEventEmitter';
import { GeminiAgentManager } from '@process/task/GeminiAgentManager';
import AcpAgentManager from '@process/task/AcpAgentManager';
import { CodexAgentManager } from '@agent/codex';
import OpenClawAgentManager from '@process/task/OpenClawAgentManager';
import NanoBotAgentManager from '@process/task/NanoBotAgentManager';

const emitter = new IpcAgentEventEmitter();
const agentFactory = new AgentFactory();

agentFactory.register(
  'gemini',
  (conv, opts) =>
    new GeminiAgentManager({ ...conv.extra, conversation_id: conv.id, yoloMode: opts?.yoloMode }, conv.model)
);
agentFactory.register(
  'acp',
  (conv, opts) => new AcpAgentManager({ ...conv.extra, conversation_id: conv.id, yoloMode: opts?.yoloMode })
);
agentFactory.register(
  'codex',
  (conv, opts) =>
    new CodexAgentManager({
      ...conv.extra,
      conversation_id: conv.id,
      yoloMode: opts?.yoloMode,
      sessionMode: conv.extra.sessionMode,
    })
);
agentFactory.register(
  'openclaw-gateway',
  (conv, opts) => new OpenClawAgentManager({ ...conv.extra, conversation_id: conv.id, yoloMode: opts?.yoloMode })
);
agentFactory.register(
  'nanobot',
  (conv, opts) => new NanoBotAgentManager({ ...conv.extra, conversation_id: conv.id, yoloMode: opts?.yoloMode })
);

export const workerTaskManager = new WorkerTaskManager(agentFactory);
```

- [ ] **Delete WorkerManage.ts**

```bash
git rm src/process/WorkerManage.ts
```

Update all remaining import sites of `WorkerManage` to use `workerTaskManager` from `initBridge.ts`:

```bash
grep -rn "WorkerManage" src/ --include="*.ts"
```

For each file found: replace `WorkerManage.getTaskById` → `workerTaskManager.getTask`, etc.

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Run all tests**

```bash
bun run test
```

- [ ] **Commit**

```bash
git add src/process/
git commit -m "feat(decouple): wire AgentFactory + WorkerTaskManager, remove WorkerManage"
```

---

## PR 5 — Bridge Cleanup + Worker Protocol Types

> Remove remaining type guards across bridge files. Apply WorkerProtocol types to ForkTask.

**Files modified:**

- `src/process/bridge/conversationBridge.ts` — remove remaining `task.type === 'xxx'` guards
- `src/process/bridge/taskBridge.ts` — remove type guards if present
- `src/worker/fork/ForkTask.ts` — annotate with WorkerProtocol types

---

### Task 5.1: Remove type guards from conversationBridge

**Files:**

- Modify: `src/process/bridge/conversationBridge.ts`

- [ ] **Find remaining type guards**

```bash
grep -n "task\.type" src/process/bridge/conversationBridge.ts
```

- [ ] **Replace each guard with the interface method**

For example, the `stop` handler:

```typescript
// Before:
if (
  task.type !== 'gemini' &&
  task.type !== 'acp' &&
  task.type !== 'codex' &&
  task.type !== 'openclaw-gateway' &&
  task.type !== 'nanobot'
) {
  return { success: false, msg: 'not support' };
}
await task.stop();

// After (IAgentManager always has stop()):
await task.stop();
return { success: true };
```

For `sendMessage`, pass `data` directly to `task.sendMessage(data)` — no per-type dispatch needed.

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Run all tests**

```bash
bun run test
```

- [ ] **Commit**

```bash
git add src/process/bridge/conversationBridge.ts
git commit -m "refactor(decouple): remove type guards from conversationBridge"
```

---

### Task 5.1b: Check and clean taskBridge

**Files:**

- Modify (if needed): `src/process/bridge/taskBridge.ts`

- [ ] **Check for type guards**

```bash
grep -n "task\.type" src/process/bridge/taskBridge.ts
```

- [ ] **If found: apply same pattern as Task 5.1**

Replace each guard with a direct call to the `IAgentManager` interface method.

- [ ] **Type-check and commit if changed**

```bash
bunx tsc --noEmit
bun run test
git add src/process/bridge/taskBridge.ts
git commit -m "refactor(decouple): remove type guards from taskBridge"
```

---

### Task 5.2: Apply WorkerProtocol types to ForkTask

**Files:**

- Modify: `src/worker/fork/ForkTask.ts`

This is a type-annotation-only change. The goal is to replace bare `string` type parameters with the `MainToWorkerMessage['type']` union where the method accepts a message type string.

- [ ] **Open ForkTask.ts and find the postMessage signature**

Current signature (approximate — read the actual file before editing):

```typescript
postMessage(type: string, data: any, extParams: Record<string, any> = {}): void
```

- [ ] **Import and apply the type**

```typescript
import type { MainToWorkerMessage } from '../WorkerProtocol'

// Change type parameter from `string` to the union:
postMessage(type: MainToWorkerMessage['type'] | string, data: unknown, extParams: Record<string, unknown> = {}): void
```

Note: use `MainToWorkerMessage['type'] | string` to stay backward compatible with agent-specific message types not yet in the base protocol.

- [ ] **Type-check**

```bash
bunx tsc --noEmit
```

- [ ] **Run all tests**

```bash
bun run test
```

- [ ] **Commit**

```bash
git add src/worker/fork/ForkTask.ts
git commit -m "refactor(decouple): annotate ForkTask.postMessage with WorkerProtocol types"
```

---

## Completion Checklist

After all 5 PRs are on the branch:

- [ ] `bun run test` passes
- [ ] `bunx tsc --noEmit` passes
- [ ] `bun run lint:fix` produces no lint errors
- [ ] `bun run test:integration` passes
- [ ] Each of the following can be tested without mocking Electron IPC or the real DB:
  - `ConversationServiceImpl` — mock `IConversationRepository`
  - `WorkerTaskManager` — mock `IAgentFactory`
  - `BaseAgentManager` — mock `IAgentEventEmitter`
  - `AgentFactory` — no mocks needed
- [ ] No direct `getDatabase()` calls remain outside `SqliteConversationRepository`
- [ ] No direct `ipcBridge` calls remain inside `BaseAgentManager`
- [ ] No `switch (conversation.type)` blocks remain (WorkerManage deleted)
- [ ] `grep -rn "WorkerManage" src/` returns no results
