# Agent Team — Coordination Protocol

## Overview

Agents communicate through a file-based protocol: structured JSONL messages in `messages.jsonl`. No external service required — everything lives in the workspace.

## Message Format

Each line in `messages.jsonl` is a JSON object:

```json
{
  "id": "msg-20260323-abc12345",
  "ts": "2026-03-23T16:30:00+08:00",
  "from": "<memberId>",
  "role": "agent",
  "to": ["*"],
  "topic": "feature-x",
  "task_id": "feature-x-impl",
  "type": "update",
  "summary": "Implemented the main handler",
  "body": "Details...",
  "dispatch": "all",
  "reply_to": "msg-20260323-prev1234",
  "files": [".agents/teams/<teamId>/coord/attachments/screenshot.png"]
}
```

## Message Types

| Type | When to Use |
|------|-------------|
| `claim` | Declare intent to work on a specific task (mutually exclusive) |
| `intent` | Declare planned work (informational, not exclusive) |
| `update` | Progress update during work |
| `question` | Ask another member for information |
| `challenge` | Disagree with a proposal — must provide evidence |
| `finding` | Share a discovery or investigation result |
| `design` | Publish a design document (attach as file if long) |
| `decision` | Propose a final conclusion |
| `conclusion` | Summarize agreed outcome |
| `ack` | Explicitly acknowledge a decision (required for consensus, must include `reply_to`) |
| `done` | Mark work as complete (must follow a design document) |
| `system` | Protocol-level notices |
| `direction` | User-provided guidance |

## Dispatch Routing

The `dispatch` field controls which agents get woken up:

| Value | Behavior |
|-------|----------|
| `all` | Wake all members except sender. Use `to: ["*"]`. Default for user messages. |
| `targets` | Wake only members listed in `to`. Use `to: ["<memberId>", ...]`. |
| `none` | Append to timeline only, no wakeup. Use `to: ["user"]`. |

User messages always wake all agents regardless of `dispatch`.

## Consensus Protocol

When user sends `/consensus <text>`:

1. Entry written with `type: 'consensus'`
2. `teamConversation.extra.consensus.required` set to `true`
3. Dispatcher enforces: **all active agents must send `ack` with `reply_to` matching the final `decision`/`conclusion` ID**
4. Bare ACKs (without `reply_to`) are NOT counted
5. Dispatcher sends `consensus-reminder` to agents missing ACK
6. When all agents have ACKed, `consensus.required` cleared to `false`

## Lock Mechanism

For mutually exclusive work (editing same file, same feature):

```bash
# Acquire
python3 <coordDir>/scripts/coord_write.py --agent-id <id> --type claim \
  --summary "Working on X" --lock-key feature-x --lock-action acquire

# Release
python3 <coordDir>/scripts/coord_write.py --agent-id <id> --type done \
  --summary "Finished X" --lock-key feature-x --lock-action release
```

Lock files stored in `<coordDir>/locks/<key>.json`. If blocked, agent should coordinate handoff or pick different work.

## Attachment Rule

Content longer than 400 characters must be stored as attachment:
- `coord_write.py --body-file <path>` handles this automatically
- File saved to `<coordDir>/attachments/<msg-id>.md`
- Only short preview kept inline

## Design Document Rule

Before marking `done`, agent must publish a design document containing:
1. Problem statement
2. Chosen approach
3. Alternatives considered
4. Affected files
5. Risks and follow-ups
6. Verification performed

## Scripts

Both scripts are embedded in each team's coord directory (no external dependency):

### coord_read.py
```bash
python3 <coordDir>/scripts/coord_read.py \
  --messages <coordDir>/messages.jsonl \
  --state-dir <coordDir>/state \
  --agent-id <memberId>
```
- Reads only new messages since last cursor position
- `--peek` to inspect without advancing cursor
- `--json` for structured output

### coord_write.py
```bash
python3 <coordDir>/scripts/coord_write.py \
  --messages <coordDir>/messages.jsonl \
  --attachments-dir <coordDir>/attachments \
  --locks-dir <coordDir>/locks \
  --agent-id <memberId> \
  --type <type> \
  --summary "<summary>" \
  --dispatch <all|targets|none> \
  --reply-to <msg-id>
```
- Auto-generates message ID and timestamp
- Long body auto-split into attachment
- `--lock-key` + `--lock-action` for mutual exclusion

## Dispatcher (CoordDispatcher)

Runtime component in main process that bridges the protocol with agent sessions:

1. **CoordFileWatcher** — `fs.watch` on `messages.jsonl` with 100ms debounce, byte-offset incremental read
2. **Dispatch routing** — resolves targets from `dispatch` + `to` fields, skips sender
3. **Busy gate** — each agent processes serially; new messages queue when busy
4. **Wakeup message** — sends structured text to agent CLI session with unread summary + file hints
5. **Consensus enforcement** — after agent finishes, checks if consensus pending and sends reminders
6. **Live timeline** — emits `timelineStream` events for frontend updates

## Injecting Protocol into Agents

Three-layer redundancy ensures agents know the protocol:

1. **Workspace files** — `TEAM.md`, `SKILL.md`, `protocol.md` in `<coordDir>/`
2. **First-message injection** — `presetContext` (ACP) or `presetRules` (Gemini) with team name, memberId, coord paths
3. **Per-wakeup header** — dispatcher prepends protocol reminder on every wakeup message

All paths use team-relative format: `.agents/teams/<teamId>/coord/...`
