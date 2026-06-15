/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  classifyConfigSetError,
  type AcpConfigSetStatus,
  type AcpDerivedOption,
} from '@/renderer/hooks/agent/useAcpConfigOptions';
import { iconColors } from '@/renderer/styles/colors';
import { Dropdown, Menu, Message } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import RuntimeSelectorPill from './RuntimeSelectorPill';

const configErrorMessageKey = (error: unknown) => {
  const errorKind = classifyConfigSetError(error);
  if (errorKind === 'command_ack') return 'agent.config.commandAck';
  if (errorKind === 'confirmation_timeout') return 'agent.config.timeout';
  if (errorKind === 'config_update_in_progress') return 'agent.config.busy';
  return 'agent.config.failed';
};

const getCurrentLabel = (thoughtLevel: AcpDerivedOption): string =>
  thoughtLevel.options.find((item) => item.value === thoughtLevel.currentValue)?.label ||
  thoughtLevel.currentValue ||
  '';

const AcpThoughtLevelSelector: React.FC<{
  thoughtLevel: AcpDerivedOption | null;
  setStatus: AcpConfigSetStatus;
  onSetOption: (optionId: string, value: string) => Promise<unknown>;
  iconOnly?: boolean;
}> = ({ thoughtLevel, setStatus, onSetOption, iconOnly = false }) => {
  const { t } = useTranslation();
  const [isLocalSetting, setIsLocalSetting] = useState(false);
  const isSetting = isLocalSetting || setStatus.state === 'setting';
  const currentLabel = useMemo(() => (thoughtLevel ? getCurrentLabel(thoughtLevel) : ''), [thoughtLevel]);

  const handleSelect = useCallback(
    async (value: string) => {
      if (!thoughtLevel || value === thoughtLevel.currentValue || isSetting) return;
      setIsLocalSetting(true);
      try {
        await onSetOption(thoughtLevel.id, value);
        Message.success(t('agent.thoughtLevel.switchSuccess'));
      } catch (error) {
        Message.error(t(configErrorMessageKey(error)));
      } finally {
        setIsLocalSetting(false);
      }
    },
    [isSetting, onSetOption, thoughtLevel, t]
  );

  if (!thoughtLevel) return null;

  return (
    <Dropdown
      trigger='click'
      droplist={
        <Menu>
          <Menu.ItemGroup title={t('agent.thoughtLevel.label')}>
            {thoughtLevel.options.map((item) => (
              <Menu.Item
                key={item.value}
                className={item.value === thoughtLevel.currentValue ? 'bg-2!' : ''}
                onClick={() => void handleSelect(item.value)}
              >
                <div className='flex items-center gap-8px w-full'>
                  {item.value === thoughtLevel.currentValue && <span className='text-primary'>✓</span>}
                  <span className={item.value !== thoughtLevel.currentValue ? 'ml-16px' : ''}>{item.label}</span>
                </div>
              </Menu.Item>
            ))}
          </Menu.ItemGroup>
        </Menu>
      }
    >
      <RuntimeSelectorPill
        testId='acp-thought-level-selector'
        className={`sendbox-model-btn agent-mode-compact-pill ${iconOnly ? 'agent-mode-compact-pill--icon-only' : ''}`}
        label={iconOnly ? undefined : currentLabel}
        leading={<Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />}
        trailing={iconOnly ? null : <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />}
        loading={isSetting}
        disabled={isSetting}
        aria-label={t('agent.thoughtLevel.label')}
      />
    </Dropdown>
  );
};

export default AcpThoughtLevelSelector;
