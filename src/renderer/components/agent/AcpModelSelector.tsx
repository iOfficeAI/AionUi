/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import type { IProvider } from '@/common/config/storage';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { formatAcpModelDisplayLabel, getAcpModelSourceLabel } from '@/renderer/utils/model/modelSource';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import MarqueePillLabel from './MarqueePillLabel';

function isSameModelInfo(a: AcpModelInfo | null | undefined, b: AcpModelInfo | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.current_model_id !== b.current_model_id ||
    a.current_model_label !== b.current_model_label ||
    a.can_switch !== b.can_switch ||
    a.source !== b.source ||
    a.source_detail !== b.source_detail ||
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
 * - can_switch=false: read-only display of current model name
 * - can_switch=true: clickable dropdown selector
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
  // Track whether user has manually switched model via dropdown
  const hasUserChangedModel = useRef(false);
  // Track the last conversation_id to detect tab switches
  const prevConversationIdRef = useRef(conversation_id);

  const updateModelInfo = useCallback((nextModelInfo: AcpModelInfo) => {
    setModelInfo((prev) => (isSameModelInfo(prev, nextModelInfo) ? prev : nextModelInfo));
  }, []);

  const loadCachedModelInfo = useCallback(
    async (backendKey: string, options?: { preserveInitialModel?: boolean }) => {
      try {
        const cached = configService.get('acp.cachedModels');
        const cachedInfo = cached?.[backendKey];
        if (!cachedInfo?.available_models?.length) return;

        if (backendKey === 'codex') {
          console.log('[AcpModelSelector][codex] Loaded cached model info:', cachedInfo);
        }

        const effectiveModelId =
          options?.preserveInitialModel && initialModelId ? initialModelId : (cachedInfo.current_model_id ?? null);

        updateModelInfo({
          ...cachedInfo,
          current_model_id: effectiveModelId,
          current_model_label:
            (effectiveModelId && cachedInfo.available_models.find((m) => m.id === effectiveModelId)?.label) ||
            effectiveModelId,
        });
      } catch {
        // Silently ignore
      }
    },
    [initialModelId, updateModelInfo]
  );

  const reloadModelInfo = useCallback(
    async (options?: { preserveInitialModel?: boolean }) => {
      const result = await ipcBridge.acpConversation.getModelInfo.invoke({ conversation_id });

      if (result?.model_info) {
        const info = result.model_info;
        if (backend === 'codex') {
          console.log('[AcpModelSelector][codex] Initial model info:', info);
        }
        if (info.available_models?.length > 0) {
          if (
            options?.preserveInitialModel &&
            initialModelId &&
            !hasUserChangedModel.current &&
            info.current_model_id !== initialModelId
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
        await loadCachedModelInfo(backend, options);
      }
    },
    [backend, conversation_id, initialModelId, loadCachedModelInfo, updateModelInfo]
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

  useEffect(() => {
    if (backend !== 'claude') return;

    const refresh = () => {
      void reloadModelInfo().catch(() => {
        // loadCachedModelInfo is already handled inside reloadModelInfo
      });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(refresh, 1500);

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [backend, reloadModelInfo]);

  // Listen for acp_model_info / codex_model_info events from responseStream
  useEffect(() => {
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'acp_model_info' && message.data) {
        const incoming = message.data as AcpModelInfo;
        if (backend === 'codex') {
          console.log('[AcpModelSelector][codex] Stream model info:', incoming);
        }
        // Preserve pre-selected model from Guid page until user manually switches.
        // The agent emits its default model during start (before re-apply), which
        // would otherwise overwrite the user's Guid page selection.
        if (initialModelId && !hasUserChangedModel.current && incoming.available_models?.length > 0) {
          const match = incoming.available_models.find((m) => m.id === initialModelId);
          if (match && incoming.current_model_id !== initialModelId) {
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
        // Codex model info: always read-only display
        const data = message.data as { model: string };
        if (data.model) {
          updateModelInfo({
            source: 'models',
            source_detail: 'codex-stream',
            current_model_id: data.model,
            current_model_label: data.model,
            can_switch: false,
            available_models: [],
          });
        }
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversation_id, initialModelId, updateModelInfo]);

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
      ipcBridge.acpConversation.setModel
        .invoke({ conversation_id, model_id })
        .then(() => {
          // setModel returns void; re-fetch model info after successful set
          ipcBridge.acpConversation.getModelInfo
            .invoke({ conversation_id })
            .then((result) => {
              if (result?.model_info) {
                updateModelInfo(result.model_info);
              }
            })
            .catch(() => {});
        })
        .catch((error) => {
          console.error('[AcpModelSelector] Failed to set model:', error);
        });
    },
    [conversation_id, updateModelInfo]
  );

  const defaultModelLabel = t('common.defaultModel');
  const rawDisplayLabel = model_info?.current_model_label || model_info?.current_model_id || '';
  const display_label = getModelDisplayLabel({
    selected_value: model_info?.current_model_id,
    selectedLabel: rawDisplayLabel,
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.useCliModel'),
  });
  const modelSourceLabel = getAcpModelSourceLabel(model_info);
  const buttonLabel = formatAcpModelDisplayLabel(display_label, modelSourceLabel);
  const tooltipContent =
    modelSourceLabel && display_label
      ? `${display_label}\nSource: ${modelSourceLabel}`
      : display_label || modelSourceLabel;
  // 获取模型配置数据（包含健康状态）
  const { data: modelConfig } = useSWR<IProvider[]>('providers', () => ipcBridge.mode.listProviders.invoke());

  // 获取当前模型的健康状态
  const current_modelHealth = React.useMemo(() => {
    if (!model_info?.current_model_id || !modelConfig) return { status: 'unknown', color: 'bg-gray-400' };
    const providerConfig = modelConfig.find((p) => p.platform?.includes(backend || ''));
    const healthStatus = providerConfig?.model_health?.[model_info.current_model_id]?.status || 'unknown';
    const healthColor =
      healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';
    return { status: healthStatus, color: healthColor };
  }, [model_info?.current_model_id, modelConfig, backend]);

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
  if (!model_info.can_switch) {
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
            <MarqueePillLabel>{buttonLabel}</MarqueePillLabel>
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
            const providerConfig = modelConfig?.find((p) => p.platform?.includes(backend || ''));
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
                  <span>{model.label}</span>
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
          <MarqueePillLabel>{buttonLabel}</MarqueePillLabel>
        </span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
