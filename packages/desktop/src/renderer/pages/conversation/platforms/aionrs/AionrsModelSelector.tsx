/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AionrsModelSelection } from './useAionrsModelSelection';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { CHAT_OPEN_MODEL_SELECTOR_EVENT } from '@/renderer/utils/chat/chatShortcutEvents';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';

const AionrsModelSelector: React.FC<{
  selection?: AionrsModelSelection;
  disabled?: boolean;
}> = ({ selection, disabled = false }) => {
  const { t } = useTranslation();
  const { isOpen: isPreviewOpen } = usePreviewContext();
  const layout = useLayoutContext();
  const compact = isPreviewOpen || layout?.isMobile;
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const defaultModelLabel = t('common.defaultModel');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const current_model = selection?.current_model;

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;

  useEffect(() => {
    if (disabled || !selection) return undefined;
    const handleOpenModelSelector = () => {
      setDropdownOpen(true);
    };
    window.addEventListener(CHAT_OPEN_MODEL_SELECTOR_EVENT, handleOpenModelSelector);
    return () => {
      window.removeEventListener(CHAT_OPEN_MODEL_SELECTOR_EVENT, handleOpenModelSelector);
    };
  }, [disabled, selection]);

  const providers = selection?.providers ?? [];
  const getAvailableModels = selection?.getAvailableModels;
  const handleSelectModel = selection?.handleSelectModel;
  const modelOptions = useMemo(
    () =>
      providers.flatMap((provider) =>
        (getAvailableModels?.(provider) ?? []).map((modelName) => ({
          key: `${provider.id}-${modelName}`,
          provider,
          modelName,
        }))
      ),
    [getAvailableModels, providers]
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    const selectedIndex = modelOptions.findIndex(
      (option) => current_model?.id + current_model?.use_model === option.provider.id + option.modelName
    );
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [current_model?.id, current_model?.use_model, dropdownOpen, modelOptions]);

  const handleDropdownKeyDown = useCallback(
    (event: React.KeyboardEvent | KeyboardEvent) => {
      if (!modelOptions.length || !handleSelectModel) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setDropdownOpen(false);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'Tab') {
        event.preventDefault();
        setActiveIndex((previous) => (previous + 1) % modelOptions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((previous) => (previous - 1 + modelOptions.length) % modelOptions.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const option = modelOptions[activeIndex];
        if (option) {
          void handleSelectModel(option.provider, option.modelName);
          setDropdownOpen(false);
        }
      }
    },
    [activeIndex, handleSelectModel, modelOptions]
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    document.addEventListener('keydown', handleDropdownKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleDropdownKeyDown, true);
    };
  }, [dropdownOpen, handleDropdownKeyDown]);

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

  const label = getModelDisplayLabel({
    selected_value: current_model?.use_model,
    selectedLabel: current_model?.use_model || '',
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.selectModel'),
  });

  return (
    <Dropdown
      trigger='click'
      popupVisible={dropdownOpen}
      onVisibleChange={setDropdownOpen}
      // Mobile: portal the popup to <body> so it escapes the titlebar slot.
      // Desktop: leave default container so click events reach Menu.Item normally.
      {...(isMobileHeaderCompact ? { getPopupContainer: () => document.body } : {})}
      droplist={
        <Menu tabIndex={-1} onKeyDown={handleDropdownKeyDown}>
          {providers.map((provider) => {
            const models = getAvailableModels?.(provider) ?? [];
            if (!models.length) return null;

            return (
              <Menu.ItemGroup title={provider.name} key={provider.id}>
                {models.map((modelName) => (
                  <Menu.Item
                    key={`${provider.id}-${modelName}`}
                    data-testid={`aionrs-model-option-${modelName}`}
                    className={classNames({
                      '!bg-2': current_model?.id + current_model?.use_model === provider.id + modelName,
                      '!bg-fill-3': modelOptions[activeIndex]?.key === `${provider.id}-${modelName}`,
                    })}
                    onMouseEnter={() => {
                      const index = modelOptions.findIndex((option) => option.key === `${provider.id}-${modelName}`);
                      if (index >= 0) setActiveIndex(index);
                    }}
                    onClick={() => void handleSelectModel(provider, modelName)}
                  >
                    <div className='flex items-center gap-8px w-full'>
                      <span>{modelName}</span>
                    </div>
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
        onKeyDown={dropdownOpen ? handleDropdownKeyDown : undefined}
      >
        <span className='flex items-center gap-6px min-w-0'>
          {renderLogo()}
          <span className={compact ? 'block truncate' : undefined}>{label}</span>
          <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AionrsModelSelector;
