/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import ModelSelectorDropdownMenu, {
  type GroupedModelDropdownOption,
} from '@/renderer/components/agent/ModelSelectorDropdownMenu';
import { cleanModelLabel, extractProviderFromLabel } from '@/renderer/components/agent/modelSelectorUtils';
import { iconColors } from '@/renderer/styles/colors';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import type { AcpModelInfo } from '../types';
import { getAvailableModels } from '../utils/modelUtils';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain, Down, Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';

type GuidModelSelectorProps = {
  // Gemini model state
  isGeminiMode: boolean;
  modelList: IProvider[];
  current_model: TProviderWithModel | undefined;
  setCurrentModel: (model: TProviderWithModel) => Promise<void>;

  // ACP model state
  currentAcpCachedModelInfo: AcpModelInfo | null;
  selectedAcpModel: string | null;
  setSelectedAcpModel: React.Dispatch<React.SetStateAction<string | null>>;
};

const GuidModelSelector: React.FC<GuidModelSelectorProps> = ({
  isGeminiMode,
  modelList,
  current_model,
  setCurrentModel,
  currentAcpCachedModelInfo,
  selectedAcpModel,
  setSelectedAcpModel,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const defaultModelLabel = t('common.defaultModel');

  // 获取模型配置数据（包含健康状态）
  const { data: modelConfig } = useProvidersQuery();

  // 过滤掉被禁用的 provider
  const enabledModelList = React.useMemo(() => {
    return modelList.filter((p) => p.enabled !== false);
  }, [modelList]);

  const geminiSelectedLabel = React.useMemo(() => {
    if (!current_model?.use_model) return '';
    return current_model.use_model;
  }, [current_model?.use_model]);

  const geminiButtonLabel = React.useMemo(() => {
    return getModelDisplayLabel({
      selected_value: current_model?.use_model,
      selectedLabel: geminiSelectedLabel,
      defaultModelLabel,
      fallbackLabel: defaultModelLabel,
    });
  }, [current_model?.use_model, defaultModelLabel, geminiSelectedLabel]);

  const acpSelectedLabel = React.useMemo(() => {
    return cleanModelLabel(
      currentAcpCachedModelInfo?.available_models?.find((m) => m.id === selectedAcpModel)?.label ||
        currentAcpCachedModelInfo?.current_model_label ||
        currentAcpCachedModelInfo?.current_model_id ||
        ''
    );
  }, [
    currentAcpCachedModelInfo?.available_models,
    currentAcpCachedModelInfo?.current_model_id,
    currentAcpCachedModelInfo?.current_model_label,
    selectedAcpModel,
  ]);

  const acpButtonLabel = React.useMemo(() => {
    return getModelDisplayLabel({
      selected_value: selectedAcpModel || currentAcpCachedModelInfo?.current_model_id,
      selectedLabel: acpSelectedLabel,
      defaultModelLabel,
      fallbackLabel: defaultModelLabel,
    });
  }, [acpSelectedLabel, currentAcpCachedModelInfo?.current_model_id, defaultModelLabel, selectedAcpModel]);

  const renderHealthDot = (healthStatus: string) => {
    const healthColor =
      healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';

    return healthStatus !== 'unknown' ? <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} /> : null;
  };

  if (isGeminiMode) {
    const geminiOptions: GroupedModelDropdownOption[] = enabledModelList.flatMap((provider) => {
      const available_models = getAvailableModels(provider);
      const matchedProvider = modelConfig?.find((p) => p.id === provider.id);

      return available_models.map((modelName) => {
        const healthStatus = matchedProvider?.model_health?.[modelName]?.status || 'unknown';
        return {
          key: `${provider.id}:${modelName}`,
          id: modelName,
          label: cleanModelLabel(modelName),
          providerId: provider.id,
          providerName: provider.name,
          leading: renderHealthDot(healthStatus),
        };
      });
    });
    const selectedOptionKey =
      current_model?.id && current_model.use_model ? `${current_model.id}:${current_model.use_model}` : undefined;

    return (
      <Dropdown
        trigger='click'
        droplist={
          <>
            {!enabledModelList || enabledModelList.length === 0 ? (
              <Menu selectedKeys={current_model ? [current_model.id + current_model.use_model] : []}>
                <Menu.Item
                  key='no-models'
                  className='px-12px py-12px text-t-secondary text-14px text-center flex justify-center items-center'
                  disabled
                >
                  {t('settings.noAvailableModels')}
                </Menu.Item>
                <Menu.Item
                  key='add-model'
                  className='text-12px text-t-secondary'
                  onClick={() => navigate('/settings/model')}
                >
                  <Plus theme='outline' size='12' />
                  {t('settings.addModel')}
                </Menu.Item>
              </Menu>
            ) : (
              <ModelSelectorDropdownMenu
                options={geminiOptions}
                selectedOptionKey={selectedOptionKey}
                onSelect={(option) => {
                  const provider = enabledModelList.find((item) => item.id === option.providerId);
                  if (!provider) return;
                  setCurrentModel({ ...provider, use_model: option.id }).catch((error) => {
                    console.error('Failed to set current model:', error);
                  });
                }}
                searchPlaceholder={t('common.modelSelector.searchPlaceholder')}
                favoritesLabel={t('common.modelSelector.favorites')}
                providerFallbackLabel={t('common.modelSelector.models')}
                noMatchesLabel={t('common.modelSelector.noMatches')}
                addFavoriteLabel={t('common.modelSelector.addFavorite')}
                removeFavoriteLabel={t('common.modelSelector.removeFavorite')}
                footer={
                  <Button
                    type='text'
                    size='mini'
                    className='!w-full !justify-start !text-12px !text-t-secondary'
                    onClick={() => navigate('/settings/model')}
                  >
                    <Plus theme='outline' size='12' />
                    {t('settings.addModel')}
                  </Button>
                }
              />
            )}
          </>
        }
      >
        <Button
          className={'sendbox-model-btn guid-config-btn'}
          shape='round'
          size='small'
          data-testid='guid-model-selector'
        >
          <span className='flex items-center gap-6px min-w-0'>
            <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
            <span>{geminiButtonLabel}</span>
            <Down theme='outline' size='12' fill={iconColors.secondary} className='shrink-0' />
          </span>
        </Button>
      </Dropdown>
    );
  }

  // ACP cached model selector
  if (currentAcpCachedModelInfo && currentAcpCachedModelInfo.available_models?.length > 0) {
    if (currentAcpCachedModelInfo.available_models.length > 0) {
      const acpOptions: GroupedModelDropdownOption[] = currentAcpCachedModelInfo.available_models.map((model) => {
        const rawLabel = model.label || model.id;
        const extracted = extractProviderFromLabel(rawLabel);
        const providerId = model.provider_id ?? model.providerId ?? extracted.providerId;
        const providerName = model.provider_name ?? model.providerName ?? extracted.providerId;
        const providerConfig = modelConfig?.find((p) => p.platform?.includes(''));
        const healthStatus = providerConfig?.model_health?.[model.id]?.status || 'unknown';

        return {
          key: providerId ? `${providerId}:${model.id}` : `guid-acp:${model.id}`,
          id: model.id,
          label: extracted.cleanLabel || model.id,
          providerId,
          providerName,
          leading: renderHealthDot(healthStatus),
        };
      });
      const selectedModelId = selectedAcpModel || currentAcpCachedModelInfo.current_model_id;
      const selectedModel = currentAcpCachedModelInfo.available_models.find((model) => model.id === selectedModelId);
      const selectedProviderId = selectedModel?.provider_id ?? selectedModel?.providerId;
      const selectedOptionKey = selectedModelId ? `${selectedProviderId ?? 'guid-acp'}:${selectedModelId}` : undefined;

      return (
        <Dropdown
          trigger='click'
          droplist={
            <ModelSelectorDropdownMenu
              options={acpOptions}
              selectedOptionKey={selectedOptionKey}
              onSelect={(option) => setSelectedAcpModel(option.id)}
              searchPlaceholder={t('common.modelSelector.searchPlaceholder')}
              favoritesLabel={t('common.modelSelector.favorites')}
              providerFallbackLabel={t('common.modelSelector.models')}
              noMatchesLabel={t('common.modelSelector.noMatches')}
              addFavoriteLabel={t('common.modelSelector.addFavorite')}
              removeFavoriteLabel={t('common.modelSelector.removeFavorite')}
            />
          }
        >
          <Button className={'sendbox-model-btn guid-config-btn'} shape='round' size='small'>
            <span className='flex items-center gap-6px min-w-0'>
              <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
              <span>{acpButtonLabel}</span>
              <Down theme='outline' size='12' fill={iconColors.secondary} className='shrink-0' />
            </span>
          </Button>
        </Dropdown>
      );
    }

    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button
          className={'sendbox-model-btn guid-config-btn'}
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0'>
            <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
            <span>{acpButtonLabel}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  // Fallback: no model switching
  return (
    <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
      <Button className={'sendbox-model-btn guid-config-btn'} shape='round' size='small' style={{ cursor: 'default' }}>
        <span className='flex items-center gap-6px min-w-0'>
          <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
          <span>{defaultModelLabel}</span>
        </span>
      </Button>
    </Tooltip>
  );
};

export default GuidModelSelector;
