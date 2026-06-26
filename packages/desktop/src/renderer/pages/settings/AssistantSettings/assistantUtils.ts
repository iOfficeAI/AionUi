import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { isBackendRelativeAssetPath, isLikelyLocalFilePath } from '@/renderer/utils/model/assistantAvatar';
import type { AssistantListItem, AvailableBackend } from './types';

export type AssistantListFilter = 'all' | 'enabled' | 'disabled' | 'builtin' | 'user';
export const ASSISTANT_SORT_ORDER_GAP = 1000;

/**
 * Source tag shown next to an assistant in the settings list.
 *
 * - `builtin` → "Built-in" tag
 * - `user` → "Custom" tag
 * - `generated` (agent-generated) → "CLI" tag, matching the product terminology.
 */
export type AssistantSourceTag = 'builtin' | 'custom' | 'cli' | null;

export const resolveAssistantSourceTag = (source: string): AssistantSourceTag => {
  if (source === 'builtin') return 'builtin';
  if (source === 'generated') return 'cli';
  return 'custom';
};

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
export const resolveAvatarImageSrc = (avatar: string | undefined): string | undefined => {
  const value = avatar?.trim();
  if (!value) return undefined;

  if (isLikelyLocalFilePath(value)) return undefined;
  if (value.startsWith('/') && !isBackendRelativeAssetPath(value)) return undefined;

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
 * Reorder assistants by moving `activeId` to the position of `overId`.
 */
export const reorderAssistantList = (
  assistants: AssistantListItem[],
  activeId: string,
  overId: string
): AssistantListItem[] => {
  const activeIndex = assistants.findIndex((assistant) => assistant.id === activeId);
  const overIndex = assistants.findIndex((assistant) => assistant.id === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) {
    return assistants;
  }

  const nextAssistants = [...assistants];
  const [movedAssistant] = nextAssistants.splice(activeIndex, 1);
  nextAssistants.splice(overIndex, 0, movedAssistant);
  return nextAssistants;
};

/**
 * Build deterministic sort_order updates for a reordered assistant list.
 */
export const buildAssistantSortUpdates = (
  previousAssistants: AssistantListItem[],
  nextAssistants: AssistantListItem[]
): Array<{ id: string; sort_order: number }> =>
  nextAssistants
    .map((assistant, index) => ({
      id: assistant.id,
      sort_order: (index + 1) * ASSISTANT_SORT_ORDER_GAP,
      previous: previousAssistants.find((item) => item.id === assistant.id),
    }))
    .filter(({ previous, sort_order }) => previous?.sort_order !== sort_order)
    .map(({ id, sort_order }) => ({ id, sort_order }));

/**
 * Apply normalized sort_order values to a reordered assistant list.
 */
export const applyAssistantSortOrders = (assistants: AssistantListItem[]): AssistantListItem[] =>
  assistants.map((assistant, index) => ({
    ...assistant,
    sort_order: (index + 1) * ASSISTANT_SORT_ORDER_GAP,
  }));

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

export const buildAssistantEditorBackends = (
  assistants: AssistantListItem[],
  localeKey: string
): AvailableBackend[] => {
  const backendMap = new Map<string, AvailableBackend>();

  for (const assistant of assistants) {
    if (assistant.source !== 'generated') {
      continue;
    }

    const runtimeKey = assistantRuntimeKey(assistant).trim();
    const agentId = assistant.agent_id?.trim() || '';
    if (!agentId || backendMap.has(agentId)) {
      continue;
    }

    const models = Array.isArray(assistant.models) ? assistant.models : [];
    const modelOptions = models.map((model) => ({ value: model, label: model }));

    backendMap.set(agentId, {
      id: agentId,
      name: assistant.name_i18n?.[localeKey] || assistant.name,
      runtimeKey,
      modelOptions,
    });
  }

  return [...backendMap.values()];
};
