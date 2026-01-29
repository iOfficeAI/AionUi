、# AionUI Cron Feature - Implementation Tasks

> Breakdown of cron-feature-design.md into executable tasks

## Task Dependency Graph

```
Layer 0 (No Dependencies - Can Start Immediately):
├── #1  Create cron skill file
├── #2  Implement CronCommandDetector
├── #3  Add cron_jobs database schema
└── #5  Implement CronBusyGuard

Layer 1:
└── #4  Implement CronStore                    ← depends on #3

Layer 2:
└── #6  Implement CronService                  ← depends on #4, #5

Layer 3 (Can Run in Parallel):
├── #7  Implement MessageMiddleware            ← depends on #2, #6
├── #9  Implement cronBridge                   ← depends on #6
└── #10 Initialize CronService on app start   ← depends on #6

Layer 4:
└── #8  Integrate into AgentManagers           ← depends on #5, #7
```

---

## Task #1: Create Cron Skill File

**Status**: Pending
**Dependencies**: None
**Estimated Lines**: ~50

### Description

Create `skills/cron/SKILL.md` - the protocol document that tells agents how to output cron commands.

### Location

`skills/cron/SKILL.md`

### Content

```markdown
---
name: cron
description: Scheduled task management - create, query, delete scheduled tasks
---

## Scheduled Task Skill

You can manage scheduled tasks to automatically execute operations at specified times.

### Create Scheduled Task

When user requests a timed reminder or periodic task, output this format:

[CRON_CREATE]
name: Task name
schedule: Cron expression (e.g., "0 9 * * MON" for every Monday 9am)
message: Message content to send
[/CRON_CREATE]

### Query Scheduled Tasks

Output [CRON_LIST] to view all scheduled tasks in current conversation.

### Delete Scheduled Task

Output [CRON_DELETE: task-id] to delete a specific task.

### Cron Expression Reference

| Expression | Meaning |
|------------|---------|
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9 * * MON` | Every Monday at 9:00 AM |
| `*/30 * * * *` | Every 30 minutes |
| `0 0 1 * *` | 1st of every month at midnight |
| `0 9 * * MON-FRI` | Weekdays at 9:00 AM |
| `0 */2 * * *` | Every 2 hours |

### Examples

**User**: "Remind me about the weekly meeting every Monday at 9am"

**Agent response**:
[CRON_CREATE]
name: Weekly Meeting Reminder
schedule: 0 9 * * MON
message: Time for the weekly meeting!
[/CRON_CREATE]
```

### Notes

- NOT injected as built-in skill
- Loaded through AssistantManagement business layer
- Users can enable/disable per assistant configuration

---

## Task #2: Implement CronCommandDetector

**Status**: Pending
**Dependencies**: None
**Estimated Lines**: ~80

### Description

Create a pure function module to detect cron commands in agent message content.

### Location

`src/process/task/CronCommandDetector.ts`

### Interface

```typescript
export type CronCommand =
  | { kind: 'create'; name: string; schedule: string; message: string }
  | { kind: 'list' }
  | { kind: 'delete'; jobId: string };

/**
 * Detect cron commands in message content
 * @param content - The text content to scan
 * @returns Array of detected commands
 */
