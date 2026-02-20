# Proposal: Dual-Claude Swarm — Multi-Agent Collaborative Sessions

> **Status**: Draft v3
> **Date**: 2026-02-19
> **Inspired by**: [anthropics/claude-quickstarts/autonomous-coding](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding), AionUi's Ralph & Ouroboros assistants

## 1. Overview

Implement a **multi-agent swarm** system where two (or more) AI agent sessions collaborate within a single AionUi conversation. One agent acts as the **Driver** (executes code, writes files) and the other as the **Navigator** (reviews, plans, directs). They communicate through a shared message feed, coordinated by **dedicated swarm hook events**, and appear in the UI as distinct participants in the same conversation.

### Key Difference from Anthropic's Quickstart

The Anthropic `autonomous-coding` demo runs sessions **sequentially** (one finishes, next starts, filesystem is the shared state). Our design runs agents **concurrently** within a single conversation, communicating through a real-time message feed — closer to pair programming than relay racing.

### Key Difference from Ralph/Ouroboros

Ralph and Ouroboros use `onAgentResponse` — a generic hook event fired after any agent turn. The swarm system introduces **dedicated feed-aware hook events** (`onSwarmFeedMessage`, `onSwarmTurnStart`, `onSwarmTurnEnd`, `onSwarmInit`) so that:

- Hooks receive **structured feed entries** (not raw agent output strings)
- Hooks know **which agent role** they belong to (via `swarmContext`)
- The swarm can orchestrate **cross-backend agents** (e.g., Codex as Driver + Claude as Navigator) where each agent has its own `presetAgentType`
- Existing `onAgentResponse` hooks remain untouched — no regressions for Ralph/Ouroboros

### Design Principles

- **Reuse, don't reimplement** — each swarm agent is spawned via the existing `ConversationService` → `createAcpAgent` → `AcpAgentManager` pipeline; the swarm is only a thin orchestrator on top (~410 new lines)
- **Each agent = a regular conversation** — spawned the same way as Ralph or Ouroboros; all backend resolution, CLI management, message queuing, and session persistence is inherited for free
- **File-based coordination** — `.swarm/feed.jsonl` as the message bus (inspectable, debuggable, crash-recoverable)
- **Dedicated swarm events** — new hook events for feed-aware coordination, separate from generic `onAgentResponse`
- **Cross-backend agents** — each agent in the swarm can use a different backend (Claude, Codex, Gemini, Qwen, etc.)
- **Minimal UI changes** — extend existing message model with agent identity metadata
- **Extensible** — start with 2 agents (driver/navigator), architecture supports N agents

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       AionUi Conversation                        │
│                                                                  │
│  dual-claude/swarm/driver/              dual-claude/swarm/navigator/
│  ┌──────────────────────┐               ┌──────────────────────┐ │
│  │  agent.json           │               │  agent.json           │ │
│  │  presetAgentType:codex│               │  presetAgentType:claude│
│  │  avatar: ⚡            │               │  avatar: 🧭            │
│  │                       │               │                       │ │
│  │  hooks/               │               │  hooks/               │ │
│  │  └─driver-hooks.js   │               │  └─navigator-hooks.js│ │
│  │    onSwarmInit        │               │    onSwarmInit        │ │
│  │    onSwarmTurnStart   │  .swarm/      │    onSwarmTurnStart   │ │
│  │    onSwarmTurnEnd     │  feed.jsonl   │    onSwarmTurnEnd     │ │
│  │    onSwarmFeedMessage │◄────────────►│    onSwarmFeedMessage │ │
│  └──────────┬───────────┘               └──────────┬───────────┘ │
│             │                                       │             │
│  ┌──────────┴───────────────────────────────────────┴──────────┐ │
│  │                  SwarmSessionManager                         │ │
│  │  - Reads each agent.json → resolves backend per agent       │ │
│  │  - Spawns backend-specific processes (Claude, Codex, etc.)  │ │
│  │  - Fires onSwarm* hook events with SwarmHookContext          │ │
│  │  - Routes feed entries to correct agent queue               │ │
│  │  - Handles lifecycle (start, pause, terminate)              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                          │                                       │
│  ┌───────────────────────┴─────────────────────────────────────┐ │
│  │               Message Feed (.swarm/feed.jsonl)               │ │
│  │  - Append-only JSONL file                                   │ │
│  │  - Each line: {from, to, type, content, ts, backend}        │ │
│  │  - Agents read from last-seen offset                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                          │                                       │
│  ┌───────────────────────┴─────────────────────────────────────┐ │
│  │                      UI Layer                                │ │
│  │  - Messages show agent avatar + name + backend badge         │ │
│  │  - Driver messages: blue avatar, left-aligned                │ │
│  │  - Navigator messages: green avatar, left-aligned            │ │
│  │  - User messages: right-aligned (as before)                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Key Structural Principle: `swarm/[agent]/agent.json`

Each agent in the swarm has its own directory under `swarm/`, mirroring the top-level `assistant.json` pattern:

```
assistant/dual-claude/
├── assistant.json              ← swarm-level config (mode, feedPath, agents list)
│                                  NO systemPrompt here — only agents have prompts
├── swarm/
│   ├── driver/
│   │   ├── agent.json          ← agent-level config (role, backend, avatar)
│   │   ├── driver.md           ← system prompt / instructions for this agent
│   │   └── hooks/
│   │       └── driver-hooks.js ← swarm event handlers for this agent
│   └── navigator/
│       ├── agent.json          ← agent-level config
│       ├── navigator.md        ← system prompt / instructions for this agent
│       └── hooks/
│           └── navigator-hooks.js
└── workspace/                  ← template copied by buildWorkspaceWidthFiles()
    └── .swarm/                 ← feed directory pre-created in template
        └── .gitkeep            ← feed.jsonl created at runtime by SwarmFeedManager
```

This mirrors how existing assistants work (`ralph.en-US.md` contains preset rules). Benefits:
- Each agent is self-contained — easy to copy/swap/customize
- System prompts live in `.md` files — easier to edit, version, and review than JSON strings
- The main `assistant.json` has **no system prompt** — it's a swarm orchestrator, not an agent
- Adding a new agent to a swarm = adding a new directory with `agent.json` + `{role}.md` + `hooks/`
- `agent.json` follows the same schema conventions as `assistant.json`
- The `workspace/` template includes `.swarm/` so the feed directory exists after `buildWorkspaceWidthFiles()` copies it

## 3. Data Structures

### 3.1 assistant.json + agent.json — Swarm Configuration

The swarm uses a **two-level config** pattern: `assistant.json` at the swarm level, and `agent.json` per agent (mirroring the `assistant.json` schema).

#### 3.1.1 `assistant.json` — Swarm-Level Config

```jsonc
// assistant/dual-claude/assistant.json
{
  "id": "dual-claude",
  "name": "Dual Claude — Driver & Navigator",
  "version": "1.0.0",
  "description": "Two Claude Code agents collaborating: one drives (writes code), one navigates (reviews & plans).",
  "author": "AionUi",
  "presetAgentType": "claude",  // default backend (used when agent.json doesn't specify its own)
  "avatar": "🤝",
  "workspacePath": "./workspace",
  "tags": ["autonomous", "multi-agent", "swarm", "pair-programming", "claude-code"],

  // NEW: multi-agent mode
  "mode": "swarm",
  "swarm": {
    "feedPath": ".swarm/feed.jsonl",
    // Agent directories under swarm/ — each has its own agent.json + hooks/
    "agents": ["driver", "navigator"],
    "maxTurns": 30,
    "turnStrategy": "round-robin"
  },

  "defaultEnabledSkills": [],
  "queuedMessages": {
    "description": "Swarm: onSwarmInit seeds both agents, onSwarmTurnEnd routes via feed",
    "phases": [
      { "trigger": "onSwarmInit", "messages": 2, "purpose": "Seed driver and navigator with initial context" },
      { "trigger": "onSwarmTurnEnd", "messages": "N (feed-driven)", "purpose": "Route agent outputs through feed to the other agent" }
    ]
  }
}
```

#### 3.1.2 `agent.json` — Per-Agent Config

Each agent directory contains an `agent.json` for metadata and a `{role}.md` for the system prompt (just like `ralph.en-US.md` for the Ralph assistant):

```jsonc
// assistant/dual-claude/swarm/driver/agent.json
{
  "role": "driver",
  "name": "Driver",
  "avatar": "🔧",
  "description": "Executes code, writes files, runs tests. Takes direction from Navigator.",
  // Per-agent backend — omit to inherit from top-level assistant.json presetAgentType
  // "presetAgentType": "codex",  // ← uncomment to make Driver use Codex
  "nameI18n": {
    "en-US": "Driver",
    "zh-CN": "执行者"
  }
}
```

