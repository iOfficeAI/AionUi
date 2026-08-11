/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TProviderWithModel } from '@/common/config/storage';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpBackend, AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';
import {
  createCodexReasoningEffortConfigOption,
  getDefaultAcpConfigOptions,
  normalizeCodexConfigOptions,
} from '@/common/types/codex/codexConfigOptions';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarqueePillLabel from './MarqueePillLabel';

function resolveInitialConfigOptions(
  options: unknown[] | undefined,
  backend?: string,
  fallbackCurrentModel?: TProviderWithModel,
  modelInfo?: AcpModelInfo | null,
  selectedModelId?: string
): AcpSessionConfigOption[] {
  const normalizedOptions = Array.isArray(options)
    ? normalizeCodexConfigOptions(options as AcpSessionConfigOption[])
    : [];
  if (backend === 'codex' && modelInfo) {
    const reasoningOption = normalizedOptions.find((option) => option.id === 'reasoning_effort');
    return [
      createCodexReasoningEffortConfigOption({
        modelInfo,
        selectedModelId,
        currentValue: reasoningOption?.currentValue || reasoningOption?.selectedValue,
      }),
    ];
  }
  if (normalizedOptions.length > 0) {
    return normalizedOptions;
  }
  return getDefaultAcpConfigOptions(backend as AcpBackend | 'custom' | undefined, fallbackCurrentModel);
}

/**
 * Dynamic config option selector for ACP agents.
 *
 * Supports two modes:
 * - **Conversation mode** (conversationId provided): fetches live config from backend,
 *   listens for updates via responseStream, and caches to ConfigStorage.
 * - **Local mode** (Guid page / custom conversation selectors): renders from
 *   initialConfigOptions (typically loaded from ConfigStorage cache) and
 *   notifies parent via onOptionSelect.
 */