export function detectCronCommands(content: string): CronCommand[];
```

### Implementation

```typescript
export function detectCronCommands(content: string): CronCommand[] {
  const commands: CronCommand[] = [];

  // Detect [CRON_CREATE]...[/CRON_CREATE]
  const createMatches = content.matchAll(
    /\[CRON_CREATE\]\s*\n([\s\S]*?)\[\/CRON_CREATE\]/gi
  );
  for (const match of createMatches) {
    const body = match[1];
    const name = body.match(/name:\s*(.+)/i)?.[1]?.trim();
    const schedule = body.match(/schedule:\s*(.+)/i)?.[1]?.trim();
    const message = body.match(/message:\s*([\s\S]*?)(?=\n[a-z]+:|$)/i)?.[1]?.trim();
    if (name && schedule && message) {
      commands.push({ kind: 'create', name, schedule, message });
    }
  }

  // Detect [CRON_LIST]
  if (/\[CRON_LIST\]/i.test(content)) {
    commands.push({ kind: 'list' });
  }

  // Detect [CRON_DELETE: xxx]
  const deleteMatches = content.matchAll(/\[CRON_DELETE:\s*([^\]]+)\]/gi);
  for (const match of deleteMatches) {
    commands.push({ kind: 'delete', jobId: match[1].trim() });
  }

  return commands;
}
```

### Tests

Should add unit tests for:
- Single CRON_CREATE block
- Multiple CRON_CREATE blocks
- CRON_LIST detection
- CRON_DELETE with various ID formats
- Mixed commands in one message
- Edge cases (empty content, malformed blocks)

---

## Task #3: Add cron_jobs Database Schema

**Status**: Pending
**Dependencies**: None
**Estimated Lines**: ~40

### Description

Add cron_jobs table to the SQLite database schema.

### Location

`src/process/database/schema.ts` (or wherever schema is defined)

### Schema

```sql
CREATE TABLE IF NOT EXISTS cron_jobs (
  -- Basic info
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,

  -- Schedule
  schedule_kind TEXT NOT NULL,       -- 'at' | 'every' | 'cron'
  schedule_value TEXT NOT NULL,      -- timestamp | ms | cron expr
  schedule_tz TEXT,                  -- timezone (optional)

  -- Target
  payload_message TEXT NOT NULL,

  -- Metadata (for management)
  conversation_id TEXT NOT NULL,     -- Which conversation created this
  conversation_title TEXT,           -- For display in UI
  agent_type TEXT NOT NULL,          -- 'gemini' | 'claude' | 'codex' | etc.
  created_by TEXT NOT NULL,          -- 'user' | 'agent'
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),

  -- Runtime state
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,                  -- 'ok' | 'error' | 'skipped'
  last_error TEXT,                   -- Error message if failed
  run_count INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cron_jobs_conversation ON cron_jobs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at) WHERE enabled = 1;
CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent_type ON cron_jobs(agent_type);
```

### Migration

May need to add migration script if database versioning is used.

---

## Task #4: Implement CronStore (Persistence Layer)

**Status**: Pending
**Dependencies**: Task #3 (Database Schema)
**Estimated Lines**: ~120

### Description

Create SQLite persistence layer for cron jobs.

### Location

`src/process/services/CronStore.ts`

### Interface

```typescript
import type { CronJob, CronSchedule } from './CronService';

export class CronStore {
  constructor(private db: Database);

  insert(job: CronJob): void;
  update(jobId: string, updates: Partial<CronJob>): void;
  delete(jobId: string): void;
  getById(jobId: string): CronJob | null;
  listAll(): CronJob[];
  listByConversation(conversationId: string): CronJob[];
  listEnabled(): CronJob[];
}
```

### Implementation Notes

- Handle serialization of `CronSchedule` union type to DB columns
- Handle deserialization from DB rows to `CronJob` objects
- Use prepared statements for security
- Update `updated_at` on every update

### Type Mapping

```typescript
// CronJob.schedule → DB columns
function serializeSchedule(schedule: CronSchedule): {
  schedule_kind: string;
  schedule_value: string;
  schedule_tz: string | null;
} {
  switch (schedule.kind) {
    case 'at':
      return { schedule_kind: 'at', schedule_value: String(schedule.atMs), schedule_tz: null };
    case 'every':
      return { schedule_kind: 'every', schedule_value: String(schedule.everyMs), schedule_tz: null };
    case 'cron':
      return { schedule_kind: 'cron', schedule_value: schedule.expr, schedule_tz: schedule.tz ?? null };
  }
}

// DB columns → CronJob.schedule
function deserializeSchedule(kind: string, value: string, tz: string | null): CronSchedule {
  switch (kind) {
    case 'at':
      return { kind: 'at', atMs: Number(value) };
    case 'every':
      return { kind: 'every', everyMs: Number(value) };
    case 'cron':
      return { kind: 'cron', expr: value, tz: tz ?? undefined };
    default:
      throw new Error(`Unknown schedule kind: ${kind}`);
  }
}
```

---

## Task #5: Implement CronBusyGuard

**Status**: Pending
**Dependencies**: None
**Estimated Lines**: ~60

### Description

Create service to track conversation busy state, used to prevent cron trigger conflicts.

### Location

`src/process/services/CronBusyGuard.ts`

### Interface

```typescript
interface ConversationState {
  isProcessing: boolean;
  lastActiveAt: number;
}

