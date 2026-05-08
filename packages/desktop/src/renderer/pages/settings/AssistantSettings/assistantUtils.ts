import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { AssistantListItem } from './types';

export type AssistantListFilter = 'all' | 'enabled' | 'disabled' | 'builtin' | 'user' | 'extension';

/**
 * Check if a string is an emoji (simple check for common emoji patterns).
 */
export const isEmoji = (str: string): boolean => {
  if (!str) return false;
  const emojiRegex = /^(?:\p{Emoji_Presentation}|\p{Emoji}️)(?:‍(?:\p{Emoji_Presentation}|\p{Emoji}️))*$/u;
  return emojiRegex.test(str);
};

/**
 * Resolve an avatar string to an image src URL, or undefined if it is not an image.
 */
export const resolveAvatarImageSrc = (
  avatar: string | undefined,
  avatarImageMap: Record<string, string>
): string | undefined => {
  const value = avatar?.trim();
  if (!value) return undefined;

  const mapped = avatarImageMap[value];
  if (mapped) return mapped;

  const resolved = resolveExtensionAssetUrl(value) || value;
  const isImage = /\.(svg|png|jpe?g|webp|gif)$/i.test(resolved) || /^(https?:|file:\/\/|data:|\/)/i.test(resolved);
  return isImage ? resolved : undefined;
};

/**
 * Sort assistants by sortOrder. The backend already returns sorted lists; this
 * is a deterministic fallback for local reorder operations.
 */
export const sortAssistants = (list: AssistantListItem[]): AssistantListItem[] =>
  [...list].toSorted((a, b) => a.sort_order - b.sort_order);

/**
 * Apply search and management filter to assistant list.
 */
export const filterAssistants = (
  assistants: AssistantListItem[],
  query: string,
  filter: AssistantListFilter,
  localeKey: string
): AssistantListItem[] => {
  const normalizedQuery = query.trim().toLowerCase();

  return assistants.filter((assistant) => {
    if (normalizedQuery) {
      const searchableText = [
        assistant.name_i18n?.[localeKey] || assistant.name,
        assistant.description_i18n?.[localeKey] || assistant.description || '',
      ]
        .join(' ')
        .toLowerCase();

      if (!searchableText.includes(normalizedQuery)) return false;
    }

    switch (filter) {
      case 'enabled':
        return assistant.enabled !== false;
      case 'disabled':
        return assistant.enabled === false;
      case 'builtin':
        return assistant.source === 'builtin';
      case 'user':
        return assistant.source === 'user';
      case 'extension':
        return assistant.source === 'extension';
      case 'all':
      default:
        return true;
    }
  });
};

/**
 * Split assistants into enabled and disabled groups while preserving order.
 */
export const groupAssistantsByEnabled = (assistants: AssistantListItem[]) => ({
  enabledAssistants: assistants.filter((assistant) => assistant.enabled !== false),
  disabledAssistants: assistants.filter((assistant) => assistant.enabled === false),
});
