/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents, type AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
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
  const layout = useLayoutContext();
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const [model_info, setModelInfo] = useState<AcpModelInfo | null>(null);
  // Track whether user has manually switched model via dropdown
  const hasUserChangedModel = useRef(false);
  // Track the last conversation_id to detect tab switches
  const prevConversationIdRef = useRef(conversation_id);

  const updateModelInfo = useCallback((nextModelInfo: AcpModelInfo) => {
    setModelInfo((prev) => {
      let finalNext = nextModelInfo;
      // Preserve existing available_models if the incoming update omits them
      // (e.g. OpenCode emitting current model switch without the full list)
      if (prev && !nextModelInfo.available_models) {
        finalNext = {
          ...nextModelInfo,
          available_models: prev.available_models,
        };
      } else if (!nextModelInfo.available_models) {
        finalNext = {
          ...nextModelInfo,
          available_models: [],
        };
      }
      return isSameModelInfo(prev, finalNext) ? prev : finalNext;
    });
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
    return info;
  }, [agentsData, backend]);

  const loadFallbackModelInfo = useCallback(
    (backendKey: string, options?: { preserveInitialModel?: boolean }) => {
      const source = handshakeModelInfo;
      if (!source || source.available_models.length === 0) return false;

      if (backendKey === 'codex') {
        console.log('[AcpModelSelector][codex] Loaded fallback model info:', source);
      }

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
        // Session may not be warmed up yet (404) — fall through to fallback.
      }

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
        loadFallbackModelInfo(backend, options);
      }
    },
    [backend, conversation_id, initialModelId, loadFallbackModelInfo, updateModelInfo]
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

  const reloadModelInfoRef = useRef(reloadModelInfo);
  reloadModelInfoRef.current = reloadModelInfo;

  // Retry model info fetch periodically when not yet available.
  // Covers backends where the agent may not be fully initialized on first mount
  // (e.g. OpenCode remote agents warm up asynchronously).
  // Uses a ref to avoid resetting the interval when useSWR re-fetches change
  // reloadModelInfo's identity.
  useEffect(() => {
    if (model_info) return;

    const refresh = () => {
      void reloadModelInfoRef.current().catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    refresh(); // immediate first attempt

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(refresh, 5000);

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [model_info]);

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
          ipcBridge.acpConversation.getModel
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
  const rawDisplayLabel =
    (model_info?.current_model_id &&
      model_info.available_models.find((m) => m.id === model_info.current_model_id)?.label) ||
    model_info?.current_model_label ||
    model_info?.current_model_id ||
    '';
  const display_label = getModelDisplayLabel({
    selected_value: model_info?.current_model_id,
    selectedLabel: rawDisplayLabel,
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.useCliModel'),
  });
  const tooltipContent = display_label;

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;

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
            {renderLogo()}
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
            {renderLogo()}
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
      // Mobile: portal the popup to <body> so it escapes the titlebar slot.
      // Desktop: leave default container so click events reach Menu.Item normally.
      {...(isMobileHeaderCompact ? { getPopupContainer: () => document.body } : {})}
      droplist={
        <Menu>
          {model_info.available_models.map((model) => (
            <Menu.Item
              key={model.id}
              className={model.id === model_info.current_model_id ? 'bg-2!' : ''}
              onClick={() => handleSelectModel(model.id)}
            >
              <div className='flex items-center gap-8px w-full'>
                <span>{model.label || model.id}</span>
              </div>
            </Menu.Item>
          ))}
        </Menu>
      }
    >
      <Button className='sendbox-model-btn header-model-btn agent-mode-compact-pill' shape='round' size='small'>
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          {renderLogo()}
          <MarqueePillLabel>{display_label}</MarqueePillLabel>
          <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
