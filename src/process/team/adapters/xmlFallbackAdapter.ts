// src/process/team/adapters/xmlFallbackAdapter.ts

import type { ParsedAction, PlatformCapability } from '../types';
import type { AgentPayload, AgentResponse, BuildPayloadParams, TeamPlatformAdapter } from './PlatformAdapter';
import { buildRolePrompt } from './buildRolePrompt';

/**
 * XML fallback instructions for platforms that do NOT support MCP tool use.
 * Only describes XML tag syntax — no mention of MCP tools (those are in the role prompts).
 */
const TEAM_INSTRUCTIONS = `## Team Coordination (XML Fallback)

If the team_* MCP tools are not available in your session, use these XML tags instead:

<send_message to="AgentName">message</send_message>
<task_create subject="..." owner="..." description="..."/>
<task_update task_id="..." status="completed"/>
<spawn_agent name="AgentName" type="agent_type"/>
<idle reason="available" summary="..." completed_task_id="..."/>

Only use <spawn_agent .../> after the user explicitly approves the proposed teammate lineup, or explicitly tells you to create a specific teammate immediately.
Do NOT emit <spawn_agent .../> in the same turn as your initial teammate proposal.
When you ask for approval, also tell the user they can later ask you to replace or adjust teammates if the lineup is not working well.

Always prefer MCP tools (team_spawn_agent, team_send_message, etc.) when they are available.`;

/** Remove matched XML tag spans from a string and return the remaining text */
function removeXmlSpans(text: string, spans: Array<[number, number]>): string {
  const sortedSpans = [...spans].toSorted((a, b) => a[0] - b[0]);
  let result = '';
  let cursor = 0;
  for (const [start, end] of sortedSpans) {
    result += text.slice(cursor, start);
    cursor = end;
  }
  result += text.slice(cursor);
  return result;
}

/** Extract a named attribute value from an XML tag string, order-independent */
function extractAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}="([^"]*)"`, 'i');
  const m = tag.match(re);
  return m ? m[1] : undefined;
}

/** Parse XML action tags from response text using regex */
function parseXmlActions(text: string): { actions: ParsedAction[]; consumedSpans: Array<[number, number]> } {
  const actions: ParsedAction[] = [];
  const consumedSpans: Array<[number, number]> = [];

  // <send_message to="AgentName">content</send_message>
  const sendMessageRe = /<send_message\s+to="([^"]+)">([\s\S]*?)<\/send_message>/g;
  for (const match of text.matchAll(sendMessageRe)) {
    actions.push({
      type: 'send_message',
      to: match[1],
      content: match[2].trim(),
    });
    consumedSpans.push([match.index!, match.index! + match[0].length]);
  }

  // <task_create .../> - attributes in any order
  const taskCreateRe = /<task_create\s+[^>]*\/>/g;
  for (const match of text.matchAll(taskCreateRe)) {
    const tag = match[0];
    const subject = extractAttr(tag, 'subject');
    if (!subject) continue; // subject is required
    actions.push({
      type: 'task_create',
      subject,
      owner: extractAttr(tag, 'owner'),
      description: extractAttr(tag, 'description'),
    });
    consumedSpans.push([match.index!, match.index! + match[0].length]);
  }

  // <task_update .../> - attributes in any order
  const taskUpdateRe = /<task_update\s+[^>]*\/>/g;
  for (const match of text.matchAll(taskUpdateRe)) {
    const tag = match[0];
    const taskId = extractAttr(tag, 'task_id');
    if (!taskId) continue; // task_id is required
    actions.push({
      type: 'task_update',
      taskId,
      status: extractAttr(tag, 'status'),
      owner: extractAttr(tag, 'owner'),
    });
    consumedSpans.push([match.index!, match.index! + match[0].length]);
  }

  // <spawn_agent .../> - attributes in any order
  const spawnAgentRe = /<spawn_agent\s+[^>]*\/>/g;
  for (const match of text.matchAll(spawnAgentRe)) {
    const tag = match[0];
    const agentName = extractAttr(tag, 'name');
    if (!agentName) continue;
    actions.push({
      type: 'spawn_agent',
      agentName,
      agentType: extractAttr(tag, 'type'),
    });
    consumedSpans.push([match.index!, match.index! + match[0].length]);
  }

  // <idle .../> - attributes in any order
  const idleRe = /<idle\s+[^>]*\/>/g;
  for (const match of text.matchAll(idleRe)) {
    const tag = match[0];
    const reason = extractAttr(tag, 'reason');
    const summary = extractAttr(tag, 'summary');
    if (!reason || summary == null) continue; // both required
    actions.push({
      type: 'idle_notification',
      reason,
      summary,
      completedTaskId: extractAttr(tag, 'completed_task_id'),
    });
    consumedSpans.push([match.index!, match.index! + match[0].length]);
  }

  return { actions, consumedSpans };
}

/**
 * Creates an adapter for platforms that do not support tool use (e.g. Gemini, Codex).
 * Agents communicate structured actions via XML tags embedded in plain text.
 */
export function createXmlFallbackAdapter(options?: { hasMcpTools?: boolean }): TeamPlatformAdapter {
  return {
    getCapability(): PlatformCapability {
      return { supportsToolUse: false, supportsStreaming: true };
    },

    buildPayload(params: BuildPayloadParams): AgentPayload {
      const { agent, mailboxMessages, tasks, teammates } = params;
      const sections: string[] = [];

      // Role prompt already includes teammates, tasks, and unread messages
      const rolePrompt = buildRolePrompt({
        agent,
        mailboxMessages,
        tasks,
        teammates,
        availableAgentTypes: params.availableAgentTypes,
        renamedAgents: params.renamedAgents,
        teamWorkspace: params.teamWorkspace,
      });
      sections.push(rolePrompt);

      // Always append XML fallback instructions so agents have a coordination path
      // even when MCP tool injection silently fails. When MCP tools are available,
      // the agent will prefer them; the XML path acts as a guaranteed fallback.
      sections.push(TEAM_INSTRUCTIONS);

      return { message: sections.join('\n\n') };
    },

    parseResponse(response: AgentResponse): ParsedAction[] {
      const { actions, consumedSpans } = parseXmlActions(response.text);

      // Text outside XML tags becomes a plain_response
      const remainingText = removeXmlSpans(response.text, consumedSpans).trim();
      if (remainingText) {
        actions.push({ type: 'plain_response', content: remainingText });
      }

      return actions;
    },
  };
}
