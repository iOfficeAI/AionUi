# Agent Team — Architecture Overview

## What It Is

Agent Team lets multiple AI coding agents (Claude Code, Codex, Gemini) collaborate in one shared workspace. Instead of running separate isolated conversations, agents share a coordination timeline, challenge each other's decisions, and converge on solutions through a structured protocol.

## Core Concepts

### Team Shell vs Child Sessions

```
agent-team conversation (parent)     ← the team shell, not a real agent
  ├── claude-code conversation       ← real Claude CLI session
  ├── codex conversation             ← real Codex CLI session
  └── gemini conversation            ← real Gemini CLI session
```

- The **parent** (`type: 'agent-team'`) is an orchestration shell. It has no agent runtime — no `WorkerTaskManager` task, no CLI process.
- Each **child** is a real conversation with a real CLI agent, sharing the same workspace directory.
- Children are linked via `child.extra.teamId` → parent ID, and parent has `extra.members[]` listing all children.

### Shared Workspace + Isolated Coord

All agents work in the same filesystem directory. But each team gets its own coordination directory:

```
<workspace>/
├── (shared code files)
└── .agents/
    └── teams/
        └── <teamId>/
            └── coord/
                ├── messages.jsonl      ← append-only timeline
                ├── TEAM.md             ← team roster
                ├── SKILL.md            ← agent instructions
                ├── protocol.md         ← full protocol rules
                ├── scripts/            ← coord_read.py, coord_write.py
                ├── attachments/        ← files, images, design docs
                ├── locks/              ← mutual exclusion
                └── state/              ← per-agent cursor tracking
```

Multiple teams on the same workspace are fully isolated — each has its own `teams/<teamId>/coord/` directory.

## Data Model

### Database (SQLite)

```
conversations table:
  type = 'agent-team'         ← parent team shell
  extra.workspace             ← shared workspace path
  extra.coordDir              ← absolute path to coord directory
  extra.members[]             ← array of { memberId, type, backend, name, conversationId }
  extra.dispatchPolicy        ← 'queue' | 'interrupt' | 'user-priority'
  extra.consensus             ← { required, decisionMessageId, activeAgents }

  type = 'acp' | 'gemini'    ← child agent conversation
  extra.teamId                ← parent team conversation ID
  extra.workspace             ← same workspace as parent
```

### IPC Bridge

```typescript
// src/common/ipcBridge.ts
agentTeam.create          → AgentTeamService.createTeam()
agentTeam.sendMessage     → AgentTeamService.sendMessage()
agentTeam.getTimeline     → AgentTeamService.getTimeline()
agentTeam.getMembers      → AgentTeamService.getMembers()
agentTeam.timelineStream  → emitter for live timeline updates
```

## Key Files

| File | Purpose |
|------|---------|
| `src/process/services/agentTeam/AgentTeamService.ts` | Team CRUD, sendMessage, workspace bootstrap |
| `src/process/services/agentTeam/CoordDispatcher.ts` | Watch coord file, route messages to agents, busy gate, consensus enforcement |
| `src/process/services/agentTeam/CoordFileWatcher.ts` | fs.watch + debounce + incremental byte-offset reading |
| `src/process/services/agentTeam/types.ts` | ICoordTimelineEntry, ICreateAgentTeamInput, etc. |
| `src/process/bridge/agentTeamBridge.ts` | IPC provider implementations |
| `src/common/ipcBridge.ts` | IPC type definitions for agentTeam namespace |
| `src/renderer/pages/conversation/platforms/agent-team/AgentTeamChat.tsx` | Team chat UI (timeline + agents view) |
| `src/renderer/pages/guid/components/TeamBuilder.tsx` | Team creation UI |

## Lifecycle

### Creating a Team

1. User selects agents + workspace on GuidPage → TeamBuilder
2. `agentTeam.create` → `AgentTeamService.createTeam()`
3. Inside a DB transaction: create parent + N child conversations
4. Bootstrap coord workspace (directories, scripts, TEAM.md, SKILL.md, protocol.md)
5. Inject coord instructions into each child via `presetContext` (ACP) or `presetRules` (Gemini)
6. Start `CoordDispatcher` for this team
7. If `initialMessage` provided, write first timeline entry + trigger dispatcher

### Sending a Message

1. User types in AgentTeamChat → `agentTeam.sendMessage`
2. Files copied to `<coordDir>/attachments/`
3. Entry appended to `messages.jsonl`
4. `timelineStream.emit()` → frontend updates
5. `CoordFileWatcher` detects change → `CoordDispatcher.handleNewMessages()`
6. Dispatcher wakes agents based on `dispatch` field routing

### Agent Coordination Loop

1. Dispatcher sends wakeup message to child agent's CLI session
2. Agent reads coord messages (`coord_read.py --agent-id <memberId>`)
3. Agent does work, writes back (`coord_write.py --agent-id <memberId> --type update ...`)
4. New coord entry triggers dispatcher → may wake other agents
5. Repeat until task complete or `/consensus` reached

### App Restart

1. `initBridge()` calls `agentTeamService.resumeAllTeams()`
2. All existing `agent-team` conversations loaded from DB
3. `startDispatcher()` for each team
4. `syncTeamWorkspaceAssets()` ensures coord files are up to date (writeIfChanged)
5. Legacy root-level TEAM.md / skill files cleaned up
