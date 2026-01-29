/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cron command types detected from agent message content
 */
export type CronCommand = { kind: 'create'; name: string; schedule: string; scheduleDescription: string; message: string } | { kind: 'list' } | { kind: 'delete'; jobId: string };

/**
 * Remove markdown code blocks from content to avoid detecting commands in examples
 * This prevents documentation examples like ```[CRON_LIST]``` from being executed
 */
function stripCodeBlocks(content: string): string {
  // Remove fenced code blocks (```...```)
  return content.replace(/```[\s\S]*?```/g, '');
}

/**
 * Detect cron commands in message content
 *
 * Supported formats:
 * - [CRON_CREATE]...[/CRON_CREATE] - Create a new scheduled task
 * - [CRON_LIST] - List all scheduled tasks
 * - [CRON_DELETE: task-id] - Delete a scheduled task
 *
 * NOTE: Commands inside markdown code blocks are ignored to prevent
 * documentation examples from being executed.
 *
 * @param content - The text content to scan
 * @returns Array of detected commands
 */
export function detectCronCommands(content: string): CronCommand[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // Strip code blocks to avoid detecting commands in examples
  const cleanContent = stripCodeBlocks(content);

  const commands: CronCommand[] = [];

  // Detect [CRON_CREATE]...[/CRON_CREATE]
  const createMatches = cleanContent.matchAll(/\[CRON_CREATE\]\s*\n?([\s\S]*?)\[\/CRON_CREATE\]/gi);
  for (const match of createMatches) {
    const body = match[1];
    const parsed = parseCronCreateBody(body);
    if (parsed) {
      commands.push({ kind: 'create', ...parsed });
    }
  }

  // Fallback: Try to parse unclosed CRON_CREATE block (agent forgot closing tag)
  if (commands.filter((c) => c.kind === 'create').length === 0) {
    const hasOpenCreate = /\[CRON_CREATE\]/i.test(cleanContent);
    const hasCloseCreate = /\[\/CRON_CREATE\]/i.test(cleanContent);
    if (hasOpenCreate && !hasCloseCreate) {
      // Try to extract content after [CRON_CREATE] until end or next command
      const fallbackMatch = cleanContent.match(/\[CRON_CREATE\]\s*\n?([\s\S]*?)(?=\[CRON_(?:LIST|DELETE)|$)/i);
      if (fallbackMatch) {
        const body = fallbackMatch[1];
        const parsed = parseCronCreateBody(body);
        if (parsed) {
          commands.push({ kind: 'create', ...parsed });
        }
      }
    }
  }

  // Detect [CRON_LIST]
  if (/\[CRON_LIST\]/i.test(cleanContent)) {
    commands.push({ kind: 'list' });
  }

  // Detect [CRON_DELETE: xxx] - but ignore placeholder values like "任务ID", "task-id", etc.
  const deleteMatches = cleanContent.matchAll(/\[CRON_DELETE:\s*([^\]]+)\]/gi);
  for (const match of deleteMatches) {
    const jobId = match[1].trim();
    // Skip placeholder values that are clearly not real job IDs
    const placeholders = ['任务id', 'task-id', 'taskid', 'job-id', 'jobid', 'xxx', 'id'];
    if (jobId && !placeholders.includes(jobId.toLowerCase())) {
      commands.push({ kind: 'delete', jobId });
    }
  }

  return commands;
}

/**
 * Parse the body of a CRON_CREATE block
 *
 * Expected format:
 * name: Task name
 * schedule: 0 9 * * MON
 * schedule_description: Every Monday at 9:00 AM (optional, will auto-generate if missing)
 * message: Message content (can be multi-line until next field or end)
 */
function parseCronCreateBody(body: string): { name: string; schedule: string; scheduleDescription: string; message: string } | null {
  if (!body) {
    return null;
  }

  // Extract name
  const nameMatch = body.match(/name:\s*(.+)/i);
  const name = nameMatch?.[1]?.trim();

  // Extract schedule (cron expression)
  const scheduleMatch = body.match(/^schedule:\s*(.+)/im);
  const schedule = scheduleMatch?.[1]?.trim();

  // Extract schedule_description (human-readable) - required
  const scheduleDescMatch = body.match(/schedule_description:\s*(.+)/i);
  const scheduleDescription = scheduleDescMatch?.[1]?.trim();

  // Extract message - everything after "message:" until end or next field
  // Message can be multi-line
  const messageMatch = body.match(/message:\s*([\s\S]*?)(?=\n(?:name|schedule|schedule_description):|$)/i);
  let message = messageMatch?.[1]?.trim();

  // If message ends with [/CRON_CREATE], strip it (should already be stripped, but just in case)
  if (message) {
    message = message.replace(/\[\/CRON_CREATE\]/gi, '').trim();
  }

  // Validate required fields
  if (!name || !schedule || !scheduleDescription || !message) {
    return null;
  }

  return { name, schedule, scheduleDescription, message };
}

/**
 * Check if content contains any cron commands
 * Useful for quick check before full parsing
 */
export function hasCronCommands(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }
  return /\[CRON_(?:CREATE|LIST|DELETE)/i.test(content);
}

/**
 * Strip cron command blocks from content
 * Used to create clean display version for UI
 */
export function stripCronCommands(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  return content
    .replace(/\[CRON_CREATE\][\s\S]*?\[\/CRON_CREATE\]/gi, '')
    .replace(/\[CRON_LIST\]/gi, '')
    .replace(/\[CRON_DELETE:[^\]]+\]/gi, '')
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();
}
