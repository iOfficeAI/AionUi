# Cron Job UI Management Design

## Overview

This document describes the implementation plan for adding cron job management UI to the AionUI application. The goal is to:
1. Display a visual indicator in ChatHistory for conversations that have scheduled tasks
2. Provide management controls (pause/resume/delete) in ChatLayout header

## Current Data Structure

### Database Schema (cron_jobs table)

```sql
CREATE TABLE cron_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,              -- 1=enabled, 0=paused

    -- Schedule
    schedule_kind TEXT NOT NULL,            -- 'at' | 'every' | 'cron'
    schedule_value TEXT NOT NULL,           -- timestamp | ms | cron expression
    schedule_tz TEXT,                       -- timezone (optional)

    -- Target
    payload_message TEXT NOT NULL,          -- Message to send

    -- Relationship
    conversation_id TEXT NOT NULL,          -- Links to conversations.id
    conversation_title TEXT,                -- For UI display
    agent_type TEXT NOT NULL,               -- 'gemini' | 'claude' | 'codex' | etc.
    created_by TEXT NOT NULL,               -- 'user' | 'agent'

    -- Runtime state
    next_run_at INTEGER,
    last_run_at INTEGER,
    last_status TEXT,                       -- 'ok' | 'error' | 'skipped'
    last_error TEXT,
    run_count INTEGER DEFAULT 0,
    ...
);

-- Index for querying by conversation
CREATE INDEX idx_cron_jobs_conversation ON cron_jobs(conversation_id);
```

### IPC Bridge APIs (ipcBridge.cron)

| API | Description |
|-----|-------------|
| `listJobs()` | List all cron jobs |
| `listJobsByConversation({ conversationId })` | List jobs for a specific conversation |
| `getJob({ jobId })` | Get a single job by ID |
| `updateJob({ jobId, updates })` | Update job (can set `enabled: false` to pause) |
| `removeJob({ jobId })` | Delete a job |
| `runJobNow({ jobId })` | Manually trigger a job |

### Events

| Event | Description |
|-------|-------------|
| `onJobCreated` | Emitted when a new job is created |
| `onJobUpdated` | Emitted when a job is updated |
| `onJobRemoved` | Emitted when a job is deleted |
| `onJobExecuted` | Emitted when a job is executed |

---

## Implementation Plan

### 1. ChatHistory - Cron Job Indicator

**Location**: `src/renderer/pages/conversation/ChatHistory.tsx`

**Approach**:
- Fetch all cron jobs once when component mounts
- Create a Map<conversationId, CronJob[]> for quick lookup
- Display an icon (e.g., clock icon) next to conversations that have active cron jobs
- Subscribe to cron events to update the indicator in real-time

**UI Design**:
```
┌─────────────────────────────────────┐
│ 📅 Today                            │
├─────────────────────────────────────┤
│ 💬 Daily Report Chat        🕐      │  <- Clock icon indicates cron job
│ 💬 Project Discussion              │
│ 💬 Code Review              🕐⚠️    │  <- Warning if job has error
└─────────────────────────────────────┘
```

**Icon States**:
| State | Icon | Description |
|-------|------|-------------|
| Active | 🕐 (Clock/Timer) | Job is enabled and running normally |
| Paused | ⏸️ (Pause) | Job is disabled/paused |
| Error | ⚠️ (Warning) | Last execution had an error |

**Questions for Confirmation**:
1. Should clicking the icon open a popover with job details, or navigate to a management panel?
2. Should we show the count of jobs if a conversation has multiple cron jobs?

---

### 2. ChatLayout - Header Management Controls

**Location**: `src/renderer/pages/conversation/ChatLayout.tsx` (headerExtra prop)

**Approach**:
- Create a new component `CronJobManager` that receives the current conversationId
- Fetch cron jobs for the current conversation
- Display a button/dropdown with management options

**UI Design Option A - Simple Button with Popover**:
```
┌─────────────────────────────────────────────────────┐
│ [headerLeft]        Title        [CronBtn] [Agent]  │
└─────────────────────────────────────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │ Scheduled Tasks (2) │
                            ├─────────────────────┤
                            │ 📋 Daily Summary    │
                            │   Next: 09:00       │
                            │   [⏸️] [▶️] [🗑️]    │
                            ├─────────────────────┤
                            │ 📋 Weekly Report    │
                            │   Next: Mon 10:00   │
                            │   [⏸️] [▶️] [🗑️]    │
                            └─────────────────────┘
```

**UI Design Option B - Inline Status + Popover**:
```
┌─────────────────────────────────────────────────────┐
│ [headerLeft]   Title   [🕐 2 tasks ▼] [Agent]       │
└─────────────────────────────────────────────────────┘
```

**Management Actions**:
| Action | Icon | Description |
|--------|------|-------------|
| Pause | ⏸️ | Set `enabled: false` |
| Resume | ▶️ | Set `enabled: true` |
| Run Now | ⚡ | Manually trigger the job |
| Delete | 🗑️ | Remove the job with confirmation |