```markdown
<!-- assistant/dual-claude/swarm/driver/driver.md -->
# Driver — Swarm Agent

You are the DRIVER in a pair-programming session.
You write code, run commands, and implement features.

The Navigator will review your work and give you direction
via messages in the feed.

## Workflow

1. Read `.swarm/feed.jsonl` for the Navigator's latest directive
2. Execute the directive (write code, run tests, etc.)
3. Report what you did clearly
4. Wait for the Navigator's next instruction

## Rules

- Focus on **execution**, not planning
- After each action, summarize what you did and what files changed
- If you encounter an error, report it clearly — don't guess at fixes
- When the task is complete, output `<done/>`
```

```jsonc
// assistant/dual-claude/swarm/navigator/agent.json
{
  "role": "navigator",
  "name": "Navigator",
  "avatar": "🧭",
  "description": "Reviews code, plans architecture, gives direction to Driver.",
  // "presetAgentType": "claude",  // ← explicitly Claude for planning/review
  "nameI18n": {
    "en-US": "Navigator",
    "zh-CN": "导航者"
  }
}
```

```markdown
<!-- assistant/dual-claude/swarm/navigator/navigator.md -->
# Navigator — Swarm Agent

You are the NAVIGATOR in a pair-programming session.
You review the Driver's code, plan the architecture,
catch bugs, and give clear direction.

## Workflow

1. Analyze the task and break it into clear, actionable steps
2. Write ONE directive at a time to the Driver
3. After the Driver reports back, review the work critically
4. Provide the next directive or corrections
5. When all work is complete, output `<done/>`

## Rules

- Focus on **strategy and quality**, not writing code directly
- Be specific: include file paths, function names, exact requirements
- Review the Driver's output critically — catch bugs and design issues
- Give ONE clear directive at a time (not a list of 10 things)
```

**System prompt loading:** `SwarmSessionManager` reads `{agentDir}/{role}.md` and injects it as the system prompt for that agent's session. Supports i18n via `{role}.{locale}.md` (e.g., `driver.zh-CN.md`) — same pattern as `ralph.en-US.md`.

#### 3.1.3 `agent.json` Schema

```typescript
// src/agent/swarm/types.ts

type SwarmAgentConfig = {
  /** Unique role identifier within the swarm */
  role: string;
  /** Display name */
  name: string;
  /** Avatar emoji or image path */
  avatar: string;
  /** Description of this agent's purpose */
  description: string;
  /** Backend override — omit to inherit from assistant.json presetAgentType */
  presetAgentType?: string;
  /** Internationalized names */
  nameI18n?: Record<string, string>;
  /** Per-agent enabled skills */
  defaultEnabledSkills?: string[];
};

// NOTE: No systemPrompt field — system prompt lives in {role}.md file alongside agent.json.
// Loaded at runtime by SwarmSessionManager, supports i18n via {role}.{locale}.md.
```

**Backend resolution order:**
1. `swarm/[agent]/agent.json → presetAgentType` — per-agent override (highest priority)
2. `assistant.json → presetAgentType` — assistant default (fallback)

#### 3.1.4 Cross-Backend Example: Codex Driver + Claude Navigator

```
assistant/codex-claude-swarm/
├── assistant.json                    ← mode: "swarm", presetAgentType: "claude" (fallback)
├── swarm/
│   ├── driver/
│   │   ├── agent.json                ← presetAgentType: "codex" (override!)
│   │   ├── driver.md                 ← system prompt for Codex driver
│   │   └── hooks/
│   │       └── driver-hooks.js
│   └── navigator/
│       ├── agent.json                ← presetAgentType: "claude" (or omit to inherit)
│       ├── navigator.md              ← system prompt for Claude navigator
│       └── hooks/
│           └── navigator-hooks.js
└── workspace/                        ← template workspace
    └── .swarm/
        └── .gitkeep
```

```jsonc
// assistant/codex-claude-swarm/swarm/driver/agent.json
{
  "role": "driver",
  "name": "Codex Driver",
  "avatar": "⚡",
  "presetAgentType": "codex"     // ← Codex backend for fast code execution
}
// System prompt in: swarm/driver/driver.md
```

```jsonc
// assistant/codex-claude-swarm/swarm/navigator/agent.json
{
  "role": "navigator",
  "name": "Claude Navigator",
  "avatar": "🧭",
  "presetAgentType": "claude"    // ← Claude backend for planning/review
}
// System prompt in: swarm/navigator/navigator.md
```

This enables any combination: Claude+Claude, Codex+Claude, Gemini+Claude, Qwen+Codex, etc. Swapping a backend is a one-line change in `agent.json`. Swapping the prompt style is editing the `.md` file.

### 3.2 Feed Message Format (`.swarm/feed.jsonl`)

Each line in the feed is a JSON object:

```typescript
// src/agent/swarm/types.ts

type SwarmFeedEntry = {
  /** Unique message ID */
  id: string;
  /** Monotonic sequence number */
  seq: number;
  /** Agent role that sent this message */
  from: string;            // "driver" | "navigator" | "system" | "user"
  /** Target agent role (or "all" for broadcast) */
  to: string;              // "driver" | "navigator" | "all"
  /** Message type */
  type: 'message' | 'action' | 'review' | 'directive' | 'status' | 'done';
  /** Message content */
  content: string;
  /** Files referenced or changed */
  files?: string[];
  /** Backend that produced this entry (for cross-backend swarms) */
  backend?: string;        // "claude" | "codex" | "gemini" | "qwen" | ...
  /** ISO timestamp */
  ts: string;
};
```

Example `.swarm/feed.jsonl` (cross-backend: Codex driver + Claude navigator):

```jsonl
{"id":"f001","seq":1,"from":"system","to":"all","type":"directive","content":"Task: Build a REST API with user authentication","ts":"2026-02-19T10:00:00Z"}
{"id":"f002","seq":2,"from":"navigator","to":"driver","type":"directive","content":"Start by creating the Express server scaffold in src/server.ts with health check endpoint. Use TypeScript.","backend":"claude","ts":"2026-02-19T10:00:05Z"}
{"id":"f003","seq":3,"from":"driver","to":"navigator","type":"action","content":"Created src/server.ts with Express setup and /health endpoint. Running on port 3000.","files":["src/server.ts"],"backend":"codex","ts":"2026-02-19T10:01:30Z"}
{"id":"f004","seq":4,"from":"navigator","to":"driver","type":"review","content":"Looks good. Now add the auth middleware. Use JWT with bcrypt for password hashing. Create src/middleware/auth.ts.","backend":"claude","ts":"2026-02-19T10:01:35Z"}
```

### 3.3 Message Model Extension

Extend the existing `IMessage` type to carry agent identity:

```typescript
// Addition to src/common/chatLib.ts

/** Agent identity metadata for multi-agent (swarm) conversations */
type SwarmAgentMeta = {
  /** Agent role identifier */
  role: string;           // "driver" | "navigator"
  /** Display name */
  name: string;           // "Driver" | "Navigator"
  /** Avatar emoji or image path */
  avatar: string;         // "🔧" | "🧭"
};

// Extended IMessage — add optional agentMeta field
interface IMessage<T extends TMessageType, Content extends Record<string, any>> {
  id: string;
  msg_id?: string;
  conversation_id: string;
  type: T;
  content: Content;
  createdAt?: number;
  position?: 'left' | 'right' | 'center' | 'pop';
  status?: 'finish' | 'pending' | 'error' | 'work';
  /** NEW: Agent identity for swarm/multi-agent conversations */
  agentMeta?: SwarmAgentMeta;
}
```

## 4. Implementation Plan

### 4.1 New Files & Directories

```
src/agent/swarm/
├── types.ts                    # SwarmConfig, SwarmFeedEntry, SwarmAgentConfig, SwarmHookContext
├── SwarmSessionManager.ts      # Manages multiple agent sessions (cross-backend)
├── SwarmFeedManager.ts         # Read/write/watch .swarm/feed.jsonl
├── SwarmTurnController.ts      # Turn-taking strategy (round-robin, on-demand)
├── SwarmHookRunner.ts          # Wraps runHooks() with SwarmHookContext injection
└── index.ts                    # Public API

assistant/dual-claude/
├── assistant.json              # Swarm-level config — no system prompt (see §3.1.1)
├── swarm/
│   ├── driver/
│   │   ├── agent.json              # Driver agent config (see §3.1.2)
│   │   ├── driver.md               # Driver system prompt / instructions
│   │   └── hooks/
│   │       └── driver-hooks.js     # onSwarm* event handlers
│   └── navigator/
│       ├── agent.json              # Navigator agent config (see §3.1.2)
│       ├── navigator.md            # Navigator system prompt / instructions
│       └── hooks/
│           └── navigator-hooks.js  # onSwarm* event handlers
└── workspace/                  # Template workspace (copied by buildWorkspaceWidthFiles)
    └── .swarm/                 # Feed directory — pre-created in template
        └── .gitkeep            # feed.jsonl is created at runtime by SwarmFeedManager

tests/unit/swarm/
├── SwarmFeedManager.test.ts
├── SwarmTurnController.test.ts
└── swarmHooks.test.ts
```

