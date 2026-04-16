/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AionrsCapabilities } from '@process/agent/aionrs/protocol';
import MarqueePillLabel from '@/renderer/components/agent/MarqueePillLabel';
import { Button, Dropdown, Menu, Message } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const AionrsEffortSelector: React.FC<{
  conversationId: string;
  capabilities?: AionrsCapabilities | null;
  initialEffort?: string;
}> = ({ conversationId, capabilities, initialEffort }) => {
  const { t } = useTranslation();
  const [currentEffort, setCurrentEffort] = useState<string | null>(initialEffort ?? null);

  const currentModelInfo = useMemo(() => {
    const currentModelId = capabilities?.current_model;
    if (!currentModelId) {
      return undefined;
    }
    return capabilities?.available_models?.find((model) => model.id === currentModelId);
  }, [capabilities?.available_models, capabilities?.current_model]);

  const effortOptions = useMemo(() => {
    if (currentModelInfo?.effort_levels?.length) {
      return currentModelInfo.effort_levels;
    }
    return capabilities?.effort_levels ?? [];
  }, [capabilities?.effort_levels, currentModelInfo?.effort_levels]);

  const defaultEffort = currentModelInfo?.default_effort || initialEffort || effortOptions[0] || null;

  useEffect(() => {
    if (effortOptions.length === 0) {
      setCurrentEffort(null);
      return;
    }

    setCurrentEffort((previous) => {
      if (previous && effortOptions.includes(previous)) {
        return previous;
      }
      if (initialEffort && effortOptions.includes(initialEffort)) {
        return initialEffort;
      }
      return defaultEffort;
    });
  }, [defaultEffort, effortOptions, initialEffort]);

  const handleSelect = useCallback(
    async (effort: string) => {
      if (effort === currentEffort) {
        return;
      }

      const result = await ipcBridge.conversation.setConfig.invoke({
        conversation_id: conversationId,
        config: { effort },
      });

      if (!result.success) {
        Message.warning(result.msg || t('conversation.aionrs.reasoningUpdateFailed'));
        return;
      }

      setCurrentEffort(effort);
    },
    [conversationId, currentEffort, t]
  );

  if (!capabilities?.effort || effortOptions.length < 2) {
    return null;
  }

  const label = currentEffort || t('conversation.aionrs.reasoningEffortDefault');

  return (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          <Menu.ItemGroup title={t('conversation.aionrs.reasoningEffort')}>
            {effortOptions.map((effort) => (
              <Menu.Item
                key={effort}
                className={effort === currentEffort ? 'bg-2!' : ''}
                onClick={() => void handleSelect(effort)}
              >
                <div className='flex items-center gap-8px'>
                  {effort === currentEffort && <span className='text-primary'>✓</span>}
                  <span className={effort !== currentEffort ? 'ml-16px' : ''}>{effort}</span>
                </div>
              </Menu.Item>
            ))}
          </Menu.ItemGroup>
        </Menu>
      }
    >
      <Button className='sendbox-model-btn agent-mode-compact-pill' shape='round' size='small'>
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          <MarqueePillLabel>{`${t('conversation.aionrs.reasoningEffort')} · ${label}`}</MarqueePillLabel>
          <Down size={12} className='text-t-tertiary shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AionrsEffortSelector;
