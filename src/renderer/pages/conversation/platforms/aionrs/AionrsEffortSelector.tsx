/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { TProviderWithModel } from '@/common/config/storage';
import type { AcpSessionConfigOption } from '@/common/types/acpTypes';
import {
  createChatgptReasoningEffortConfigOption,
  isChatgptReasoningEffortValue,
} from '@/common/types/codex/codexConfigOptions';
import type { AionrsCapabilities } from '@process/agent/aionrs/protocol';
import AcpConfigSelector from '@/renderer/components/agent/AcpConfigSelector';
import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AionrsRuntimeModelInfo } from './useAionrsModelSelection';

const formatEffortLabel = (effort: string) => effort.charAt(0).toUpperCase() + effort.slice(1);

async function savePreferredAionrsEffort(effort: string): Promise<void> {
  const config = await ConfigStorage.get('aionrs.config');
  await ConfigStorage.set('aionrs.config', {
    ...config,
    preferredConfigOptions: {
      ...config?.preferredConfigOptions,
      reasoning_effort: effort,
    },
  });
}

const AionrsEffortSelector: React.FC<{
  conversationId: string;
  capabilities?: AionrsCapabilities | null;
  currentModel?: TProviderWithModel;
  currentModelInfo?: AionrsRuntimeModelInfo;
  initialEffort?: string;
}> = ({ conversationId, capabilities, currentModel, currentModelInfo, initialEffort }) => {
  const { t } = useTranslation();
  const [currentEffort, setCurrentEffort] = useState<string | null>(initialEffort ?? null);
  const isChatgptModel = currentModel?.platform === 'chatgpt';

  const effortValues = useMemo(() => {
    if (isChatgptModel) {
      return createChatgptReasoningEffortConfigOption().options?.map((choice) => choice.value) ?? [];
    }

    if (currentModelInfo?.effort_levels?.length) {
      return currentModelInfo.effort_levels;
    }

    return capabilities?.effort_levels ?? [];
  }, [capabilities?.effort_levels, currentModelInfo?.effort_levels, isChatgptModel]);

  const defaultEffort = useMemo(() => {
    if (isChatgptModel) {
      if (isChatgptReasoningEffortValue(initialEffort)) {
        return initialEffort;
      }
      if (isChatgptReasoningEffortValue(currentModelInfo?.default_effort)) {
        return currentModelInfo.default_effort;
      }
      return createChatgptReasoningEffortConfigOption().currentValue ?? null;
    }

    return currentModelInfo?.default_effort || initialEffort || effortValues[0] || null;
  }, [currentModelInfo?.default_effort, effortValues, initialEffort, isChatgptModel]);

  useEffect(() => {
    if (effortValues.length === 0) {
      setCurrentEffort(null);
      return;
    }

    setCurrentEffort((previous) => {
      if (previous && effortValues.includes(previous)) {
        return previous;
      }
      if (initialEffort && effortValues.includes(initialEffort)) {
        return initialEffort;
      }
      if (defaultEffort && effortValues.includes(defaultEffort)) {
        return defaultEffort;
      }
      return effortValues[0] ?? null;
    });
  }, [defaultEffort, effortValues, initialEffort]);

  const configOptions = useMemo<AcpSessionConfigOption[]>(() => {
    if (!capabilities?.effort || effortValues.length < 2) {
      return [];
    }

    if (isChatgptModel) {
      return [createChatgptReasoningEffortConfigOption(currentEffort ?? defaultEffort ?? undefined)];
    }

    return [
      {
        id: 'reasoning_effort',
        name: 'Reasoning effort',
        category: 'reasoning',
        type: 'select',
        currentValue: currentEffort ?? defaultEffort ?? undefined,
        options: effortValues.map((effort) => ({
          value: effort,
          name: formatEffortLabel(effort),
        })),
      },
    ];
  }, [capabilities?.effort, currentEffort, defaultEffort, effortValues, isChatgptModel]);

  const handleSelect = useCallback(
    async (effort: string) => {
      if (effort === currentEffort) {
        return true;
      }

      try {
        const result = await ipcBridge.conversation.setConfig.invoke({
          conversation_id: conversationId,
          config: { effort },
        });

        if (!result.success) {
          Message.warning(result.msg || t('conversation.aionrs.reasoningUpdateFailed'));
          return false;
        }

        setCurrentEffort(effort);
        void savePreferredAionrsEffort(effort).catch(() => {
          // Best effort only. The per-conversation config already changed.
        });
        return true;
      } catch (error) {
        console.error('[AionrsEffortSelector] Failed to update reasoning effort:', error);
        Message.warning(t('conversation.aionrs.reasoningUpdateFailed'));
        return false;
      }
    },
    [conversationId, currentEffort, t]
  );

  if (configOptions.length === 0) {
    return null;
  }

  return (
    <AcpConfigSelector
      backend='aionrs'
      conversationId={conversationId}
      initialConfigOptions={configOptions}
      onOptionSelect={(_configId, value) => handleSelect(value)}
    />
  );
};

export default AionrsEffortSelector;
