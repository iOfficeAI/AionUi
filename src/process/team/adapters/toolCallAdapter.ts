// src/process/team/adapters/toolCallAdapter.ts
//
// Intercepts acp_tool_call events from agent response streams and maps
// Claude's native tool calls (Agent, SendMessage, TaskCreate, etc.) to
// AionUi's team ParsedAction system.
//
// This replaces the XML-parsing approach: instead of asking the LLM to emit
// XML tags (which it ignores in favor of its own tools), we intercept the
// tool_use calls it already makes and route them through team infrastructure.

import type { ToolCallUpdate } from '@/common/types/acpTypes';
import type { ParsedAction } from '../types';

/** Map of tool names we intercept → handler */
const TEAM_TOOL_NAMES = new Set([
  // Claude Code native tool names
  'Agent',
  'SendMessage',
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TeamCreate',
  'TeamDelete',
  // Lowercase variants in case backends normalize
  'agent',
  'sendmessage',
  'taskcreate',
  'taskupdate',
]);

/**
 * Check if a tool call is team-relevant (i.e. Agent/SendMessage/Task tools).
 */
export function isTeamToolCall(toolName: string): boolean {
  return TEAM_TOOL_NAMES.has(toolName);
}

/**
 * Parse a completed acp_tool_call event into a ParsedAction.
 * Returns null if the tool call is not team-relevant or has incomplete data.
 *
 * Only processes tool calls with status 'completed' or 'in_progress' that have rawInput.
 */
export function parseToolCallAction(update: ToolCallUpdate): ParsedAction | null {
  const { title, rawInput, status } = update.update;
  if (!title || !rawInput) return null;

  // Only process calls that have input data
  if (status !== 'completed' && status !== 'in_progress' && status !== 'pending') return null;

  const toolName = title.toLowerCase();
  const input = rawInput as Record<string, unknown>;

  switch (toolName) {
    case 'agent': {
      // Claude's Agent tool spawns a subagent
      // Map to spawn_agent action
      const agentName = String(input.name ?? input.description ?? 'unnamed');
      const agentType = String(input.subagent_type ?? 'acp');
      return {
        type: 'spawn_agent',
        agentName,
        agentType,
      };
    }

    case 'sendmessage': {
      // Claude's SendMessage sends to a teammate
      const to = String(input.to ?? '');
      const message = typeof input.message === 'string'
        ? input.message
        : JSON.stringify(input.message ?? '');
      const summary = String(input.summary ?? '');
      if (!to) return null;
      return {
        type: 'send_message',
        to,
        content: message,
        summary,
      };
    }

    case 'taskcreate': {
      const subject = String(input.description ?? input.subject ?? '');
      const owner = input.owner ? String(input.owner) : undefined;
      if (!subject) return null;
      return {
        type: 'task_create',
        subject,
        description: input.description ? String(input.description) : undefined,
        owner,
      };
    }

    case 'taskupdate': {
      const taskId = String(input.task_id ?? input.id ?? '');
      if (!taskId) return null;
      return {
        type: 'task_update',
        taskId,
        status: input.status ? String(input.status) : undefined,
        owner: input.owner ? String(input.owner) : undefined,
      };
    }

    case 'teamcreate':
    case 'teamdelete':
      // These are team lifecycle tools — not actionable as ParsedAction
      return null;

    default:
      return null;
  }
}

/**
 * Extract tool name and rawInput from an IResponseMessage with type 'acp_tool_call'.
 * The data field contains a ToolCallUpdate object.
 */
export function extractToolCallInfo(data: unknown): { title: string; rawInput?: Record<string, unknown>; status: string; toolCallId: string } | null {
  if (!data || typeof data !== 'object') return null;

  // data is ToolCallUpdate shape: { update: { sessionUpdate, toolCallId, status, title, rawInput, ... } }
  const update = (data as Record<string, unknown>).update as Record<string, unknown> | undefined;
  if (!update) return null;

  const title = update.title as string | undefined;
  const status = update.status as string | undefined;
  const toolCallId = update.toolCallId as string | undefined;
  if (!title || !status || !toolCallId) return null;

  return {
    title,
    rawInput: update.rawInput as Record<string, unknown> | undefined,
    status,
    toolCallId,
  };
}
