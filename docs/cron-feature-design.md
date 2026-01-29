# AionUI Cron Feature Design

> Discussion summary: How to add scheduled task capability to AionUI for all agent types (Gemini, ACP Claude/Codex, etc.)

## Background

### AionUI Current Architecture

- **Gemini**: Secondary development based on gemini-cli, with full control over tools and skills injection
- **ACP Agents** (Claude, Codex, OpenCode, etc.): Shell wrapper via ACP protocol (JSON-RPC), cannot inject internal tools
- **Existing Skills Mechanism**: `AcpSkillManager` supports two injection modes:
  - Gemini: Full skill content injection
  - ACP: Skills index + path injection, agent reads on-demand via Read tool

### Reference: Clawdbot Implementation

Clawdbot's cron implementation (`src/cron/`):
- `CronService` runs in Gateway main process
- Supports three schedule types: `at` (one-time), `every` (interval), `cron` (cron expression)
- Uses `croner` library for cron expression parsing
- Storage: `~/.clawdbot/cron-jobs.json`

## Design Goals

1. Enable **all agent types** (Gemini + ACP) to have scheduled task capability
2. Users create scheduled tasks **through conversation**, not UI
3. Leverage existing AionUI architecture, minimal code changes

## Solution: Skill Protocol + Message Detection

### Core Concept

```
Skill = Protocol Document
  Tells Agent: "When user wants to create a scheduled task, output this format..."

AionUI = Protocol Parser
  Detects Agent output, parses format, executes corresponding operation
```

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AionUI Main Process                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐                                        │
│  │  CronService    │  ← Scheduling + Trigger                │
│  │  (Main Process) │                                        │
│  └────────┬────────┘                                        │
│           │                                                 │
│           │ On trigger                                      │
│           ▼                                                 │
│  ┌─────────────────────────────┐                           │
│  │ ipcBridge.conversation      │  ← Existing IPC (reuse)   │
│  │ .sendMessage.invoke()       │     see conversationBridge│
│  └─────────────────────────────┘                           │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────┐                           │
│  │  Any Agent (Unified)        │                           │
│  │  Gemini / Claude / Codex    │                           │
│  └─────────────────────────────┘                           │
│                                                             │
│  ┌─────────────────────────────┐                           │
│  │  CronCommandDetector        │  ← Detects agent output   │
│  │  [CRON_CREATE] format       │                           │
│  └─────────────────────────────┘                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Complete Flow

```
1. First message injects Skills index
   → Agent knows cron skill is available

2. User: "Remind me about weekly meeting every Monday at 9am"

3. Agent reads cron skill (via Read tool for ACP agents)
   → Learns output format

4. Agent outputs:
   [CRON_CREATE]
   name: Weekly Meeting Reminder
   schedule: 0 9 * * MON
   message: Time for weekly meeting!
   [/CRON_CREATE]

5. AionUI detects [CRON_CREATE]
   → Calls CronService.addJob()
   → Returns confirmation to Agent

6. Every Monday 9am, CronService triggers
   → Sends message to that conversation
   → Agent responds: "Time for weekly meeting!"
```

## Implementation Details

### 1. Skill File

**Location**: `skills/cron/SKILL.md`

**Injection Mode**: NOT as a built-in skill. The cron skill is loaded through `AssistantManagement` business layer, similar to other optional skills. Users can enable/disable it per assistant configuration.

This means:
- Skill file lives in `skills/cron/SKILL.md` (user-accessible skills directory)
- AssistantManagement reads and injects enabled skills for each conversation
- Agent receives skill index on first message, reads full content via Read tool when needed

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

Output [CRON_LIST] to view all scheduled tasks

### Delete Scheduled Task

Output [CRON_DELETE: task-id] to delete a specific task

### Cron Expression Reference
- `0 9 * * *` - Every day at 9am
- `0 9 * * MON` - Every Monday at 9am
- `*/30 * * * *` - Every 30 minutes
- `0 0 1 * *` - 1st of every month
- `0 9 * * MON-FRI` - Weekdays at 9am
```

### 2. CronService

**Location**: `src/process/services/CronService.ts`

```typescript
import Croner from 'croner';

/**
 * Cron Job Definition
 * Contains all metadata needed for scheduling, execution, and frontend management
 */
interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;

  /** Execution target */
  target: {
    payload: { kind: 'message'; text: string };
  };

  /**
   * Metadata for management and tracking
   * This is NOT part of Skill - CronService is responsible for storing this
   */
  metadata: {
    conversationId: string;      // Which conversation created this job
    conversationTitle?: string;  // Conversation title (for display in UI)
    agentType: AgentType;        // Agent type: 'gemini' | 'claude' | 'codex' | etc.
    createdBy: 'user' | 'agent'; // Created via UI or via conversation
    createdAt: number;           // Creation timestamp
    updatedAt: number;           // Last update timestamp
  };

  /** Runtime state */
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: 'ok' | 'error' | 'skipped';  // Added 'skipped' for busy conversation
    lastError?: string;          // Error message if last run failed
    runCount: number;            // Total execution count
    retryCount: number;          // Current consecutive retry count
    maxRetries: number;          // Max retries before skip, default 3
  };
}

type CronSchedule =
  | { kind: 'at'; atMs: number }
  | { kind: 'every'; everyMs: number }
  | { kind: 'cron'; expr: string; tz?: string };

type AgentType = 'gemini' | 'claude' | 'codex' | 'opencode' | 'qwen' | 'goose' | 'custom';

class CronService {
  private jobs: Map<string, { job: CronJob; timer: Croner }> = new Map();

  async init(): Promise<void>;           // Load from storage on app start

  // CRUD operations
  async addJob(params: CreateCronJobParams): Promise<CronJob>;
  async updateJob(jobId: string, updates: Partial<CronJob>): Promise<CronJob>;
  async removeJob(jobId: string): Promise<void>;

  // Query operations
  async listJobs(): Promise<CronJob[]>;
  async listJobsByConversation(conversationId: string): Promise<CronJob[]>;
  async getJob(jobId: string): Promise<CronJob | null>;

  // Execution
  async runJobNow(jobId: string): Promise<void>;

  private async executeJob(job: CronJob): Promise<void> {
    const { conversationId } = job.metadata;

    // Update state before execution
    job.state.lastRunAtMs = Date.now();
    job.state.runCount++;

    try {
      // Reuse existing IPC: ipcBridge.conversation.sendMessage
      // This is defined in src/common/ipcBridge.ts and implemented in conversationBridge.ts
      // It auto-dispatches to the correct AgentManager based on conversation type
      await ipcBridge.conversation.sendMessage.invoke({
        conversation_id: conversationId,
        input: job.target.payload.text,
        msg_id: uuid(),
        // Optional: metadata for tracking cron source
        // metadata: { source: 'cron', jobId: job.id }
      });
      job.state.lastStatus = 'ok';
      job.state.lastError = undefined;
    } catch (error) {
      job.state.lastStatus = 'error';
      job.state.lastError = error.message;
    }

    // Persist state update
    await this.persistJob(job);
  }
}

/** Parameters for creating a new cron job */
interface CreateCronJobParams {
  name: string;
  schedule: CronSchedule;
  message: string;
  // Metadata (provided by MessageMiddleware)
  conversationId: string;
  conversationTitle?: string;
  agentType: AgentType;
  createdBy: 'user' | 'agent';
}
```

### 3. CronCommandDetector

**Location**: `src/process/task/CronCommandDetector.ts`

```typescript
export type CronCommand =
  | { kind: 'create'; name: string; schedule: string; message: string }
  | { kind: 'list' }
  | { kind: 'delete'; jobId: string };

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

### 4. Integration Point - Message Middleware

**Problem**: AionUI has separate message streams for each agent type:
- `GeminiAgentManager` → `geminiConversation.responseStream.emit()`
- `AcpAgentManager` → `acpConversation.responseStream.emit()`
- `CodexAgentManager` → `codexConversation.responseStream.emit()`

**Solution**: Create a unified message middleware that all managers call before emitting.

**Location**: `src/process/task/MessageMiddleware.ts`

