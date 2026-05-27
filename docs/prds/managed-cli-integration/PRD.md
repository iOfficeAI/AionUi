# Managed CLI Integration — PRD

## Scope

Desktop frontend (`AionUi`) managed runtime sync for 4 CLIs:

- Claude (ACP agent via `@agentclientprotocol/claude-agent-acp`)
- Hermes (Python CLI via `uv`)
- OpenClaw (npm CLI)
- OpenCode (npm CLI via `bun`)

## Goal

Inject managed API config (`base_url` + `api_key`) into each CLI's runtime,
bypassing their native auth/login flows. The managed API handles model routing.

## Acceptance criteria

| #   | Criterion                                                            | Status                      |
| --- | -------------------------------------------------------------------- | --------------------------- |
| 1   | Fresh dev startup reaches managed reconcile and writes CLI configs   | ✅                          |
| 2   | `Managed sync OK: claude, hermes, opencode, openclaw` logged         | ✅                          |
| 3   | Config files written to managed paths (not `~/.config/`)             | ✅                          |
| 4   | Claude: agent initializes without exit 1 (no model env var override) | ✅ Code fixed, needs retest |
| 5   | Brand asset 200 after backend rebuild                                | ✅                          |
| 6   | Packaged app resolver finds `POUNDING.app` via Info.plist            | ✅                          |
| 7   | Hermes install idempotent (`uv venv --clear`)                        | ✅                          |
| 8   | Update feed repo path matches code                                   | ✅                          |

## Out of scope (backend ACP agent issues)

- Claude `session/new` crash with `guide_mcp` injection
- Hermes empty response
- OpenCode zero-text response
- OpenClaw duplicate text

## Branches

- `dev` / `main` / `release/pounding-v2.0.x` — all synced
- AionCore — assets rebuilt for brand logo
