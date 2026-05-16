# CDP Verification — Renderer Process Errors

Only use CDP when the error originates from renderer-side code (React components, UI hooks,
renderer-side IPC calls). These are errors visible in the browser DevTools console.

## Prerequisites

- `mcp__chrome-devtools__*` tools must be available
- CDP is enabled by default in dev mode on port 9230
- Start the app if not running: `bun run start &`
  Wait ~20s, then poll `mcp__chrome-devtools__list_pages` until pages appear.

## CRITICAL — MCP session rules

1. **NEVER run `claude mcp remove/add` mid-session** — tools become permanently unavailable.
2. The chrome-devtools MCP server connects to CDP lazily — app can be started during workflow.
3. If MCP tools return "No such tool", classify as skipped and rely on unit tests.

See [docs/cdp.md](../../../docs/cdp.md) for CDP configuration details.

## Verification flow

1. Navigate to the relevant page using `mcp__chrome-devtools__navigate_page`
2. Reproduce the error scenario via `click`, `fill`, `press_key`, `evaluate_script`
3. Check for errors: `list_console_messages`, `take_screenshot`, `list_network_requests`
4. **Pass**: error no longer occurs. **Fail**: error still occurs or new error introduced.

## On failure — retry loop (max 3 attempts)

Adjust the fix → re-run tests → re-run quality checks → re-verify.
After 3 failures, proceed to commit & PR but mark verification as FAILED.

## On success

Collect evidence (screenshots, console logs) for the PR.
