/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AionrsCapabilities } from '@process/agent/aionrs/protocol';
import { mergeWithCapabilities, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { useEffect, useMemo, useState } from 'react';

type UseAionrsCapabilitiesReturn = {
  capabilities: AionrsCapabilities | null;
  dynamicModes: AgentModeOption[];
  initialized: boolean;
};

function isAionrsCapabilities(value: unknown): value is AionrsCapabilities {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as { modes?: unknown }).modes);
}

export const useAionrsCapabilities = (conversationId: string): UseAionrsCapabilitiesReturn => {
  const [capabilities, setCapabilities] = useState<AionrsCapabilities | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setCapabilities(null);
    setInitialized(false);

    ipcBridge.acpConversation.getCapabilities
      .invoke({ conversationId })
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (result.success && result.data) {
          setCapabilities(result.data.capabilities);
          setInitialized(result.data.initialized);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setInitialized(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    const handleMessage = (message: IResponseMessage) => {
      if (message.conversation_id !== conversationId || message.type !== 'config_changed') {
        return;
      }

      if (!isAionrsCapabilities(message.data)) {
        return;
      }

      setCapabilities(message.data);
      setInitialized(true);
    };

    return ipcBridge.conversation.responseStream.on(handleMessage);
  }, [conversationId]);

  const dynamicModes = useMemo(
    () => mergeWithCapabilities('aionrs', capabilities?.modes ?? null),
    [capabilities?.modes]
  );

  return {
    capabilities,
    dynamicModes,
    initialized,
  };
};
