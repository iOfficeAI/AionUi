/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import type { IProvider } from '@/common/config/storage';
import type { AcpModelInfo } from '@/common/types/acpTypes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { formatAcpModelDisplayLabel, getAcpModelSourceLabel } from '@/renderer/utils/model/modelSource';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import MarqueePillLabel from './MarqueePillLabel';

function useOptionalPreviewOpen(): boolean {
  try {
    return usePreviewContext().isOpen;
  } catch {
    return false;
  }
}

function isSameModelInfo(a: AcpModelInfo | null | undefined, b: AcpModelInfo | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.currentModelId !== b.currentModelId ||
    a.currentModelLabel !== b.currentModelLabel ||
    a.canSwitch !== b.canSwitch ||
    a.source !== b.source ||
    a.sourceDetail !== b.sourceDetail ||
    (a.availableModels?.length ?? 0) !== (b.availableModels?.length ?? 0)
  ) {
    return false;
  }

  return (a.availableModels ?? []).every((model, index) => {
    const other = b.availableModels?.[index];
    return (
      other &&
      other.id === model.id &&
      other.label === model.label &&
      other.defaultReasoningEffort === model.defaultReasoningEffort &&
      (other.supportedReasoningEfforts?.length ?? 0) === (model.supportedReasoningEfforts?.length ?? 0) &&
      (model.supportedReasoningEfforts ?? []).every(
        (effort, effortIndex) => other.supportedReasoningEfforts?.[effortIndex] === effort
      )
    );
  });
}

function resolveModelInfo(modelInfo: AcpModelInfo | null, initialModelId?: string): AcpModelInfo | null {
  if (!modelInfo) {
    return null;
  }

  const effectiveModelId = initialModelId || modelInfo.currentModelId || null;
  const matchedModel = effectiveModelId
    ? modelInfo.availableModels?.find((item) => item.id === effectiveModelId)
    : undefined;

  return {
    ...modelInfo,
    currentModelId: effectiveModelId,
    currentModelLabel: matchedModel?.label || modelInfo.currentModelLabel || effectiveModelId || '',
  };
}

/**
 * Model selector for ACP-based agents.
 * Fetches model info via IPC and listens for real-time updates via responseStream.
 * Renders three states:
 * - null model info: disabled "Use CLI model" button
 * - canSwitch=false: read-only display of current model name
 * - canSwitch=true: clickable dropdown selector
 *
 * When backend and initialModelId are provided, the component can show
 * cached model info before the agent manager is created (pre-first-message).
 */
