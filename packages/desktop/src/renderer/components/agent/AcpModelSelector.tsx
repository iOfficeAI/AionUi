/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import {
  buildManagedRuntimeModelId,
  getManagedCliSelectableModels,
  getManagedRuntimeModelDisplayLabel,
  MANAGED_NEWAPI_PROVIDER_ID,
  resolveManagedModelIdFromRuntime,
  resolveManagedRuntimeCliTarget,
} from '@/common/types/agent/managedRuntimeCli';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { useNewApiAccount } from '@/renderer/hooks/context/NewApiAccountContext';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents, type AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import MarqueePillLabel from './MarqueePillLabel';

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

/**
 * Model selector for ACP-based agents.
 * Fetches model info via IPC and listens for real-time updates via responseStream.
 * Renders three states:
 * - null model info: disabled "Use CLI model" button (backward compatible)
 * - no available_models: read-only display of current model name
 * - has available_models: clickable dropdown selector
 *
 * When backend and initialModelId are provided, the component can show
 * cached model info before the agent manager is created (pre-first-message).
 * Uses MarqueePillLabel for adaptive width with marquee on hover.
 */
const AcpModelSelector: React.FC<{
  conversation_id: string;
  /** ACP backend name for loading cached models (e.g., 'claude', 'qwen') */
  backend?: string;
  /** Pre-selected model ID from Guid page */
  initialModelId?: string;
}> = ({ conversation_id, backend, initialModelId }) => {
  const { t } = useTranslation();
  const [model_info, setModelInfo] = useState<AcpModelInfo | null>(null);
  const { data: modelConfig } = useProvidersQuery();
  useNewApiAccount();
  // Track whether user has manually switched model via dropdown
  const hasUserChangedModel = useRef(false);
  // Track the last conversation_id to detect tab switches
  const prevConversationIdRef = useRef(conversation_id);
  const cliTarget = resolveManagedRuntimeCliTarget(backend);
  const managedProvider = useMemo(
    () => modelConfig?.find((provider) => provider.id === MANAGED_NEWAPI_PROVIDER_ID),
    [modelConfig]
  );
  const managedSelectableModels = useMemo(() => getManagedCliSelectableModels(managedProvider), [managedProvider]);
  const useManagedCliModels = Boolean(cliTarget && managedSelectableModels.length > 0);
  const normalizedInitialManagedModelId = useMemo(() => {
    if (!useManagedCliModels || !cliTarget) return initialModelId ?? null;
    const normalized = resolveManagedModelIdFromRuntime(cliTarget, initialModelId);
    return normalized && managedSelectableModels.includes(normalized) ? normalized : null;
  }, [cliTarget, initialModelId, managedSelectableModels, useManagedCliModels]);
  const managedFallbackModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!useManagedCliModels || !cliTarget || managedSelectableModels.length === 0) return null;
    const preferredManagedModel = configService.get('newApi.desktop.cliModelPrefs')?.[cliTarget];
    const current_model_id =
      normalizedInitialManagedModelId ||
      (preferredManagedModel && managedSelectableModels.includes(preferredManagedModel)
        ? preferredManagedModel
        : null) ||
      managedSelectableModels[0] ||
      null;
    return {
      current_model_id,
      current_model_label: current_model_id,
      available_models: managedSelectableModels.map((modelId) => ({
        id: modelId,
        label: modelId,
      })),
    };
  }, [cliTarget, managedSelectableModels, normalizedInitialManagedModelId, useManagedCliModels]);

  const normalizeManagedModelInfo = useCallback(
    (info: AcpModelInfo): AcpModelInfo => {
      if (!useManagedCliModels || !cliTarget) return info;

      const available_models = managedSelectableModels.map((modelId) => ({ id: modelId, label: modelId }));

      const current_model_id =
        resolveManagedModelIdFromRuntime(cliTarget, info.current_model_id) ||
        resolveManagedModelIdFromRuntime(cliTarget, info.current_model_label) ||
        available_models[0]?.id ||
        null;

      return {
        current_model_id,
        current_model_label:
          current_model_id ||
          getManagedRuntimeModelDisplayLabel(info.current_model_label) ||
          getManagedRuntimeModelDisplayLabel(info.current_model_id) ||
          null,
        available_models,
      };
    },
    [cliTarget, managedSelectableModels, useManagedCliModels]
  );

  const updateModelInfo = useCallback((nextModelInfo: AcpModelInfo) => {
    setModelInfo((prev) => (isSameModelInfo(prev, nextModelInfo) ? prev : nextModelInfo));
  }, []);

  // Primary fallback: `handshake.available_models` persisted on the
  // `agent_metadata` row and served by `GET /api/agents`. Populated after
  // the agent has completed at least one session/new, so it survives
  // restarts and lets us render the model list before warmup finishes.
  const { data: agentsData } = useSWR<AgentMetadata[]>(DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents);
  const handshakeModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!backend || !agentsData?.length) return null;
    const matched = agentsData.find((a) => (a.backend ?? a.agent_type) === backend);
    const info = matched?.handshake?.available_models as AcpModelInfo | undefined;
    if (!info || !Array.isArray(info.available_models) || info.available_models.length === 0) return null;
    return normalizeManagedModelInfo(info);
  }, [agentsData, backend, normalizeManagedModelInfo]);

  const loadFallbackModelInfo = useCallback(
    (backendKey: string, options?: { preserveInitialModel?: boolean }) => {
      const source = handshakeModelInfo || managedFallbackModelInfo;
      if (!source || source.available_models.length === 0) return false;

      if (backendKey === 'codex') {
        console.log('[AcpModelSelector][codex] Loaded fallback model info:', source);
      }

      const effectiveModelId =
        options?.preserveInitialModel && normalizedInitialManagedModelId
          ? normalizedInitialManagedModelId
          : (source.current_model_id ?? null);

      updateModelInfo({
        ...source,
        current_model_id: effectiveModelId,
        current_model_label:
          (effectiveModelId && source.available_models.find((m) => m.id === effectiveModelId)?.label) ||
          effectiveModelId,
      });
      return true;
    },
    [handshakeModelInfo, managedFallbackModelInfo, normalizedInitialManagedModelId, updateModelInfo]
  );

  const reloadModelInfo = useCallback(
    async (options?: { preserveInitialModel?: boolean }) => {
      let result: Awaited<ReturnType<typeof ipcBridge.acpConversation.getModel.invoke>> | null = null;
      try {
        result = await ipcBridge.acpConversation.getModel.invoke({ conversation_id });
      } catch {
        // Session may not be warmed up yet (404) — fall through to fallback.
      }

      if (result?.model_info) {
        const info = normalizeManagedModelInfo(result.model_info);
        if (backend === 'codex') {
          console.log('[AcpModelSelector][codex] Initial model info:', info);
        }
        if (info.available_models?.length > 0) {
          if (
            options?.preserveInitialModel &&
            normalizedInitialManagedModelId &&
            !hasUserChangedModel.current &&
            info.current_model_id !== normalizedInitialManagedModelId
          ) {
            const match = info.available_models.find((m) => m.id === normalizedInitialManagedModelId);
            if (match) {
              updateModelInfo({
                ...info,
                current_model_id: normalizedInitialManagedModelId,
                current_model_label: match.label || normalizedInitialManagedModelId,
              });
              return;
            }
          }
          updateModelInfo(info);
          return;
        }
      }

      if (backend) {
        loadFallbackModelInfo(backend, options);
      }
    },
    [
      backend,
      conversation_id,
      loadFallbackModelInfo,
      normalizeManagedModelInfo,
      normalizedInitialManagedModelId,
      updateModelInfo,
    ]
  );

  // Fetch initial model info on mount, fallback to cached models if manager not ready
  useEffect(() => {
    // If user manually changed model and we're returning to the same conversation, skip reload
    if (hasUserChangedModel.current && prevConversationIdRef.current === conversation_id) return;

    // Reset flag when switching to a different conversation
    if (prevConversationIdRef.current !== conversation_id) {
      hasUserChangedModel.current = false;
      prevConversationIdRef.current = conversation_id;
    }

    void reloadModelInfo({ preserveInitialModel: true }).catch(() => {
      // loadCachedModelInfo is already handled inside reloadModelInfo
    });
  }, [conversation_id, backend, initialModelId, reloadModelInfo]);

  // Backfill from handshake once /api/agents responds, if we still have no
  // model info (e.g. session/new hasn't happened this restart so getModelInfo
  // returned 404). Respect user switches and initialModelId from Guid page.
  useEffect(() => {
    if (!backend || !handshakeModelInfo) return;
    if (model_info && model_info.available_models.length > 0) return;
    if (hasUserChangedModel.current) return;
    loadFallbackModelInfo(backend, { preserveInitialModel: true });
  }, [backend, handshakeModelInfo, model_info, loadFallbackModelInfo]);

  useEffect(() => {
    if (!backend || !managedFallbackModelInfo || !useManagedCliModels) return;
    if (model_info && model_info.available_models.length > 0) return;
    if (hasUserChangedModel.current) return;
    loadFallbackModelInfo(backend, { preserveInitialModel: true });
  }, [backend, loadFallbackModelInfo, managedFallbackModelInfo, model_info, useManagedCliModels]);

  useEffect(() => {
    if (backend !== 'claude') return;
    if (model_info) return;

    const refresh = () => {
      void reloadModelInfo().catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
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

  // Listen for acp_model_info / codex_model_info events from responseStream
  useEffect(() => {
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'acp_model_info' && message.data) {
        const incoming = message.data as AcpModelInfo;
        const normalizedIncoming = useManagedCliModels && cliTarget ? normalizeManagedModelInfo(incoming) : incoming;
        if (backend === 'codex') {
          console.log('[AcpModelSelector][codex] Stream model info:', normalizedIncoming);
        }
        if (
          normalizedInitialManagedModelId &&
          !hasUserChangedModel.current &&
          normalizedIncoming.available_models?.length > 0
        ) {
          const match = normalizedIncoming.available_models.find((m) => m.id === normalizedInitialManagedModelId);
          if (match && normalizedIncoming.current_model_id !== normalizedInitialManagedModelId) {
            updateModelInfo({
              ...normalizedIncoming,
              current_model_id: normalizedInitialManagedModelId,
              current_model_label: match.label || normalizedInitialManagedModelId,
            });
            return;
          }
        }
        updateModelInfo(normalizedIncoming);
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
  }, [
    cliTarget,
    conversation_id,
    normalizeManagedModelInfo,
    normalizedInitialManagedModelId,
    updateModelInfo,
    useManagedCliModels,
  ]);

  const handleSelectModel = useCallback(
    (model_id: string) => {
      hasUserChangedModel.current = true;
      setModelInfo((prev) => {
        if (!prev) return prev;
        const selectedModel = prev.available_models.find((model) => model.id === model_id);
        return {
          ...prev,
          current_model_id: model_id,
          current_model_label: selectedModel?.label || model_id,
        };
      });

      const runtimeModelId =
        useManagedCliModels && cliTarget ? buildManagedRuntimeModelId(cliTarget, model_id) : model_id;

      ipcBridge.acpConversation.setModel
        .invoke({ conversation_id, model_id: runtimeModelId })
        .then(() => {
          if (useManagedCliModels && cliTarget) {
            void ipcBridge.newApiAccount.reconcileModel
              .invoke({ cliTarget, modelId: model_id })
              .catch((error) => console.error('[AcpModelSelector] Failed to sync managed CLI model:', error));
          }
          ipcBridge.acpConversation.getModel
            .invoke({ conversation_id })
            .then((result) => {
              if (result?.model_info) {
                const nextInfo = normalizeManagedModelInfo(result.model_info);
                if (useManagedCliModels && cliTarget) {
                  updateModelInfo(nextInfo);
                  return;
                }
                updateModelInfo(nextInfo);
              }
            })
            .catch(() => {});
        })
        .catch((error) => {
          console.error('[AcpModelSelector] Failed to set model:', error);
        });
    },
    [backend, cliTarget, conversation_id, normalizeManagedModelInfo, updateModelInfo, useManagedCliModels]
  );

  const defaultModelLabel = t('common.defaultModel');
  const rawDisplayLabel =
    (model_info?.current_model_id &&
      model_info.available_models.find((m) => m.id === model_info.current_model_id)?.label) ||
    model_info?.current_model_label ||
    model_info?.current_model_id ||
    '';
  const display_label = getModelDisplayLabel({
    selected_value: model_info?.current_model_id,
    selectedLabel:
      (useManagedCliModels && cliTarget ? getManagedRuntimeModelDisplayLabel(rawDisplayLabel) : rawDisplayLabel) ||
      rawDisplayLabel,
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.useCliModel'),
  });
  const tooltipContent = display_label;

  // 获取当前模型的健康状态
  const current_modelHealth = React.useMemo(() => {
    if (!model_info?.current_model_id || !modelConfig) return { status: 'unknown', color: 'bg-gray-400' };
    const providerConfig =
      useManagedCliModels && cliTarget
        ? modelConfig.find((p) => p.id === MANAGED_NEWAPI_PROVIDER_ID)
        : modelConfig.find((p) => p.platform?.includes(backend || ''));
    const healthStatus = providerConfig?.model_health?.[model_info.current_model_id]?.status || 'unknown';
    const healthColor =
      healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';
    return { status: healthStatus, color: healthColor };
  }, [backend, cliTarget, modelConfig, model_info?.current_model_id, useManagedCliModels]);

  // State 1: No model info — show disabled "Use CLI model" button
  if (!model_info) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            <MarqueePillLabel>{t('conversation.welcome.useCliModel')}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  // State 2: Has model info but cannot switch — read-only display
  const canSwitch = model_info.available_models.length > 0;
  if (!canSwitch) {
    return (
      <Tooltip content={tooltipContent} position='top'>
        <Button
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            {current_modelHealth.status !== 'unknown' && (
              <div className={`w-6px h-6px rounded-full shrink-0 ${current_modelHealth.color}`} />
            )}
            <MarqueePillLabel>{display_label}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  // State 3: Can switch — dropdown selector
  return (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          {model_info.available_models.map((model) => {
            // 获取模型健康状态
            const providerConfig =
              useManagedCliModels && cliTarget
                ? modelConfig?.find((p) => p.id === MANAGED_NEWAPI_PROVIDER_ID)
                : modelConfig?.find((p) => p.platform?.includes(backend || ''));
            const healthStatus = providerConfig?.model_health?.[model.id]?.status || 'unknown';
            const healthColor =
              healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';

            return (
              <Menu.Item
                key={model.id}
                className={model.id === model_info.current_model_id ? 'bg-2!' : ''}
                onClick={() => handleSelectModel(model.id)}
              >
                <div className='flex items-center gap-8px w-full'>
                  {healthStatus !== 'unknown' && <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />}
                  <span>{model.label || model.id}</span>
                </div>
              </Menu.Item>
            );
          })}
        </Menu>
      }
    >
      <Button className='sendbox-model-btn header-model-btn agent-mode-compact-pill' shape='round' size='small'>
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          {current_modelHealth.status !== 'unknown' && (
            <div className={`w-6px h-6px rounded-full shrink-0 ${current_modelHealth.color}`} />
          )}
          <MarqueePillLabel>{display_label}</MarqueePillLabel>
        </span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
