/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/ipcBridge';
import { ConfigStorage } from '@/common/storage';
import type { AcpModelInfo } from '@/types/acpTypes';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
 */
const AcpModelSelector: React.FC<{
  conversationId: string;
  /** ACP backend name for loading cached models (e.g., 'claude', 'qwen') */
  backend?: string;
  /** Pre-selected model ID from Guid page */
  initialModelId?: string;
}> = ({ conversationId, backend, initialModelId }) => {
  const { t } = useTranslation();
  const [modelInfo, setModelInfo] = useState<AcpModelInfo | null>(null);
  const modelInfoRef = useRef(modelInfo);
  modelInfoRef.current = modelInfo;

  // Fetch initial model info on mount, fallback to cached models if manager not ready
  useEffect(() => {
    let cancelled = false;
    ipcBridge.acpConversation.getModelInfo
      .invoke({ conversationId })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data?.modelInfo) {
          setModelInfo(result.data.modelInfo);
        } else if (backend && initialModelId) {
          // Manager not yet created — load cached model list from storage
          void loadCachedModelInfo(backend, initialModelId, cancelled);
        }
      })
      .catch(() => {
        if (!cancelled && backend && initialModelId) {
          void loadCachedModelInfo(backend, initialModelId, cancelled);
        }
      });

    return () => {
      cancelled = true;
    };

    async function loadCachedModelInfo(backendKey: string, modelId: string, isCancelled: boolean) {
      try {
        const cached = await ConfigStorage.get('acp.cachedModels');
        if (isCancelled) return;
        const cachedInfo = cached?.[backendKey];
        if (cachedInfo && cachedInfo.availableModels.length > 0) {
          setModelInfo({
            ...cachedInfo,
            currentModelId: modelId,
            currentModelLabel: cachedInfo.availableModels.find((m) => m.id === modelId)?.label || modelId,
          });
        }
      } catch {
        // Silently ignore
      }
    }
  }, [conversationId, backend, initialModelId]);

  // Listen for acp_model_info / codex_model_info events from responseStream
  useEffect(() => {
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversationId) return;
      if (message.type === 'acp_model_info' && message.data) {
        setModelInfo(message.data as AcpModelInfo);
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
  }, [conversationId]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
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
    [conversationId]
  );

  // State 1: No model info — show disabled "Use CLI model" button
  if (!modelInfo) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button className='sendbox-model-btn header-model-btn' shape='round' size='small' style={{ cursor: 'default' }}>
          {t('conversation.welcome.useCliModel')}
        </Button>
      </Tooltip>
    );
  }

  const displayLabel = modelInfo.currentModelLabel || modelInfo.currentModelId || t('conversation.welcome.useCliModel');

  // State 2: Has model info but cannot switch — read-only display
  if (!modelInfo.canSwitch) {
    return (
      <Tooltip content={displayLabel} position='top'>
        <Button className='sendbox-model-btn header-model-btn' shape='round' size='small' style={{ cursor: 'default' }}>
          {displayLabel}
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
          {modelInfo.availableModels.map((model) => (
            <Menu.Item key={model.id} className={model.id === modelInfo.currentModelId ? '!bg-2' : ''} onClick={() => handleSelectModel(model.id)}>
              {model.label}
            </Menu.Item>
          ))}
        </Menu>
      }
    >
      <Button className='sendbox-model-btn header-model-btn' shape='round' size='small'>
        {displayLabel}
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
