/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AionrsModelSelection } from './useAionrsModelSelection';
import type { AcpConfigSetStatus, AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import {
  composeRuntimeSelectorLabel,
  RuntimeSelectorCheckedItem,
  RuntimeSelectorMenuDivider,
  renderThoughtLevelMenuGroup,
} from '@/renderer/components/agent/runtimeSelectorOptions';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';

const AionrsModelSelector: React.FC<{
  selection?: AionrsModelSelection;
  disabled?: boolean;
  thoughtLevel?: AcpDerivedOption | null;
  setStatus?: AcpConfigSetStatus;
  onSetThoughtLevel?: (optionId: string, value: string) => Promise<unknown>;
}> = ({ selection, disabled = false, thoughtLevel = null, setStatus, onSetThoughtLevel }) => {
  const { t } = useTranslation();
  const { isOpen: isPreviewOpen } = usePreviewContext();
  const layout = useLayoutContext();
  const compact = isPreviewOpen || layout?.isMobile;
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const defaultModelLabel = t('common.defaultModel');

  const current_model = selection?.current_model;

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;

  if (disabled || !selection) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button
          className={classNames(
            'sendbox-model-btn header-model-btn',
            compact && '!max-w-[120px]',
            isMobileHeaderCompact && '!max-w-[160px]'
          )}
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0'>
            {renderLogo()}
            <span className={compact ? 'block truncate' : undefined}>{t('conversation.welcome.useCliModel')}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  const { providers, getAvailableModels, handleSelectModel } = selection;

  const label = getModelDisplayLabel({
    selected_value: current_model?.use_model,
    selectedLabel: current_model?.use_model || '',
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.selectModel'),
  });
  const combinedLabel = composeRuntimeSelectorLabel({ modelLabel: label, thoughtLevel });
  const handleThoughtLevelSelect = (value: string) => {
    if (!thoughtLevel || value === thoughtLevel.currentValue || !onSetThoughtLevel) return;
    void onSetThoughtLevel(thoughtLevel.id, value);
  };

  return (
    <Dropdown
      trigger='click'
      // Mobile: portal the popup to <body> so it escapes the titlebar slot.
      // Desktop: leave default container so click events reach Menu.Item normally.
      {...(isMobileHeaderCompact ? { getPopupContainer: () => document.body } : {})}
      droplist={
        <Menu className='aion-model-menu--sticky-group'>
          {renderThoughtLevelMenuGroup({
            thoughtLevel,
            setStatus,
            title: t('agent.thoughtLevel.label'),
            onSelect: handleThoughtLevelSelect,
          })}
          {thoughtLevel && <RuntimeSelectorMenuDivider />}
          {providers.map((provider) => {
            const models = getAvailableModels(provider);
            if (!models.length) return null;

            return (
              <Menu.ItemGroup title={provider.name} key={provider.id}>
                {models.map((modelName) => (
                  <Menu.Item
                    key={`${provider.id}-${modelName}`}
                    data-testid={`aionrs-model-option-${modelName}`}
                    className={current_model?.id + current_model?.use_model === provider.id + modelName ? '!bg-2' : ''}
                    onClick={() => void handleSelectModel(provider, modelName)}
                  >
                    <RuntimeSelectorCheckedItem
                      selected={current_model?.id + current_model?.use_model === provider.id + modelName}
                    >
                      {modelName}
                    </RuntimeSelectorCheckedItem>
                  </Menu.Item>
                ))}
              </Menu.ItemGroup>
            );
          })}
        </Menu>
      }
    >
      <Button
        data-testid='aionrs-model-selector'
        className={classNames(
          'sendbox-model-btn header-model-btn',
          compact && '!max-w-[120px]',
          isMobileHeaderCompact && '!max-w-[160px]'
        )}
        shape='round'
        size='small'
      >
        <span className='flex items-center gap-6px min-w-0'>
          {renderLogo()}
          <span className={compact ? 'block truncate' : undefined}>{combinedLabel}</span>
          <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AionrsModelSelector;