### 4.2 `SwarmFeedManager` — The Message Bus

Manages the `.swarm/feed.jsonl` file as an append-only message bus. The `.swarm/` directory already exists in the workspace because it's part of the `assistant/dual-claude/workspace/` template — copied by `buildWorkspaceWidthFiles()` during conversation creation.

```typescript
// src/agent/swarm/SwarmFeedManager.ts

class SwarmFeedManager {
  private feedPath: string;       // absolute: {workspace}/.swarm/feed.jsonl
  private seq: number = 0;
  private cursors: Map<string, number> = new Map();  // role → last-read seq

  constructor(workspacePath: string, feedRelPath: string);
  // feedRelPath = ".swarm/feed.jsonl" (from assistant.json swarm.feedPath)
  // resolves to: {workspacePath}/.swarm/feed.jsonl

  /** Initialize feed file (directory already exists from workspace template) */
  init(): void;

  /** Append a message to the feed */
  append(entry: Omit<SwarmFeedEntry, 'id' | 'seq' | 'ts'>): SwarmFeedEntry;

  /** Read new messages for a specific agent since its last cursor position */
  readNewFor(role: string): SwarmFeedEntry[];

  /** Read all messages */
  readAll(): SwarmFeedEntry[];

  /** Check if a "done" message exists */
  isDone(): boolean;

  /** Get current sequence number */
  getSeq(): number;
}
```

**Key design decisions:**

- **Workspace template includes `.swarm/`** — The directory is pre-created in `assistant/dual-claude/workspace/.swarm/` and copied to the runtime workspace by `buildWorkspaceWidthFiles()`. The `feed.jsonl` file itself is created at runtime by `init()`.
- **Append-only JSONL** — Each write is a single `fs.appendFileSync()` call (atomic on most filesystems for small writes). No file locking needed.
- **Cursor-based reads** — Each agent tracks its `lastSeenSeq`. `readNewFor(role)` returns entries where `seq > cursor AND (to === role OR to === 'all')`.
- **Inspectable** — Humans can `cat .swarm/feed.jsonl` to see the full conversation history between agents.
- **Crash-recoverable** — On restart, read the file, find max seq, rebuild cursors.

### 4.3 `SwarmSessionManager` — Thin Orchestrator (Reuses Existing Pipeline)

The swarm manager does **not** create its own agent processes. Instead, it spawns each agent as a regular AionUi conversation using the existing `ConversationService.createConversation()` → `WorkerManage.buildConversation()` → `AcpAgentManager` pipeline — the same code path used for Ralph, Ouroboros, or any other assistant.

**Key principle:** Each `swarm/[agent]/` directory is treated as a **mini-assistant**. The swarm manager resolves the agent's config, builds `ICreateConversationParams`, and calls the standard creation flow. It then coordinates the agents via feed events and the message queue — nothing more.

```typescript
// src/agent/swarm/SwarmSessionManager.ts — thin orchestrator

import { ConversationService } from '@/process/services/conversationService';
import { WorkerManage } from '@/process/WorkerManage';
import { SwarmFeedManager } from './SwarmFeedManager';
import { SwarmTurnController } from './SwarmTurnController';
import { runSwarmHooks } from './SwarmHookRunner';
import type { SwarmConfig, SwarmAgentConfig } from './types';
import type { AcpAgentManager } from '@/process/task/AcpAgentManager';

type SwarmAgentHandle = {
  role: string;
  config: SwarmAgentConfig;
  backend: string;               // resolved: agent.presetAgentType || assistant.presetAgentType
  conversationId: string;        // the spawned conversation's ID
  manager: AcpAgentManager;      // reference to the existing AcpAgentManager instance
  hooksPath: string;             // swarm/[agent]/hooks/
  systemPromptPath: string;      // swarm/[agent]/{role}.md
};

export class SwarmSessionManager {
  private feedManager: SwarmFeedManager;
  private turnController: SwarmTurnController;
  private agents: Map<string, SwarmAgentHandle> = new Map();
  private config: SwarmConfig;
  private parentConversationId: string;
  private defaultBackend: string;
  private workspace: string;
  private assistantId: string;
  private assistantDir: string;

  constructor(config: SwarmConfig, parentConversationId: string, workspace: string, defaultBackend: string, assistantId: string, assistantDir: string) {
    this.config = config;
    this.parentConversationId = parentConversationId;
    this.workspace = workspace;
    this.defaultBackend = defaultBackend;
    this.assistantId = assistantId;
    this.assistantDir = assistantDir;
    this.feedManager = new SwarmFeedManager(workspace, config.feedPath);
    this.turnController = new SwarmTurnController(
      config.turnStrategy,
      config.agents,
      config.maxTurns
    );
  }

  /**
   * Initialize: spawn each agent as a regular conversation via existing pipeline.
   */
  async init(userMessage: string): Promise<void> {
    this.feedManager.init();

    for (const agentName of this.config.agents) {
      const agentDir = path.join(this.assistantDir, 'swarm', agentName);
      const agentConfig: SwarmAgentConfig = readJson(path.join(agentDir, 'agent.json'));
      const resolvedBackend = agentConfig.presetAgentType || this.defaultBackend;
      const systemPrompt = readPromptMd(agentDir, agentConfig.role);
      const hooksPath = path.join(agentDir, 'hooks');

      // ── Reuse existing pipeline: spawn as a regular conversation ──
      const result = await ConversationService.createConversation({
        type: 'acp',
        model: resolveModelForBackend(resolvedBackend),
        extra: {
          workspace: this.workspace,        // shared workspace (agents see same files)
          backend: resolvedBackend,          // claude, codex, qwen, etc.
          presetAssistantId: this.assistantId,
          presetContext: systemPrompt,       // injected from {role}.md
          enabledSkills: agentConfig.defaultEnabledSkills || [],
          agentName: agentConfig.name,
          // hooks are loaded from the agent's own hooks/ dir
        },
        name: `${this.assistantId}/${agentConfig.role}`,
        source: 'swarm',
      });

      if (!result.success || !result.conversation) {
        throw new Error(`Failed to spawn swarm agent "${agentConfig.role}": ${result.error}`);
      }

      // Get the AcpAgentManager that WorkerManage already created and cached
      const manager = WorkerManage.getTaskById(result.conversation.id) as AcpAgentManager;

      this.agents.set(agentConfig.role, {
        role: agentConfig.role,
        config: agentConfig,
        backend: resolvedBackend,
        conversationId: result.conversation.id,
        manager,
        hooksPath,
        systemPromptPath: path.join(agentDir, `${agentConfig.role}.md`),
      });

      // ── Wire agent finish events to swarm coordination ──
      // When this agent's turn finishes, the swarm routes the output
      manager.onTurnFinished((output: string) => {
        void this.onAgentFinished(agentConfig.role, output);
      });
    }

    // Fire onSwarmInit for each agent → collects seed queueMessages
    for (const [role, handle] of this.agents) {
      const result = await runSwarmHooks('onSwarmInit', {
        role,
        agentConfig: handle.config,
        feedManager: this.feedManager,
        turnNumber: 0,
        maxTurns: this.config.maxTurns,
        turnStrategy: this.config.turnStrategy,
        peers: this.getPeers(role),
        workspace: this.workspace,
        assistantHooksPath: handle.hooksPath,
        content: userMessage,
      });

      // Enqueue seed messages into the agent's existing AcpMessageQueue
      if (result.queueMessages?.length) {
        handle.manager.messageQueue.enqueueAll(result.queueMessages);
      }
    }

    // Start the first agent's turn
    const firstRole = this.turnController.next();
    await this.startTurn(firstRole);
  }

  /** Route a feed entry to the target agent's message queue */
  routeToAgent(entry: SwarmFeedEntry): void;

  /** Pause/resume/terminate delegate to each agent's AcpAgentManager */
  pause(): void { for (const h of this.agents.values()) h.manager.messageQueue.pause(); }
  resume(): void { for (const h of this.agents.values()) h.manager.messageQueue.resume(); }
  terminate(): void { for (const h of this.agents.values()) h.manager.stop(); }
  isDone(): boolean { return this.feedManager.isDone() || this.turnController.isExhausted(); }

  private getPeers(role: string): string[] {
    return [...this.agents.keys()].filter(r => r !== role);
  }
}
```

**What the swarm manager does NOT do:**
- Does NOT create AcpAgent instances — `AcpAgentManager.initAgent()` handles that (lazy)
- Does NOT resolve CLI paths or backend config — `AcpAgentManager.initAgent()` handles that
- Does NOT manage message queues — uses each agent's existing `AcpMessageQueue`
- Does NOT run `onConversationInit` hooks — `buildWorkspaceWidthFiles()` handles that
- Does NOT copy workspace templates — `buildWorkspaceWidthFiles()` handles that

