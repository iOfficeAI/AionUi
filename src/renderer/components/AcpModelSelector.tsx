/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { AcpModelInfo } from '@/types/acpTypes';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Model selector for ACP-based agents.
 * Fetches model info via IPC and listens for real-time updates via responseStream.
 * Renders three states:
 * - null model info: disabled "Use CLI model" button (backward compatible)
 * - canSwitch=false: read-only display of current model name
 * - canSwitch=true: clickable dropdown selector
 * When preview panel is open, shows compact version (truncated label).
 */
const AcpModelSelector: React.FC<{
  conversationId: string;
}> = ({ conversationId }) => {
  const { t } = useTranslation();
  const { isOpen: isPreviewOpen } = usePreviewContext();
  const [modelInfo, setModelInfo] = useState<AcpModelInfo | null>(null);
  const modelInfoRef = useRef(modelInfo);
  modelInfoRef.current = modelInfo;

  // Fetch initial model info on mount
  useEffect(() => {
    ipcBridge.acpConversation.getModelInfo
      .invoke({ conversationId })
      .then((result) => {
        if (result.success && result.data?.modelInfo) {
          setModelInfo(result.data.modelInfo);
        }
      })
      .catch(() => {
        // Silently ignore - model info is optional
      });
  }, [conversationId]);

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

  const displayLabel = modelInfo?.currentModelLabel || modelInfo?.currentModelId || t('conversation.welcome.useCliModel');
  const compact = isPreviewOpen;

  // State 1: No model info — show disabled "Use CLI model" button
  if (!modelInfo) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button className={classNames('sendbox-model-btn header-model-btn', compact && '!max-w-[120px]')} shape='round' size='small' style={{ cursor: 'default' }}>
          <span className={compact ? 'block truncate' : undefined}>{t('conversation.welcome.useCliModel')}</span>
        </Button>
      </Tooltip>
    );
  }

  // State 2: Has model info but cannot switch — read-only display
  if (!modelInfo.canSwitch) {
    return (
      <Tooltip content={displayLabel} position='top'>
        <Button className={classNames('sendbox-model-btn header-model-btn', compact && '!max-w-[120px]')} shape='round' size='small' style={{ cursor: 'default' }}>
          <span className={compact ? 'block truncate' : undefined}>{displayLabel}</span>
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
      <Button className={classNames('sendbox-model-btn header-model-btn', compact && '!max-w-[120px]')} shape='round' size='small'>
        <span className={compact ? 'block truncate' : undefined}>{displayLabel}</span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
