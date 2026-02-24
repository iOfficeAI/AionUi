# Ouroboros — Self-Feeding Agent Loop

An autonomous assistant that generates its own follow-up prompts and feeds them back into itself, iterating turn-by-turn until the task is complete. Named after the ancient serpent consuming its own tail — the agent's output literally becomes its next input.

## How It Works

Ouroboros turns a single user request into a multi-turn autonomous loop through three mechanisms: **intent persistence**, **self-feeding prompts**, and **convergent planning**.

### The Loop

```
User: "Build feature X"
         |
         v
  [onQueueInit hook]
    - Saves user request to .ouroboros/prompt.md (the "North Star")
    - Queues an initialization prompt
         |
         v
  [Turn 1: Understand, Enrich, Plan]
    - Agent reads prompt.md
    - Enriches it (clarifies ambiguities, defines "done")
    - Creates a step-by-step plan in .ouroboros/state.json
    - Executes the first step
    - Emits: <next>precise prompt for step 2</next>
         |
         v
  [onAgentResponse hook]
    - Auto-logs progress to .ouroboros/progress.log
    - Parses <next> tag from agent output
    - Queues it as the next input message
         |
         v
  [Turn 2...N: Execute, Compound, Feed]
    - Agent re-reads prompt.md (stay aligned)
    - Reads state.json (current progress)
    - Executes the current step
    - Updates state.json
    - Emits <next> for the following step
    - ...or <done/> when all work is complete
         |
         v
  [onAgentResponse hook]
    - Detects <done/> signal → loop ends
    - Or parses <next> → queues it → loop continues
```

### Termination Conditions

The loop stops when any of these are true:

1. Agent emits `<done/>` in its output
2. `state.json` status is set to `"done"`
3. Maximum iterations reached (default: 20) — agent is prompted to wrap up
4. No `<next>` tag and no `nextPrompt` in state.json — nothing to feed back

## Key Concepts

### The North Star (`prompt.md`)

`.ouroboros/prompt.md` captures the user's original intent. It's written by the hook on initialization and enriched by the agent on the first turn. Every subsequent turn, the agent re-reads it to prevent drift. If the work starts diverging from the original request, the agent course-corrects.

### Compound Engineering

Each `<next>` prompt is not free-form text — it's a precision-engineered instruction that follows the **Five Laws**:

1. **Reference the goal** — Re-read prompt.md, stay aligned with original intent
2. **Maximize delta** — What single action moves closest to "done"?
3. **Minimize scope** — Do exactly what's needed, nothing more
4. **Be self-contained** — Include file paths, function names, exact requirements
5. **Converge** — Each iteration tighter than the last; expanding scope means something is wrong

### State File (`state.json`)

`.ouroboros/state.json` is the agent's memory between turns:

```json
{
  "status": "running",
  "iteration": 3,
  "maxIterations": 20,
  "goal": "Build a REST API with JWT authentication and CRUD endpoints",
  "plan": [
    { "step": 1, "title": "Project scaffolding", "status": "done" },
    { "step": 2, "title": "Database setup", "status": "done" },
    { "step": 3, "title": "Auth endpoints", "status": "in_progress" },
    { "step": 4, "title": "Auth middleware", "status": "pending" },
    { "step": 5, "title": "User CRUD", "status": "pending" },
    { "step": 6, "title": "Tests and validation", "status": "pending" }
  ],
  "nextPrompt": "Fallback prompt if <next> tag is missing",
  "completedSummary": "Running log of what has been accomplished."
}
```

The plan is adaptive — the agent can add, remove, or reorder steps as it learns more, as long as the changes serve the original intent in prompt.md.

### Progress Log (`progress.log`)

`.ouroboros/progress.log` is maintained automatically by the hook, not the agent. After each turn, the hook extracts a summary and list of changed files from the agent's output and appends a structured entry. The agent can read it to review past iterations but never needs to write to it.

## Architecture

### File Structure

```
assistant/ouroboros/
├── assistant.json              # Metadata, localization, preset prompts
├── ouroboros.en-US.md          # System instructions (English)
├── ouroboros.zh-CN.md          # System instructions (Chinese)
├── hooks/
│   └── ouroboros.js            # Hook implementation (the engine)
└── workspace/                  # Template copied to each conversation
    ├── CLAUDE.md               # Quick reference for the agent
    └── .ouroboros/
        └── state.json.example  # Example state file
```

### Hooks

The system is driven by two hooks in `hooks/ouroboros.js`:

#### `onQueueInit` (priority: 50)

Triggered when the conversation message queue initializes.

- Persists the user's raw request to `.ouroboros/prompt.md`
- Queues the seed prompt that instructs the agent to enrich the intent, create a plan, and begin work

#### `onAgentResponse` (priority: 50)

Triggered after each agent turn finishes. This is the self-feeding engine.

1. **Auto-log** — Extracts summary and files changed from agent output, appends to `progress.log`
2. **Check termination** — Looks for `<done/>` signal, `state.json` status, or max iterations
3. **Parse next prompt** — Extracts `<next>` tag from output (primary) or reads `nextPrompt` from state.json (fallback)
4. **Queue next turn** — Wraps the prompt with iteration context and enqueues it

### Integration with AionUi

Ouroboros hooks integrate with AionUi's message queue system:

- `AcpAgentManager` calls `runQueueInitHooks()` after the first message and `runAgentResponseHooks()` after each agent turn
- The `HookRunner` executes hooks with a context object that includes `enqueue()` for adding messages to the queue
- `AcpMessageQueue` processes queued messages in FIFO order, creating the turn-by-turn loop

### Prompt Resolution Order

When determining the next prompt to feed back:

1. `<next>` tag parsed from agent output (primary)
2. `nextPrompt` field from `state.json` (fallback)
3. Neither found — loop stops

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `maxIterations` | 20 | Maximum turns before forced wrap-up |
| `presetAgentType` | `claude` | Agent backend (Claude recommended) |

## Example Use Cases

- Build a REST API with authentication and CRUD endpoints
- Refactor a codebase to use a new architecture pattern
- Create a CLI tool with multiple subcommands
- Set up a CI/CD pipeline with testing and deployment stages

## Supported Languages

- English (en-US)
- Chinese Simplified (zh-CN)

## License

Part of AionUi. Licensed under Apache-2.0.