**What the swarm manager DOES do:**
- Reads `assistant.json` swarm config and each `agent.json`
- Calls `ConversationService.createConversation()` per agent (standard pipeline)
- Wires agent finish events to swarm coordination (feed routing)
- Fires `onSwarm*` hook events at the right lifecycle points
- Manages turn-taking via `SwarmTurnController`
- Manages the shared feed via `SwarmFeedManager`

**Lifecycle:**

1. User sends message → `SwarmSessionManager.init(userMessage)`
2. For each agent: `ConversationService.createConversation()` → spawns as regular conversation
3. `onSwarmInit` per agent → seed messages enqueued into each agent's `AcpMessageQueue`
4. Navigator turn starts → its `AcpMessageQueue` processes the seed message → `AcpAgentManager.sendMessage()` → lazy `initAgent()` → CLI spawned
5. Navigator finishes → `onTurnFinished` callback → `onSwarmTurnEnd` → writes to feed → routes to Driver
6. Driver turn starts → same flow via its own `AcpAgentManager`
7. Repeat until `done` signal or `maxTurns` reached

### 4.4 `SwarmTurnController` — Turn-Taking Strategy

```typescript
// src/agent/swarm/SwarmTurnController.ts

type TurnStrategy = 'round-robin' | 'on-demand';

class SwarmTurnController {
  private strategy: TurnStrategy;
  private agentOrder: string[];
  private currentIndex: number = 0;
  private turnCount: number = 0;
  private maxTurns: number;

  constructor(strategy: TurnStrategy, agents: string[], maxTurns: number);

  /** Get the next agent role that should act */
  next(): string;

  /** Check if max turns reached */
  isExhausted(): boolean;

  /** Get turn count */
  getTurnCount(): number;
}
```

**Strategies:**

- **`round-robin`** (default): Navigator → Driver → Navigator → Driver → ...
- **`on-demand`**: Agent specifies who should go next via `to` field in feed (more flexible, less predictable)

### 4.5 Swarm Hook Events — Dedicated Feed-Aware Event System

#### 4.5.1 Why Not Reuse `onAgentResponse`?

Ralph and Ouroboros use `onAgentResponse` — a generic event fired after any agent turn. It receives raw `content` (the agent's text output) and returns `queueMessages`. This works for single-agent loops but has limitations for multi-agent swarms:

| Concern | `onAgentResponse` (generic) | Swarm events (dedicated) |
|---------|---------------------------|--------------------------|
| Context | Raw string `content` | Structured `SwarmFeedEntry[]` + `SwarmHookContext` |
| Agent identity | Hook must parse/infer role | `context.swarm.role` provided automatically |
| Backend awareness | Single `backend` string | `context.swarm.agentBackend` per agent |
| Feed operations | Hook does raw `fs.appendFileSync` | `context.swarm.feed.append()` helper |
| Turn coordination | Hook polls feed manually | `SwarmSessionManager` fires events at correct points |
| Cross-backend | Not designed for it | Each agent resolves its own backend type |
| Regression risk | Changes affect Ralph/Ouroboros | Zero impact on existing assistants |

#### 4.5.2 New Hook Events

Add four new events to the `HookEvent` union type:

```typescript
// Addition to src/assistant/hooks/types.ts

export type HookEvent =
  // ... existing events ...
  | 'onWorkspaceInit'
  | 'onConversationInit'
  | 'onSendMessage'
  | 'onFirstMessage'
  | 'onBuildSystemInstructions'
  | 'onError'
  | 'onQueueInit'
  | 'onAgentResponse'
  // NEW: Swarm-specific events
  | 'onSwarmInit'
  | 'onSwarmTurnStart'
  | 'onSwarmTurnEnd'
  | 'onSwarmFeedMessage';
```

**Event lifecycle in a swarm turn:**

```
User sends task
  │
  ├─► onSwarmInit (both agents)         — seed each agent with role context
  │     fired once per swarm session
  │
  ├─► onSwarmTurnStart (navigator)      — navigator's turn begins
  │     │
  │     │   [navigator agent runs...]
  │     │
  │     └─► onSwarmTurnEnd (navigator)  — navigator finished, output → feed
  │           │
  │           └─► onSwarmFeedMessage (driver)  — driver receives feed entry
  │                 │
  │                 └─► onSwarmTurnStart (driver) — driver's turn begins
  │                       │
  │                       │   [driver agent runs...]
  │                       │
  │                       └─► onSwarmTurnEnd (driver) — driver finished, output → feed
  │                             │
  │                             └─► onSwarmFeedMessage (navigator) — navigator receives
  │                                   │
  │                                   └─► ... round-robin continues ...
  │
  └─► (done signal or maxTurns) → swarm terminates
```

#### 4.5.3 `SwarmHookContext` — Extended Context for Swarm Hooks

```typescript
// Addition to src/agent/swarm/types.ts

/** Swarm-specific context passed to swarm hook events */
type SwarmHookContext = {
  /** This agent's role in the swarm */
  role: string;                     // "driver" | "navigator"
  /** This agent's display name */
  name: string;                     // "Driver" | "Codex Driver"
  /** This agent's resolved backend type */
  agentBackend: string;             // "claude" | "codex" | "gemini" | "qwen"
  /** The counterpart's role(s) */
  peers: string[];                  // ["navigator"] or ["driver"]
  /** Current turn number */
  turnNumber: number;
  /** Max turns before auto-terminate */
  maxTurns: number;
  /** Turn strategy */
  turnStrategy: TurnStrategy;
  /** Feed helper — hooks use this instead of raw fs operations */
  feed: {
    /** Append an entry to the feed (auto-fills id, seq, ts, backend) */
    append: (entry: { to: string; type: string; content: string; files?: string[] }) => SwarmFeedEntry;
    /** Read new entries addressed to this agent's role */
    readNew: () => SwarmFeedEntry[];
    /** Read all entries */
    readAll: () => SwarmFeedEntry[];
    /** Check if any agent signaled done */
    isDone: () => boolean;
  };
};

/** Full context passed to swarm hook handlers */
type SwarmFullHookContext = HookContext & {
  /** Swarm-specific context — only present for onSwarm* events */
  swarm: SwarmHookContext;
  /** The feed entries that triggered this event (for onSwarmFeedMessage) */
  feedEntries?: SwarmFeedEntry[];
  /** The agent's raw output (for onSwarmTurnEnd) */
  agentOutput?: string;
};
```

#### 4.5.4 `SwarmHookResult` — Extended Result

```typescript
// Addition to src/agent/swarm/types.ts

type SwarmHookResult = HookResult & {
  /** Feed entries to write (alternative to using context.swarm.feed.append) */
  feedEntries?: Array<{ to: string; type: string; content: string; files?: string[] }>;
  /** Signal that the swarm task is done */
  done?: boolean;
  /** Override which agent goes next (for on-demand turn strategy) */
  nextAgent?: string;
};
```

#### 4.5.5 Event Details

| Event | When Fired | Context Includes | Expected Hook Behavior |
|-------|-----------|------------------|----------------------|
| `onSwarmInit` | Once when swarm starts, per agent | `swarm.role`, `content` (user task) | Return seed `queueMessages` for the agent |
| `onSwarmTurnStart` | Before an agent's turn begins | `swarm.role`, `feedEntries` (new messages for this agent) | Transform/filter feed entries into the agent's prompt |
| `onSwarmTurnEnd` | After an agent finishes its turn | `swarm.role`, `agentOutput` (raw output) | Parse output, write to feed, detect `<done/>`, return `feedEntries` |
| `onSwarmFeedMessage` | When a new feed entry targets this agent | `swarm.role`, `feedEntries` (the new entries) | Decide whether to queue a message to wake the agent |

#### 4.5.6 Driver Hooks (Using Swarm Events)

```javascript
// assistant/dual-claude/swarm/driver/hooks/driver-hooks.js

const ROLE = 'driver';

module.exports = {
  /**
   * onSwarmInit — Seed the driver with initial context.
   * The driver waits for the navigator's first directive before acting.
   */
  onSwarmInit: {
    handler: async (context) => {
      const { swarm } = context;
      const userTask = context.content || 'No task specified.';

      return {
        queueMessages: [{
          content: [
            '## Swarm — Driver Session',
            '',
            `**Task:** ${userTask}`,
            `**Your backend:** ${swarm.agentBackend}`,
            `**Your role:** ${swarm.role}`,
            '',
            'You are the **Driver** in a pair-programming swarm.',
            'The Navigator will review your work and provide direction.',
            '',
            '**Your workflow:**',
            '1. Read `.swarm/feed.jsonl` for the Navigator\'s latest directive',
            '2. Execute the directive (write code, run tests, etc.)',
            '3. Report what you did clearly',
            '4. Wait for the Navigator\'s next instruction',
            '',
            'Start by reading the feed for the Navigator\'s first directive.',
          ].join('\n'),
          priority: 'normal',
          source: 'hook',
        }],
      };
    },
    priority: 50,
  },

  /**
   * onSwarmTurnEnd — Driver completed an action.
   * Parse output, write to feed, detect done signal.
   */
  onSwarmTurnEnd: {
    handler: async (context) => {
      const { swarm, agentOutput = '' } = context;

      // Check for done signal
      if (/<done\s*\/?>/.test(agentOutput)) {
        swarm.feed.append({
          to: 'all',
          type: 'done',
          content: 'Driver signals task completion.',
        });
        return { done: true };
      }

      // Write driver's action report to feed
      swarm.feed.append({
        to: 'navigator',
        type: 'action',
        content: agentOutput.slice(0, 4000),
      });

      return {};
    },
    priority: 50,
  },

  /**
   * onSwarmFeedMessage — Navigator posted a directive for the driver.
   * Queue a message to wake the driver with the directive.
   */
  onSwarmFeedMessage: {
    handler: async (context) => {
      const { feedEntries = [] } = context;
      if (feedEntries.length === 0) return {};

      const latest = feedEntries[feedEntries.length - 1];

      return {
        queueMessages: [{
          content: [
            `## Navigator says: (turn ${context.swarm.turnNumber}/${context.swarm.maxTurns})`,
            '',
            latest.content,
            '',
            '---',
            '_Read `.swarm/feed.jsonl` for full context. Execute the directive above._',
          ].join('\n'),
          priority: 'normal',
          source: 'hook',
        }],
      };
    },
    priority: 50,
  },
};
```

#### 4.5.7 Navigator Hooks (Using Swarm Events)

```javascript
// assistant/dual-claude/swarm/navigator/hooks/navigator-hooks.js