```typescript
import { detectCronCommands, type CronCommand } from './CronCommandDetector';
import { cronService } from '../services/CronService';
import type { TMessage } from '@/common/chatLib';
import type { AgentType } from '@/types/acpTypes';

/**
 * Unified message middleware for all agent types
 * Processes agent responses before they are emitted to UI
 */
export async function processAgentResponse(
  conversationId: string,
  agentType: AgentType,
  message: TMessage
): Promise<{ message: TMessage; systemResponses: string[] }> {
  const systemResponses: string[] = [];

  // Only process assistant messages with text content
  if (message.role !== 'assistant' || !message.content) {
    return { message, systemResponses };
  }

  // Extract text content (handle both string and structured content)
  const textContent = typeof message.content === 'string'
    ? message.content
    : message.content.find(c => c.type === 'text')?.text || '';

  // Detect and handle cron commands
  const cronCommands = detectCronCommands(textContent);
  if (cronCommands.length > 0) {
    const responses = await handleCronCommands(conversationId, agentType, cronCommands);
    systemResponses.push(...responses);
  }

  // Future: Add more middleware handlers here
  // - Other command detection
  // - Message filtering/transformation

  return { message, systemResponses };
}

async function handleCronCommands(
  conversationId: string,
  agentType: AgentType,
  commands: CronCommand[]
): Promise<string[]> {
  const responses: string[] = [];

  for (const cmd of commands) {
    if (cmd.kind === 'create') {
      const job = await cronService.addJob({
        name: cmd.name,
        enabled: true,
        schedule: { kind: 'cron', expr: cmd.schedule },
        target: {
          conversationId,
          agentType,
          payload: { kind: 'message', text: cmd.message }
        }
      });
      responses.push(`✅ Scheduled task created: "${job.name}" (ID: ${job.id})`);
    } else if (cmd.kind === 'list') {
      const jobs = await cronService.listJobs();
      const jobList = jobs
        .filter(j => j.target.conversationId === conversationId)
        .map(j => `- ${j.name} (${j.schedule.expr}) - ID: ${j.id}`)
        .join('\n');
      responses.push(`📋 Your scheduled tasks:\n${jobList || 'No tasks'}`);
    } else if (cmd.kind === 'delete') {
      await cronService.removeJob(cmd.jobId);
      responses.push(`🗑️ Task deleted: ${cmd.jobId}`);
    }
  }

  return responses;
}
```

**Integration in each AgentManager**:

```typescript
// GeminiAgentManager.ts
import { processAgentResponse } from './MessageMiddleware';

// Before emitting response
const { message: processed, systemResponses } = await processAgentResponse(
  this.conversationId,
  'gemini',
  message
);
ipcBridge.geminiConversation.responseStream.emit(processed);

// Send system responses if any
for (const sysMsg of systemResponses) {
  // Emit as system message to UI
  ipcBridge.geminiConversation.responseStream.emit({
    role: 'system',
    content: sysMsg,
    msg_id: generateId(),
  });
}
```

```typescript
// AcpAgentManager.ts
import { processAgentResponse } from './MessageMiddleware';

// Before emitting response
const { message: processed, systemResponses } = await processAgentResponse(
  this.conversationId,
  this.agentType, // 'claude' | 'codex' | 'opencode' | etc.
  message
);
ipcBridge.acpConversation.responseStream.emit(processed);

// Send system responses
for (const sysMsg of systemResponses) {
  ipcBridge.acpConversation.responseStream.emit({
    role: 'system',
    content: sysMsg,
    msg_id: generateId(),
  });
}
```

```typescript
// CodexAgentManager.ts
import { processAgentResponse } from './MessageMiddleware';

// Same pattern as above
const { message: processed, systemResponses } = await processAgentResponse(
  this.conversationId,
  'codex',
  message
);
ipcBridge.codexConversation.responseStream.emit(processed);
// ... emit system responses
```
```

### 5. Database Schema

**Location**: `src/process/database/schema.ts` (add)

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
  last_status TEXT,                  -- 'ok' | 'error'
  last_error TEXT,                   -- Error message if failed
  run_count INTEGER DEFAULT 0
);

-- Index for querying jobs by conversation (frontend management)
CREATE INDEX idx_cron_jobs_conversation ON cron_jobs(conversation_id);

-- Index for scheduler to find next jobs to run
CREATE INDEX idx_cron_jobs_next_run ON cron_jobs(next_run_at) WHERE enabled = 1;

-- Index for querying by agent type (if needed)
CREATE INDEX idx_cron_jobs_agent_type ON cron_jobs(agent_type);
```

### 6. IPC Bridge (for UI management)

**Location**: `src/common/ipcBridge.ts` (add)

