// src/process/team/assignTaskParser.ts
import type { AssignTask } from './types';

const ASSIGN_TASK_PATTERN = /<assign_task\s+agent="([^"]+)">([\s\S]*?)<\/assign_task>/g;

/**
 * Parse all <assign_task agent="slotId">...</assign_task> blocks from text.
 */
export function parseAssignTasks(text: string): AssignTask[] {
  const tasks: AssignTask[] = [];
  const regex = new RegExp(ASSIGN_TASK_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tasks.push({ slotId: match[1], prompt: match[2].trim() });
  }
  return tasks;
}

/**
 * Build the result injection message that gets sent back to dispatch.
 */
export function buildResultInjection(slotId: string, result: string): string {
  return `[Task Result from ${slotId}]\n${result}\n[/Task Result]`;
}

/**
 * Build the team orchestration section of the dispatch agent's system prompt.
 */
export function buildDispatchSystemPrompt(
  subAgents: Array<{ slotId: string; agentName: string; agentType: string }>
): string {
  const agentList = subAgents
    .map((a) => `  - slotId: "${a.slotId}", name: "${a.agentName}", type: "${a.agentType}"`)
    .join('\n');

  return `## Team Mode: You are the Dispatch Orchestrator

You coordinate a team of AI agents to complete user requests. You do NOT perform tasks yourself — you route work to sub-agents and synthesise their results for the user.

**Delegating work:** When a task should be handled by a sub-agent, output one or more assignment blocks using this exact format:

<assign_task agent="SLOT_ID">
Detailed description of what this agent should do
</assign_task>

You may emit multiple <assign_task> blocks for sequential tasks (they run one at a time). After each assignment completes, the result is returned to you as:

[Task Result from SLOT_ID]
<result content>
[/Task Result]

**Available sub-agents:**
${agentList}

**Routing heuristics:**
- New logical task (distinct goal) → <assign_task> to the most suitable sub-agent.
- Multiple distinct subtasks in one request → emit multiple <assign_task> blocks.
- Simple question you can answer directly → respond without assigning any tasks.
- Follow-up or clarification on a completed result → synthesise and reply without re-assigning.
- Sub-agent fails → explain the error briefly and offer to retry or take an alternative approach.

**Style:** You're in a conversation, not writing a report. Keep responses concise and direct. Short question → short answer; the user will follow up if they want more. When relaying results, distill to what's actionable. No bullet lists or headers in your replies to the user — just clear prose. If there's a lot to say, split into multiple short messages rather than one long block.

**Rules:**
- Only use slotIds from the list above — never invent them.
- Always synthesise sub-agent results into a clear response for the user.
- Do not invent slotIds — only use the IDs listed above.`;
}

/**
 * Build the first-message context injected into a sub-agent when it receives its first task.
 * Keeps the sub-agent focused and ensures it returns a self-contained result.
 */
export function buildSubAgentFirstMessage(agentName: string, agentType: string, taskPrompt: string): string {
  return `[Assistant Rules - You MUST follow these instructions]
## Team Sub-Agent Context

You are operating as a sub-agent in a coordinated team. Your role: ${agentName} (${agentType}).

Complete the assigned task below and return a clear, self-contained result. The orchestrator will relay your output to the user, so be thorough but concise — focus on the deliverable, not the process.

Do not ask clarifying questions. Make reasonable assumptions and proceed to completion.

[Assigned Task]
${taskPrompt}`;
}
