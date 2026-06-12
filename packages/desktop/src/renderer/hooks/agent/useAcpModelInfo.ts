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
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import {
  getManagedCliSelectableModels,
  resolveManagedRuntimeCliTarget,
  MANAGED_NEWAPI_PROVIDER_ID,
} from '@/common/types/agent/managedRuntimeCli';
import { configService } from '@/common/config/configService';
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
  const prevBackendRef = useRef(backend);
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

  const managedModelInfoForUpdateRef = useRef<AcpModelInfo | null>(null);

  const updateModelInfo = useCallback(
    (nextModelInfo: AcpModelInfo) => {
      // Merge managed provider (POUNDING API) models into every write path.
      // This ensures the dropdown always shows all available models regardless
      // of which code path writes (reloadModelInfo, acp_model_info stream, etc.)
      const managed = managedModelInfoForUpdateRef.current;
      let merged = nextModelInfo;
      if (managed && managed.available_models.length > 0) {
        const existingIds = new Set(nextModelInfo.available_models.map((m) => m.id));
        const newModels = managed.available_models.filter((m) => !existingIds.has(m.id));
        if (newModels.length > 0) {
          merged = {
            ...nextModelInfo,
            available_models: [...nextModelInfo.available_models, ...newModels],
          };
        }
      }
      void mutateModelInfo((prev) => {
        return isSameModelInfo(prev, merged) ? prev : merged;
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

  // Managed runtime CLI fallback for OpenClaw etc.
  const { data: providers } = useProvidersQuery();
  const cliTarget = useMemo(() => {
    if (!backend) return undefined;
    return resolveManagedRuntimeCliTarget(backend);
  }, [backend]);
  const managedModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!cliTarget || !providers) return null;
    const managedProvider = providers.find((p) => p.id === MANAGED_NEWAPI_PROVIDER_ID);
    if (!managedProvider) return null;
    const models = getManagedCliSelectableModels(managedProvider, cliTarget);
    if (models.length === 0) return null;
    const prefs = (configService.get('newApi.desktop.cliModelPrefs') ?? {}) as Record<string, string>;
    const currentModelId = prefs[cliTarget] ?? models[0];
    return {
      current_model_id: currentModelId,
      current_model_label: currentModelId,
      available_models: models.map((id) => ({ id, label: id })),
    };
  }, [cliTarget, providers]);

  // Sync managedModelInfo to ref for use in updateModelInfo
  useEffect(() => {
    managedModelInfoForUpdateRef.current = managedModelInfo;
  }, [managedModelInfo]);

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
    if (prevBackendRef.current !== backend) {
      // Backend change means models come from a different CLI —
      // reset user-changed flag so the managed fallback can populate
      // the model selector for the new backend.
      hasUserChangedModel.current = false;
      prevBackendRef.current = backend;
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

  // Poll backend for model info while window has focus.
  // Originally Claude-only; now extended to all ACP backends so users
  // see model info for Codex, Gemini, Qwen, Hermes, and others.
  useEffect(() => {
    if (!enabled) return;
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
          // Preserve existing available_models — codex_model_info only provides
          // the current model, not the full list. Wiping available_models breaks
          // the model selector dropdown for Hermes/OpenClaw.
          const current = modelInfoRef.current;
          updateModelInfo({
            current_model_id: data.model,
            current_model_label: data.model,
            available_models: current?.available_models ?? [],
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
        let acpSucceeded = false;

        // Step 1: Try ACP session/set_model (best-effort).
        // Codex and OpenCode do NOT support in-session model switching — their
        // config files are only read at process launch. For these CLIs, ACP
        // set_model is a no-op; we skip it and go straight to disk config write
        // + session kill so the next message rebuilds with the new model.
        const needsProcessRestart = cliTarget === 'codex' || cliTarget === 'opencode';

        if (!needsProcessRestart) {
          try {
            await prepareRuntime?.();
            const confirmed = await ipcBridge.acpConversation.setModel.invoke({ conversation_id, model_id });
            confirmedModelInfo = confirmed.model_info ?? null;
            if (confirmedModelInfo) {
              updateModelInfo(confirmedModelInfo);
            }
            acpSucceeded = true;
            logAcpModelInfo('select_model_acp_confirmed', {
              conversation_id,
              backend,
              model_id,
              confirmed_model_info: summarizeModelInfo(confirmedModelInfo),
            });
          } catch (error) {
            logAcpModelInfo('select_model_acp_failed_best_effort', {
              conversation_id,
              backend,
              requested_model_id: model_id,
              error: error instanceof Error ? error.message : String(error),
            });
            // Best-effort: continue to disk config write even if ACP fails.
          }
        } else {
          logAcpModelInfo('select_model_skipping_acp_needs_restart', {
            conversation_id,
            backend,
            cli_target: cliTarget,
            requested_model_id: model_id,
          });
        }

        // Step 2: Determine the confirmed model ID.
        // When ACP succeeded, use its confirmed value (which may be slot-normalized
        // for Claude). When ACP was skipped or failed, use the raw user-selected ID.
        const confirmedModelId = acpSucceeded
          ? confirmedModelInfo?.current_model_id || modelInfoRef.current?.current_model_id || model_id
          : model_id;

        onSelectModelSuccess?.(confirmedModelId);

        // Step 3: Persist to acp.config preferences.
        if (backend) {
          void savePreferredModelId(backend, confirmedModelId);
        }

        // Step 4: Write disk config and reconcile managed CLI runtime.
        // This is the critical path that ensures the CLI config files on disk
        // (settings.json, config.toml, opencode.json, etc.) reflect the new model.
        if (cliTarget) {
          try {
            const prefs = (configService.get('newApi.desktop.cliModelPrefs') ?? {}) as Record<string, string>;
            await configService.set('newApi.desktop.cliModelPrefs', { ...prefs, [cliTarget]: confirmedModelId });
            await ipcBridge.newApiAccount.reconcileModel.invoke({ cliTarget, modelId: confirmedModelId });
            logAcpModelInfo('select_model_cli_prefs_updated', {
              conversation_id,
              backend,
              cli_target: cliTarget,
              confirmed_model_id: confirmedModelId,
            });
          } catch (error) {
            logAcpModelInfo('select_model_cli_prefs_update_failed', {
              conversation_id,
              backend,
              cli_target: cliTarget,
              confirmed_model_id: confirmedModelId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Step 5: For CLIs that require process restart (Codex, OpenCode),
        // kill the current session so the next message rebuilds with new config.
        if (needsProcessRestart) {
          try {
            await ipcBridge.conversation.stop.invoke({ conversation_id });
            logAcpModelInfo('select_model_session_killed_for_restart', {
              conversation_id,
              backend,
              cli_target: cliTarget,
            });
          } catch (error) {
            logAcpModelInfo('select_model_session_kill_failed', {
              conversation_id,
              backend,
              cli_target: cliTarget,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Step 6: Refresh model info from backend.
        if (acpSucceeded) {
          void reloadModelInfo().catch(() => {});
        }

        logAcpModelInfo('select_model_complete', {
          conversation_id,
          backend,
          requested_model_id: model_id,
          confirmed_model_id: confirmedModelId,
          acp_succeeded: acpSucceeded,
          needs_restart: needsProcessRestart,
        });
      })().catch((error) => {
        console.error('[useAcpModelInfo] Failed to finalize model selection:', error);
      });
    },
    [
      backend,
      conversation_id,
      enabled,
      cliTarget,
      model_info,
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
