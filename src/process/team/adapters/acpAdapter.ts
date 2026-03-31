// src/process/team/adapters/acpAdapter.ts

import type { ParsedAction, PlatformCapability } from '../types';
import type {
  AgentPayload,
  AgentResponse,
  BuildPayloadParams,
  TeamPlatformAdapter,
  ToolDefinition,
} from './PlatformAdapter';
import { buildRolePrompt } from './buildRolePrompt';

/** Tool definitions exposed to ACP-compatible agents */
const TEAM_TOOLS: ToolDefinition[] = [
  {
    name: 'SendMessage',
    description: 'Send a message to a teammate',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Name of the teammate' },
        message: { type: 'string', description: 'Message content' },
        summary: { type: 'string', description: 'One-line summary of the message' },
      },
      required: ['to', 'message'],
    },
  },
  {
    name: 'TaskCreate',
    description: 'Create a new task on the shared task board',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Short title of the task' },
        description: { type: 'string', description: 'Detailed description of the task' },
        owner: { type: 'string', description: 'Name of the agent assigned to the task' },
      },
      required: ['subject'],
    },
  },
  {
    name: 'TaskUpdate',
    description: 'Update the status or owner of an existing task',
    parameters: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'ID of the task to update' },
        status: { type: 'string', description: 'New status: pending, in_progress, completed, or deleted' },
        owner: { type: 'string', description: 'Name of the agent now assigned to the task' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'SpawnAgent',
    description: 'Create a new teammate agent and add it to the team',
    parameters: {
      type: 'object',
      properties: {
        agentName: { type: 'string', description: 'Name for the new teammate (e.g. "xiaokuai", "researcher")' },
        agentType: { type: 'string', description: 'Backend type: acp (default), gemini, codex, etc.' },
      },
      required: ['agentName'],
    },
  },
  {
    name: 'idle_notification',
    description: 'Notify the team that this agent is now idle',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why the agent is idle: available, interrupted, or failed' },
        summary: { type: 'string', description: 'Summary of work completed or current state' },
        completedTaskId: { type: 'string', description: 'ID of the task that was just completed, if any' },
      },
      required: ['reason', 'summary'],
    },
  },
];

/** Format unread mailbox messages into a human-readable section */
function formatMailboxMessages(messages: BuildPayloadParams['mailboxMessages']): string {
  if (messages.length === 0) {
    return '';
  }
  const lines = messages.map((m) => `[From ${m.fromAgentId}] ${m.content}`);
  return `## Unread Messages\n${lines.join('\n')}`;
}

/** Format tasks into a human-readable section */
function formatTasks(tasks: BuildPayloadParams['tasks']): string {
  if (tasks.length === 0) {
    return '';
  }
  const lines = tasks.map((t) => `- [${t.id}] ${t.subject} (${t.status}, owner: ${t.owner ?? 'unassigned'})`);
  return `## Current Tasks\n${lines.join('\n')}`;
}

/**
 * Creates an adapter for ACP-compatible platforms (e.g. Claude via ACP).
 * Agents on this platform can use tool_use blocks for structured actions.
 */
export function createAcpAdapter(): TeamPlatformAdapter {
  return {
    getCapability(): PlatformCapability {
      return { supportsToolUse: true, supportsStreaming: true };
    },

    buildPayload(params: BuildPayloadParams): AgentPayload {
      const { agent, mailboxMessages, tasks, teammates } = params;
      const sections: string[] = [];

      // Inject role-specific system prompt so agents know their identity
      const rolePrompt = buildRolePrompt({ agent, mailboxMessages, tasks, teammates });
      sections.push(rolePrompt);

      const mailboxSection = formatMailboxMessages(mailboxMessages);
      if (mailboxSection) {
        sections.push(mailboxSection);
      }

      const tasksSection = formatTasks(tasks);
      if (tasksSection) {
        sections.push(tasksSection);
      }

      return {
        message: sections.join('\n\n'),
        tools: TEAM_TOOLS,
      };
    },

    parseResponse(response: AgentResponse): ParsedAction[] {
      const actions: ParsedAction[] = [];

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const call of response.toolCalls) {
          const input = call.input;

          switch (call.name) {
            case 'SendMessage':
              actions.push({
                type: 'send_message',
                to: String(input.to ?? ''),
                content: String(input.message ?? ''),
                summary: input.summary != null ? String(input.summary) : undefined,
              });
              break;

            case 'TaskCreate':
              actions.push({
                type: 'task_create',
                subject: String(input.subject ?? ''),
                description: input.description != null ? String(input.description) : undefined,
                owner: input.owner != null ? String(input.owner) : undefined,
              });
              break;

            case 'TaskUpdate':
              actions.push({
                type: 'task_update',
                taskId: String(input.taskId ?? ''),
                status: input.status != null ? String(input.status) : undefined,
                owner: input.owner != null ? String(input.owner) : undefined,
              });
              break;

            case 'SpawnAgent':
              actions.push({
                type: 'spawn_agent',
                agentName: String(input.agentName ?? ''),
                agentType: input.agentType != null ? String(input.agentType) : undefined,
              });
              break;

            case 'idle_notification':
              actions.push({
                type: 'idle_notification',
                reason: String(input.reason ?? ''),
                summary: String(input.summary ?? ''),
                completedTaskId: input.completedTaskId != null ? String(input.completedTaskId) : undefined,
              });
              break;

            default:
              break;
          }
        }
      }

      // Any remaining text content becomes a plain_response
      const trimmedText = response.text.trim();
      if (trimmedText) {
        actions.push({ type: 'plain_response', content: trimmedText });
      }

      return actions;
    },
  };
}