const ROLE = 'navigator';

module.exports = {
  /**
   * onSwarmInit — Navigator seeds the collaboration.
   * Writes user task to feed and receives planning prompt.
   */
  onSwarmInit: {
    handler: async (context) => {
      const { swarm } = context;
      const userRequest = (context.content || '').trim();

      // Write user task to feed as the seed directive
      swarm.feed.append({
        to: 'all',
        type: 'directive',
        content: userRequest,
      });

      return {
        queueMessages: [{
          content: [
            '## Swarm — Navigator Session',
            '',
            `**Task:** ${userRequest}`,
            `**Your backend:** ${swarm.agentBackend}`,
            `**Your role:** ${swarm.role}`,
            `**Driver backend:** ${context.swarm.peers.join(', ')}`,
            '',
            'You are the **Navigator** in a pair-programming swarm.',
            'The Driver will execute your directives and report back.',
            '',
            '**Your workflow:**',
            '1. Analyze the task and break it into clear, actionable steps',
            '2. Write your first directive to the Driver',
            '3. After the Driver reports back, review the work',
            '4. Provide the next directive or corrections',
            '5. When all work is complete, output `<done/>`',
            '',
            '**Rules:**',
            '- Give ONE clear directive at a time (not a list of 10 things)',
            '- Be specific: include file paths, function names, exact requirements',
            '- Review the Driver\'s output critically — catch bugs and design issues',
            '',
            'Begin by analyzing the task and writing your first directive.',
          ].join('\n'),
          priority: 'normal',
          source: 'hook',
        }],
      };
    },
    priority: 50,
  },

  /**
   * onSwarmTurnEnd — Navigator provided a review or directive.
   * Write to feed. Detect done signal.
   */
  onSwarmTurnEnd: {
    handler: async (context) => {
      const { swarm, agentOutput = '' } = context;

      // Check for done signal
      if (/<done\s*\/?>/.test(agentOutput)) {
        swarm.feed.append({
          to: 'all',
          type: 'done',
          content: 'Navigator signals task completion.',
        });
        return { done: true };
      }

      // Write navigator's directive to feed
      swarm.feed.append({
        to: 'driver',
        type: 'directive',
        content: agentOutput.slice(0, 4000),
      });

      return {};
    },
    priority: 50,
  },

  /**
   * onSwarmFeedMessage — Driver posted an action report.
   * Queue a message to wake the navigator with the report.
   */
  onSwarmFeedMessage: {
    handler: async (context) => {
      const { feedEntries = [] } = context;
      if (feedEntries.length === 0) return {};

      const latest = feedEntries[feedEntries.length - 1];

      return {
        queueMessages: [{
          content: [
            `## Driver reports: (turn ${context.swarm.turnNumber}/${context.swarm.maxTurns})`,
            '',
            latest.content,
            '',
            '---',
            '_Read `.swarm/feed.jsonl` for full context. Review and provide next directive._',
          ].join('\n'),
          priority: 'normal',
          source: 'hook',
        }],
      };
    },
    priority: 50,
  },
};
```

#### 4.5.8 How `SwarmSessionManager` Fires Swarm Events

The `SwarmSessionManager` owns the event firing lifecycle. It calls hooks via a new `runSwarmHooks()` function that wraps the existing `runHooks()` with `SwarmHookContext` injection:

```typescript
// src/agent/swarm/SwarmHookRunner.ts

import { runHooks } from '@/assistant/hooks/HookRunner';
import type { SwarmHookContext, SwarmFeedEntry } from './types';

/**
 * Run swarm-specific hooks for a given agent role.
 * Injects SwarmHookContext into the standard HookContext.
 */
export async function runSwarmHooks(
  event: 'onSwarmInit' | 'onSwarmTurnStart' | 'onSwarmTurnEnd' | 'onSwarmFeedMessage',
  options: {
    role: string;
    agentConfig: SwarmAgentConfig;
    feedManager: SwarmFeedManager;
    turnNumber: number;
    maxTurns: number;
    turnStrategy: TurnStrategy;
    peers: string[];
    workspace: string;
    assistantHooksPath: string;       // role-specific hooks dir
    content?: string;                 // user task (for onSwarmInit)
    agentOutput?: string;             // raw output (for onSwarmTurnEnd)
    feedEntries?: SwarmFeedEntry[];   // new entries (for onSwarmFeedMessage)
  }
): Promise<SwarmHookResult> {
  const swarmContext: SwarmHookContext = {
    role: options.role,
    name: options.agentConfig.name,
    agentBackend: options.agentConfig.presetAgentType || 'claude', // resolved backend
    peers: options.peers,
    turnNumber: options.turnNumber,
    maxTurns: options.maxTurns,
    turnStrategy: options.turnStrategy,
    feed: {
      append: (entry) => options.feedManager.append({
        from: options.role,
        backend: options.agentConfig.presetAgentType,
        ...entry,
      }),
      readNew: () => options.feedManager.readNewFor(options.role),
      readAll: () => options.feedManager.readAll(),
      isDone: () => options.feedManager.isDone(),
    },
  };

  // Run hooks with swarm context injected
  return await runHooks(event, {
    assistantPath: options.assistantHooksPath.replace(/\/hooks$/, ''),
    workspace: options.workspace,
    backend: options.agentConfig.presetAgentType,
    content: options.content,
    // Swarm-specific fields (accessible via context.swarm, context.feedEntries, etc.)
    swarm: swarmContext,
    agentOutput: options.agentOutput,
    feedEntries: options.feedEntries,
  } as any) as SwarmHookResult;
}
```

**Key design: hooks never touch the filesystem directly.** They use `context.swarm.feed.append()` which delegates to `SwarmFeedManager`. This means the same hooks work regardless of backend — a Codex agent's hooks produce the same feed entries as a Claude agent's hooks.

### 4.6 `SwarmSessionManager` — Core Orchestration Logic

Since each agent is spawned as a regular conversation (§4.3), the core orchestration is just **event wiring** — listening for agent finish events and routing through the feed. This is the `onAgentFinished` and `startTurn` logic:

```typescript
// src/agent/swarm/SwarmSessionManager.ts — continued from §4.3

  /** Called when an agent finishes its turn (via onTurnFinished callback) */
  async onAgentFinished(role: string, output: string): Promise<void> {
    const handle = this.agents.get(role)!;

    // 1. Fire onSwarmTurnEnd — hook writes to feed, detects done
    const turnEndResult = await runSwarmHooks('onSwarmTurnEnd', {
      role,
      agentConfig: handle.config,
      feedManager: this.feedManager,
      turnNumber: this.turnController.getTurnCount(),
      maxTurns: this.config.maxTurns,
      turnStrategy: this.config.turnStrategy,
      peers: this.getPeers(role),
      workspace: this.workspace,
      assistantHooksPath: handle.hooksPath,
      agentOutput: output,
    });

    // 2. Check termination
    if (turnEndResult.done || this.feedManager.isDone() || this.turnController.isExhausted()) {
      this.terminate();
      return;
    }

    // 3. Determine next agent
    const nextRole = turnEndResult.nextAgent || this.turnController.next();
    const nextHandle = this.agents.get(nextRole)!;

    // 4. Read new feed entries for the next agent
    const newEntries = this.feedManager.readNewFor(nextRole);

    // 5. Fire onSwarmFeedMessage for the next agent
    const feedResult = await runSwarmHooks('onSwarmFeedMessage', {
      role: nextRole,
      agentConfig: nextHandle.config,
      feedManager: this.feedManager,
      turnNumber: this.turnController.getTurnCount(),
      maxTurns: this.config.maxTurns,
      turnStrategy: this.config.turnStrategy,
      peers: this.getPeers(nextRole),
      workspace: this.workspace,
      assistantHooksPath: nextHandle.hooksPath,
      feedEntries: newEntries,
    });

    // 6. Enqueue messages into the agent's existing AcpMessageQueue
    if (feedResult.queueMessages?.length) {
      nextHandle.manager.messageQueue.enqueueAll(feedResult.queueMessages);
    }

    await this.startTurn(nextRole);
  }

  private async startTurn(role: string): Promise<void> {
    const handle = this.agents.get(role)!;

    // Fire onSwarmTurnStart
    await runSwarmHooks('onSwarmTurnStart', {
      role,
      agentConfig: handle.config,
      feedManager: this.feedManager,
      turnNumber: this.turnController.getTurnCount(),
      maxTurns: this.config.maxTurns,
      turnStrategy: this.config.turnStrategy,
      peers: this.getPeers(role),
      workspace: this.workspace,
      assistantHooksPath: handle.hooksPath,
    });

    // The agent's AcpMessageQueue auto-processes when messages are enqueued.
    // AcpAgentManager.initAgent() is called lazily on first sendMessage() —
    // we don't need to start anything here, the queue handles it.
  }
