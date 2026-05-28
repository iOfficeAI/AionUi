/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { savePreferredModelId } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents, type AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

function isSameModelInfo(a: AcpModelInfo | null | undefined, b: AcpModelInfo | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.current_model_id !== b.current_model_id ||
    a.current_model_label !== b.current_model_label ||
    a.available_models.length !== b.available_models.length
  ) {
    return false;
  }
  return a.available_models.every((model, index) => {
    const other = b.available_models[index];
    return other && other.id === model.id && other.label === model.label;
  });
}

export interface UseAcpModelInfoResult {
  model_info: AcpModelInfo | null;
  /** True when the agent exposes a switchable model list */
  canSwitch: boolean;
  /** Switch the active model and persist via IPC */
  selectModel: (model_id: string) => void;
}

/**
 * Loads ACP model info for a conversation, syncs it from real-time
 * `acp_model_info` / `codex_model_info` stream events, and exposes a
 * setter that calls `setModel` over IPC. Mirrors the logic that
 * AcpModelSelector previously kept inline so both the dropdown and the
 * mobile action sheet can drive the same source of truth.
 */
export const useAcpModelInfo = ({
  conversation_id,
  backend,
  initialModelId,
}: {
  conversation_id: string;
  backend?: string;
  initialModelId?: string;
}): UseAcpModelInfoResult => {
  const [model_info, setModelInfo] = useState<AcpModelInfo | null>(null);
  const hasUserChangedModel = useRef(false);
  const prevConversationIdRef = useRef(conversation_id);

  const updateModelInfo = useCallback((nextModelInfo: AcpModelInfo) => {
    setModelInfo((prev) => (isSameModelInfo(prev, nextModelInfo) ? prev : nextModelInfo));
  }, []);

  const { data: agentsData } = useSWR<AgentMetadata[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);
  const handshakeModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!backend || !agentsData?.length) return null;
    const matched = agentsData.find((a) => (a.backend ?? a.agent_type) === backend);
    const info = matched?.handshake?.available_models as AcpModelInfo | undefined;
    if (!info || !Array.isArray(info.available_models) || info.available_models.length === 0) return null;
    return info;
  }, [agentsData, backend]);

  const loadFallbackModelInfo = useCallback(
    (options?: { preserveInitialModel?: boolean }) => {
      const source = handshakeModelInfo;
      if (!source || source.available_models.length === 0) return false;

      const effectiveModelId =
        options?.preserveInitialModel && initialModelId ? initialModelId : (source.current_model_id ?? null);

      updateModelInfo({
        ...source,
        current_model_id: effectiveModelId,
        current_model_label:
          (effectiveModelId && source.available_models.find((m) => m.id === effectiveModelId)?.label) ||
          effectiveModelId,
      });
      return true;
    },
    [handshakeModelInfo, initialModelId, updateModelInfo]
  );

  const reloadModelInfo = useCallback(
    async (options?: { preserveInitialModel?: boolean }) => {
      let result: Awaited<ReturnType<typeof ipcBridge.acpConversation.getModel.invoke>> | null = null;
      try {
        result = await ipcBridge.acpConversation.getModel.invoke({ conversation_id });
      } catch {
        // 404 before warmup — fall through to handshake fallback.
      }

      if (result?.model_info) {
        const info = result.model_info;
        if (info.available_models?.length > 0) {
          // Backend's `current_model_id` is the source of truth for an active
          // session. Only fall back to `initialModelId` when the backend has
          // no current model yet (genuine pre-handshake case) — never
          // override a known backend value, otherwise re-entering an old
          // conversation would clobber a switch the user already made
          // (ELECTRON-1RV).
          if (
            options?.preserveInitialModel &&
            initialModelId &&
            !info.current_model_id &&
            info.available_models.some((m) => m.id === initialModelId)
          ) {
            const match = info.available_models.find((m) => m.id === initialModelId);
            if (match) {
              updateModelInfo({
                ...info,
                current_model_id: initialModelId,
                current_model_label: match.label || initialModelId,
              });
              return;
            }
          }
          updateModelInfo(info);
          return;
        }
      }

      if (backend) {
        loadFallbackModelInfo(options);
      }
    },
    [backend, conversation_id, initialModelId, loadFallbackModelInfo, updateModelInfo]
  );

  useEffect(() => {
    if (prevConversationIdRef.current !== conversation_id) {
      // Resetting on conversation change is intentional — the in-flight
      // model selection belongs to the previous conversation, not this one.
      hasUserChangedModel.current = false;
      prevConversationIdRef.current = conversation_id;
    }
    void reloadModelInfo({ preserveInitialModel: true }).catch(() => {});
  }, [conversation_id, backend, initialModelId, reloadModelInfo]);

  useEffect(() => {
    if (!backend || !handshakeModelInfo) return;
    if (model_info && model_info.available_models.length > 0) return;
    if (hasUserChangedModel.current) return;
    loadFallbackModelInfo({ preserveInitialModel: true });
  }, [backend, handshakeModelInfo, model_info, loadFallbackModelInfo]);

  // Claude doesn't push acp_model_info on warmup; poll while window has focus.
  useEffect(() => {
    if (backend !== 'claude') return;
    if (model_info) return;
    const refresh = () => {
      void reloadModelInfo().catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [backend, model_info, reloadModelInfo]);

  useEffect(() => {
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'acp_model_info' && message.data) {
        const incoming = message.data as AcpModelInfo;
        // Same rule as reloadModelInfo: backend's current_model_id wins.
        // Only honor initialModelId when the stream payload has none.
        if (
          initialModelId &&
          !incoming.current_model_id &&
          incoming.available_models?.length > 0 &&
          incoming.available_models.some((m) => m.id === initialModelId)
        ) {
          const match = incoming.available_models.find((m) => m.id === initialModelId);
          if (match) {
            updateModelInfo({
              ...incoming,
              current_model_id: initialModelId,
              current_model_label: match.label || initialModelId,
            });
            return;
          }
        }
        updateModelInfo(incoming);
      } else if (message.type === 'codex_model_info' && message.data) {
        const data = message.data as { model: string };
        if (data.model) {
          updateModelInfo({
            current_model_id: data.model,
            current_model_label: data.model,
            available_models: [],
          });
        }
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversation_id, initialModelId, updateModelInfo]);

  const selectModel = useCallback(
    (model_id: string) => {
      hasUserChangedModel.current = true;
      setModelInfo((prev) => {
        if (!prev) return prev;
        const selectedModel = prev.available_models.find((m) => m.id === model_id);
        return {
          ...prev,
          current_model_id: model_id,
          current_model_label: selectedModel?.label || model_id,
        };
      });
      ipcBridge.acpConversation.setModel
        .invoke({ conversation_id, model_id })
        .then(() => {
          ipcBridge.acpConversation.getModel
            .invoke({ conversation_id })
            .then((result) => {
              if (result?.model_info) updateModelInfo(result.model_info);
            })
            .catch(() => {});
        })
        .catch((error) => {
          console.error('[useAcpModelInfo] Failed to set model:', error);
        });
      // Persist for the Guid page (next session default) and for this same
      // conversation's `extra.current_model_id` so it stops shadowing the
      // backend's authoritative value.
      if (backend) {
        void savePreferredModelId(backend, model_id);
      }
      void ipcBridge.conversation.update
        .invoke({
          id: conversation_id,
          updates: { extra: { current_model_id: model_id } as TChatConversation['extra'] },
          merge_extra: true,
        })
        .catch((error) => {
          console.error('[useAcpModelInfo] Failed to persist current_model_id:', error);
        });
    },
    [backend, conversation_id, updateModelInfo]
  );

  const canSwitch = Boolean(model_info && model_info.available_models.length > 0);

  return { model_info, canSwitch, selectModel };
};
