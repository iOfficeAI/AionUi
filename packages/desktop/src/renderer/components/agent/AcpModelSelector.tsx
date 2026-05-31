/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { CHAT_OPEN_MODEL_SELECTOR_EVENT } from '@/renderer/utils/chat/chatShortcutEvents';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarqueePillLabel from './MarqueePillLabel';

/**
 * Model selector for ACP-based agents. Renders three states:
 * - null model info: disabled "Use CLI model" button (backward compatible)
 * - no available_models: read-only display of current model name
 * - has available_models: clickable dropdown selector
 *
 * Data fetching/syncing lives in `useAcpModelInfo` so the mobile action
 * sheet can read from the same source.
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
  const { model_info, canSwitch, selectModel } = useAcpModelInfo({ conversation_id, backend, initialModelId });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

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

  useEffect(() => {
    if (!canSwitch) return undefined;
    const handleOpenModelSelector = () => {
      setDropdownOpen(true);
    };
    window.addEventListener(CHAT_OPEN_MODEL_SELECTOR_EVENT, handleOpenModelSelector);
    return () => {
      window.removeEventListener(CHAT_OPEN_MODEL_SELECTOR_EVENT, handleOpenModelSelector);
    };
  }, [canSwitch]);

  const availableModels = useMemo(() => model_info?.available_models ?? [], [model_info?.available_models]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const selectedIndex = availableModels.findIndex((model) => model.id === model_info?.current_model_id);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [availableModels, dropdownOpen, model_info?.current_model_id]);

  const handleDropdownKeyDown = useCallback(
    (event: React.KeyboardEvent | KeyboardEvent) => {
      if (!availableModels.length) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setDropdownOpen(false);
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'Tab') {
        event.preventDefault();
        setActiveIndex((previous) => (previous + 1) % availableModels.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((previous) => (previous - 1 + availableModels.length) % availableModels.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const model = availableModels[activeIndex];
        if (model) {
          void selectModel(model.id);
          setDropdownOpen(false);
        }
      }
    },
    [activeIndex, availableModels, selectModel]
  );

  useEffect(() => {
    if (!dropdownOpen) return;
    document.addEventListener('keydown', handleDropdownKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleDropdownKeyDown, true);
    };
  }, [dropdownOpen, handleDropdownKeyDown]);

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
          {availableModels.map((model, index) => (
            <Menu.Item
              key={model.id}
              className={classNames({
                'bg-2!': model.id === model_info.current_model_id,
                '!bg-fill-3': index === activeIndex,
              })}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectModel(model.id)}
            >
              <div className='flex items-center gap-8px w-full'>
                <span>{model.label || model.id}</span>
              </div>
            </Menu.Item>
          ))}
        </Menu>
      }
    >
      <Button
        className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
        shape='round'
        size='small'
        onKeyDown={dropdownOpen ? handleDropdownKeyDown : undefined}
      >
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
