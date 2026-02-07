/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { ipcBridge } from '@/common';
import { cronService, type AgentType } from '@process/services/cron/CronService';
import { detectCronCommands, stripCronCommands, type CronCommand } from './CronCommandDetector';
import { hasThinkTags, stripThinkTags } from './ThinkTagDetector';

/**
 * Result of processing an agent response
 */
export interface ProcessResult {
  /** Original message - save to database */
  message: TMessage;
  /** Cleaned message with cron commands stripped - emit to UI */
  displayMessage?: TMessage;
  /** System response messages to append after agent response */
  systemResponses: string[];
}

/**
 * Process agent response before emitting to UI
 *
 * This middleware:
 * 1. Strips think tags from messages (e.g., <think>...</think>)
 * 2. Detects cron commands in completed messages
 * 3. Executes detected commands (create/list/delete jobs)
 * 4. Returns cleaned message for UI display
 *
 * @param conversationId - The conversation ID
 * @param agentType - The agent type (gemini, claude, codex, etc.)
 * @param message - The message to process
 * @returns ProcessResult with original message, display message, and system responses
 */
export async function processAgentResponse(conversationId: string, agentType: AgentType, message: TMessage): Promise<ProcessResult> {
  const systemResponses: string[] = [];

  // Only process completed messages
  // Skip if message is still streaming or pending
  if (message.status !== 'finish') {
    return { message, systemResponses };
  }

  // Extract text content from message
  const textContent = extractTextContent(message);
  if (!textContent) {
    return { message, systemResponses };
  }

  let displayContent = textContent;
  let needsDisplayMessage = false;

  // Strip think tags first (internal reasoning tags from models like MiniMax, DeepSeek, etc.)
  if (hasThinkTags(displayContent)) {
    displayContent = stripThinkTags(displayContent);
    needsDisplayMessage = true;
  }

  // Detect cron commands
  const cronCommands = detectCronCommands(displayContent);
  if (cronCommands.length > 0) {
    // Handle detected commands
    const responses = await handleCronCommands(conversationId, agentType, cronCommands);
    systemResponses.push(...responses);

    // Strip cron commands from display
    displayContent = stripCronCommands(displayContent);
    needsDisplayMessage = true;
  }

  // Return cleaned message if any processing was done
  if (needsDisplayMessage) {
    const displayMessage = createDisplayMessage(message, displayContent);
    return {
      message, // Original for database
      displayMessage, // Cleaned for UI
      systemResponses,
    };
  }

  return { message, systemResponses };
}

/**
 * Extract text content from a TMessage for cron command detection
 * Exported for use by AgentManagers
 *
 * @param message - The message to extract text from
 * @returns The text content or empty string if not found
 */
export function extractTextFromMessage(message: TMessage): string {
  if (!message.content) {
    return '';
  }

  // Handle direct string content
  if (typeof message.content === 'string') {
    return message.content;
  }

  // Handle object content with 'content' property (most common case)
  if (typeof message.content === 'object' && 'content' in message.content) {
    const contentObj = message.content as { content?: string };
    return contentObj.content ?? '';
  }

  return '';
}

/**
 * Extract text content from a message (internal use)
 * Returns null for empty content to distinguish from empty string
 */
function extractTextContent(message: TMessage): string | null {
  const text = extractTextFromMessage(message);
  return text || null;
}

/**
 * Create a display message with modified content
 * Only modifies messages with { content: string } structure
 */
function createDisplayMessage(original: TMessage, newContent: string): TMessage {
  const content = original.content;

  // Only handle the common case: content is { content: string }
  if (typeof content === 'object' && content !== null && 'content' in content) {
    const contentObj = content as { content: string };
    if (typeof contentObj.content === 'string') {
      // Use type assertion to avoid complex union type issues
      const newContentObj = { ...content, content: newContent };
      return {
        ...original,
        content: newContentObj,
      } as TMessage;
    }
  }

  // For other content types, return original unchanged
  return original;
}

/**
 * Process cron commands in a message and emit system responses
 * This is a high-level helper that combines detection, processing, and emitting
 *
 * Usage in AgentManagers:
 * ```typescript
 * if (tMessage.status === 'finish' && hasCronCommands(extractTextFromMessage(tMessage))) {
 *   await processCronInMessage(conversationId, agentType, tMessage, (msg) => {
 *     ipcBridge.xxxConversation.responseStream.emit({ type: 'system', ... });
 *   });
 * }
 * ```
 *
 * @param conversationId - The conversation ID
 * @param agentType - The agent type
 * @param message - The completed message to check for cron commands
 * @param emitSystemResponse - Callback to emit system response messages
 */
export async function processCronInMessage(conversationId: string, agentType: AgentType, message: TMessage, emitSystemResponse: (response: string) => void): Promise<void> {
  try {
    const result = await processAgentResponse(conversationId, agentType, message);

    // Emit system responses through the provided callback
    for (const sysMsg of result.systemResponses) {
      emitSystemResponse(sysMsg);
    }
  } catch {
    // Silently handle errors
  }
}

/**
 * Handle detected cron commands
 */
async function handleCronCommands(conversationId: string, agentType: AgentType, commands: CronCommand[]): Promise<string[]> {
  const responses: string[] = [];

  for (const cmd of commands) {
    try {
      switch (cmd.kind) {
        case 'create': {
          const job = await cronService.addJob({
            name: cmd.name,
            schedule: { kind: 'cron', expr: cmd.schedule, description: cmd.scheduleDescription },
            message: cmd.message,
            conversationId,
            agentType,
            createdBy: 'agent',
          });
          // Emit event to renderer process for real-time UI update
          ipcBridge.cron.onJobCreated.emit(job);
          responses.push(`✅ Scheduled task created: "${job.name}" (ID: ${job.id})`);
          break;
        }

        case 'list': {
          const jobs = await cronService.listJobsByConversation(conversationId);
          if (jobs.length === 0) {
            responses.push('📋 No scheduled tasks in this conversation.');
          } else {
            const jobList = jobs
              .map((j) => {
                const scheduleStr = j.schedule.kind === 'cron' ? j.schedule.expr : j.schedule.kind;
                const status = j.enabled ? '✓' : '✗';
                return `- [${status}] ${j.name} (${scheduleStr}) - ID: ${j.id}`;
              })
              .join('\n');
            responses.push(`📋 Scheduled tasks:\n${jobList}`);
          }
          break;
        }

        case 'delete': {
          await cronService.removeJob(cmd.jobId);
          // Emit event to renderer process for real-time UI update
          ipcBridge.cron.onJobRemoved.emit({ jobId: cmd.jobId });
          responses.push(`🗑️ Task deleted: ${cmd.jobId}`);
          break;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      responses.push(`❌ Error: ${errorMsg}`);
    }
  }

  return responses;
}
