/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AionrsModelSelection } from './useAionrsModelSelection';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import ModelSelectorDropdownMenu, {
  type GroupedModelDropdownOption,
} from '@/renderer/components/agent/ModelSelectorDropdownMenu';
import { cleanModelLabel } from '@/renderer/components/agent/modelSelectorUtils';
import { Button, Dropdown, Tooltip } from '@arco-design/web-react';
import { Brain, Down } from '@icon-park/react';
import React from 'react';
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
  const options: GroupedModelDropdownOption[] = providers.flatMap((provider) =>
    getAvailableModels(provider).map((modelName) => ({
      key: `${provider.id}:${modelName}`,
      id: modelName,
      label: cleanModelLabel(modelName),
      providerId: provider.id,
      providerName: provider.name,
      testId: `aionrs-model-option-${modelName}`,
    }))
  );
  const selectedOptionKey =
    current_model?.id && current_model?.use_model ? `${current_model.id}:${current_model.use_model}` : undefined;

  return (
    <Dropdown
      trigger='click'
      // Mobile: portal the popup to <body> so it escapes the titlebar slot.
      // Desktop: leave default container so click events reach Menu.Item normally.
      {...(isMobileHeaderCompact ? { getPopupContainer: () => document.body } : {})}
      droplist={
        <ModelSelectorDropdownMenu
          options={options}
          selectedOptionKey={selectedOptionKey}
          onSelect={(option) => {
            const provider = providers.find((item) => item.id === option.providerId);
            if (provider) void handleSelectModel(provider, option.id);
          }}
          searchPlaceholder={t('common.modelSelector.searchPlaceholder')}
          favoritesLabel={t('common.modelSelector.favorites')}
          providerFallbackLabel={t('common.modelSelector.models')}
          noMatchesLabel={t('common.modelSelector.noMatches')}
          addFavoriteLabel={t('common.modelSelector.addFavorite')}
          removeFavoriteLabel={t('common.modelSelector.removeFavorite')}
        />
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
          <span className={compact ? 'block truncate' : undefined}>{label}</span>
          <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AionrsModelSelector;