const AcpConfigSelector: React.FC<{
  conversationId?: string;
  backend?: string;
  compact?: boolean;
  buttonClassName?: string;
  leadingIcon?: ReactNode;
  /** Cached config options for immediate render (from DB or ConfigStorage) */
  initialConfigOptions?: unknown[];
  /** Current provider/model used for backend-specific default options before cache is ready */
  fallbackCurrentModel?: TProviderWithModel;
  /** Live model capabilities used to derive model-specific Codex options */
  modelInfo?: AcpModelInfo | null;
  /** Locally selected model before a conversation exists */
  selectedModelId?: string;
  /** Local/custom callback when user selects an option */
  onOptionSelect?: (configId: string, value: string) => void | boolean | Promise<void | boolean>;
}> = ({
  conversationId,
  backend,
  compact: _compact = false,
  buttonClassName,
  leadingIcon,
  initialConfigOptions,
  fallbackCurrentModel,
  modelInfo,
  selectedModelId,
  onOptionSelect,
}) => {
  const { t } = useTranslation();
  const [configOptions, setConfigOptions] = useState<AcpSessionConfigOption[]>(() =>
    resolveInitialConfigOptions(initialConfigOptions, backend, fallbackCurrentModel, modelInfo, selectedModelId)
  );
  const shouldSyncWithAcpConversation = Boolean(backend && conversationId && !onOptionSelect);

  // Fetch config options on mount (conversation mode only)
  useEffect(() => {
    if (!shouldSyncWithAcpConversation || !conversationId) return;
    let cancelled = false;
    ipcBridge.acpConversation.getConfigOptions
      .invoke({ conversationId })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data?.configOptions?.length > 0) {
          setConfigOptions(result.data.configOptions);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [conversationId, shouldSyncWithAcpConversation]);

  // Listen for config_option_update events from responseStream (conversation mode only)
  useEffect(() => {
    if (!shouldSyncWithAcpConversation || !conversationId) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversationId) return;
      if (message.type === 'acp_model_info') {
        ipcBridge.acpConversation.getConfigOptions
          .invoke({ conversationId })
          .then((result) => {
            if (result.success && result.data?.configOptions?.length > 0) {
              setConfigOptions(result.data.configOptions);
            }
          })
          .catch(() => {});
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversationId, shouldSyncWithAcpConversation]);

  // Sync when initialConfigOptions prop changes (e.g. agent switch on Guid page)
  useEffect(() => {
    setConfigOptions(
      resolveInitialConfigOptions(initialConfigOptions, backend, fallbackCurrentModel, modelInfo, selectedModelId)
    );
  }, [backend, fallbackCurrentModel, initialConfigOptions, modelInfo, selectedModelId]);

  const handleSelectOption = useCallback(
    (configId: string, value: string) => {
      const previousConfigOptions = configOptions;

      // Optimistically update UI
      setConfigOptions((prev) =>
        prev.map((opt) => (opt.id === configId ? { ...opt, currentValue: value, selectedValue: value } : opt))
      );

      // Local/custom mode: notify parent, no ACP IPC needed
      if (onOptionSelect) {
        void Promise.resolve(onOptionSelect(configId, value))
          .then((result) => {
            if (result === false) {
              setConfigOptions(previousConfigOptions);
            }
          })
          .catch((error) => {
            console.error('[AcpConfigSelector] Failed to apply local config option:', error);
            setConfigOptions(previousConfigOptions);
          });
        return;
      }

      if (!conversationId) {
        return;
      }

      // Conversation mode: send to ACP backend
      ipcBridge.acpConversation.setConfigOption
        .invoke({ conversationId, configId, value })
        .then((result) => {
          if (result.success && result.data?.configOptions?.length > 0) {
            setConfigOptions(result.data.configOptions);
          }
        })
        .catch((error) => {
          console.error('[AcpConfigSelector] Failed to set config option:', error);
          // Revert on error by re-fetching
          ipcBridge.acpConversation.getConfigOptions
            .invoke({ conversationId })
            .then((result) => {
              if (result.success && result.data?.configOptions) {
                setConfigOptions(result.data.configOptions);
              }
            })
            .catch(() => {});
        });
    },
    [configOptions, conversationId, onOptionSelect]
  );

  // Don't render when no backend is specified
  if (!backend) return null;

  // Filter: only show select-type options with multiple choices,
  // exclude mode/model (handled by AgentModeSelector / AcpModelSelector)
  const selectOptions = configOptions.filter(
    (opt) =>
      opt.type === 'select' &&
      opt.options &&
      opt.options.length > 1 &&
      opt.category !== 'mode' &&
      opt.category !== 'model'
  );

  // Don't render if no options available
  if (selectOptions.length === 0) return null;

  return (
    <>
      {selectOptions.map((option) => {
        const currentValue = option.currentValue || option.selectedValue;
        const currentLabel =
          option.options?.find((o) => o.value === currentValue)?.name ||
          currentValue ||
          t('acp.config.default', { defaultValue: 'Default' });

        return (
          <Dropdown
            key={option.id}
            trigger='click'
            droplist={
              <Menu>
                <Menu.ItemGroup title={t(`acp.config.${option.id}`, { defaultValue: option.name || 'Options' })}>
                  {option.options?.map((choice) => (
                    <Menu.Item
                      key={choice.value}
                      className={choice.value === currentValue ? 'bg-2!' : ''}
                      onClick={() => handleSelectOption(option.id, choice.value)}
                    >
                      <div className='flex items-center gap-8px'>
                        {choice.value === currentValue && <span className='text-primary'>✓</span>}
                        <span className={choice.value !== currentValue ? 'ml-16px' : ''}>
                          {choice.name || choice.value}
                        </span>
                      </div>
                    </Menu.Item>
                  ))}
                </Menu.ItemGroup>
              </Menu>
            }
          >
            <Button
              className={`sendbox-model-btn agent-mode-compact-pill${buttonClassName ? ` ${buttonClassName}` : ''}`}
              shape='round'
              size='small'
            >
              <span className='flex items-center gap-6px min-w-0 leading-none'>
                {leadingIcon && <span className='shrink-0 inline-flex items-center'>{leadingIcon}</span>}
                <MarqueePillLabel>{currentLabel}</MarqueePillLabel>
                <Down size={12} className='text-t-tertiary shrink-0' />
              </span>
            </Button>
          </Dropdown>
        );
      })}
    </>
  );
};

export default AcpConfigSelector;
