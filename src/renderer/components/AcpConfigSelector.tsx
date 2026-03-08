/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { AcpSessionConfigOption } from '@/types/acpTypes';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Hardcoded thinking budget options for backends that don't expose
 * thought_level via ACP configOptions (e.g., Claude Code).
 *
 * Values aligned with claudian's THINKING_BUDGETS:
 * off=0, low=4000, medium=8000, high=16000, xhigh=32000 tokens.
 */
const FALLBACK_THINKING_OPTIONS: AcpSessionConfigOption = {
  id: 'thinking_budget',
  name: 'Thinking',
  description: 'Control how much the model thinks before responding',
  category: 'thought_level',
  type: 'select',
  currentValue: 'medium',
  options: [
    { value: 'off', name: 'Off' },
    { value: 'low', name: 'Low' },
    { value: 'medium', name: 'Medium' },
    { value: 'high', name: 'High' },
    { value: 'xhigh', name: 'Ultra' },
  ],
};

/**
 * Generic config option selector for ACP agents.
 * - For backends that expose configOptions (e.g., Codex): renders them dynamically
 * - For backends that don't (e.g., Claude Code): falls back to hardcoded thinking options
 *
 * ACP 代理的通用配置选项选择器。
 * - 对暴露 configOptions 的后端（如 Codex）：动态渲染
 * - 对不暴露的后端（如 Claude Code）：使用硬编码的 thinking 选项作为 fallback
 */
const AcpConfigSelector: React.FC<{
  conversationId: string;
  compact?: boolean;
  /** When true, show fallback thinking options if backend doesn't provide any */
  enableFallback?: boolean;
}> = ({ conversationId, compact: _compact, enableFallback }) => {
  const { t } = useTranslation();
  const [configOptions, setConfigOptions] = useState<AcpSessionConfigOption[]>([]);
  const [fetchDone, setFetchDone] = useState(false);
  const [fallbackValue, setFallbackValue] = useState<string>(FALLBACK_THINKING_OPTIONS.currentValue || 'medium');

  // Fetch config options on mount
  useEffect(() => {
    let cancelled = false;
    setFetchDone(false);
    ipcBridge.acpConversation.getConfigOptions
      .invoke({ conversationId })
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data?.configOptions?.length > 0) {
          setConfigOptions(result.data.configOptions);
        }
        setFetchDone(true);
      })
      .catch(() => {
        if (!cancelled) setFetchDone(true);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Listen for config_option_update events from responseStream
  useEffect(() => {
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
  }, [conversationId]);

  // Merge fallback thinking options if backend doesn't provide thought_level
  const effectiveOptions = useMemo(() => {
    const hasThoughtLevel = configOptions.some((opt) => opt.category === 'thought_level');
    if (!hasThoughtLevel && enableFallback && fetchDone) {
      return [...configOptions, { ...FALLBACK_THINKING_OPTIONS, currentValue: fallbackValue }];
    }
    return configOptions;
  }, [configOptions, enableFallback, fetchDone, fallbackValue]);

  const handleSelectOption = useCallback(
    (configId: string, value: string) => {
      // Check if this is a fallback option (not in configOptions state)
      const isFallback = configId === FALLBACK_THINKING_OPTIONS.id && !configOptions.some((opt) => opt.id === configId);

      if (isFallback) {
        // Update fallback state directly
        setFallbackValue(value);
      } else {
        // Optimistically update UI for real config options
        setConfigOptions((prev) => prev.map((opt) => (opt.id === configId ? { ...opt, currentValue: value, selectedValue: value } : opt)));
      }

      // Send to ACP backend (best-effort for both real and fallback options)
      ipcBridge.acpConversation.setConfigOption
        .invoke({ conversationId, configId, value })
        .then((result) => {
          if (result.success && result.data?.configOptions?.length > 0) {
            setConfigOptions(result.data.configOptions);
          }
        })
        .catch((error) => {
          console.error('[AcpConfigSelector] Failed to set config option:', error);
          if (!isFallback) {
            // Revert on error by re-fetching (only for real options)
            ipcBridge.acpConversation.getConfigOptions
              .invoke({ conversationId })
              .then((result) => {
                if (result.success && result.data?.configOptions) {
                  setConfigOptions(result.data.configOptions);
                }
              })
              .catch(() => {});
          }
        });
    },
    [conversationId, configOptions]
  );

  // Filter to only show select-type options with multiple choices
  const selectOptions = effectiveOptions.filter((opt) => opt.type === 'select' && opt.options && opt.options.length > 1);

  // Don't render if no options available
  if (selectOptions.length === 0) return null;

  return (
    <>
      {selectOptions.map((option) => {
        const currentLabel = option.options?.find((o) => o.value === option.currentValue)?.name || option.currentValue || option.name || t('acp.config.default');

        return (
          <Dropdown
            key={option.id}
            trigger='click'
            droplist={
              <Menu>
                {option.options?.map((choice) => (
                  <Menu.Item key={choice.value} className={choice.value === option.currentValue ? 'bg-2!' : ''} onClick={() => handleSelectOption(option.id, choice.value)}>
                    <span>{choice.name || choice.value}</span>
                  </Menu.Item>
                ))}
              </Menu>
            }
          >
            <Button className='sendbox-model-btn agent-mode-compact-pill' shape='round' size='small'>
              <span className='flex items-center gap-6px min-w-0 leading-none'>
                <span className='block truncate leading-none'>{currentLabel}</span>
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
