/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { TEAM_SUPPORTED_BACKENDS } from '@/common/types/teamTypes';

/**
 * Returns true if the given agent backend should receive the team guide prompt injection.
 * Uses TEAM_SUPPORTED_BACKENDS — all team-capable backends also support the solo-to-team guide.
 */
export function shouldInjectTeamGuideMcp(backend: string): boolean {
  return TEAM_SUPPORTED_BACKENDS.has(backend);
}

// ── Shared decision criteria (single source of truth) ───────────────────────

const EXPLICIT_TEAM_REQUEST_CRITERIA = `- The user explicitly asks to create a Team
- The user explicitly asks for multiple agents, teammates, or parallel workers
- The user says they want to pull in a Team before starting`;

const EXTREME_COMPLEXITY_CRITERIA = `- The task is so large, risky, or specialized that one agent is unlikely to complete it well alone
- The work needs substantial parallel role separation that cannot be reasonably handled in a normal solo workflow
- This bar is very high: if you can handle the task yourself, stay solo`;

const STAY_SOLO_CRITERIA = `- Greetings, casual conversation, or general questions
- Single-point tasks: one question, one file, one fix, one translation, one explanation
- Normal coding, writing, research, or analysis tasks that one agent can handle with some effort
- Any task you can reasonably complete yourself, even if it takes multiple turns`;

const SOLO_DEFAULT_RULE = `Handle the task yourself in the current chat by default. Do NOT proactively recommend Team just because the work spans multiple files, takes multiple rounds, or would benefit from specialization.`;

// ── Exported prompt builders ────────────────────────────────────────────────

/**
 * Full system prompt fragment injected on the first message for solo agents.
 * Guides the agent to keep normal work solo and only discuss Team mode when truly needed.
 */
export function getTeamGuidePrompt(backend?: string): string {
  const agentType = backend || 'claude';
  return `## Team Mode

You can create a multi-agent Team for the user.

### Default behavior
${SOLO_DEFAULT_RULE}

### Only bring up Team in either of these cases
1. The user explicitly wants a Team or multiple agents:
${EXPLICIT_TEAM_REQUEST_CRITERIA}
2. The task is exceptionally complex and you genuinely believe one agent is unlikely to handle it well alone:
${EXTREME_COMPLEXITY_CRITERIA}

### Otherwise stay solo and do not mention Team
${STAY_SOLO_CRITERIA}

If case 2 applies, ask at most once whether the user wants to bring in a Team. Keep it brief and optional. If the user says no, ignores it, or prefers solo help, continue solo and do not mention Team again.

### How to proceed when Team is requested or approved (STRICT — follow every step, do NOT skip)
1. Explain in one sentence why the Team setup helps this task.
2. Present a team configuration table: role name, responsibility, and agent type for each member. Example format:
   | Role | Responsibility | Type |
   | Leader | Coordinate and review | ${agentType} |
   | Developer | Implement features | ${agentType} |
   | Tester | Write and run tests | ${agentType} |
3. **Output the table as a normal text message and END YOUR TURN.** Do NOT call \`aion_create_team\` or any other tool (including ask_user) in this turn. Wait for the user to reply in their next message with explicit confirmation (e.g. "ok", "go ahead", "确认") before proceeding.
4. After user confirms → call \`aion_create_team\`. The summary MUST include both the goal and the confirmed team configuration. (The system automatically sets the correct agent type — you do NOT need to pass agentType.)
5. After \`aion_create_team\` returns → read the response carefully and follow the next_step instructions. Tell the user the team is created → immediately call \`aion_navigate\` with the route from the response. **Both calls (create + navigate) are required.**
6. User declines or wants changes → adjust or proceed solo. Do not mention Team again unless the user asks.

### Tool constraint
Use **only** \`aion_create_team\` and \`aion_navigate\` for team operations. Do NOT use any built-in or other team/agent creation tools.`;
}

/**
 * Description for the aion_create_team MCP tool.
 */
export function getCreateTeamToolDescription(): string {
  return (
    `Create a multi-agent Team to handle complex tasks collaboratively.\n` +
    `\n` +
    `WHEN TO USE (ONLY if one of these is true):\n` +
    `- The user explicitly asked to create a Team, use multiple agents, or pull in teammates.\n` +
    `- The task is clearly beyond what one agent can reasonably handle well alone, you asked once whether the user wants a Team, and the user explicitly agreed.\n` +
    `Do NOT use just because the task is substantial, multi-file, iterative, or would benefit from specialization.\n` +
    `\n` +
    `PRECONDITIONS (all must be true before calling — NEVER skip):\n` +
    `1. Either the user explicitly asked for a Team, or the user explicitly accepted your one optional Team question for an exceptionally hard task.\n` +
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
