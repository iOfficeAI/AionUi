/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

type LocalCronProcessingResult = {
  displayContent?: string;
  systemResponses: string[];
};

const THINK_TAG_RE = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;
const CRON_CREATE_RE = /\[CRON_CREATE\]\s*([\s\S]*?)\s*\[\/CRON_CREATE\]/gi;
const CRON_UPDATE_RE = /\[CRON_UPDATE:\s*([^\]]+)\]\s*([\s\S]*?)\s*\[\/CRON_UPDATE\]/gi;
const CRON_LIST_RE = /\[CRON_LIST\]/gi;
const CRON_DELETE_RE = /\[CRON_DELETE:\s*([^\]]+)\]/gi;

function stripThinkTags(text: string): string {
  return text.replace(THINK_TAG_RE, '').trim();
}

function stripCronCommands(text: string): string {
  return text
    .replace(CRON_CREATE_RE, '')
    .replace(CRON_UPDATE_RE, '')
    .replace(CRON_LIST_RE, '')
    .replace(CRON_DELETE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strip cron command tags and think tags from the assistant message for display.
 * Actual cron job creation/update/delete is handled by the backend middleware (StreamRelay).
 */
export async function processLocalCronResponse(
  _conversationId: string,
  rawContent: string
): Promise<LocalCronProcessingResult> {
  if (!rawContent.trim()) {
    return { systemResponses: [] };
  }

  const thinkStripped = stripThinkTags(rawContent);
  const hasCronTags =
    CRON_CREATE_RE.test(thinkStripped) ||
    CRON_UPDATE_RE.test(thinkStripped) ||
    CRON_LIST_RE.test(thinkStripped) ||
    CRON_DELETE_RE.test(thinkStripped);

  // Reset regex lastIndex after .test() calls (they have the 'g' flag)
  CRON_CREATE_RE.lastIndex = 0;
  CRON_UPDATE_RE.lastIndex = 0;
  CRON_LIST_RE.lastIndex = 0;
  CRON_DELETE_RE.lastIndex = 0;

  if (!hasCronTags) {
    return {
      displayContent: thinkStripped !== rawContent ? thinkStripped : undefined,
      systemResponses: [],
    };
  }

  return {
    displayContent: stripCronCommands(thinkStripped),
    systemResponses: [],
  };
}
