import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { AssistantListItem } from './types';

/**
 * Check if a builtin assistant has skills config (defaultEnabledSkills or skillFiles).
 */
export const hasBuiltinSkills = (assistantId: string): boolean => {
  if (!assistantId.startsWith('builtin-')) return false;
  const presetId = assistantId.replace('builtin-', '');
  const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return false;
  const hasDefaultSkills = preset.defaultEnabledSkills && preset.defaultEnabledSkills.length > 0;
  const hasSkillFiles = preset.skillFiles && Object.keys(preset.skillFiles).length > 0;
  return hasDefaultSkills || hasSkillFiles;
};

/**
 * Check if a string is an emoji (simple check for common emoji patterns).
 */
export const isEmoji = (str: string): boolean => {
  if (!str) return false;
  const emojiRegex =
    /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;
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
  const isImage =
    /\.(svg|png|jpe?g|webp|gif)$/i.test(resolved) || /^(https?:|aion-asset:\/\/|file:\/\/|data:)/i.test(resolved);
  return isImage ? resolved : undefined;
};

/**
 * Sort assistants according to ASSISTANT_PRESETS order.
 */
export const sortAssistants = (agents: AssistantListItem[]): AssistantListItem[] => {
  const presetOrder = ASSISTANT_PRESETS.map((preset) => `builtin-${preset.id}`);
  return agents
    .filter((agent) => agent.isPreset)
    .toSorted((a, b) => {
      const indexA = presetOrder.indexOf(a.id);
      const indexB = presetOrder.indexOf(b.id);
      if (indexA !== -1 || indexB !== -1) {
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      }
      return 0;
    });
};

/**
 * Normalize raw extension assistant records into typed AssistantListItem[].
 */
export const normalizeExtensionAssistants = (extensionAssistants: Record<string, unknown>[]): AssistantListItem[] => {
  if (!Array.isArray(extensionAssistants) || extensionAssistants.length === 0) return [];

  return extensionAssistants
    .map((ext) => {
      const id = typeof ext.id === 'string' ? ext.id : '';
      const name = typeof ext.name === 'string' ? ext.name : '';
      if (!id || !name) return null;

      return {
        id,
        name,
        nameI18n: ext.nameI18n as Record<string, string> | undefined,
        description: typeof ext.description === 'string' ? ext.description : undefined,
        descriptionI18n: ext.descriptionI18n as Record<string, string> | undefined,
        avatar: typeof ext.avatar === 'string' ? ext.avatar : undefined,
        presetAgentType: typeof ext.presetAgentType === 'string' ? ext.presetAgentType : undefined,
        context: typeof ext.context === 'string' ? ext.context : undefined,
        contextI18n: ext.contextI18n as Record<string, string> | undefined,
        models: Array.isArray(ext.models) ? (ext.models as string[]) : undefined,
        enabledSkills: Array.isArray(ext.enabledSkills) ? (ext.enabledSkills as string[]) : undefined,
        prompts: Array.isArray(ext.prompts) ? (ext.prompts as string[]) : undefined,
        promptsI18n: ext.promptsI18n as Record<string, string[]> | undefined,
        isPreset: true,
        isBuiltin: false,
        enabled: true,
        _source: 'extension',
        _extensionName: typeof ext._extensionName === 'string' ? ext._extensionName : undefined,
        _kind: typeof ext._kind === 'string' ? ext._kind : undefined,
      } as AssistantListItem;
    })
    .filter((item): item is AssistantListItem => item !== null);
};

/**
 * Check if an assistant originates from an extension.
 */
export const isExtensionAssistant = (assistant: AssistantListItem | null | undefined): boolean => {
  if (!assistant) return false;
  return assistant._source === 'extension' || assistant.id.startsWith('ext-');
};
