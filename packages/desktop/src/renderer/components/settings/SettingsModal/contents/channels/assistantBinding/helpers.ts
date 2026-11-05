/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isAionrsAssistant, type Assistant } from '@/common/types/agent/assistantTypes';
import type { IChannelAssistantBindingRead, IChannelAssistantBindingWrite } from '@/common/types/channel/channel';

/**
 * Channel settings UI consumes backend-normalized assistant bindings.
 * Legacy backend/custom-agent migration is handled by aionCore during channel
 * settings reads; renderer-side selection must only trust canonical
 * `assistant_id` bindings.
 */
export type ChannelAssistantBinding = IChannelAssistantBindingRead | undefined;

export type ResolvedChannelAssistantSelection = {
  assistantId?: string;
  hasBrokenSavedAssistant: boolean;
};

export function getDefaultChannelAssistant(assistants: Assistant[]): Assistant | undefined {
  return (
    assistants.find((assistant) => assistant.source === 'generated' && isAionrsAssistant(assistant)) ||
    assistants.find((assistant) => isAionrsAssistant(assistant)) ||
    assistants[0]
  );
}

export function resolveChannelAssistantId(saved: ChannelAssistantBinding, assistants: Assistant[]): string | undefined {
  return resolveChannelAssistantSelection(saved, assistants).assistantId;
}

export function resolveChannelAssistantSelection(
  saved: ChannelAssistantBinding,
  assistants: Assistant[]
): ResolvedChannelAssistantSelection {
  if (!saved) {
    return {
      assistantId: getDefaultChannelAssistant(assistants)?.id,
      hasBrokenSavedAssistant: false,
    };
  }

  const explicitAssistantId = typeof saved.assistant_id === 'string' ? saved.assistant_id : undefined;

  if (explicitAssistantId && assistants.some((assistant) => assistant.id === explicitAssistantId)) {
    return {
      assistantId: explicitAssistantId,
      hasBrokenSavedAssistant: false,
    };
  }

  if (explicitAssistantId || saved.custom_agent_id || saved.backend || saved.agent_type) {
    return {
      assistantId: undefined,
      hasBrokenSavedAssistant: true,
    };
  }

  return {
    assistantId: getDefaultChannelAssistant(assistants)?.id,
    hasBrokenSavedAssistant: false,
  };
}

export function buildChannelAssistantBinding(assistant: Assistant): IChannelAssistantBindingWrite {
  return {
    assistant_id: assistant.id,
  };
}
