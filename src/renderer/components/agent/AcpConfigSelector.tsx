/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpSessionConfigOption } from '@/common/types/acpTypes';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarqueePillLabel from './MarqueePillLabel';

/**
 * Dynamic config option selector for ACP agents.
 *
 * Supports two modes:
 * - **Conversation mode** (conversation_id provided): fetches live config from backend,
 *   listens for updates via responseStream, and caches to ConfigStorage.
 * - **Local mode** (no conversation_id, e.g. Guid page): renders from initialConfigOptions
 *   (typically loaded from ConfigStorage cache) and notifies parent via onOptionSelect.
 */
const AcpConfigSelector: React.FC<{
  conversation_id?: string;
  backend?: string;
  compact?: boolean;
  buttonClassName?: string;
  leadingIcon?: ReactNode;
  /** Cached config options for immediate render (from DB or ConfigStorage) */
  initialConfigOptions?: unknown[];
  /** Local mode callback when user selects an option (Guid page) */
  onOptionSelect?: (config_id: string, value: string) => void;
}> = ({
  conversation_id,
  backend,
  compact: _compact = false,
  buttonClassName,
  leadingIcon,
  initialConfigOptions,
  onOptionSelect,
}) => {
  const { t } = useTranslation();
  const [config_options, setConfigOptions] = useState<AcpSessionConfigOption[]>(
    () => (Array.isArray(initialConfigOptions) ? initialConfigOptions : []) as AcpSessionConfigOption[]
  );

  // Fetch config options on mount (conversation mode only)
  useEffect(() => {
    if (!backend || !conversation_id) return;
    let cancelled = false;
    ipcBridge.acpConversation.getConfigOptions
      .invoke({ conversation_id })
      .then((result) => {
        if (cancelled) return;
        if (result?.config_options?.length > 0) {
          setConfigOptions(result.config_options);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [conversation_id, backend]);

  // Listen for config_option_update events from responseStream (conversation mode only)
  useEffect(() => {
    if (!backend || !conversation_id) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'acp_model_info') {
        ipcBridge.acpConversation.getConfigOptions
          .invoke({ conversation_id })
          .then((result) => {
            if (result?.config_options?.length > 0) {
              setConfigOptions(result.config_options);
            }
          })
          .catch(() => {});
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversation_id, backend]);

  // Sync when initialConfigOptions prop changes (e.g. agent switch on Guid page)
  useEffect(() => {
    if (Array.isArray(initialConfigOptions)) {
      setConfigOptions(initialConfigOptions as AcpSessionConfigOption[]);
    }
  }, [initialConfigOptions]);

  const handleSelectOption = useCallback(
    (config_id: string, value: string) => {
      // Optimistically update UI
      setConfigOptions((prev) =>
        prev.map((opt) => (opt.id === config_id ? { ...opt, current_value: value, selected_value: value } : opt))
      );

      // Local mode (Guid page): notify parent, no IPC needed
      if (!conversation_id) {
        onOptionSelect?.(config_id, value);
        return;
      }

      // Conversation mode: send to ACP backend (setConfigOption returns void)
      ipcBridge.acpConversation.setConfigOption
        .invoke({ conversation_id, config_id, value })
        .then(() => {
          // Re-fetch config options after successful set
          ipcBridge.acpConversation.getConfigOptions
            .invoke({ conversation_id })
            .then((result) => {
              if (result?.config_options?.length > 0) {
                setConfigOptions(result.config_options);
              }
            })
            .catch(() => {});
        })
        .catch((error) => {
          console.error('[AcpConfigSelector] Failed to set config option:', error);
          // Revert on error by re-fetching
          ipcBridge.acpConversation.getConfigOptions
            .invoke({ conversation_id })
            .then((result) => {
              if (result?.config_options) {
                setConfigOptions(result.config_options);
              }
            })
            .catch(() => {});
        });
    },
    [conversation_id, onOptionSelect]
  );

  // Don't render when no backend is specified
  if (!backend) return null;

  // Filter: only show select-type options with multiple choices,
  // exclude mode/model (handled by AgentModeSelector / AcpModelSelector)
  const selectOptions = config_options.filter(
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
        const current_value = option.current_value || option.selected_value;
        const currentLabel =
          option.options?.find((o) => o.value === current_value)?.name ||
          current_value ||
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
                      className={choice.value === current_value ? 'bg-2!' : ''}
                      onClick={() => handleSelectOption(option.id, choice.value)}
                    >
                      <div className='flex items-center gap-8px'>
                        {choice.value === current_value && <span className='text-primary'>✓</span>}
                        <span className={choice.value !== current_value ? 'ml-16px' : ''}>
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