class CronBusyGuard {
  private states: Map<string, ConversationState>;

  isProcessing(conversationId: string): boolean;
  setProcessing(conversationId: string, value: boolean): void;
  getLastActiveAt(conversationId: string): number | undefined;
  waitForIdle(conversationId: string, timeoutMs?: number): Promise<void>;
}

export const conversationStateService: CronBusyGuard;
```

### Implementation

```typescript
class CronBusyGuard {
  private states = new Map<string, ConversationState>();

  isProcessing(conversationId: string): boolean {
    return this.states.get(conversationId)?.isProcessing ?? false;
  }

  setProcessing(conversationId: string, value: boolean): void {
    const state = this.states.get(conversationId) ?? { isProcessing: false, lastActiveAt: 0 };
    state.isProcessing = value;
    if (value) {
      state.lastActiveAt = Date.now();
    }
    this.states.set(conversationId, state);
  }

  getLastActiveAt(conversationId: string): number | undefined {
    return this.states.get(conversationId)?.lastActiveAt;
  }

  async waitForIdle(conversationId: string, timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    while (this.isProcessing(conversationId)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for conversation ${conversationId} to be idle`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Clean up stale states (optional)
  cleanup(olderThanMs = 3600000): void {
    const now = Date.now();
    for (const [id, state] of this.states) {
      if (!state.isProcessing && now - state.lastActiveAt > olderThanMs) {
        this.states.delete(id);
      }
    }
  }
}

export const conversationStateService = new CronBusyGuard();
```

---

## Task #6: Implement CronService (Core Scheduler)

**Status**: Pending
**Dependencies**: Task #4 (CronStore), Task #5 (CronBusyGuard)
**Estimated Lines**: ~300

### Description

Core scheduling service - manages cron jobs, timers, and execution.

### Location

`src/process/services/CronService.ts`

### Dependencies

```bash
npm install croner
```

### Interface

```typescript
import Croner from 'croner';

type CronSchedule =
  | { kind: 'at'; atMs: number }
  | { kind: 'every'; everyMs: number }
  | { kind: 'cron'; expr: string; tz?: string };

type AgentType = 'gemini' | 'claude' | 'codex' | 'opencode' | 'qwen' | 'goose' | 'custom';

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  target: {
    payload: { kind: 'message'; text: string };
  };
  metadata: {
    conversationId: string;
    conversationTitle?: string;
    agentType: AgentType;
    createdBy: 'user' | 'agent';
    createdAt: number;
    updatedAt: number;
  };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: 'ok' | 'error' | 'skipped';
    lastError?: string;
    runCount: number;
    retryCount: number;
    maxRetries: number;
  };
}

interface CreateCronJobParams {
  name: string;
  schedule: CronSchedule;
  message: string;
  conversationId: string;
  conversationTitle?: string;
  agentType: AgentType;
  createdBy: 'user' | 'agent';
}

class CronService {
  async init(): Promise<void>;
  async addJob(params: CreateCronJobParams): Promise<CronJob>;
  async updateJob(jobId: string, updates: Partial<CronJob>): Promise<CronJob>;
  async removeJob(jobId: string): Promise<void>;
  async listJobs(): Promise<CronJob[]>;
  async listJobsByConversation(conversationId: string): Promise<CronJob[]>;
  async getJob(jobId: string): Promise<CronJob | null>;
  async runJobNow(jobId: string): Promise<void>;
}

export const cronService: CronService;
```

### Key Implementation Details

#### Timer Management

```typescript
private jobs: Map<string, { job: CronJob; timer: Croner | NodeJS.Timeout }> = new Map();

private createTimer(job: CronJob): Croner | NodeJS.Timeout {
  switch (job.schedule.kind) {
    case 'cron':
      return new Croner(job.schedule.expr, { timezone: job.schedule.tz }, () => {
        void this.executeJob(job);
      });
    case 'every':
      return setInterval(() => void this.executeJob(job), job.schedule.everyMs);
    case 'at':
      const delay = job.schedule.atMs - Date.now();
      if (delay > 0) {
        return setTimeout(() => void this.executeJob(job), delay);
      }
      return null; // Already passed
  }
}
```

#### Job Execution with Conflict Handling

```typescript
private async executeJob(job: CronJob): Promise<void> {
  const { conversationId } = job.metadata;

  // Check if conversation is busy
  if (conversationStateService.isProcessing(conversationId)) {
    job.state.retryCount++;

    if (job.state.retryCount > (job.state.maxRetries || 3)) {
      job.state.lastStatus = 'skipped';
      job.state.lastError = `Conversation busy after ${job.state.maxRetries || 3} retries`;
      job.state.retryCount = 0;
      await this.persistJob(job);
      return;
    }

    // Schedule retry in 30s
    setTimeout(() => void this.executeJob(job), 30000);
    return;
  }

  // Execute
  job.state.lastRunAtMs = Date.now();
  job.state.runCount++;

  try {
    await ipcBridge.conversation.sendMessage.invoke({
      conversation_id: conversationId,
      input: job.target.payload.text,
      msg_id: uuid(),
    });
    job.state.lastStatus = 'ok';
    job.state.lastError = undefined;
    job.state.retryCount = 0;
  } catch (error) {
    job.state.lastStatus = 'error';
    job.state.lastError = error instanceof Error ? error.message : String(error);
  }

  // Update next run time
  this.updateNextRunTime(job);
  await this.persistJob(job);
}
```

---

## Task #7: Implement MessageMiddleware

**Status**: Pending
**Dependencies**: Task #2 (CronCommandDetector), Task #6 (CronService)
**Estimated Lines**: ~100

### Description

Unified message processing middleware - detects cron commands and processes them.

### Location

`src/process/task/MessageMiddleware.ts`

### Interface

```typescript
import type { TMessage } from '@/common/chatLib';
import type { AgentType } from '@/types/acpTypes';

interface ProcessResult {
  message: TMessage;              // Original → save to database
  displayMessage?: TMessage;      // Cleaned → emit to UI
  systemResponses: string[];      // System messages to append
}

export async function processAgentResponse(
  conversationId: string,
  agentType: AgentType,
  message: TMessage
): Promise<ProcessResult>;
```

### Implementation

```typescript
import { detectCronCommands, type CronCommand } from './CronCommandDetector';
import { cronService } from '../services/CronService';
import type { TMessage } from '@/common/chatLib';
import type { AgentType } from '@/types/acpTypes';

export async function processAgentResponse(
  conversationId: string,
  agentType: AgentType,
  message: TMessage
): Promise<ProcessResult> {
  const systemResponses: string[] = [];

  // Only process completed assistant messages
  if (message.status !== 'finish') {
    return { message, systemResponses };
  }

  // Extract text content
  const textContent = typeof message.content === 'string'
    ? message.content
    : message.content?.content || '';

  if (!textContent) {
    return { message, systemResponses };
  }

  // Detect cron commands
  const cronCommands = detectCronCommands(textContent);

  if (cronCommands.length === 0) {
    return { message, systemResponses };
  }

  // Handle commands
  const responses = await handleCronCommands(conversationId, agentType, cronCommands);
  systemResponses.push(...responses);

  // Create display version with commands stripped
  const displayContent = textContent
    .replace(/\[CRON_CREATE\][\s\S]*?\[\/CRON_CREATE\]/gi, '')
    .replace(/\[CRON_LIST\]/gi, '')
    .replace(/\[CRON_DELETE:[^\]]+\]/gi, '')
    .trim();

  const displayMessage: TMessage = {
    ...message,
    content: typeof message.content === 'string'
      ? displayContent
      : { ...message.content, content: displayContent }
  };

  return { message, displayMessage, systemResponses };
}

async function handleCronCommands(
  conversationId: string,
  agentType: AgentType,
  commands: CronCommand[]
): Promise<string[]> {
  const responses: string[] = [];

  for (const cmd of commands) {
    try {
      if (cmd.kind === 'create') {
        const job = await cronService.addJob({
          name: cmd.name,
          schedule: { kind: 'cron', expr: cmd.schedule },
          message: cmd.message,
          conversationId,
          agentType,
          createdBy: 'agent',
        });
        responses.push(`✅ Scheduled task created: "${job.name}" (ID: ${job.id})`);
      } else if (cmd.kind === 'list') {
        const jobs = await cronService.listJobsByConversation(conversationId);
        if (jobs.length === 0) {
          responses.push('📋 No scheduled tasks in this conversation.');
        } else {
          const jobList = jobs
            .map(j => `- ${j.name} (${j.schedule.kind === 'cron' ? j.schedule.expr : j.schedule.kind}) - ID: ${j.id}`)
            .join('\n');
          responses.push(`📋 Scheduled tasks:\n${jobList}`);
        }
      } else if (cmd.kind === 'delete') {
        await cronService.removeJob(cmd.jobId);
        responses.push(`🗑️ Task deleted: ${cmd.jobId}`);
      }
    } catch (error) {
      responses.push(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return responses;
}
```

---

## Task #8: Integrate MessageMiddleware into AgentManagers

**Status**: Pending
**Dependencies**: Task #5 (CronBusyGuard), Task #7 (MessageMiddleware)
**Estimated Lines**: ~80 (across 3 files)

### Description

Modify AgentManagers to use MessageMiddleware and CronBusyGuard.

### Files to Modify

1. `src/process/task/GeminiAgentManager.ts`
2. `src/process/task/AcpAgentManager.ts`
3. `src/process/task/CodexAgentManager.ts`

### Changes Required

#### 1. Import statements

```typescript
import { processAgentResponse } from './MessageMiddleware';
import { conversationStateService } from '../services/CronBusyGuard';
```

#### 2. Wrap sendMessage with state tracking

```typescript
async sendMessage(data: { content: string; ... }): Promise<...> {
  conversationStateService.setProcessing(this.conversation_id, true);
  try {
    // ... existing logic
  } finally {
    conversationStateService.setProcessing(this.conversation_id, false);
  }
}
```

#### 3. Process response before emit (in onStreamEvent or equivalent)

```typescript
// When message is complete (status === 'finish')
const result = await processAgentResponse(
  this.conversation_id,
  this.agentType,  // or 'gemini' / 'codex'
  message
);

// Save original to database
addMessage(this.conversation_id, result.message);

// Emit cleaned version to UI
responseStream.emit(result.displayMessage ?? result.message);

// Emit system responses
for (const sysMsg of result.systemResponses) {
  responseStream.emit({
    type: 'system',
    conversation_id: this.conversation_id,
    msg_id: uuid(),
    data: sysMsg,
  });
}
```

### AcpAgentManager Specific

In `onStreamEvent` callback, need to detect when message is complete before processing:

```typescript
onStreamEvent: (message) => {
  // ... existing logic ...

  // Check if this is a complete message
  const tMessage = transformMessage(message as IResponseMessage);
  if (tMessage && tMessage.status === 'finish') {
    // Process through middleware
    void (async () => {
      const result = await processAgentResponse(
        data.conversation_id,
        data.backend,
        tMessage
      );
      // Handle result...
    })();
  }
}
```

---

## Task #9: Implement cronBridge (IPC Handlers)

**Status**: Pending
**Dependencies**: Task #6 (CronService)
**Estimated Lines**: ~80

### Description

Create IPC bridge for frontend to communicate with CronService.

### Files to Create/Modify

1. Add to `src/common/ipcBridge.ts`
2. Create `src/process/bridge/cronBridge.ts`
3. Register in `src/process/bridge/index.ts`

### Part 1: IPC Definition

Add to `src/common/ipcBridge.ts`:

```typescript
import type { CronJob, CreateCronJobParams } from '../process/services/CronService';

export const cron = {
  // Query
  listJobs: bridge.buildProvider<CronJob[], void>('cron.list-jobs'),
  listJobsByConversation: bridge.buildProvider<CronJob[], { conversationId: string }>('cron.list-jobs-by-conversation'),
  getJob: bridge.buildProvider<CronJob | null, { jobId: string }>('cron.get-job'),

  // CRUD
  addJob: bridge.buildProvider<CronJob, CreateCronJobParams>('cron.add-job'),
  updateJob: bridge.buildProvider<CronJob, { jobId: string; updates: Partial<CronJob> }>('cron.update-job'),
  removeJob: bridge.buildProvider<void, { jobId: string }>('cron.remove-job'),

  // Execution
  runJobNow: bridge.buildProvider<void, { jobId: string }>('cron.run-job-now'),

  // Events
  onJobCreated: bridge.buildEmitter<CronJob>('cron.job-created'),
  onJobUpdated: bridge.buildEmitter<CronJob>('cron.job-updated'),
  onJobRemoved: bridge.buildEmitter<{ jobId: string }>('cron.job-removed'),
  onJobExecuted: bridge.buildEmitter<{ jobId: string; status: 'ok' | 'error' | 'skipped'; error?: string }>('cron.job-executed'),
};
```

### Part 2: Bridge Implementation

Create `src/process/bridge/cronBridge.ts`:

```typescript
import { ipcBridge } from '@/common';
import { cronService } from '../services/CronService';

export function initCronBridge(): void {
  // Query handlers
  ipcBridge.cron.listJobs.provider(async () => {
    return cronService.listJobs();
  });

  ipcBridge.cron.listJobsByConversation.provider(async ({ conversationId }) => {
    return cronService.listJobsByConversation(conversationId);
  });

  ipcBridge.cron.getJob.provider(async ({ jobId }) => {
    return cronService.getJob(jobId);
  });

  // CRUD handlers
  ipcBridge.cron.addJob.provider(async (params) => {
    const job = await cronService.addJob(params);
    ipcBridge.cron.onJobCreated.emit(job);
    return job;
  });

  ipcBridge.cron.updateJob.provider(async ({ jobId, updates }) => {
    const job = await cronService.updateJob(jobId, updates);
    ipcBridge.cron.onJobUpdated.emit(job);
    return job;
  });

  ipcBridge.cron.removeJob.provider(async ({ jobId }) => {
    await cronService.removeJob(jobId);
    ipcBridge.cron.onJobRemoved.emit({ jobId });
  });

  // Execution
  ipcBridge.cron.runJobNow.provider(async ({ jobId }) => {
    await cronService.runJobNow(jobId);
  });
}
```

### Part 3: Register Bridge

Add to `src/process/bridge/index.ts`:

```typescript
import { initCronBridge } from './cronBridge';

export function initAllBridges(): void {
  // ... existing bridges ...
  initCronBridge();
}
```

---

## Task #10: Initialize CronService on App Start

**Status**: Pending
**Dependencies**: Task #6 (CronService)
**Estimated Lines**: ~10

### Description

Ensure CronService is initialized when the app starts.

### Location

Find main process initialization point (likely `src/process/index.ts` or similar)

### Implementation

```typescript
import { cronService } from './services/CronService';

// In app initialization
async function initializeApp() {
  // ... existing initialization ...

  // Initialize cron service
  await cronService.init();
  console.log('[CronService] Initialized');
}
```

### Notes

- `init()` loads existing jobs from database
- Starts timers for all enabled jobs
- Should be called after database is ready
- Should handle errors gracefully (don't crash app if cron fails)

---

## Summary

| Task | Component | Lines | Dependencies |
|------|-----------|-------|--------------|
| #1 | Skill File | ~50 | None |
| #2 | CronCommandDetector | ~80 | None |
| #3 | Database Schema | ~40 | None |
| #4 | CronStore | ~120 | #3 |
| #5 | CronBusyGuard | ~60 | None |
| #6 | CronService | ~300 | #4, #5 |
| #7 | MessageMiddleware | ~100 | #2, #6 |
| #8 | AgentManager Integration | ~80 | #5, #7 |
| #9 | cronBridge | ~80 | #6 |
| #10 | Service Initialization | ~10 | #6 |

**Total**: ~920 lines + Skill file

---

## Future Tasks (Not Included)

- Frontend: ConversationCronPanel component (~100 lines)
- Frontend: CronManager page (~100 lines)
- Unit tests for CronCommandDetector
- Integration tests for CronService

---

*Document created: 2026-01-27*
*Based on cron-feature-design.md*