```typescript
export const cron = bridge.define('cron', {
  // Query
  listJobs: bridge.fn<void, CronJob[]>(),
  listJobsByConversation: bridge.fn<{ conversationId: string }, CronJob[]>(),
  getJob: bridge.fn<{ jobId: string }, CronJob | null>(),

  // CRUD
  addJob: bridge.fn<CreateCronJobParams, CronJob>(),
  updateJob: bridge.fn<{ jobId: string; updates: Partial<CronJob> }, CronJob>(),
  removeJob: bridge.fn<{ jobId: string }, void>(),

  // Execution
  runJobNow: bridge.fn<{ jobId: string }, void>(),

  // Events (for real-time UI updates)
  onJobCreated: bridge.event<CronJob>(),
  onJobUpdated: bridge.event<CronJob>(),
  onJobRemoved: bridge.event<{ jobId: string }>(),
  onJobExecuted: bridge.event<{ jobId: string; status: 'ok' | 'error'; error?: string }>(),
});
```

**Location**: `src/process/bridge/cronBridge.ts`

```typescript
import { cron } from '@/common/ipcBridge';
import { cronService } from '../services/CronService';

// Query handlers
cron.listJobs.provider(async () => {
  return cronService.listJobs();
});

cron.listJobsByConversation.provider(async ({ conversationId }) => {
  return cronService.listJobsByConversation(conversationId);
});

cron.getJob.provider(async ({ jobId }) => {
  return cronService.getJob(jobId);
});

// CRUD handlers
cron.addJob.provider(async (params) => {
  const job = await cronService.addJob(params);
  cron.onJobCreated.emit(job);  // Notify UI
  return job;
});

cron.updateJob.provider(async ({ jobId, updates }) => {
  const job = await cronService.updateJob(jobId, updates);
  cron.onJobUpdated.emit(job);  // Notify UI
  return job;
});

cron.removeJob.provider(async ({ jobId }) => {
  await cronService.removeJob(jobId);
  cron.onJobRemoved.emit({ jobId });  // Notify UI
});

cron.runJobNow.provider(async ({ jobId }) => {
  await cronService.runJobNow(jobId);
});
```

### 7. Frontend Usage Examples

**In conversation settings panel**:

```tsx
// src/renderer/components/ConversationCronPanel.tsx
import { useEffect, useState } from 'react';
import { cron } from '@/common/ipcBridge';

function ConversationCronPanel({ conversationId }: { conversationId: string }) {
  const [jobs, setJobs] = useState<CronJob[]>([]);

  useEffect(() => {
    // Load jobs for this conversation
    cron.listJobsByConversation({ conversationId }).then(setJobs);

    // Subscribe to real-time updates
    const unsubCreated = cron.onJobCreated.on((job) => {
      if (job.metadata.conversationId === conversationId) {
        setJobs(prev => [...prev, job]);
      }
    });
    const unsubRemoved = cron.onJobRemoved.on(({ jobId }) => {
      setJobs(prev => prev.filter(j => j.id !== jobId));
    });

    return () => {
      unsubCreated();
      unsubRemoved();
    };
  }, [conversationId]);

  return (
    <div>
      <h3>Scheduled Tasks ({jobs.length})</h3>
      {jobs.map(job => (
        <div key={job.id}>
          <span>{job.name}</span>
          <span>{formatSchedule(job.schedule)}</span>
          <span>Next: {formatTime(job.state.nextRunAtMs)}</span>
          <span>Runs: {job.state.runCount}</span>
          <Button onClick={() => cron.runJobNow({ jobId: job.id })}>
            Run Now
          </Button>
          <Button onClick={() => cron.removeJob({ jobId: job.id })}>
            Delete
          </Button>
        </div>
      ))}
    </div>
  );
}
```

**In global cron management page**:

