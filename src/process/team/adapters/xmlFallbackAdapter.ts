// src/process/team/adapters/xmlFallbackAdapter.ts

import type { ParsedAction, PlatformCapability } from '../types'
import type { AgentPayload, AgentResponse, BuildPayloadParams, TeamPlatformAdapter } from './PlatformAdapter'

/** Instructions appended to the payload so agents know the XML action format */
const XML_INSTRUCTIONS = `## Available Actions

Use the following XML tags to take actions. Place them anywhere in your response.

Send a message to a teammate:
<send_message to="AgentName">message</send_message>

Create a new task:
<task_create subject="..." owner="..." description="..."/>

Update task status:
<task_update task_id="..." status="completed"/>

Signal that you are idle:
<idle reason="available" summary="..." completed_task_id="..."/>`

/** Format unread mailbox messages into a human-readable section */
function formatMailboxMessages(messages: BuildPayloadParams['mailboxMessages']): string {
  if (messages.length === 0) {
    return ''
  }
  const lines = messages.map((m) => `[From ${m.fromAgentId}] ${m.content}`)
  return `## Unread Messages\n${lines.join('\n')}`
}

/** Format tasks into a human-readable section */
function formatTasks(tasks: BuildPayloadParams['tasks']): string {
  if (tasks.length === 0) {
    return ''
  }
  const lines = tasks.map((t) => `- [${t.id}] ${t.subject} (${t.status}, owner: ${t.owner ?? 'unassigned'})`)
  return `## Current Tasks\n${lines.join('\n')}`
}

/** Remove matched XML tag spans from a string and return the remaining text */
function removeXmlSpans(text: string, spans: Array<[number, number]>): string {
  const sortedSpans = [...spans].sort((a, b) => a[0] - b[0])
  let result = ''
  let cursor = 0
  for (const [start, end] of sortedSpans) {
    result += text.slice(cursor, start)
    cursor = end
  }
  result += text.slice(cursor)
  return result
}

/** Parse XML action tags from response text using regex */
function parseXmlActions(text: string): { actions: ParsedAction[]; consumedSpans: Array<[number, number]> } {
  const actions: ParsedAction[] = []
  const consumedSpans: Array<[number, number]> = []

  // <send_message to="AgentName">content</send_message>
  const sendMessageRe = /<send_message\s+to="([^"]+)">([\s\S]*?)<\/send_message>/g
  for (const match of text.matchAll(sendMessageRe)) {
    actions.push({
      type: 'send_message',
      to: match[1],
      content: match[2].trim(),
    })
    consumedSpans.push([match.index!, match.index! + match[0].length])
  }

  // <task_create subject="..." owner="..." description="..."/>
  const taskCreateRe = /<task_create\s+subject="([^"]+)"(?:\s+owner="([^"]*)")?(?:\s+description="([^"]*)")?\s*\/>/g
  for (const match of text.matchAll(taskCreateRe)) {
    actions.push({
      type: 'task_create',
      subject: match[1],
      owner: match[2] ? match[2] : undefined,
      description: match[3] ? match[3] : undefined,
    })
    consumedSpans.push([match.index!, match.index! + match[0].length])
  }

  // <task_update task_id="..." status="..." owner="..."/>
  const taskUpdateRe = /<task_update\s+task_id="([^"]+)"(?:\s+status="([^"]*)")?(?:\s+owner="([^"]*)")?\s*\/>/g
  for (const match of text.matchAll(taskUpdateRe)) {
    actions.push({
      type: 'task_update',
      taskId: match[1],
      status: match[2] ? match[2] : undefined,
      owner: match[3] ? match[3] : undefined,
    })
    consumedSpans.push([match.index!, match.index! + match[0].length])
  }

  // <idle reason="..." summary="..." completed_task_id="..."/>
  const idleRe = /<idle\s+reason="([^"]+)"\s+summary="([^"]*)"(?:\s+completed_task_id="([^"]*)")?\s*\/>/g
  for (const match of text.matchAll(idleRe)) {
    actions.push({
      type: 'idle_notification',
      reason: match[1],
      summary: match[2],
      completedTaskId: match[3] ? match[3] : undefined,
    })
    consumedSpans.push([match.index!, match.index! + match[0].length])
  }

  return { actions, consumedSpans }
}

/**
 * Creates an adapter for platforms that do not support tool use (e.g. Gemini, Codex).
 * Agents communicate structured actions via XML tags embedded in plain text.
 */
export function createXmlFallbackAdapter(): TeamPlatformAdapter {
  return {
    getCapability(): PlatformCapability {
      return { supportsToolUse: false, supportsStreaming: true }
    },

    buildPayload(params: BuildPayloadParams): AgentPayload {
      const { mailboxMessages, tasks } = params
      const sections: string[] = []

      const mailboxSection = formatMailboxMessages(mailboxMessages)
      if (mailboxSection) {
        sections.push(mailboxSection)
      }

      const tasksSection = formatTasks(tasks)
      if (tasksSection) {
        sections.push(tasksSection)
      }

      sections.push(XML_INSTRUCTIONS)

      return { message: sections.join('\n\n') }
    },

    parseResponse(response: AgentResponse): ParsedAction[] {
      const { actions, consumedSpans } = parseXmlActions(response.text)

      // Text outside XML tags becomes a plain_response
      const remainingText = removeXmlSpans(response.text, consumedSpans).trim()
      if (remainingText) {
        actions.push({ type: 'plain_response', content: remainingText })
      }

      return actions
    },
  }
}
