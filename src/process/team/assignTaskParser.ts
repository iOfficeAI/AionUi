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

You coordinate a team of AI agents to complete user requests. When a task should be delegated to a sub-agent, output one or more assignment blocks using this exact format:

<assign_task agent="SLOT_ID">
Detailed description of what this agent should do
</assign_task>

You may emit multiple <assign_task> blocks for sequential tasks. After each assignment completes, the result is returned to you as:

[Task Result from SLOT_ID]
<result content>
[/Task Result]

**Available sub-agents:**
${agentList}

**Rules:**
- Only use <assign_task> blocks when delegating work to sub-agents.
- For simple questions or direct answers, respond to the user without assigning any tasks.
- Always synthesise sub-agent results into a clear response for the user.
- Do not invent slotIds — only use the IDs listed above.`;
}
