import type { TMessage } from '@/common/chat/chatLib';
import type { TProviderWithModel } from '@/common/config/storage';
import { readMessageContent } from '@/renderer/utils/chat/conversationExport';
import { hasThinkTags, stripThinkTags } from '@/renderer/utils/chat/thinkTagFilter';

export const buildAutoTitleFromContent = (content: string): string | null => {
  const withoutThinkTags = hasThinkTags(content) ? stripThinkTags(content) : content;
  const lines = withoutThinkTags
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== '```');

  const firstLine = lines[0] ?? '';
  const normalized = firstLine
    .replace(/^[#>*\-\d.\s]+/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  return normalized || null;
};

/**
 * Pick the very first user prompt from conversation history.
 * Falls back to the current send-box content when history has no user prompt yet.
 */
export const deriveAutoTitleFromMessages = (messages: TMessage[], fallbackContent?: string): string | null => {
  for (const message of messages) {
    if (message.type !== 'text' || message.position !== 'right') {
      continue;
    }

    const title = buildAutoTitleFromContent(readMessageContent(message));
    if (title) {
      return title;
    }
  }

  if (fallbackContent) {
    return buildAutoTitleFromContent(fallbackContent);
  }

  return null;
};

/**
 * Generate a conversation title using AI based on the first user message.
 *
 * @param firstMessage - The first user message content
 * @param provider - The current model provider info
 * @param locale - The UI locale (e.g. 'zh', 'en')
 * @returns A short title (≤15 chars) or null on failure
 */
export const generateTitleWithAI = async (
  firstMessage: string,
  provider: TProviderWithModel,
  locale: string = 'en',
): Promise<string | null> => {
  if (!firstMessage?.trim()) {
    return null;
  }

  try {
    const { ClientFactory } = await import('@/common/api/ClientFactory');
    const client = await ClientFactory.createRotatingClient(provider, {
      timeout: 30_000,
    });

    const langInstruction = locale.startsWith('zh')
      ? '请用中文回复。'
      : locale.startsWith('ja')
        ? '日本語で返信してください。'
        : 'Reply in English.';

    const prompt = `Based on the following user message, generate a very short conversation title.
Rules:
- Maximum 15 characters
- No quotes, no punctuation at the end
- ${langInstruction}
- Be concise and descriptive

User message: ${firstMessage.slice(0, 200)}

Title:`;

    const result = await client.createChatCompletion({
      model: provider.use_model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 30,
      temperature: 0.3,
    });

    const raw = result.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return null;
    }

    // Clean up: remove surrounding quotes, trailing punctuation, and truncate
    const cleaned = raw
      .replace(/^['"「『【]|['"」』】]$/g, '')
      .replace(/[。.！!？?\s]+$/, '')
      .trim()
      .slice(0, 15);

    return cleaned || null;
  } catch (error) {
    console.warn('AI title generation failed, falling back to rule-based title:', error);
    return null;
  }
};
