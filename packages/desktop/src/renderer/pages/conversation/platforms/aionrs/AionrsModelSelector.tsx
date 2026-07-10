/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AionrsModelSelection } from './useAionrsModelSelection';
import type { AcpConfigSetStatus, AcpDerivedOption } from '@/renderer/hooks/agent/useAcpConfigOptions';
import {
  composeRuntimeSelectorLabel,
  getCurrentThoughtLevelLabel,
  RUNTIME_SUBMENU_TRIGGER_PROPS,
  RuntimeSelectorCheckedItem,
  RuntimeSelectorModelList,
  type RuntimeSelectorModelGroup,
  RuntimeSelectorSubMenuTitle,
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

/** Composite id for a provider+model pair, so the shared flat model list can track selection. */
const compositeId = (providerId: string, modelName: string) => `${providerId}::${modelName}`;

const AionrsModelSelector: React.FC<{
  selection?: AionrsModelSelection;
  disabled?: boolean;
  thoughtLevel?: AcpDerivedOption | null;
  /** Kept for call-site compatibility; the two-level submenu no longer gates on set status here. */
  setStatus?: AcpConfigSetStatus;
  onSetThoughtLevel?: (optionId: string, value: string) => Promise<unknown>;
}> = ({ selection, disabled = false, thoughtLevel = null, onSetThoughtLevel }) => {
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

  // aionrs models are grouped by provider. Use a composite id (see compositeId)
  // so the shared model list can track selection, and map it back on select.
  const modelGroups: RuntimeSelectorModelGroup[] = [];
  const modelLookup = new Map<string, { provider: (typeof providers)[number]; modelName: string }>();
  for (const provider of providers) {
    const models = getAvailableModels(provider);
    if (!models.length) continue;
    modelGroups.push({
      key: provider.id,
      title: provider.name,
      models: models.map((modelName) => {
        const id = compositeId(provider.id, modelName);
        modelLookup.set(id, { provider, modelName });
        return { id, label: modelName };
      }),
    });
  }
  const currentCompositeId = current_model ? compositeId(current_model.id, current_model.use_model || '') : null;
  const handleModelSelect = (id: string) => {
    const entry = modelLookup.get(id);
    if (entry) void handleSelectModel(entry.provider, entry.modelName);
  };

  const modelListNode = (
    <RuntimeSelectorModelList groups={modelGroups} currentModelId={currentCompositeId} onSelect={handleModelSelect} />
  );

  return (
    <Dropdown
      trigger='click'
      // Mobile: portal the popup to <body> so it escapes the titlebar slot.
      // Desktop: leave default container so click events reach Menu.Item normally.
      {...(isMobileHeaderCompact ? { getPopupContainer: () => document.body } : {})}
      droplist={
        <Menu>
          {thoughtLevel ? (
            <>
              <Menu.SubMenu
                key='model'
                triggerProps={RUNTIME_SUBMENU_TRIGGER_PROPS}
                title={
                  <RuntimeSelectorSubMenuTitle label={t('common.model', { defaultValue: 'Model' })} value={label} />
                }
              >
                {modelListNode}
              </Menu.SubMenu>
              <Menu.SubMenu
                key='thought-level'
                triggerProps={RUNTIME_SUBMENU_TRIGGER_PROPS}
                title={
                  <RuntimeSelectorSubMenuTitle
                    label={t('agent.thoughtLevel.label')}
                    value={getCurrentThoughtLevelLabel(thoughtLevel)}
                  />
                }
              >
                {thoughtLevel.options.map((item) => (
                  <Menu.Item
                    key={item.value}
                    className={item.value === thoughtLevel.currentValue ? '!bg-2' : ''}
                    onClick={() => handleThoughtLevelSelect(item.value)}
                  >
                    <RuntimeSelectorCheckedItem
                      selected={item.value === thoughtLevel.currentValue}
                      description={item.description}
                    >
                      {item.label}
                    </RuntimeSelectorCheckedItem>
                  </Menu.Item>
                ))}
              </Menu.SubMenu>
            </>
          ) : (
            modelListNode
          )}
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
