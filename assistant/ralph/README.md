# Ralph — Autonomous Code Agent

Ralph is an autonomous AI agent loop that implements software features from a structured PRD (Product Requirements Document), one user story at a time. Each iteration runs with fresh context, quality gates are never skipped, and the codebase never breaks.

## How It Works

Ralph turns a plain-English feature request into working, tested code through a three-phase pipeline:

```
User: "Build feature X"
        |
        v
  Phase 1: Enrich         ──  Analyze the request, identify edge cases,
        |                      write .ralph/prompt.md
        v
  Phase 2: PRD             ──  Generate structured user stories with
        |                      acceptance criteria in .ralph/prd.json
        v
  Phase 3: Implement Loop  ──  Pick next story by priority → implement →
        |                      run quality gates → commit → mark done →
        |                      repeat until all stories pass
        v
    All done
```

The entire flow is automated by Ralph's hook system — once the user sends a feature request, Ralph drives the conversation through all three phases without manual intervention.

### Phase 1: Enrich

Ralph deeply analyzes the feature request to surface implicit requirements, edge cases, constraints, and natural story boundaries. The analysis is written to `.ralph/prompt.md`. No code is written in this phase.

### Phase 2: PRD Generation

Ralph reads the enriched prompt and generates `.ralph/prd.json` — a structured document containing prioritized user stories, each with concrete acceptance criteria. If open questions remain, Ralph asks the user for clarification before proceeding. Stories are sized to fit within a single AI context window and ordered by dependency (schema/models -> business logic -> API -> UI).

### Phase 3: Implementation Loop

Ralph picks the next incomplete story (by priority), implements it, runs quality gates, commits, updates state, and moves on. This repeats until every story has `passes: true`.

Each iteration follows a strict sequence:

1. **Orient** — Read `prd.json` and `progress.txt`, state the plan
2. **Implement** — Write code scoped to the story's acceptance criteria only
3. **Quality Gates** — Run typecheck, lint, and test commands; fix all failures
4. **Commit** — One commit per story: `feat: US-xxx - Story Title`
5. **Update State** — Mark story as `passes: true` in `prd.json`, append to `progress.txt`
6. **Signal** — Emit completion signal if this was the last story, otherwise continue

## Architecture

```
assistant/ralph/
├── assistant.json                     # Preset metadata and configuration
├── ralph.en-US.md                     # English system prompt
├── ralph.zh-CN.md                     # Chinese system prompt
├── hooks/
│   └── ralph.js                       # Three-phase hook (drives the autonomous loop)
└── workspace/
    ├── CLAUDE.md                      # Reference guide for the AI agent
    ├── .ralph/
    │   └── prd.json.example           # Example PRD structure
    └── .claude/commands/
        ├── enrich.md                  # /enrich — analyze a feature request
        ├── prd.md                     # /prd — generate PRD from enriched prompt
        ├── implement.md               # /implement — implement a single story
        ├── status.md                  # /status — show progress dashboard
        └── retry.md                   # /retry — retry a failed story

src/agent/ralph/
├── types.ts                           # Type definitions (PRD, stories, config, etc.)
├── RalphOrchestrator.ts               # Main iteration loop engine
├── PrdParser.ts                       # PRD validation, parsing, and manipulation
├── ProgressTracker.ts                 # Progress logging and formatting
├── RalphPromptBuilder.ts              # Context-aware prompt generation
└── index.ts                           # Public exports
```

### Hook System

The hook in `hooks/ralph.js` has two event handlers that form the autonomous loop:

- **`onQueueInit`** — Triggered when a conversation starts. Queues `/enrich <user request>` to kick off Phase 1.
- **`onAgentResponse`** — Triggered after each AI response. Checks workspace state and queues the appropriate next action:
  - If `prompt.md` exists but `prd.json` does not -> queues `/prd` (Phase 2)
  - If `prd.json` exists -> finds the next incomplete story and queues `/implement US-xxx` (Phase 3)
  - If all stories are complete -> stops queuing (done)

