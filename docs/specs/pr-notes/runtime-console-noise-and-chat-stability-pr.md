# PR: Improve ACP Chat Runtime Stability

## Summary

This PR fixes the three highest-impact runtime issues observed during ACP chat usage:

- Prevents non-display messages from entering the virtualized chat list and creating zero-height rows.
- Treats `slash_commands_updated` as a handled transient event so it no longer produces unsupported-message warnings.
- Adds actionable user-facing guidance for ACP rate-limit and timeout failures.

## Problem

Users can encounter DevTools flooding and unclear failure states during normal chat usage:

- `react-virtuoso: Zero-sized element, this should not happen` repeats many times.
- `[transformMessage] Unsupported message type 'slash_commands_updated'` appears repeatedly.
- Long ACP requests may end with `429 Rate limit exceeded` or `Prompt timed out` without enough guidance.

## Changes

### Chat list stability

- Added `shouldRenderMessageInList` to filter hidden and non-renderable message types before data reaches `Virtuoso`.
- `available_commands` and `codex_permission` are excluded from the virtualized list because they are handled elsewhere or render no row content.

### Slash command event handling

- Added `slash_commands_updated` to the transient message cases in `transformMessage`.
- ACP hooks can still consume the event to refresh slash commands, but the generic transformer no longer warns.

### ACP failure guidance

- Added ACP error formatting for rate limits and timeouts.
- Error messages now include the backend/model context and next-step guidance, while preserving the original error detail.

## Tests

- `tests/unit/transformMessage.test.ts`
- `tests/unit/renderer/conversation/Messages/messageListUtils.test.ts`
- `tests/unit/common/acpErrorMessage.test.ts`

## Validation

Recommended commands before submitting:

```bash
bun run test -- tests/unit/transformMessage.test.ts tests/unit/renderer/conversation/Messages/messageListUtils.test.ts tests/unit/common/acpErrorMessage.test.ts
bunx tsc --noEmit
```
