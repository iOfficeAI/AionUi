/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import type { IChannelAssistantBindingRead, IChannelAssistantBindingWrite } from '@/common/types/channel/channel';

/**
 * Channel settings still need to read legacy assistant bindings while the
 * backend/config migration remains in progress. New writes must use
 * `IChannelAssistantBindingWrite` and should never introduce these legacy keys.
 */
export type ChannelAssistantBinding = IChannelAssistantBindingRead | string | undefined;

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

  if (typeof saved === 'string') {
    return findAssistantIdByBackend(saved, assistants) || getDefaultChannelAssistant(assistants)?.id;
  }

  const explicitAssistantId =
    (typeof saved.assistant_id === 'string' ? saved.assistant_id : undefined) ||
    (typeof saved.custom_agent_id === 'string' ? saved.custom_agent_id : undefined);

  if (explicitAssistantId && assistants.some((assistant) => assistant.id === explicitAssistantId)) {
    return explicitAssistantId;
  }

  const backend =
    (typeof saved.backend === 'string' ? saved.backend : undefined) ||
    (typeof saved.agent_type === 'string' ? saved.agent_type : undefined);

  return findAssistantIdByBackend(backend, assistants) || getDefaultChannelAssistant(assistants)?.id;
}

export function buildChannelAssistantBinding(assistant: Assistant): IChannelAssistantBindingWrite {
  return {
    assistant_id: assistant.id,
  };
}

function findAssistantIdByBackend(backend: string | undefined, assistants: Assistant[]): string | undefined {
  if (!backend) return undefined;

  return (
    assistants.find((assistant) => assistant.source === 'bare' && assistant.preset_agent_type === backend)?.id ||
    assistants.find((assistant) => assistant.preset_agent_type === backend)?.id
  );
}