```

**Cross-backend lifecycle example (Codex driver + Claude navigator):**

```
1. init("Build REST API with auth")
   ├─ ConversationService.createConversation(type:"acp", backend:"codex") → driver
   ├─ ConversationService.createConversation(type:"acp", backend:"claude") → navigator
   │   Each creates: DB row + AcpAgentManager (cached in WorkerManage)
   │   CLI process NOT started yet (lazy init on first sendMessage)
   ├─ onSwarmInit(driver) → seeds driver's AcpMessageQueue
   └─ onSwarmInit(navigator) → seeds navigator's AcpMessageQueue

2. Navigator turn (Claude process):
   ├─ AcpMessageQueue dequeues seed → AcpAgentManager.sendMessage()
   │   → initAgent() (lazy) → resolves cliPath from acp.config["claude"]
   │   → AcpAgent.start() → spawns Claude CLI process
   ├─ Claude analyzes task, outputs plan
   ├─ AcpAgent finish signal → onTurnFinished callback → swarm.onAgentFinished()
   ├─ onSwarmTurnEnd(navigator) → hook writes directive to feed (backend: "claude")
   └─ onSwarmFeedMessage(driver) → queues directive into driver's AcpMessageQueue

3. Driver turn (Codex process):
   ├─ AcpMessageQueue dequeues → AcpAgentManager.sendMessage()
   │   → initAgent() (lazy) → resolves cliPath from acp.config["codex"]
   │   → AcpAgent.start() → spawns Codex CLI process
   ├─ Codex reads directive, writes code
   ├─ AcpAgent finish signal → onTurnFinished callback → swarm.onAgentFinished()
   ├─ onSwarmTurnEnd(driver) → hook writes action report to feed (backend: "codex")
   └─ onSwarmFeedMessage(navigator) → queues report into navigator's AcpMessageQueue

4. Repeat until <done/> or maxTurns
```

**Why this works:** Each swarm agent is a real AionUi conversation with its own `AcpAgentManager`, `AcpMessageQueue`, and `AcpAgent` (CLI process). The swarm manager just coordinates **when** each agent's queue gets new messages and **what** those messages contain (via feed routing). All the heavy lifting — backend resolution, CLI spawning, mode management, session persistence — is handled by the existing pipeline.

### 4.7 Integration with Existing Systems

The swarm integrates into the existing AionUi architecture with **minimal changes** — the key insight is that each swarm agent is just a regular conversation.

#### 4.7.1 Assistant Loading (`src/common/presets/assistantPresets.ts`)

Register the new assistant:

```typescript
{
  id: 'dual-claude',
  name: 'Dual Claude',
  avatar: '🤝',
  presetAgentType: 'claude',
  mode: 'swarm',  // NEW field recognized by agent init
  // ...
}
```

#### 4.7.2 Agent Initialization (`src/process/initAgent.ts`)

When `assistant.mode === 'swarm'`, the existing `createAcpAgent()` flow is extended:

```typescript
// In initAgent.ts or a new swarm integration module

export async function createSwarmConversation(params: ICreateConversationParams): Promise<TChatConversation> {
  // 1. Create the parent conversation (the swarm itself — for UI grouping)
  const parentConversation = await createAcpAgent(params);

  // 2. Read assistant.json to get swarm config
  const assistantDir = path.join(getAssistantsDir(), params.extra.presetAssistantId);
  const assistantJson = readJson(path.join(assistantDir, 'assistant.json'));

  // 3. Create SwarmSessionManager — it will spawn child conversations via
  //    ConversationService.createConversation() using the SAME pipeline
  const swarmManager = new SwarmSessionManager(
    assistantJson.swarm,
    parentConversation.id,
    parentConversation.extra.workspace,
    assistantJson.presetAgentType,
    assistantJson.id,
    assistantDir,
  );

  // 4. Register the swarm manager (NOT an AcpAgentManager — it's a coordinator)
  WorkerManage.registerSwarm(parentConversation.id, swarmManager);

  return parentConversation;
}
```

**Key:** The parent conversation exists for UI grouping and user interaction. Each agent inside is a real child conversation created via the standard `ConversationService.createConversation()` → `createAcpAgent()` → `buildWorkspaceWidthFiles()` → `WorkerManage.buildConversation()` pipeline.

#### 4.7.3 Existing Pipeline Reuse Map

| Existing Code | What It Does For Swarm | Where Called |
|---------------|----------------------|-------------|
| `ConversationService.createConversation()` | Spawns each agent as a regular conversation | `SwarmSessionManager.init()` per agent |
| `createAcpAgent()` | Builds workspace, resolves hooks path | Called by ConversationService |
| `buildWorkspaceWidthFiles()` | Copies workspace template, runs `onConversationInit` | Called by createAcpAgent |
| `WorkerManage.buildConversation()` | Creates `AcpAgentManager`, caches in taskList | Called by ConversationService |
| `AcpAgentManager.initAgent()` | Resolves backend CLI path, spawns process | Lazy — on first `sendMessage()` |
| `AcpAgentManager.sendMessage()` | Routes to message queue | Called when swarm hooks enqueue messages |
| `AcpMessageQueue` | Sequential message processing, auto-start | Each agent gets its own (from AcpAgentManager) |
| `AcpAgent.start()` | Spawns CLI process (Claude, Codex, etc.) | Lazy — via `initAgent()` |

#### 4.7.4 What's New vs. Reused

| Component | New or Reused | Notes |
|-----------|--------------|-------|
| `SwarmSessionManager` | **New** | Thin orchestrator — ~200 lines |
| `SwarmFeedManager` | **New** | JSONL message bus — ~100 lines |
| `SwarmTurnController` | **New** | Round-robin logic — ~50 lines |
| `SwarmHookRunner` | **New** | Wraps `runHooks()` with swarm context — ~60 lines |
| `ConversationService.createConversation()` | **Reused** | Unchanged — spawns each agent |
| `createAcpAgent()` + `buildWorkspaceWidthFiles()` | **Reused** | Unchanged — sets up workspace + hooks |
| `AcpAgentManager` | **Reused** | Unchanged — manages each agent's lifecycle |
| `AcpMessageQueue` | **Reused** | Unchanged — handles sequential messaging |
| `AcpAgent` | **Reused** | Unchanged — spawns CLI processes |
| `WorkerManage` | **Small addition** | Add `registerSwarm()` + `getTaskById()` support |

#### 4.7.5 Message Queue Integration

The swarm hooks use each agent's existing `AcpMessageQueue` (from its `AcpAgentManager`):

- **Instead of** `runQueueInitHooks()` → `onSwarmInit` enqueues seed messages via `handle.manager.messageQueue.enqueueAll()`
- **Instead of** `runAgentResponseHooks()` → `onSwarmTurnEnd` + `onSwarmFeedMessage` enqueue follow-up messages
- Each queue's `sendMessageDirect` is already wired to the agent's `AcpAgent` (which uses the resolved backend CLI)
- The existing `onAgentResponse` event is **not fired** for swarm agents — zero regression risk for Ralph/Ouroboros

#### 4.7.6 Shared Workspace

All agents in a swarm share the **same workspace directory**. This is intentional — they're pair-programming on the same codebase. The `buildWorkspaceWidthFiles()` call copies the `assistant/dual-claude/workspace/` template (which includes `.swarm/`) into the runtime workspace. The `SwarmFeedManager` then creates `feed.jsonl` inside the already-existing `.swarm/` directory. Subsequent agents receive the same workspace path — they all see the same files and the same feed.

### 4.8 UI Changes

#### 4.8.1 Message Rendering with Agent Identity

In `src/renderer/messages/MessageList.tsx`, when rendering messages with `agentMeta`:

```tsx
// Conceptual change to MessageItem
const MessageItem: React.FC<{ message: TMessage }> = ({ message }) => {
  const isSwarm = !!message.agentMeta;

  return (
    <div className={classNames('flex items-start message-item', {
      'justify-end': message.position === 'right',
      'justify-start': message.position === 'left',
    })}>
      {/* NEW: Show agent avatar for swarm messages */}
      {isSwarm && message.position === 'left' && (
        <SwarmAgentBadge
          avatar={message.agentMeta.avatar}
          name={message.agentMeta.name}
          role={message.agentMeta.role}
        />
      )}
      {/* Existing message content rendering */}
      <MessageContent message={message} />
    </div>
  );
};
```

#### 4.8.2 `SwarmAgentBadge` Component

```tsx
// src/renderer/components/SwarmAgentBadge.tsx