**Questions for Confirmation**:
1. Which UI option do you prefer - Option A (button reveals popover) or Option B (inline status)?
2. Should the management controls only show when there are active jobs, or always show a button?
3. Do we need a "Create New Task" button, or is that handled elsewhere?

---

### 3. New Components to Create

#### 3.1 `CronJobIndicator` Component
```typescript
// src/renderer/components/CronJobIndicator.tsx
interface CronJobIndicatorProps {
  conversationId: string;
  jobs?: ICronJob[];
  size?: 'small' | 'medium';
}
```

#### 3.2 `CronJobManager` Component
```typescript
// src/renderer/components/CronJobManager.tsx
interface CronJobManagerProps {
  conversationId: string;
  onJobUpdate?: (job: ICronJob) => void;
}
```

#### 3.3 `CronJobPopover` Component (Optional)
```typescript
// src/renderer/components/CronJobPopover.tsx
interface CronJobPopoverProps {
  jobs: ICronJob[];
  onPause: (jobId: string) => void;
  onResume: (jobId: string) => void;
  onDelete: (jobId: string) => void;
  onRunNow: (jobId: string) => void;
}
```

---

### 4. Hooks to Create

#### 4.1 `useCronJobs` Hook
```typescript
// src/renderer/hooks/useCronJobs.ts
function useCronJobs(conversationId?: string) {
  // Fetch jobs, subscribe to events, return state and actions
  return {
    jobs: ICronJob[],
    loading: boolean,
    error: Error | null,
    pauseJob: (jobId: string) => Promise<void>,
    resumeJob: (jobId: string) => Promise<void>,
    deleteJob: (jobId: string) => Promise<void>,
    runJobNow: (jobId: string) => Promise<void>,
  };
}
```

#### 4.2 `useCronJobsByConversation` Hook (for ChatHistory)
```typescript
// src/renderer/hooks/useCronJobsByConversation.ts
function useCronJobsByConversation() {
  // Fetch all jobs, group by conversation
  return {
    jobsByConversation: Map<string, ICronJob[]>,
    loading: boolean,
    hasJobsForConversation: (conversationId: string) => boolean,
    getJobsForConversation: (conversationId: string) => ICronJob[],
  };
}
```

---

### 5. Translation Keys to Add

```json
{
  "cron": {
    "scheduledTasks": "Scheduled Tasks",
    "noTasks": "No scheduled tasks",
    "taskCount": "{{count}} task(s)",
    "nextRun": "Next: {{time}}",
    "lastRun": "Last: {{time}}",
    "status": {
      "active": "Active",
      "paused": "Paused",
      "error": "Error"
    },
    "actions": {
      "pause": "Pause",
      "resume": "Resume",
      "runNow": "Run Now",
      "delete": "Delete"
    },
    "confirmDelete": "Are you sure you want to delete this scheduled task?",
    "deleteSuccess": "Task deleted",
    "pauseSuccess": "Task paused",
    "resumeSuccess": "Task resumed",
    "runNowSuccess": "Task triggered"
  }
}
```

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Process                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │ CronService │───▶│  CronStore  │───▶│ SQLite (cron_jobs)  │  │
│  └─────────────┘    └─────────────┘    └─────────────────────┘  │
│         │                                                        │
│         │ IPC Events                                             │
│         ▼                                                        │
│  ┌─────────────┐                                                 │
│  │ CronBridge  │                                                 │
│  └─────────────┘                                                 │
└────────│────────────────────────────────────────────────────────┘
         │ IPC
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Renderer Process                           │
│  ┌──────────────────┐    ┌────────────────────────────────────┐ │
│  │ useCronJobs Hook │───▶│ CronJobManager / CronJobIndicator  │ │
│  └──────────────────┘    └────────────────────────────────────┘ │
│                                    │                             │
│                                    ▼                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              ChatHistory / ChatLayout                       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| **ChatHistory Icon** | Simple icon only - distinguish cron conversations from normal ones, no click interaction |
| **ChatLayout Management UI** | A - Button + Popover |
| **Job Details Display** | B - Name + Schedule + Last status + Next run |
| **Empty State** | A - Don't show anything in headerExtra when no cron jobs |
| **Error Handling** | B - Error icon + Popover shows error details |
| **Real-time Updates** | IPC events subscription (already implemented) |

---

## Implementation Summary

### ChatHistory Changes
- Add a small clock icon (🕐) after conversation name if it has cron jobs
- Icon only, no click interaction needed
- Different icon states: active (clock), paused (pause), error (warning)

### ChatLayout Changes
- Add `CronJobManager` component to `headerExtra`
- Only render when conversation has cron jobs
- Button shows job count, click to open Popover
- Popover displays: job name, schedule, last status, next run time
- Actions: Pause/Resume, Run Now, Delete

---

## Next Steps

1. Create `useCronJobs` hook for fetching and managing cron jobs
2. Create `CronJobIndicator` component (simple icon for ChatHistory)
3. Create `CronJobManager` component (button + popover for ChatLayout)
4. Update `ChatHistory.tsx` to include the indicator
5. Update conversation pages to pass `CronJobManager` via `headerExtra`
6. Add translations for zh-CN and en-US
