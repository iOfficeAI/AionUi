# Ouroboros — Reference

## Self-Feeding Protocol

End every response with exactly one of:

```
<next>Specific, actionable prompt for the next turn</next>
```

or when all work is complete:

```
<done/>
```

The system parses `<next>` from your output and feeds it back as the next input.

## The North Star: `prompt.md`

`.ouroboros/prompt.md` is the user's original intent. Reference it every turn to prevent drift.

- Saved automatically by the system on init
- You enrich it on Turn 1 (clarify, define "done", add constraints)
- Every subsequent turn: re-read it, stay aligned, course-correct if drifting

## Compound Engineering

Each `<next>` must follow the Five Laws:

1. **Reference the goal** — Is this step serving prompt.md?
2. **Maximize delta** — What single action moves closest to "done"?
3. **Minimize scope** — Do exactly what's needed, nothing more
4. **Be self-contained** — File paths, function names, exact requirements
5. **Converge** — Tighter each iteration. Expanding scope = wrong direction

```
next_prompt = highest_leverage_action(
  goal = prompt.md,
  done = state.json.completed,
  remaining = state.json.plan.filter(pending),
  constraints = minimum_effort
)
```

## State File Format

`.ouroboros/state.json` — memory between turns:

```json
{
  "status": "running | done",
  "iteration": 1,
  "maxIterations": 20,
  "goal": "The original user request (mirrors prompt.md)",
  "plan": [
    {
      "step": 1,
      "title": "Step title",
      "description": "What to do",
      "status": "pending | in_progress | done"
    }
  ],
  "nextPrompt": "Backup of <next> tag content (fallback)",
  "completedSummary": "Running log of accomplishments"
}
```

### Resolution Order

1. `<next>` tag from output (primary)
2. `nextPrompt` from state.json (fallback)
3. Neither found → loop stops

## Progress Log

Progress is logged **automatically by the system hook** after each turn. The hook extracts summary, files changed, and next action from your output and appends structured entries to `.ouroboros/progress.log`.

You don't maintain this file. Read it if you need to review past iterations.

## Quality Gates

Discover commands by reading `package.json` scripts, `Makefile`, `pyproject.toml`, `go.mod`, `Cargo.toml`, or the project README.

| Stack             | Commands                                               |
| ----------------- | ------------------------------------------------------ |
| Node / TypeScript | `npm run typecheck` · `npm run lint` · `npm test`      |
| Python            | `mypy .` · `ruff check .` · `pytest`                   |
| Go                | `go vet ./...` · `golangci-lint run` · `go test ./...` |
| Rust              | `cargo check` · `cargo clippy` · `cargo test`          |

Fix every failure before moving to the next step.
