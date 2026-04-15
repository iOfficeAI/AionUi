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
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

/**
 * Model selector for ACP-based agents.
 * Fetches model info via IPC and listens for real-time updates via responseStream.
 * Renders three states:
 * - null model info: disabled "Use CLI model" button (backward compatible)
 * - canSwitch=false: read-only display of current model name
 * - canSwitch=true: clickable dropdown selector
 *
 * When backend and initialModelId are provided, the component can show
 * cached model info before the agent manager is created (pre-first-message).
 * When preview panel is open, shows compact version (truncated label).
 */
const resolveModelInfo = (modelInfo: AcpModelInfo | null, initialModelId?: string): AcpModelInfo | null => {
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
};

const AcpModelSelector: React.FC<{
  conversationId?: string;
  /** ACP backend name for loading cached models (e.g., 'claude', 'qwen') */
  backend?: string;
  /** Pre-selected model ID from Guid page */
  initialModelId?: string;
  /** Optional local/cached model info source for non-conversation usage */
  localModelInfo?: AcpModelInfo | null;
  /** Optional local change handler for non-conversation usage */
  onSelectModel?: (modelId: string) => void;
}> = ({ conversationId, backend, initialModelId, localModelInfo, onSelectModel }) => {
  const { t } = useTranslation();
  const { isOpen: isPreviewOpen } = usePreviewContext();
  const layout = useLayoutContext();
  const [modelInfo, setModelInfo] = useState<AcpModelInfo | null>(() =>
    resolveModelInfo(localModelInfo ?? null, initialModelId)
  );
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const modelInfoRef = useRef(modelInfo);
  modelInfoRef.current = modelInfo;
  // Track whether user has manually switched model via dropdown
  const hasUserChangedModel = useRef(false);
  const isUsingLocalModelInfo = localModelInfo !== undefined;
  // Track the last conversationId to detect tab switches
  const prevConversationIdRef = useRef(conversationId);

  useEffect(() => {
    if (!isUsingLocalModelInfo) return;
    setModelInfo(resolveModelInfo(localModelInfo ?? null, initialModelId));
  }, [initialModelId, isUsingLocalModelInfo, localModelInfo]);

  // Fetch initial model info on mount, fallback to cached models if manager not ready
  useEffect(() => {
    if (isUsingLocalModelInfo || !conversationId) return;
    // If user manually changed model and we're returning to the same conversation, skip reload
    if (hasUserChangedModel.current && prevConversationIdRef.current === conversationId) return;

    // Reset flag when switching to a different conversation
    if (prevConversationIdRef.current !== conversationId) {
      hasUserChangedModel.current = false;
      prevConversationIdRef.current = conversationId;
    }
    let cancelled = false;
    ipcBridge.acpConversation.getModelInfo
      .invoke({ conversationId })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data?.modelInfo) {
          const info = result.data.modelInfo;
          // When agent is not fully initialized, getModelInfo returns
          // canSwitch=false with empty availableModels. Prefer cached data
          // in that case to keep the dropdown functional.
          if (info.availableModels?.length > 0) {
            // If user pre-selected a model (from Guid page) and hasn't manually changed it,
            // keep that selection instead of letting the agent's default overwrite it.
            if (initialModelId && !hasUserChangedModel.current && info.currentModelId !== initialModelId) {
              const match = info.availableModels.find((m) => m.id === initialModelId);
              if (match) {
                setModelInfo({
                  ...info,
                  currentModelId: initialModelId,
                  currentModelLabel: match.label || initialModelId,
                });
              } else {
                setModelInfo(info);
              }
            } else {
              setModelInfo(info);
            }
          } else if (backend) {
            void loadCachedModelInfo(backend, cancelled);
          } else {
            setModelInfo(info);
          }
        } else if (backend) {
          // Manager not yet created — load cached model list from storage
          void loadCachedModelInfo(backend, cancelled);
        }
      })
      .catch(() => {
        if (!cancelled && backend) {
          void loadCachedModelInfo(backend, cancelled);
        }
      });

    return () => {
      cancelled = true;
    };

    async function loadCachedModelInfo(backendKey: string, isCancelled: boolean) {
      try {
        const cached = await ConfigStorage.get('acp.cachedModels');
        if (isCancelled) return;
        const cachedInfo = cached?.[backendKey];
        if (cachedInfo?.availableModels?.length > 0) {
          const effectiveModelId = initialModelId || cachedInfo.currentModelId || null;
          setModelInfo({
            ...cachedInfo,
            currentModelId: effectiveModelId,
            currentModelLabel:
              (effectiveModelId && cachedInfo.availableModels.find((m) => m.id === effectiveModelId)?.label) ||
              effectiveModelId,
          });
        }
      } catch {
        // Silently ignore
      }
    }
  }, [conversationId, backend, initialModelId, isUsingLocalModelInfo]);

  // Listen for acp_model_info / codex_model_info events from responseStream
  useEffect(() => {
    if (isUsingLocalModelInfo || !conversationId) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversationId) return;
      if (message.type === 'acp_model_info' && message.data) {
        const incoming = message.data as AcpModelInfo;
        // Preserve pre-selected model from Guid page until user manually switches.
        // The agent emits its default model during start (before re-apply), which
        // would otherwise overwrite the user's Guid page selection.
        if (initialModelId && !hasUserChangedModel.current && incoming.availableModels?.length > 0) {
          const match = incoming.availableModels.find((m) => m.id === initialModelId);
          if (match && incoming.currentModelId !== initialModelId) {
            setModelInfo({
              ...incoming,
              currentModelId: initialModelId,
              currentModelLabel: match.label || initialModelId,
            });
            return;
          }
        }
        setModelInfo(incoming);
      } else if (message.type === 'codex_model_info' && message.data) {
        // Codex model info: always read-only display
        const data = message.data as { model: string };
        if (data.model) {
          setModelInfo({
            source: 'models',
            currentModelId: data.model,
            currentModelLabel: data.model,
            canSwitch: false,
            availableModels: [],
          });
        }
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversationId, initialModelId, isUsingLocalModelInfo, backend]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      hasUserChangedModel.current = true;
      if (onSelectModel) {
        setModelInfo((prev) => {
          if (!prev) return prev;
          const matchedModel = prev.availableModels?.find((item) => item.id === modelId);
          return {
            ...prev,
            currentModelId: modelId,
            currentModelLabel: matchedModel?.label || modelId,
          };
        });
        onSelectModel(modelId);
        return;
      }

      if (!conversationId) {
        return;
      }
      setModelInfo((prev) => (prev ? { ...prev, currentModelId: modelId } : prev));
      ipcBridge.acpConversation.setModel
        .invoke({ conversationId, modelId })
        .then((result) => {
          if (result.success && result.data?.modelInfo) {
            setModelInfo(result.data.modelInfo);
          }
        })
        .catch((error) => {
          console.error('[AcpModelSelector] Failed to set model:', error);
        });
    },
    [conversationId, onSelectModel]
  );

  const defaultModelLabel = t('common.defaultModel');
  const rawDisplayLabel = modelInfo?.currentModelLabel || modelInfo?.currentModelId || '';
  const displayLabel = getModelDisplayLabel({
    selectedValue: modelInfo?.currentModelId,
    selectedLabel: rawDisplayLabel,
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.useCliModel'),
  });
  const compact = isPreviewOpen || layout?.isMobile;
  const isMobileCompact = Boolean(layout?.isMobile);

  useEffect(() => {
    setDropdownVisible(false);
    setTooltipVisible(false);
  }, [conversationId, backend, initialModelId, modelInfo]);

  // 获取模型配置数据（包含健康状态）
  const { data: modelConfig } = useSWR<IProvider[]>('model.config', () => ipcBridge.mode.getModelConfig.invoke());

  // 获取当前模型的健康状态
  const currentModelHealth = React.useMemo(() => {
    if (!modelInfo?.currentModelId || !modelConfig) return { status: 'unknown', color: 'bg-gray-400' };
    const providerConfig = modelConfig.find((p) => p.platform?.includes(backend || ''));
    const healthStatus = providerConfig?.modelHealth?.[modelInfo.currentModelId]?.status || 'unknown';
    const healthColor =
      healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';
    return { status: healthStatus, color: healthColor };
  }, [modelInfo?.currentModelId, modelConfig, backend]);

  // State 1: No model info — show disabled "Use CLI model" button
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
            'sendbox-model-btn header-model-btn',
            compact && '!max-w-[120px]',
            isMobileCompact && '!max-w-[160px]'
          )}
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0'>
            <span className={compact ? 'block truncate' : undefined}>{t('conversation.welcome.useCliModel')}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  // State 2: Has model info but cannot switch — read-only display
  if (!modelInfo.canSwitch) {
    return (
      <Tooltip
        content={displayLabel}
        position='top'
        popupVisible={tooltipVisible}
        onVisibleChange={setTooltipVisible}
        unmountOnExit
      >
        <Button
          className={classNames(
            'sendbox-model-btn header-model-btn',
            compact && '!max-w-[120px]',
            isMobileCompact && '!max-w-[160px]'
          )}
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0'>
            {currentModelHealth.status !== 'unknown' && (
              <div className={`w-6px h-6px rounded-full shrink-0 ${currentModelHealth.color}`} />
            )}
            <span className={compact ? 'block truncate' : undefined}>{displayLabel}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  // State 3: Can switch — dropdown selector
  return (
    <Dropdown
      trigger='click'
      popupVisible={dropdownVisible}
      onVisibleChange={setDropdownVisible}
      unmountOnExit
      droplist={
        <Menu>
          {modelInfo.availableModels.map((model) => {
            // 获取模型健康状态
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
          'sendbox-model-btn header-model-btn',
          compact && '!max-w-[120px]',
          isMobileCompact && '!max-w-[160px]'
        )}
        shape='round'
        size='small'
      >
        <span className='flex items-center gap-6px min-w-0'>
          {currentModelHealth.status !== 'unknown' && (
            <div className={`w-6px h-6px rounded-full shrink-0 ${currentModelHealth.color}`} />
          )}
          <span className={compact ? 'block truncate' : undefined}>{displayLabel}</span>
        </span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
