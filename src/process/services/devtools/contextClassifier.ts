/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Context injection classifier — detects what kinds of context are injected into each message.
 * Identifies CLAUDE.md, system reminders, file content, tool results, etc.
 */

import { countTokens, extractTextContent } from './jsonlParser';
import type { ContentBlock, ParsedMessage } from './types';

export type ContextInjectionType = 'claude_md' | 'file_content' | 'system_reminder' | 'tool_result' | 'tool_input' | 'thinking' | 'user_input' | 'assistant_output' | 'unknown';

export type ContextInjection = {
  type: ContextInjectionType;
  source: string;
  tokenEstimate: number;
  preview: string;
};

export type MessageContextInfo = {
  uuid: string;
  injections: ContextInjection[];
  totalTokens: number;
};

const CLAUDE_MD_PATTERNS = [/CLAUDE\.md/, /## Project/, /# Instructions/, /project instructions/i, /codebase.*instructions/i];

const SYSTEM_REMINDER_PATTERNS = [/<system-reminder>/, /<important-instruction>/, /<user-prompt-submit-hook>/, /<caveat>/, /<context-window-full>/, /<repository-description>/];

/**
 * Classify context injections for a single message.
 */
function classifyMessageContext(msg: ParsedMessage): ContextInjection[] {
  const injections: ContextInjection[] = [];

  if (msg.type === 'user') {
    // Tool results
    if (msg.toolResults.length > 0) {
      for (const result of msg.toolResults) {
        const content = result.content || '';
        injections.push({
          type: 'tool_result',
          source: result.toolUseId,
          tokenEstimate: countTokens(content),
          preview: content.slice(0, 150),
        });
      }
      return injections;
    }

    // Check for system/meta messages
    if (msg.isMeta) {
      const text = extractTextContent(msg.content);
      const isClaudeMd = CLAUDE_MD_PATTERNS.some((p) => p.test(text));
      const isSystemReminder = SYSTEM_REMINDER_PATTERNS.some((p) => p.test(text));

      injections.push({
        type: isClaudeMd ? 'claude_md' : isSystemReminder ? 'system_reminder' : 'unknown',
        source: isClaudeMd ? 'CLAUDE.md' : isSystemReminder ? 'system' : 'meta',
        tokenEstimate: countTokens(text),
        preview: text.slice(0, 150),
      });
      return injections;
    }

    // Real user input
    const text = extractTextContent(msg.content);
    if (text.trim()) {
      // Check if user message contains system reminders (injected context)
      const isSystemReminder = SYSTEM_REMINDER_PATTERNS.some((p) => p.test(text));
      if (isSystemReminder) {
        injections.push({
          type: 'system_reminder',
          source: 'system',
          tokenEstimate: countTokens(text),
          preview: text.slice(0, 150),
        });
      } else {
        injections.push({
          type: 'user_input',
          source: 'user',
          tokenEstimate: countTokens(text),
          preview: text.slice(0, 150),
        });
      }
    }
    return injections;
  }

  if (msg.type === 'assistant') {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === 'thinking' && block.thinking) {
          injections.push({
            type: 'thinking',
            source: 'assistant',
            tokenEstimate: countTokens(block.thinking),
            preview: block.thinking.slice(0, 150),
          });
        } else if (block.type === 'tool_use') {
          const inputStr = JSON.stringify(block.input || {});
          injections.push({
            type: 'tool_input',
            source: block.name,
            tokenEstimate: countTokens(inputStr),
            preview: `${block.name}: ${inputStr.slice(0, 120)}`,
          });
        } else if (block.type === 'text' && block.text) {
          injections.push({
            type: 'assistant_output',
            source: 'assistant',
            tokenEstimate: countTokens(block.text),
            preview: block.text.slice(0, 150),
          });
        }
      }
    } else {
      const text = typeof msg.content === 'string' ? msg.content : '';
      if (text.trim()) {
        injections.push({
          type: 'assistant_output',
          source: 'assistant',
          tokenEstimate: countTokens(text),
          preview: text.slice(0, 150),
        });
      }
    }
    return injections;
  }

  if (msg.type === 'system') {
    const text = extractTextContent(msg.content);
    const isClaudeMd = CLAUDE_MD_PATTERNS.some((p) => p.test(text));
    injections.push({
      type: isClaudeMd ? 'claude_md' : 'system_reminder',
      source: isClaudeMd ? 'CLAUDE.md' : 'system',
      tokenEstimate: countTokens(text),
      preview: text.slice(0, 150),
    });
    return injections;
  }

  // Summary / other
  const text = extractTextContent(msg.content);
  if (text.trim()) {
    injections.push({
      type: 'unknown',
      source: msg.type,
      tokenEstimate: countTokens(text),
      preview: text.slice(0, 150),
    });
  }

  return injections;
}

/**
 * Compute context injection info for all messages in a session.
 */
export function classifyContextInjections(messages: ParsedMessage[]): MessageContextInfo[] {
  return messages.map((msg) => {
    const injections = classifyMessageContext(msg);
    const totalTokens = injections.reduce((sum, inj) => sum + inj.tokenEstimate, 0);
    return {
      uuid: msg.uuid,
      injections,
      totalTokens,
    };
  });
}

/**
 * Aggregate context injection stats across all messages.
 */
export type ContextBreakdownSummary = {
  byType: Record<ContextInjectionType, { count: number; totalTokens: number }>;
  totalTokens: number;
  topSources: Array<{ source: string; type: ContextInjectionType; totalTokens: number; count: number }>;
};

export function summarizeContextBreakdown(contextInfo: MessageContextInfo[]): ContextBreakdownSummary {
  const byType: Record<string, { count: number; totalTokens: number }> = {};
  const sourceMap = new Map<string, { source: string; type: ContextInjectionType; totalTokens: number; count: number }>();
  let totalTokens = 0;

  for (const msg of contextInfo) {
    for (const inj of msg.injections) {
      totalTokens += inj.tokenEstimate;

      if (!byType[inj.type]) {
        byType[inj.type] = { count: 0, totalTokens: 0 };
      }
      byType[inj.type].count++;
      byType[inj.type].totalTokens += inj.tokenEstimate;

      const key = `${inj.type}:${inj.source}`;
      const existing = sourceMap.get(key);
      if (existing) {
        existing.count++;
        existing.totalTokens += inj.tokenEstimate;
      } else {
        sourceMap.set(key, { source: inj.source, type: inj.type, totalTokens: inj.tokenEstimate, count: 1 });
      }
    }
  }

  const topSources = Array.from(sourceMap.values())
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 20);

  return {
    byType: byType as ContextBreakdownSummary['byType'],
    totalTokens,
    topSources,
  };
}
