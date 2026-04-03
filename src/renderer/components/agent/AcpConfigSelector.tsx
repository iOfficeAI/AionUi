/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import type { AcpBackend, AcpSessionConfigOption } from '@/common/types/acpTypes';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarqueePillLabel from './MarqueePillLabel';

/**
 * Backends that currently support ACP configOptions (e.g., thought_level).
 * Other backends will be added here once their ACP layer exposes config options.
 *
 * 目前支援 ACP configOptions 的後端列表。
 * 其他後端（如 Claude Code、OpenCode）待上游支援後再加入。
 */
const CONFIG_OPTION_SUPPORTED_BACKENDS: Set<AcpBackend> = new Set(['codex']);

/** ConfigStorage key for cached config options per backend */
const CACHED_CONFIG_OPTIONS_KEY = 'acp.cachedConfigOptions';

/**
 * Save config options to ConfigStorage keyed by backend.
 */
function cacheConfigOptions(backend: string, options: AcpSessionConfigOption[]): void {
  ConfigStorage.get(CACHED_CONFIG_OPTIONS_KEY)
    .then((cached) => ConfigStorage.set(CACHED_CONFIG_OPTIONS_KEY, { ...cached, [backend]: options }))
    .catch(() => {});
}

/**
 * Dynamic config option selector for ACP agents.
 *
 * Supports two modes:
 * - **Conversation mode** (conversationId provided): fetches live config from backend,
 *   listens for updates via responseStream, and caches to ConfigStorage.
 * - **Local mode** (no conversationId, e.g. Guid page): renders from initialConfigOptions
 *   (typically loaded from ConfigStorage cache) and notifies parent via onOptionSelect.
 */
const AcpConfigSelector: React.FC<{
  conversationId?: string;
  backend?: AcpBackend;
  compact?: boolean;
  /** Cached config options for immediate render (from DB or ConfigStorage) */
  initialConfigOptions?: unknown[];
  /** Local mode callback when user selects an option (Guid page) */
  onOptionSelect?: (configId: string, value: string) => void;
}> = ({ conversationId, backend, compact = false, initialConfigOptions, onOptionSelect }) => {
  const { t } = useTranslation();
  const [configOptions, setConfigOptions] = useState<AcpSessionConfigOption[]>(
    () => (Array.isArray(initialConfigOptions) ? initialConfigOptions : []) as AcpSessionConfigOption[]
  );

  // Skip entirely for unsupported backends
  const isSupported = backend && CONFIG_OPTION_SUPPORTED_BACKENDS.has(backend);
  const isConversationMode = Boolean(conversationId);

  // Fetch config options on mount (conversation mode only)
  useEffect(() => {
    if (!isSupported || !conversationId) return;
    let cancelled = false;
    ipcBridge.acpConversation.getConfigOptions
      .invoke({ conversationId })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data?.configOptions?.length > 0) {
          setConfigOptions(result.data.configOptions);
          cacheConfigOptions(backend, result.data.configOptions);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [conversationId, isSupported, backend]);

  // Listen for config_option_update events from responseStream (conversation mode only)
  useEffect(() => {
    if (!isSupported || !conversationId) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversationId) return;
      if (message.type === 'acp_model_info') {
        ipcBridge.acpConversation.getConfigOptions
          .invoke({ conversationId })
          .then((result) => {
            if (result.success && result.data?.configOptions?.length > 0) {
              setConfigOptions(result.data.configOptions);
              cacheConfigOptions(backend, result.data.configOptions);
            }
          })
          .catch(() => {});
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversationId, isSupported, backend]);

  // Sync when initialConfigOptions prop changes (e.g. agent switch on Guid page)
  useEffect(() => {
    if (Array.isArray(initialConfigOptions) && initialConfigOptions.length > 0) {
      setConfigOptions(initialConfigOptions as AcpSessionConfigOption[]);
    }
  }, [initialConfigOptions]);

  const handleSelectOption = useCallback(
    (configId: string, value: string) => {
      // Optimistically update UI
      setConfigOptions((prev) =>
        prev.map((opt) => (opt.id === configId ? { ...opt, currentValue: value, selectedValue: value } : opt))
      );

      // Local mode (Guid page): notify parent, no IPC needed
      if (!conversationId) {
        onOptionSelect?.(configId, value);
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
    [conversationId, onOptionSelect]
  );

  // Don't render for unsupported backends
  if (!isSupported) return null;

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
            <Button className='sendbox-model-btn agent-mode-compact-pill' shape='round' size='small'>
              <span className='flex items-center gap-6px min-w-0 leading-none'>
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