const AcpModelSelector: React.FC<{
  conversationId?: string;
  backend?: string;
  initialModelId?: string;
  localModelInfo?: AcpModelInfo | null;
  onSelectModel?: (modelId: string) => void;
}> = ({ conversationId, backend, initialModelId, localModelInfo, onSelectModel }) => {
  const { t } = useTranslation();
  const isPreviewOpen = useOptionalPreviewOpen();
  const layout = useLayoutContext();
  const [modelInfo, setModelInfo] = useState<AcpModelInfo | null>(() =>
    resolveModelInfo(localModelInfo ?? null, initialModelId)
  );
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const hasUserChangedModel = useRef(false);
  const isUsingLocalModelInfo = localModelInfo !== undefined;
  const prevConversationIdRef = useRef(conversationId);

  const updateModelInfo = useCallback((nextModelInfo: AcpModelInfo) => {
    setModelInfo((prev) => (isSameModelInfo(prev, nextModelInfo) ? prev : nextModelInfo));
  }, []);

  const loadCachedModelInfo = useCallback(
    async (backendKey: string, options?: { preserveInitialModel?: boolean }) => {
      try {
        const cached = await ConfigStorage.get('acp.cachedModels');
        const cachedInfo = cached?.[backendKey];
        if (!cachedInfo?.availableModels?.length) return;

        const effectiveModelId =
          options?.preserveInitialModel && initialModelId ? initialModelId : (cachedInfo.currentModelId ?? null);

        updateModelInfo({
          ...cachedInfo,
          currentModelId: effectiveModelId,
          currentModelLabel:
            (effectiveModelId && cachedInfo.availableModels.find((m) => m.id === effectiveModelId)?.label) ||
            effectiveModelId,
        });
      } catch {
        // Silently ignore cache failures
      }
    },
    [initialModelId, updateModelInfo]
  );

  const reloadModelInfo = useCallback(
    async (options?: { preserveInitialModel?: boolean }) => {
      if (!conversationId) return;

      const result = await ipcBridge.acpConversation.getModelInfo.invoke({ conversationId });

      if (result.success && result.data?.modelInfo) {
        const info = result.data.modelInfo;
        if (info.availableModels?.length > 0) {
          if (
            options?.preserveInitialModel &&
            initialModelId &&
            !hasUserChangedModel.current &&
            info.currentModelId !== initialModelId
          ) {
            const match = info.availableModels.find((m) => m.id === initialModelId);
            if (match) {
              updateModelInfo({
                ...info,
                currentModelId: initialModelId,
                currentModelLabel: match.label || initialModelId,
              });
              return;
            }
          }
          updateModelInfo(info);
          return;
        }
      }

      if (backend && !hasUserChangedModel.current) {
        await loadCachedModelInfo(backend, options);
      }
    },
    [backend, conversationId, initialModelId, loadCachedModelInfo, updateModelInfo]
  );

  useEffect(() => {
    if (!isUsingLocalModelInfo) return;
    setModelInfo(resolveModelInfo(localModelInfo ?? null, initialModelId));
  }, [initialModelId, isUsingLocalModelInfo, localModelInfo]);

  useEffect(() => {
    if (isUsingLocalModelInfo || !conversationId) return;
    if (hasUserChangedModel.current && prevConversationIdRef.current === conversationId) return;

    if (prevConversationIdRef.current !== conversationId) {
      hasUserChangedModel.current = false;
      prevConversationIdRef.current = conversationId;
    }

    void reloadModelInfo({ preserveInitialModel: true }).catch(() => {
      // loadCachedModelInfo is already handled inside reloadModelInfo
    });
  }, [conversationId, initialModelId, isUsingLocalModelInfo, reloadModelInfo]);

  useEffect(() => {
    if (isUsingLocalModelInfo || !conversationId || (backend !== 'claude' && backend !== 'codex')) return;

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
  }, [backend, conversationId, isUsingLocalModelInfo, reloadModelInfo]);

  useEffect(() => {
    if (isUsingLocalModelInfo || !conversationId) return;

    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversationId) return;

      if (message.type === 'acp_model_info' && message.data) {
        const incoming = message.data as AcpModelInfo;
        if (initialModelId && !hasUserChangedModel.current && incoming.availableModels?.length > 0) {
          const match = incoming.availableModels.find((m) => m.id === initialModelId);
          if (match && incoming.currentModelId !== initialModelId) {
            updateModelInfo({
              ...incoming,
              currentModelId: initialModelId,
              currentModelLabel: match.label || initialModelId,
            });
            return;
          }
        }
        updateModelInfo(incoming);
      } else if (message.type === 'codex_model_info' && message.data) {
        const data = message.data as { model: string };
        if (data.model) {
          updateModelInfo({
            source: 'models',
            sourceDetail: 'codex-stream',
            currentModelId: data.model,
            currentModelLabel: data.model,
            canSwitch: false,
            availableModels: [],
          });
        }
      }
    };

    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversationId, initialModelId, isUsingLocalModelInfo, updateModelInfo]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      if (modelInfo?.currentModelId === modelId) {
        setDropdownVisible(false);
        return;
      }

      hasUserChangedModel.current = true;
      setModelInfo((prev) => {
        if (!prev) return prev;
        const selectedModel = prev.availableModels.find((model) => model.id === modelId);
        return {
          ...prev,
          currentModelId: modelId,
          currentModelLabel: selectedModel?.label || modelId,
        };
      });

      if (onSelectModel) {
        onSelectModel(modelId);
        return;
      }

      if (!conversationId) {
        return;
      }

      ipcBridge.acpConversation.setModel
        .invoke({ conversationId, modelId })
        .then((result) => {
          if (result.success && result.data?.modelInfo) {
            updateModelInfo(result.data.modelInfo);
          }
        })
        .catch((error) => {
          console.error('[AcpModelSelector] Failed to set model:', error);
        });
    },
    [conversationId, modelInfo?.currentModelId, onSelectModel, updateModelInfo]
  );

  const defaultModelLabel = t('common.defaultModel');
  const rawDisplayLabel = modelInfo?.currentModelLabel || modelInfo?.currentModelId || '';
  const displayLabel = getModelDisplayLabel({
    selectedValue: modelInfo?.currentModelId,
    selectedLabel: rawDisplayLabel,
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.useCliModel'),
  });
  const modelSourceLabel = getAcpModelSourceLabel(modelInfo);
  const buttonLabel = formatAcpModelDisplayLabel(displayLabel, modelSourceLabel);
  const tooltipContent =
    modelSourceLabel && displayLabel
      ? `${displayLabel}\nSource: ${modelSourceLabel}`
      : displayLabel || modelSourceLabel;
  const compact = isPreviewOpen || layout?.isMobile;
  const isMobileCompact = Boolean(layout?.isMobile);

  useEffect(() => {
    setDropdownVisible(false);
    setTooltipVisible(false);
  }, [backend, conversationId, initialModelId, modelInfo]);

  const { data: modelConfig } = useSWR<IProvider[]>('model.config', () => ipcBridge.mode.getModelConfig.invoke());
  const currentModelHealth = React.useMemo(() => {
    if (!modelInfo?.currentModelId || !modelConfig) return { status: 'unknown', color: 'bg-gray-400' };
    const providerConfig = modelConfig.find((p) => p.platform?.includes(backend || ''));
    const healthStatus = providerConfig?.modelHealth?.[modelInfo.currentModelId]?.status || 'unknown';
    const healthColor =
      healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';
    return { status: healthStatus, color: healthColor };
  }, [backend, modelConfig, modelInfo?.currentModelId]);

  if (!modelInfo) {
    return (
      <Tooltip
        content={t('conversation.welcome.modelSwitchNotSupported')}
        position='top'
        popupVisible={tooltipVisible}
        onVisibleChange={setTooltipVisible}
        unmountOnExit
      >
        <Button
          className={classNames(
            'sendbox-model-btn header-model-btn agent-mode-compact-pill',
            compact && '!max-w-[120px]',
            isMobileCompact && '!max-w-[160px]'
          )}
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

  if (!modelInfo.canSwitch) {
    return (
      <Tooltip
        content={tooltipContent}
        position='top'
        popupVisible={tooltipVisible}
        onVisibleChange={setTooltipVisible}
        unmountOnExit
      >
        <Button
          className={classNames(
            'sendbox-model-btn header-model-btn agent-mode-compact-pill',
            compact && '!max-w-[120px]',
            isMobileCompact && '!max-w-[160px]'
          )}
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            {currentModelHealth.status !== 'unknown' && (
              <div className={`w-6px h-6px rounded-full shrink-0 ${currentModelHealth.color}`} />
            )}
            <MarqueePillLabel>{buttonLabel}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Dropdown
      trigger='click'
      popupVisible={dropdownVisible}
      onVisibleChange={setDropdownVisible}
      unmountOnExit
      droplist={
        <Menu>
          {modelInfo.availableModels.map((model) => {
            const providerConfig = modelConfig?.find((p) => p.platform?.includes(backend || ''));
            const healthStatus = providerConfig?.modelHealth?.[model.id]?.status || 'unknown';
            const healthColor =
              healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';

            return (
              <Menu.Item
                key={model.id}
                className={model.id === modelInfo.currentModelId ? 'bg-2!' : ''}
                onClick={() => {
                  setDropdownVisible(false);
                  handleSelectModel(model.id);
                }}
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
      <Button
        className={classNames(
          'sendbox-model-btn header-model-btn agent-mode-compact-pill',
          compact && '!max-w-[120px]',
          isMobileCompact && '!max-w-[160px]'
        )}
        shape='round'
        size='small'
      >
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          {currentModelHealth.status !== 'unknown' && (
            <div className={`w-6px h-6px rounded-full shrink-0 ${currentModelHealth.color}`} />
          )}
          <MarqueePillLabel>{buttonLabel}</MarqueePillLabel>
        </span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
