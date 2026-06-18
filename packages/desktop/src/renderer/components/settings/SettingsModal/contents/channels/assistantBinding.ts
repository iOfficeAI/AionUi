/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { IChannelAssistantBindingRead, IChannelAssistantBindingWrite } from '@/common/types/channel/channel';

/**
 * Channel settings UI consumes backend-normalized assistant bindings.
 * Legacy backend/custom-agent migration is handled by aionCore during channel
 * settings reads; renderer-side selection must only trust canonical
 * `assistant_id` bindings.
 */
export type ChannelAssistantBinding = IChannelAssistantBindingRead | undefined;

export function getDefaultChannelAssistant(assistants: Assistant[]): Assistant | undefined {
  return (
    assistants.find((assistant) => assistant.source === 'bare' && assistant.preset_agent_type === 'aionrs') ||
    assistants.find((assistant) => assistant.preset_agent_type === 'aionrs') ||
    assistants[0]
  );
}

export function resolveChannelAssistantId(saved: ChannelAssistantBinding, assistants: Assistant[]): string | undefined {
  if (!saved) {
    return getDefaultChannelAssistant(assistants)?.id;
  }

  const explicitAssistantId = typeof saved.assistant_id === 'string' ? saved.assistant_id : undefined;

  if (explicitAssistantId && assistants.some((assistant) => assistant.id === explicitAssistantId)) {
    return explicitAssistantId;
  }

  return getDefaultChannelAssistant(assistants)?.id;
}

export function buildChannelAssistantBinding(assistant: Assistant): IChannelAssistantBindingWrite {
  return {
    assistant_id: assistant.id,
  };
}
