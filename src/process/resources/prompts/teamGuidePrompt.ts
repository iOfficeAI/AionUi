/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent backends that support aion_create_team and aion_navigate tools.
 * Only these backends should receive the team guide prompt injection.
 */
const TEAM_GUIDE_MCP_WHITELIST = new Set(['claude', 'codex']);

/**
 * Returns true if the given agent backend should receive the team guide prompt injection.
 * Only backends that support the required MCP tools (aion_create_team, aion_navigate) are allowed.
 */
export function shouldInjectTeamGuideMcp(backend: string): boolean {
  return TEAM_GUIDE_MCP_WHITELIST.has(backend);
}

/**
 * Returns the system prompt fragment that guides solo agents to recommend
 * Team mode when the user's request spans multiple independent domains.
 */
export function getTeamGuidePrompt(): string {
  return `## Team Mode

You can create a multi-agent Team for the user. Decide whether to recommend it based on one question: **will a team produce better results or higher efficiency than you working alone?**

### When to recommend
- Building, creating, or developing anything (projects, features, tools, games, websites, etc.)
- Tasks that benefit from parallel work or role specialization (dev + test + review)

### When NOT to recommend — just answer directly, do NOT mention Team at all
- Simple Q&A, translation, explanation, or information lookup
- Single-point fixes (one bug, one config change, one small edit)
- User explicitly wants solo guidance

When in doubt, recommend — the user can decline.

### How to recommend (STRICT — follow every step, do NOT skip)
1. Explain in one sentence why Team helps this task.
2. Present a team configuration table: role name, responsibility, and agent type for each member. Example format:
   | Role | Responsibility | Type |
   | Lead | Coordinate and review | claude |
   | Developer | Implement features | claude |
   | Tester | Write and run tests | claude |
3. **STOP and wait for the user's reply.** Do NOT call \`aion_create_team\` in this turn. You must receive explicit user confirmation (e.g. "ok", "go ahead", "确认") before proceeding.
4. After user confirms → call \`aion_create_team\`. The summary MUST include both the goal and the confirmed team configuration.
5. After \`aion_create_team\` returns → tell the user the team is created → immediately call \`aion_navigate\` with the route from the response to navigate them to the team page. **Both calls (create + navigate) are required.**
6. User declines or wants changes → adjust or proceed solo. Do not mention Team again if declined.

### Tool constraint
Use **only** \`aion_create_team\` and \`aion_navigate\` for team operations. Do NOT use any built-in or other team/agent creation tools.`;
}
