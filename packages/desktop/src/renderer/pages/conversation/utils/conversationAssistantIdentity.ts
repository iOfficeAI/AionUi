import type { TChatConversation } from '@/common/config/storage';
import type { PresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { resolveAssistantAvatar } from '@/renderer/utils/model/assistantAvatar';
import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import type { AgentLogoMap } from '@/renderer/utils/model/agentLogo';

/**
 * Resolve the effective runtime backend for a conversation.
 *
 * New assistant-led flows should pass the assistant backend explicitly when it
 * is known. Legacy conversations may still fall back to `extra.backend`.
 */
export function resolveConversationBackend(
  conversation: TChatConversation | undefined,
  presetAssistantBackend?: string
): string | undefined {
  const explicitAssistantBackend = presetAssistantBackend?.trim();
  if (explicitAssistantBackend) {
    return explicitAssistantBackend;
  }

  if (!conversation) return undefined;

  const conversationAssistantBackend = conversation.assistant?.backend?.trim();
  if (conversationAssistantBackend) {
    return conversationAssistantBackend;
  }

  if (conversation.type === 'acp') {
    return conversation.extra?.backend;
  }

  if (conversation.type === 'openclaw-gateway') {
    return conversation.extra?.backend || 'openclaw-gateway';
  }

  if (conversation.type === 'remote') {
    return 'remote';
  }

  return conversation.type;
}

export type ConversationLeadingMark =
  | {
      kind: 'emoji';
      value: string;
      label: string;
    }
  | {
      kind: 'image';
      value: string;
      label: string;
    }
  | {
      kind: 'fallback';
      label: string;
    }
  | {
      kind: 'assistant_fallback';
      label: string;
    };

export function resolveConversationLeadingMark(
  conversation: TChatConversation,
  assistantInfo: PresetAssistantInfo | undefined,
  logos: AgentLogoMap
): ConversationLeadingMark {
  if (assistantInfo) {
    if (assistantInfo.isFallback) {
      return {
        kind: 'assistant_fallback',
        label: assistantInfo.name,
      };
    }

    return assistantInfo.isEmoji
      ? {
          kind: 'emoji',
          value: assistantInfo.logo,
          label: assistantInfo.name,
        }
      : {
          kind: 'image',
          value: assistantInfo.logo,
          label: assistantInfo.name,
        };
  }

  if (conversation.assistant) {
    const assistantLabel = conversation.assistant.name.trim() || conversation.assistant.id;
    const assistantAvatar = resolveAssistantAvatar(conversation.assistant.avatar);
    if (assistantAvatar.kind === 'emoji') {
      return {
        kind: 'emoji',
        value: assistantAvatar.value,
        label: assistantLabel,
      };
    }
    if (assistantAvatar.kind === 'image') {
      return {
        kind: 'image',
        value: assistantAvatar.value,
        label: assistantLabel,
      };
    }

    return {
      kind: 'assistant_fallback',
      label: assistantLabel,
    };
  }

  const backendKey = resolveConversationBackend(conversation)?.trim() || 'agent';
  const logo = resolveAgentLogo(logos, { backend: backendKey });
  if (logo) {
    return {
      kind: 'image',
      value: logo,
      label: backendKey,
    };
  }

  return {
    kind: 'fallback',
    label: backendKey,
  };
}
