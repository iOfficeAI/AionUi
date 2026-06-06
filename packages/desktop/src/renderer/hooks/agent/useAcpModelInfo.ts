/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { savePreferredModelId } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents, type AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';

type AcpModelInfoKey = readonly ['acp-model-info', string];
type AcpModelInfoFetchResult = {
  model_info: AcpModelInfo | null;
  missing_active_session: boolean;
};

const getAcpModelInfoKey = (conversation_id: string): AcpModelInfoKey => ['acp-model-info', conversation_id] as const;

const summarizeModelInfo = (info: AcpModelInfo | null | undefined) => {
  if (!info) return null;
  return {
    current_model_id: info.current_model_id,
    current_model_label: info.current_model_label,
    available_models: info.available_models.map((model) => `${model.id}:${model.label}`),
  };
};

const logAcpModelInfo = (event: string, data: Record<string, unknown>) => {
  const entry = { event, ...data };
  console.info('[useAcpModelInfo]', entry);
  void ipcBridge.application.writeRendererLog
    .invoke({
      level: 'info',
      tag: 'useAcpModelInfo',
      message: event,
      data: entry,
    })
    .catch(() => {});
};

const fetchAcpModelInfoResult = async ([, conversation_id]: AcpModelInfoKey): Promise<AcpModelInfoFetchResult> => {
  try {
    const result = await ipcBridge.acpConversation.getModel.invoke({ conversation_id });
    return { model_info: result?.model_info ?? null, missing_active_session: false };
  } catch (error) {
    const missingActiveSession = isBackendHttpError(error) && error.status === 404;
    if (!missingActiveSession) {
      logAcpModelInfo('fetch_failed', {
        conversation_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // 404 before warmup or between ACP evict/rebuild. reloadModelInfo must
    // not fall back directly; the no-cache fallback effect handles genuine
    // first-load cases without overwriting an established model cache.
    return { model_info: null, missing_active_session: missingActiveSession };
  }
};

const fetchAcpModelInfo = async (key: AcpModelInfoKey): Promise<AcpModelInfo | null> =>
  (await fetchAcpModelInfoResult(key)).model_info;

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
  prepareRuntime,
  enabled = true,
  onSelectModelSuccess,
  onSelectModelFailed,
}: {
  conversation_id: string;
  backend?: string;
  initialModelId?: string;
  prepareRuntime?: () => Promise<void>;
  enabled?: boolean;
  onSelectModelSuccess?: (model_id: string) => void;
  onSelectModelFailed?: (model_id: string, error: unknown) => void;
}): UseAcpModelInfoResult => {
  const hasUserChangedModel = useRef(false);
  const prevConversationIdRef = useRef(conversation_id);
  const modelInfoRef = useRef<AcpModelInfo | null>(null);
  const handshakeModelInfoRef = useRef<AcpModelInfo | null>(null);
  const scheduledReloadTimersRef = useRef<number[]>([]);
  const modelInfoKey = useMemo(() => getAcpModelInfoKey(conversation_id), [conversation_id]);
  const {
    data: cachedModelInfo,
    isLoading: isModelInfoLoading,
    mutate: mutateModelInfo,
  } = useSWR<AcpModelInfo | null>(enabled ? modelInfoKey : null, fetchAcpModelInfo, { revalidateOnMount: false });
  const model_info = enabled ? (cachedModelInfo ?? null) : null;

  useEffect(() => {
    modelInfoRef.current = model_info;
  }, [model_info]);

  const updateModelInfo = useCallback(
    (nextModelInfo: AcpModelInfo) => {
      void mutateModelInfo((prev) => {
        return isSameModelInfo(prev, nextModelInfo) ? prev : nextModelInfo;
      }, false);
    },
    [mutateModelInfo]
  );

  const { data: agentsData } = useSWR<AgentMetadata[]>(enabled ? DETECTED_AGENTS_SWR_KEY : null, fetchDetectedAgents);
  const handshakeModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!backend || !agentsData?.length) return null;
    const matched = agentsData.find((a) => (a.backend ?? a.agent_type) === backend);
    const info = matched?.handshake?.available_models as AcpModelInfo | undefined;
    if (!info || !Array.isArray(info.available_models) || info.available_models.length === 0) return null;
    return info;
  }, [agentsData, backend]);

  useEffect(() => {
    handshakeModelInfoRef.current = handshakeModelInfo;
  }, [handshakeModelInfo]);

  const loadFallbackModelInfo = useCallback(
    (options?: { preserveInitialModel?: boolean }) => {
      if (!enabled) return false;
      const source = handshakeModelInfoRef.current;
      if (!source || source.available_models.length === 0) return false;

      const effectiveModelId =
        options?.preserveInitialModel && initialModelId ? initialModelId : (source.current_model_id ?? null);

      logAcpModelInfo('fallback_from_handshake', {
        conversation_id,
        backend,
        preserve_initial_model: Boolean(options?.preserveInitialModel),
        initial_model_id: initialModelId,
        effective_model_id: effectiveModelId,
        source_model_info: summarizeModelInfo(source),
      });

      updateModelInfo({
        ...source,
        current_model_id: effectiveModelId,
        current_model_label:
          (effectiveModelId && source.available_models.find((m) => m.id === effectiveModelId)?.label) ||
          effectiveModelId,
      });
      return true;
    },
    [backend, conversation_id, enabled, initialModelId, updateModelInfo]
  );

  const reloadModelInfo = useCallback(
    async (options?: { preserveInitialModel?: boolean }): Promise<boolean> => {
      if (!enabled) return false;
      try {
        await prepareRuntime?.();
      } catch (error) {
        logAcpModelInfo('prepare_runtime_failed_before_model_reload', {
          conversation_id,
          backend,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }

      const { model_info: info, missing_active_session: missingActiveSession } =
        await fetchAcpModelInfoResult(modelInfoKey);

      if (info?.available_models?.length) {
        // Backend's `current_model_id` is the source of truth for an active
        // session. Only fall back to `initialModelId` when the backend has
        // no current model yet (genuine pre-handshake case); never
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
            return true;
          }
        }
        updateModelInfo(info);
        return true;
      }

      if (backend) {
        const cached = modelInfoRef.current;
        if (cached?.available_models?.length) {
          logAcpModelInfo('reload_no_backend_model_keep_cached_model', {
            conversation_id,
            backend,
            missing_active_session: missingActiveSession,
            cached_model_info: summarizeModelInfo(cached),
          });
          return false;
        }
        if (missingActiveSession) {
          return false;
        }
        return loadFallbackModelInfo(options);
      }
      return false;
    },
    [
      backend,
      conversation_id,
      enabled,
      initialModelId,
      loadFallbackModelInfo,
      modelInfoKey,
      prepareRuntime,
      updateModelInfo,
    ]
  );

  const clearScheduledReloads = useCallback(() => {
    scheduledReloadTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    scheduledReloadTimersRef.current = [];
  }, []);

  const scheduleModelInfoReload = useCallback(
    (_reason: string, delays: number[]) => {
      clearScheduledReloads();
      scheduledReloadTimersRef.current = delays.map((delay) =>
        window.setTimeout(() => {
          void reloadModelInfo().catch(() => {});
        }, delay)
      );
    },
    [clearScheduledReloads, reloadModelInfo]
  );

  useEffect(() => {
    return () => {
      clearScheduledReloads();
    };
  }, [clearScheduledReloads, conversation_id]);

  useEffect(() => {
    if (!enabled) {
      clearScheduledReloads();
      return;
    }
    if (prevConversationIdRef.current !== conversation_id) {
      // Resetting on conversation change is intentional; the in-flight
      // model selection belongs to the previous conversation, not this one.
      hasUserChangedModel.current = false;
      prevConversationIdRef.current = conversation_id;
    }
    void reloadModelInfo({ preserveInitialModel: true }).catch(() => {});
  }, [conversation_id, backend, enabled, initialModelId, reloadModelInfo, clearScheduledReloads]);

  useEffect(() => {
    if (!enabled) return;
    if (!backend || !handshakeModelInfo) return;
    if (model_info && model_info.available_models.length > 0) return;
    if (isModelInfoLoading) return;
    if (hasUserChangedModel.current) return;
    loadFallbackModelInfo({ preserveInitialModel: true });
  }, [backend, enabled, handshakeModelInfo, isModelInfoLoading, model_info, loadFallbackModelInfo]);

  // Claude doesn't push acp_model_info on warmup; poll while window has focus.
  useEffect(() => {
    if (!enabled) return;
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
  }, [backend, enabled, model_info, reloadModelInfo]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'start') {
        scheduleModelInfoReload('start', [250, 1500]);
      } else if (message.type === 'finish' || message.type === 'error') {
        scheduleModelInfoReload(message.type, [250, 1500]);
      } else if (message.type === 'agent_status') {
        const data = message.data as { status?: string } | undefined;
        if (data?.status === 'session_active') {
          scheduleModelInfoReload('session_active', [250]);
        }
      }

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
  }, [conversation_id, enabled, initialModelId, scheduleModelInfoReload, updateModelInfo]);

  const selectModel = useCallback(
    (model_id: string) => {
      if (!enabled) return;
      hasUserChangedModel.current = true;
      const previousModelInfo = model_info;
      logAcpModelInfo('select_model_requested', {
        conversation_id,
        backend,
        requested_model_id: model_id,
        previous_model_info: summarizeModelInfo(previousModelInfo),
      });

      void (async () => {
        let confirmedModelInfo: AcpModelInfo | null = null;
        try {
          await prepareRuntime?.();
          const confirmed = await ipcBridge.acpConversation.setModel.invoke({ conversation_id, model_id });
          confirmedModelInfo = confirmed.model_info ?? null;
          if (confirmedModelInfo) {
            updateModelInfo(confirmedModelInfo);
          }
        } catch (error) {
          hasUserChangedModel.current = false;
          logAcpModelInfo('select_model_failed', {
            conversation_id,
            backend,
            requested_model_id: model_id,
            error: error instanceof Error ? error.message : String(error),
          });
          console.error('[useAcpModelInfo] Failed to set model:', error);
          if (previousModelInfo) {
            updateModelInfo(previousModelInfo);
          } else {
            void mutateModelInfo(null, false);
          }
          onSelectModelFailed?.(model_id, error);
          void reloadModelInfo().catch(() => {});
          return;
        }

        logAcpModelInfo('select_model_confirmed', {
          conversation_id,
          backend,
          requested_model_id: model_id,
          confirmed_model_info: summarizeModelInfo(confirmedModelInfo),
        });
        const refreshed = await reloadModelInfo().catch(() => false);
        logAcpModelInfo('select_model_refresh_completed', {
          conversation_id,
          backend,
          requested_model_id: model_id,
          refreshed,
        });

        const confirmedModelId =
          confirmedModelInfo?.current_model_id || modelInfoRef.current?.current_model_id || model_id;
        onSelectModelSuccess?.(confirmedModelId);

        // Persist only after the active ACP session accepts the model switch.
        if (backend) {
          void savePreferredModelId(backend, confirmedModelId);
        }
        logAcpModelInfo('select_model_preference_save_queued', {
          conversation_id,
          backend,
          requested_model_id: model_id,
          confirmed_model_id: confirmedModelId,
        });
      })().catch((error) => {
        console.error('[useAcpModelInfo] Failed to finalize model selection:', error);
      });
    },
    [
      backend,
      conversation_id,
      enabled,
      model_info,
      mutateModelInfo,
      onSelectModelFailed,
      onSelectModelSuccess,
      prepareRuntime,
      reloadModelInfo,
      updateModelInfo,
    ]
  );

  const canSwitch = enabled && Boolean(model_info && model_info.available_models.length > 0);

  return { model_info, canSwitch, selectModel };
};