type SwarmAgentBadgeProps = {
  avatar: string;
  name: string;
  role: string;
};

const ROLE_COLORS: Record<string, string> = {
  driver: 'bg-blue-100 text-blue-700 border-blue-200',
  navigator: 'bg-green-100 text-green-700 border-green-200',
};

const SwarmAgentBadge: React.FC<SwarmAgentBadgeProps> = ({ avatar, name, role }) => (
  <div className="flex flex-col items-center mr-2 min-w-8">
    <span className="text-lg">{avatar}</span>
    <span className={classNames(
      'text-xs px-1 rounded border mt-0.5',
      ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'
    )}>
      {name}
    </span>
  </div>
);
```

#### 4.8.3 Database Schema

Add `agent_meta` column to messages table:

```sql
-- Migration
ALTER TABLE messages ADD COLUMN agent_meta TEXT;
-- Stores JSON: {"role":"driver","name":"Driver","avatar":"🔧"}
```

The `rowToMessage()` / `messageToRow()` functions in `src/process/database/types.ts` parse/stringify this field.

## 5. Sequence Diagram (with Swarm Hook Events)

```
User                  SwarmSessionManager         Navigator (Claude)     Driver (Codex)     Feed
  │                          │                         │                    │                 │
  │── "Build REST API" ─────►│                         │                    │                 │
  │                          │                         │                    │                 │
  │                          │─ onSwarmInit(navigator) ►│                    │                 │
  │                          │─ onSwarmInit(driver) ────┼───────────────────►│                 │
  │                          │                         │                    │                 │
  │                          │─ onSwarmTurnStart(nav) ─►│                    │                 │
  │                          │                         │── analyze task     │                 │
  │                          │                         │── plan steps       │                 │
  │                          │◄────── output ──────────│                    │                 │
  │                          │                         │                    │                 │
  │                          │─ onSwarmTurnEnd(nav) ───►│                    │                 │
  │                          │  hook: feed.append() ───┼────────────────────┼────────────────►│
  │                          │  (directive → driver)   │                    │                 │
  │                          │                         │                    │                 │
  │                          │─ onSwarmFeedMessage(drv) ┼───────────────────►│                 │
  │                          │  hook: queueMessages ───┼───────────────────►│                 │
  │                          │                         │                    │                 │
  │                          │─ onSwarmTurnStart(drv) ─┼───────────────────►│                 │
  │                          │                         │                    │── write code    │
  │                          │                         │                    │── run tests     │
  │                          │◄────────────────────────┼────── output ──────│                 │
  │                          │                         │                    │                 │
  │                          │─ onSwarmTurnEnd(drv) ───┼───────────────────►│                 │
  │                          │  hook: feed.append() ───┼────────────────────┼────────────────►│
  │                          │  (action → navigator)   │                    │                 │
  │                          │                         │                    │                 │
  │                          │─ onSwarmFeedMessage(nav) ►│                    │                 │
  │                          │  hook: queueMessages ───►│                    │                 │
  │                          │                         │── review code      │                 │
  │                          │                         │── check quality    │                 │
  │                          │                         │                    │                 │
  │                          │        ... continues round-robin ...         │                 │
  │                          │                         │                    │                 │
  │                          │─ onSwarmTurnEnd(nav) ───►│                    │                 │
  │                          │  hook: done=true ───────│                    │                 │
  │◄── "Task complete" ─────│                         │                    │                 │
```

## 6. Unit Tests

### 6.1 `SwarmFeedManager.test.ts`

```typescript
// tests/unit/swarm/SwarmFeedManager.test.ts

describe('SwarmFeedManager', () => {
  let feedManager: SwarmFeedManager;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-test-'));
    feedManager = new SwarmFeedManager(tmpDir, '.swarm/feed.jsonl');
    feedManager.init();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('init creates .swarm directory and empty feed file', () => {
    expect(fs.existsSync(path.join(tmpDir, '.swarm'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.swarm', 'feed.jsonl'))).toBe(true);
  });

  test('append adds entry with auto-incremented seq', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task A' });
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do X' });

    const entries = feedManager.readAll();
    expect(entries).toHaveLength(2);
    expect(entries[0].seq).toBe(1);
    expect(entries[1].seq).toBe(2);
    expect(entries[1].from).toBe('navigator');
  });

  test('readNewFor returns only messages addressed to the role', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task' });
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do X' });
    feedManager.append({ from: 'driver', to: 'navigator', type: 'action', content: 'Did X' });

    const forDriver = feedManager.readNewFor('driver');
    expect(forDriver).toHaveLength(2); // user→all + navigator→driver
    expect(forDriver[0].content).toBe('Task');
    expect(forDriver[1].content).toBe('Do X');

    const forNavigator = feedManager.readNewFor('navigator');
    expect(forNavigator).toHaveLength(2); // user→all + driver→navigator
  });

  test('readNewFor respects cursor — does not return already-read messages', () => {
    feedManager.append({ from: 'user', to: 'all', type: 'directive', content: 'Task' });
    feedManager.readNewFor('driver'); // advance cursor

    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Do Y' });
    const newMessages = feedManager.readNewFor('driver');
    expect(newMessages).toHaveLength(1);
    expect(newMessages[0].content).toBe('Do Y');
  });

  test('isDone returns true when done entry exists', () => {
    feedManager.append({ from: 'navigator', to: 'all', type: 'done', content: 'Complete' });
    expect(feedManager.isDone()).toBe(true);
  });

  test('isDone returns false when no done entry', () => {
    feedManager.append({ from: 'navigator', to: 'driver', type: 'directive', content: 'Work' });
    expect(feedManager.isDone()).toBe(false);
  });
});
```

### 6.2 `SwarmTurnController.test.ts`

```typescript
// tests/unit/swarm/SwarmTurnController.test.ts

describe('SwarmTurnController', () => {
  test('round-robin alternates between agents', () => {
    const controller = new SwarmTurnController('round-robin', ['navigator', 'driver'], 10);
    expect(controller.next()).toBe('navigator');
    expect(controller.next()).toBe('driver');
    expect(controller.next()).toBe('navigator');
    expect(controller.next()).toBe('driver');
  });

  test('isExhausted returns true after maxTurns', () => {
    const controller = new SwarmTurnController('round-robin', ['navigator', 'driver'], 3);
    controller.next(); // turn 1
    controller.next(); // turn 2
    controller.next(); // turn 3
    expect(controller.isExhausted()).toBe(true);
  });

  test('isExhausted returns false before maxTurns', () => {
    const controller = new SwarmTurnController('round-robin', ['navigator', 'driver'], 10);
    controller.next();
    expect(controller.isExhausted()).toBe(false);
  });

  test('getTurnCount tracks total turns', () => {
    const controller = new SwarmTurnController('round-robin', ['a', 'b'], 100);
    expect(controller.getTurnCount()).toBe(0);
    controller.next();
    controller.next();
    expect(controller.getTurnCount()).toBe(2);
  });
});
```

### 6.3 `swarmHooks.test.ts`

```typescript
// tests/unit/swarm/swarmHooks.test.ts

/** Helper: create a mock SwarmHookContext for testing */
function createMockSwarmContext(role, overrides = {}) {
  const feedEntries = [];
  return {
    role,
    name: role.charAt(0).toUpperCase() + role.slice(1),
    agentBackend: 'claude',
    peers: role === 'driver' ? ['navigator'] : ['driver'],
    turnNumber: 1,
    maxTurns: 30,
    turnStrategy: 'round-robin',
    feed: {
      append: (entry) => {
        const full = { id: `f-${Date.now()}`, seq: feedEntries.length + 1, from: role, ts: new Date().toISOString(), ...entry };
        feedEntries.push(full);
        return full;
      },
      readNew: () => [],
      readAll: () => feedEntries,
      isDone: () => feedEntries.some(e => e.type === 'done'),
    },
    _feedEntries: feedEntries, // test inspection
    ...overrides,
  };
}

describe('Driver hooks (swarm events)', () => {
  test('onSwarmInit returns seed message with role context', async () => {
    const hooks = require('../../../assistant/dual-claude/swarm/driver/hooks/driver-hooks.js');
    const swarm = createMockSwarmContext('driver');
    const result = await hooks.onSwarmInit.handler({
      swarm,
      content: 'Build a REST API',
    });
    expect(result.queueMessages).toHaveLength(1);
    expect(result.queueMessages[0].content).toContain('Driver');
    expect(result.queueMessages[0].content).toContain('Build a REST API');
  });

  test('onSwarmTurnEnd writes action to feed via context.swarm.feed', async () => {
    const hooks = require('../../../assistant/dual-claude/swarm/driver/hooks/driver-hooks.js');
    const swarm = createMockSwarmContext('driver');
    const result = await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: 'Created server.ts with Express setup.',
    });

    expect(swarm._feedEntries).toHaveLength(1);
    expect(swarm._feedEntries[0].from).toBe('driver');
    expect(swarm._feedEntries[0].to).toBe('navigator');
    expect(swarm._feedEntries[0].type).toBe('action');
    expect(result.done).toBeUndefined();
  });

  test('onSwarmTurnEnd detects <done/> signal and writes done entry', async () => {
    const hooks = require('../../../assistant/dual-claude/swarm/driver/hooks/driver-hooks.js');
    const swarm = createMockSwarmContext('driver');
    const result = await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: 'All tasks complete! <done/>',
    });

    expect(swarm._feedEntries).toHaveLength(1);
    expect(swarm._feedEntries[0].type).toBe('done');
    expect(result.done).toBe(true);
  });

  test('onSwarmFeedMessage queues navigator directive for driver', async () => {
    const hooks = require('../../../assistant/dual-claude/swarm/driver/hooks/driver-hooks.js');
    const swarm = createMockSwarmContext('driver');
    const result = await hooks.onSwarmFeedMessage.handler({
      swarm,
      feedEntries: [{
        id: 'f-1', seq: 2, from: 'navigator', to: 'driver',
        type: 'directive', content: 'Create auth middleware', ts: new Date().toISOString(),
      }],
    });

    expect(result.queueMessages).toHaveLength(1);
    expect(result.queueMessages[0].content).toContain('Navigator says');
    expect(result.queueMessages[0].content).toContain('Create auth middleware');
  });
});

