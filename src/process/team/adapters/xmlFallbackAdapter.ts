// src/process/team/adapters/xmlFallbackAdapter.ts

import type { ParsedAction, PlatformCapability } from '../types';
import type { AgentPayload, AgentResponse, BuildPayloadParams, TeamPlatformAdapter } from './PlatformAdapter';
import { buildRolePrompt } from './buildRolePrompt';

/** Instructions appended to the payload so agents know the XML action format */
const XML_INSTRUCTIONS = `## Available Actions

Use the following XML tags to take actions. Place them anywhere in your response.

Send a message to a teammate:
<send_message to="AgentName">message</send_message>

Create a new task:
<task_create subject="..." owner="..." description="..."/>

Update task status:
<task_update task_id="..." status="completed"/>

Create a new teammate:
<spawn_agent name="AgentName" type="acp"/>

Signal that you are idle:
<idle reason="available" summary="..." completed_task_id="..."/>`;

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
export function createXmlFallbackAdapter(): TeamPlatformAdapter {
  return {
    getCapability(): PlatformCapability {
      return { supportsToolUse: false, supportsStreaming: true };
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

      sections.push(XML_INSTRUCTIONS);

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