```tsx
// src/renderer/pages/CronManager.tsx
function CronManager() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [groupBy, setGroupBy] = useState<'conversation' | 'agent'>('conversation');

  useEffect(() => {
    cron.listJobs().then(setJobs);
  }, []);

  const grouped = useMemo(() => {
    if (groupBy === 'conversation') {
      return groupByKey(jobs, j => j.metadata.conversationId);
    } else {
      return groupByKey(jobs, j => j.metadata.agentType);
    }
  }, [jobs, groupBy]);

  return (
    <div>
      <h2>All Scheduled Tasks</h2>
      <Select value={groupBy} onChange={setGroupBy}>
        <Option value="conversation">Group by Conversation</Option>
        <Option value="agent">Group by Agent Type</Option>
      </Select>

      {Object.entries(grouped).map(([key, groupJobs]) => (
        <div key={key}>
          <h3>{key} ({groupJobs.length} tasks)</h3>
          <Table dataSource={groupJobs} columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Schedule', render: j => formatSchedule(j.schedule) },
            { title: 'Last Run', render: j => formatTime(j.state.lastRunAtMs) },
            { title: 'Status', render: j => j.state.lastStatus },
            { title: 'Actions', render: j => (
              <>
                <Button onClick={() => cron.runJobNow({ jobId: j.id })}>Run</Button>
                <Button onClick={() => cron.removeJob({ jobId: j.id })}>Delete</Button>
              </>
            )}
          ]} />
        </div>
      ))}
    </div>
  );
}
```

## Code Estimation

| Component | Purpose | Lines |
|-----------|---------|-------|
| `skills/cron/SKILL.md` | Protocol document for agents | ~50 |
| `CronService.ts` | Scheduling + trigger + conflict handling | ~300 |
| `CronCommandDetector.ts` | Detect agent output commands | ~80 |
| `CronStore.ts` (SQLite) | Persistence layer | ~120 |
| `MessageMiddleware.ts` | Unified message processing (with status check) | ~100 |
| `CronBusyGuard.ts` | Track conversation busy state | ~60 |
| Manager integration | Changes to 3 AgentManagers | ~80 |
| `cronBridge.ts` | IPC handlers | ~80 |
| Frontend components | ConversationCronPanel + CronManager | ~200 |

**Total: ~1070 lines of code + 1 Skill file**

## Component Responsibilities

| Component | Responsibility | NOT Responsible For |
|-----------|----------------|---------------------|
| **Skill** | Tell agent output format | Storing metadata, querying jobs |
| **CronService** | Schedule, execute, store jobs with metadata | Detecting agent output |
| **MessageMiddleware** | Detect commands, call CronService | Scheduling, storage |
| **IPC Bridge** | Frontend ↔ CronService communication | Business logic |
| **Frontend** | Display, manage jobs per conversation | Execution, storage |

## Comparison with Clawdbot

| Aspect | Clawdbot | AionUI (Proposed) |
|--------|----------|-------------------|
| Tool injection | Direct internal tools | Message format detection |
| Agent invocation | Agent calls CronService directly | Agent outputs marker, AionUI parses and executes |
| Coupling | Deep integration | Loose coupling, works with any agent |
| Session isolation | `sessionTarget: main \| isolated` | Not needed, each conversation is already isolated |
| Wake mode | `now \| next-heartbeat` | Simplified to `now` only |

## Advantages

1. **Unified** - All agent types support scheduled tasks the same way
2. **Non-invasive** - No need to modify any external CLI (Claude/Codex, etc.)
3. **Extensible** - Same pattern can add more capabilities (notifications, webhooks, etc.)
4. **Existing foundation** - Reuses AcpSkillManager's skill loading mechanism

## Implementation Details - Edge Cases

### Detection Timing: After Complete Response (Not Streaming)

**Problem**: During streaming, `[CRON_CREATE]` block may be fragmented across chunks.

**Solution**: Only detect after message is complete.

**Note**: `message.status` already exists in `src/common/chatLib.ts:90`:
```typescript
interface IMessage<T, Content> {
  // ...
  status?: 'finish' | 'pending' | 'error' | 'work';
}
```

```typescript
async function processAgentResponse(
  conversationId: string,
  agentType: AgentType,
  message: TMessage
): Promise<ProcessResult> {
  // Skip detection until message is finished
  if (message.status !== 'finish') {
    return { message, systemResponses: [] };
  }

  // Message complete - now detect commands
  const cronCommands = detectCronCommands(message.content);
  // ...
}
```

### System Response Presentation

**Approach**: Independent system message, appended after agent response.

```
┌─────────────────────────────────────────┐
│ Agent Response                          │
│ OK, I've created a scheduled task:      │
│ [CRON_CREATE]                           │
│ name: Weekly Meeting                    │
│ schedule: 0 9 * * MON                   │
│ message: Time for meeting!              │
│ [/CRON_CREATE]                          │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ System Message (separate)               │
│ ✅ Task created: "Weekly Meeting"       │
│    ID: cron_xxx                         │
└─────────────────────────────────────────┘
```