describe('Navigator hooks (swarm events)', () => {
  test('onSwarmInit writes user task to feed and returns seed message', async () => {
    const hooks = require('../../../assistant/dual-claude/swarm/navigator/hooks/navigator-hooks.js');
    const swarm = createMockSwarmContext('navigator');
    const result = await hooks.onSwarmInit.handler({
      swarm,
      content: 'Build a REST API',
    });

    expect(result.queueMessages).toHaveLength(1);
    expect(result.queueMessages[0].content).toContain('Navigator');

    // Navigator's onSwarmInit writes the user task to feed
    expect(swarm._feedEntries).toHaveLength(1);
    expect(swarm._feedEntries[0].type).toBe('directive');
    expect(swarm._feedEntries[0].content).toBe('Build a REST API');
  });

  test('onSwarmTurnEnd writes directive to feed', async () => {
    const hooks = require('../../../assistant/dual-claude/swarm/navigator/hooks/navigator-hooks.js');
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: 'Create Express scaffold in src/server.ts with health check.',
    });

    expect(swarm._feedEntries).toHaveLength(1);
    expect(swarm._feedEntries[0].to).toBe('driver');
    expect(swarm._feedEntries[0].type).toBe('directive');
  });

  test('onSwarmFeedMessage queues driver report for navigator', async () => {
    const hooks = require('../../../assistant/dual-claude/swarm/navigator/hooks/navigator-hooks.js');
    const swarm = createMockSwarmContext('navigator');
    const result = await hooks.onSwarmFeedMessage.handler({
      swarm,
      feedEntries: [{
        id: 'f-3', seq: 3, from: 'driver', to: 'navigator',
        type: 'action', content: 'Created server.ts', ts: new Date().toISOString(),
      }],
    });

    expect(result.queueMessages).toHaveLength(1);
    expect(result.queueMessages[0].content).toContain('Driver reports');
  });
});

describe('Cross-backend swarm hooks', () => {
  test('hooks work with different agentBackend values', async () => {
    const driverHooks = require('../../../assistant/dual-claude/swarm/driver/hooks/driver-hooks.js');
    const codexSwarm = createMockSwarmContext('driver', { agentBackend: 'codex' });
    const result = await driverHooks.onSwarmInit.handler({
      swarm: codexSwarm,
      content: 'Build REST API',
    });

    expect(result.queueMessages[0].content).toContain('codex');
  });
});
```

## 7. Configuration Summary

### Minimal Implementation Checklist

| # | Task | Files | Scope | New vs Reuse |
|---|------|-------|-------|-------------|
| 1 | Add `mode` field + swarm types to assistant types | `src/common/presets/assistantPresets.ts`, type defs | Small | Extend |
| 2 | Create `src/agent/swarm/types.ts` | New file (SwarmConfig, SwarmFeedEntry, SwarmHookContext, etc.) | Small | New |
| 3 | Add swarm hook events to `HookEvent` union | `src/assistant/hooks/types.ts` | Small | Extend |
| 4 | Create `SwarmFeedManager` | `src/agent/swarm/SwarmFeedManager.ts` (~100 lines) | Medium | New |
| 5 | Create `SwarmTurnController` | `src/agent/swarm/SwarmTurnController.ts` (~50 lines) | Small | New |
| 6 | Create `SwarmHookRunner` | `src/agent/swarm/SwarmHookRunner.ts` (wraps existing `runHooks()`, ~60 lines) | Small | Wraps existing |
| 7 | Create `SwarmSessionManager` | `src/agent/swarm/SwarmSessionManager.ts` — thin orchestrator (~200 lines) | Medium | New (but delegates to existing pipeline) |
| 8 | Add `registerSwarm()` to `WorkerManage` | `src/process/WorkerManage.ts` | Small | Extend |
| 9 | Add `createSwarmConversation()` | `src/process/initAgent.ts` — detects `mode: "swarm"`, creates swarm manager | Small | Extend |
| 10 | Create `dual-claude` assistant config | `assistant/dual-claude/assistant.json` + per-agent `agent.json` + `.md` prompts | Medium | New |
| 11 | Create driver hooks | `assistant/dual-claude/swarm/driver/hooks/driver-hooks.js` (onSwarm* events) | Medium | New |
| 12 | Create navigator hooks | `assistant/dual-claude/swarm/navigator/hooks/navigator-hooks.js` (onSwarm* events) | Medium | New |
| 13 | Add `agentMeta` to message model | `src/common/chatLib.ts`, `src/process/database/types.ts` | Small | Extend |
| 14 | Add `agent_meta` DB column | `src/process/database/schema.ts` migration | Small | Extend |
| 15 | Create `SwarmAgentBadge` UI component | `src/renderer/components/SwarmAgentBadge.tsx` | Small | New |
| 16 | Update `MessageList` to render agent badges | `src/renderer/messages/MessageList.tsx` | Small | Extend |
| 17 | Unit tests | `tests/unit/swarm/*.test.ts` | Medium | New |

**Code reuse summary:** ~410 new lines across 4 new files (SwarmSessionManager, SwarmFeedManager, SwarmTurnController, SwarmHookRunner). All agent spawning, backend resolution, CLI management, and message queuing is handled by the existing `ConversationService` → `createAcpAgent` → `AcpAgentManager` → `AcpAgent` pipeline — unchanged.

### Implementation Order

**Phase 1 — Core (get it working):**
Tasks 1–9: Types, swarm hook events, feed manager, turn controller, hook runner, session manager, WorkerManage extension, initAgent integration

**Phase 2 — Assistant & Hooks (make it autonomous):**
Tasks 10–12: dual-claude assistant + per-agent configs + system prompt .md files + swarm event hooks

**Phase 3 — UI (make it visible):**
Tasks 13–16: Message model extension, DB migration, agent badge component

**Phase 4 — Tests (make it reliable):**
Task 17: Unit tests for feed, turn controller, hooks, and cross-backend scenarios

## 8. Future Extensions

- **N-agent swarms** — Add a "reviewer" or "tester" role (architecture supports it, just add to `swarm.agents[]` or new `agent.json`)
- **Cross-backend swarms** — Already supported: Codex+Claude, Gemini+Claude, Qwen+Codex (each agent resolves its own `presetAgentType`)
- **Human-in-the-loop** — User can inject messages into the feed via UI, acting as a third participant
- **Feed visualization** — Dedicated UI panel showing the `.swarm/feed.jsonl` as a timeline
- **Swarm templates** — Pre-built configurations: "Code Review" (writer + reviewer), "TDD" (test-writer + implementer), "Full Stack" (frontend + backend)
- **Custom swarm hook events** — Agents can emit custom events via `feedEntries` with custom `type` values, allowing hooks to react to domain-specific signals
