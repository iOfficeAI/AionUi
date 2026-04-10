/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent backends that support aion_create_team and aion_navigate tools.
 * Only these backends should receive the team guide prompt injection.
 * Single source of truth — mcpSessionConfig re-exports this as TEAM_GUIDE_ALLOWED_BACKENDS.
 */
export const TEAM_GUIDE_BACKENDS: ReadonlySet<string> = new Set(['claude', 'codex']);

/**
 * Returns true if the given agent backend should receive the team guide prompt injection.
 * Only backends that support the required MCP tools (aion_create_team, aion_navigate) are allowed.
 */
export function shouldInjectTeamGuideMcp(backend: string): boolean {
  return TEAM_GUIDE_BACKENDS.has(backend);
}

// ── Shared decision criteria (single source of truth) ───────────────────────

const RECOMMEND_CRITERIA = `- Task spans multiple files, modules, or domains
- Task requires multiple rounds of iteration — not completable in one response
- Task benefits from role specialization (dev + test + review, or analyst + reviewer)
- Task involves building, creating, developing, or analyzing anything substantial
- Examples: build a project, analyze a large codebase, implement a feature across modules, refactor an architecture`;

const NOT_RECOMMEND_CRITERIA = `- Task is about a single point: one question, one file, one fix, one translation
- Task can be fully answered in one response
- User explicitly wants solo guidance
- Examples: "what does this function do?", "fix this typo", "translate this paragraph", "explain this error"`;

const DOUBT_RULE = `When in doubt, recommend — the cost of declining is zero.`;

// ── Exported prompt builders ────────────────────────────────────────────────

/**
 * Full system prompt fragment injected on the first message for solo agents.
 * Guides the agent to recommend Team mode when appropriate.
 */
export function getTeamGuidePrompt(): string {
  return `## Team Mode

You can create a multi-agent Team for the user.

### Recommend Team when ANY of these are true
${RECOMMEND_CRITERIA}

### Do NOT recommend — just answer directly, do NOT mention Team at all
${NOT_RECOMMEND_CRITERIA}

${DOUBT_RULE}

### How to recommend (STRICT — follow every step, do NOT skip)
1. Explain in one sentence why Team helps this task.
2. Present a team configuration table: role name, responsibility, and agent type for each member. Example format:
   | Role | Responsibility | Type |
   | Lead | Coordinate and review | claude |
   | Developer | Implement features | claude |
   | Tester | Write and run tests | claude |
3. **STOP and wait for the user's reply.** Do NOT call \`aion_create_team\` in this turn. You must receive explicit user confirmation (e.g. "ok", "go ahead", "确认") before proceeding.
4. After user confirms → call \`aion_create_team\`. The summary MUST include both the goal and the confirmed team configuration.
5. After \`aion_create_team\` returns → read the response carefully and follow the next_step instructions. Tell the user the team is created → immediately call \`aion_navigate\` with the route from the response. **Both calls (create + navigate) are required.**
6. User declines or wants changes → adjust or proceed solo. Do not mention Team again if declined.

### Tool constraint
Use **only** \`aion_create_team\` and \`aion_navigate\` for team operations. Do NOT use any built-in or other team/agent creation tools.`;
}

/**
 * Short reminder injected via \<system-reminder\> on every turn for solo agents.
 * Keeps the team recommendation active across the conversation.
 */
export function getTeamGuideReminder(): string {
  return (
    `Evaluate whether this request warrants a multi-agent Team.\n` +
    `Recommend Team when: task spans multiple files/modules, needs multiple iterations, or benefits from role specialization (e.g. analyzing a large codebase, building a feature).\n` +
    `Do NOT recommend (just answer directly, never mention Team): single-point tasks answerable in one response (one question, one fix, one translation).\n` +
    `${DOUBT_RULE}\n` +
    `Before calling aion_create_team you MUST present a team configuration and get explicit user confirmation.\n` +
    `After aion_create_team succeeds, read the response and call aion_navigate with the returned route.`
  );
}

/**
 * Description for the aion_create_team MCP tool.
 */
export function getCreateTeamToolDescription(): string {
  return (
    `Create a multi-agent Team to handle complex tasks collaboratively.\n` +
    `\n` +
    `WHEN TO USE (ANY of these true):\n` +
    `${RECOMMEND_CRITERIA}\n` +
    `Do NOT use for single-point tasks answerable in one response.\n` +
    `\n` +
    `PRECONDITIONS (all must be true before calling — NEVER skip):\n` +
    `1. You determined this task benefits from a team.\n` +
    `2. You presented a team configuration (roles, responsibilities, agent types) to the user.\n` +
    `3. The user explicitly confirmed in a PREVIOUS message (e.g. "ok", "go ahead", "确认").\n` +
    `If ANY condition is not met, do NOT call this tool — present the configuration and wait.\n` +
    `\n` +
    `This is the ONLY way to create teams — do NOT use any built-in or other team/agent tools.\n` +
    `The summary MUST include both the task goal and the confirmed team member roles.\n` +
    `\n` +
    `IMPORTANT: Read the response carefully and follow the next_step instructions.`
  );
}
