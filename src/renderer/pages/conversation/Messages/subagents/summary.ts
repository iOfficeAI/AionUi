import type { IMessageAcpToolCall, IMessageToolGroup } from '@/common/chat/chatLib';

export type SubagentSummaryStatus = 'active' | 'completed' | 'failed';

export type SubagentSummaryEntry = {
  id: string;
  label: string;
  messageId: string;
  status: SubagentSummaryStatus;
};

const KNOWN_SUBAGENT_TOOL_NAMES = new Set([
  'delegate_to_agent',
  'codebase_investigator',
  'cli_help',
  'generalist_agent',
]);
const SUBAGENT_TEXT_PATTERNS = [/\bsubagents?\b/i, /delegate[_\s-]*to[_\s-]*agent/i, /spawn(?:ed|ing)?\s+agent/i];

const prettifyToolName = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (part) => part.toUpperCase());

const matchesSubagentText = (value?: string): boolean => {
  if (!value) return false;
  return SUBAGENT_TEXT_PATTERNS.some((pattern) => pattern.test(value));
};

const normalizeToolGroupStatus = (status: IMessageToolGroup['content'][number]['status']): SubagentSummaryStatus => {
  switch (status) {
    case 'Error':
    case 'Canceled':
      return 'failed';
    case 'Success':
      return 'completed';
    default:
      return 'active';
  }
};

const normalizeAcpStatus = (status: IMessageAcpToolCall['content']['update']['status']): SubagentSummaryStatus => {
  switch (status) {
    case 'failed':
      return 'failed';
    case 'completed':
      return 'completed';
    default:
      return 'active';
  }
};

const resolveRawInputText = (rawInput?: Record<string, unknown>): string => {
  if (!rawInput) return '';
  const candidates = [rawInput.description, rawInput.prompt, rawInput.agent, rawInput.name];
  return candidates.find((value): value is string => typeof value === 'string' && value.trim().length > 0) || '';
};

const resolveLabel = (toolName: string, fallback?: string): string => {
  if (fallback && fallback.trim().length > 0) {
    return fallback.trim();
  }
  return prettifyToolName(toolName);
};

export function extractSubagentSummaryEntries(
  messages: Array<IMessageToolGroup | IMessageAcpToolCall>
): SubagentSummaryEntry[] {
  return messages.flatMap((message) => {
    if (message.type === 'tool_group') {
      return message.content.flatMap((item) => {
        const isKnownTool = KNOWN_SUBAGENT_TOOL_NAMES.has(item.name.toLowerCase());
        const fallbackText = typeof item.description === 'string' ? item.description : '';
        const matchesByText = matchesSubagentText(item.name) || matchesSubagentText(fallbackText);
        if (!isKnownTool && !matchesByText) {
          return [];
        }

        return [
          {
            id: `${message.id}:${item.callId}`,
            label: resolveLabel(item.name, fallbackText),
            messageId: message.id,
            status: normalizeToolGroupStatus(item.status),
          },
        ];
      });
    }

    const title = message.content.update.title || '';
    const rawInputText = resolveRawInputText(message.content.update.rawInput);
    if (!matchesSubagentText(title) && !matchesSubagentText(rawInputText)) {
      return [];
    }

    return [
      {
        id: `${message.id}:${message.content.update.toolCallId}`,
        label: resolveLabel(title || rawInputText || message.content.update.kind, rawInputText),
        messageId: message.id,
        status: normalizeAcpStatus(message.content.update.status),
      },
    ];
  });
}