### Backend Orchestrator

`RalphOrchestrator` provides a programmatic API for the same loop:

```typescript
const orchestrator = new RalphOrchestrator(sendMessage, fileSystem, {
  maxIterations: 10,
  yoloMode: true,
});

const results = await orchestrator.run();
// results: RalphIterationResult[] — one entry per story implemented
```

It reads the PRD, builds context-rich prompts for each iteration (including full progress history and accumulated learnings), sends them to the AI agent, and tracks results. Status callbacks provide real-time progress updates.

## PRD Format

The PRD is a JSON file at `.ralph/prd.json`:

```json
{
  "project": "my-app",
  "branchName": "ralph/add-user-auth",
  "description": "Add user authentication with email/password login and registration",
  "userStories": [
    {
      "id": "US-001",
      "title": "User model and database migration",
      "description": "As a developer, I want a User model with email and password fields so that I can store user credentials",
      "acceptanceCriteria": [
        "User model has email (unique, required) and passwordHash fields",
        "Database migration creates users table",
        "Model validates email format"
      ],
      "priority": 1,
      "passes": false
    }
  ]
}
```

**Sizing rules:**
- Each story must be completable within a single context window
- Order by dependency: schema/models -> business logic -> API -> UI
- Acceptance criteria must be concrete and testable
- All stories start with `passes: false`

## Commands

Ralph exposes five custom commands via Claude Code's command system:

| Command | Purpose |
|---------|---------|
| `/enrich <request>` | Analyze a feature request, write `.ralph/prompt.md` |
| `/prd` | Generate `prd.json` from the enriched prompt |
| `/implement [US-xxx]` | Implement a single user story (or the next one by priority) |
| `/status` | Show progress dashboard — which stories are done, what's next |
| `/retry [US-xxx]` | Retry a failed or incomplete story |

## Quality Gates

Ralph discovers the correct commands for the project's tech stack and runs them before marking any story complete:

| Stack | Commands |
|-------|----------|
| Node / TypeScript | `npm run typecheck` / `npm run lint` / `npm test` |
| Python | `mypy .` / `ruff check .` / `pytest` |
| Go | `go vet ./...` / `golangci-lint run` / `go test ./...` |
| Rust | `cargo check` / `cargo clippy` / `cargo test` |

Every failure must be fixed before a story can pass.

## Runtime State

During execution, Ralph maintains state in the workspace `.ralph/` directory:

| File | Purpose |
|------|---------|
| `prompt.md` | Enriched feature request (Phase 1 output) |
| `prd.json` | User stories with completion status (Phase 2 output, updated in Phase 3) |
| `progress.txt` | Cumulative log of what was done in each iteration |

Each new iteration receives the full PRD, full progress history, and accumulated learnings. Context is never lost between iterations because everything is written to disk and re-read.

## Key Design Decisions

- **Fresh context per iteration** — Ralph does not rely on conversation memory. Everything the AI needs is explicitly provided via the prompt, including PRD state, progress history, and learnings from prior iterations.
- **Priority-driven execution** — Stories execute in priority order (lowest number first), respecting dependencies. Schema before logic, logic before API, API before UI.
- **One story per iteration** — Each iteration focuses on exactly one story. No speculative implementation of future stories or refactoring of adjacent code.
- **Immutable state updates** — The `PrdParser` uses immutable operations when marking stories complete, preventing accidental mutations.
- **Completion signal** — The marker `<promise>COMPLETE</promise>` tells the orchestrator when all work is finished. Without it, Ralph continues until max iterations.

## Tests

Unit tests are in `tests/unit/ralph/`:

```
tests/unit/ralph/
├── RalphOrchestrator.test.ts    # Full loop, max iterations, status tracking
├── PrdParser.test.ts            # Parsing, validation, story operations
├── ProgressTracker.test.ts      # Progress formatting and parsing
└── RalphPromptBuilder.test.ts   # Prompt generation
```

Run with:

```bash
npm test -- --testPathPattern=ralph
```