**Strip command blocks**: Database keeps original, UI shows cleaned version.

```typescript
interface ProcessResult {
  message: TMessage;              // Original → save to database
  displayMessage?: TMessage;      // Cleaned → emit to UI
  systemResponses: string[];
}

// In MessageMiddleware
async function processAgentResponse(...): Promise<ProcessResult> {
  const cronCommands = detectCronCommands(message.content.content);

  if (cronCommands.length > 0) {
    // Create UI display version (remove command blocks)
    const displayContent = message.content.content
      .replace(/\[CRON_CREATE\][\s\S]*?\[\/CRON_CREATE\]/gi, '')
      .replace(/\[CRON_LIST\]/gi, '')
      .replace(/\[CRON_DELETE:[^\]]+\]/gi, '')
      .trim();

    const displayMessage = {
      ...message,
      content: { ...message.content, content: displayContent }
    };

    return {
      message,           // Original → database
      displayMessage,    // Cleaned → UI
      systemResponses
    };
  }

  return { message, systemResponses: [] };
}

// In AgentManager
const result = await processAgentResponse(conversationId, agentType, message);

// Save to database: original message
addMessage(conversationId, result.message);

// Emit to UI: cleaned message
responseStream.emit(result.displayMessage ?? result.message);
```

**Rationale**:
- Database keeps original → debugging, audit, troubleshooting
- UI shows cleaned → better user experience

### Trigger Conflict: Conversation Busy

**Problem**: What if cron triggers while user is actively chatting?

```
User chatting → Agent processing → Cron triggers → Conflict!
```

**Solution**: Conversation state check + retry mechanism.

```typescript
// src/process/services/CronBusyGuard.ts
class CronBusyGuard {
  private states = new Map<string, { isProcessing: boolean; lastActiveAt: number }>();

  isProcessing(conversationId: string): boolean;
  setProcessing(conversationId: string, value: boolean): void;
  waitForIdle(conversationId: string, timeoutMs?: number): Promise<void>;
}

// In CronService.executeJob()
async executeJob(job: CronJob): Promise<void> {
  const { conversationId } = job.metadata;

  // Check if conversation is busy
  if (conversationStateService.isProcessing(conversationId)) {
    job.state.retryCount++;

    // Max 3 retries, then skip
    if (job.state.retryCount > (job.state.maxRetries || 3)) {
      job.state.lastStatus = 'skipped';
      job.state.lastError = `Conversation busy after ${job.state.maxRetries || 3} retries`;
      job.state.retryCount = 0;  // Reset for next trigger
      await this.persistJob(job);
      console.log(`Job ${job.id} skipped: conversation busy`);
      return;
    }

    // Retry in 30s
    console.log(`Conversation ${conversationId} busy, retry ${job.state.retryCount}/${job.state.maxRetries || 3}`);
    await this.scheduleRetry(job, { delayMs: 30000 });
    return;
  }

  // Acquire lock before sending
  const lock = await acquireConversationLock(conversationId);
  try {
    conversationStateService.setProcessing(conversationId, true);
    await this.sendMessageToConversation(job);

    // Success - reset retry count
    job.state.retryCount = 0;
    job.state.lastStatus = 'ok';
  } catch (error) {
    job.state.lastStatus = 'error';
    job.state.lastError = error.message;
  } finally {
    conversationStateService.setProcessing(conversationId, false);
    lock.release();
    await this.persistJob(job);
  }
}
```

**Integration with AgentManagers**:

```typescript
// In each AgentManager, mark conversation state
class GeminiAgentManager {
  async sendMessage(content: string) {
    conversationStateService.setProcessing(this.conversationId, true);
    try {
      // ... process message
    } finally {
      conversationStateService.setProcessing(this.conversationId, false);
    }
  }
}
```

## Future Extensions

1. **Task chains** - One task triggers another
2. **Conditional execution** - Only run if certain conditions met
3. **Retry mechanism** - Automatic retry on failure
4. **Execution history** - Track all runs and results
5. **Multi-channel delivery** - Optional notification via other channels (Telegram, etc.)

---

*Document created: 2026-01-27*
*Based on discussion comparing Clawdbot and AionUI architectures*
