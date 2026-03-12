/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { iconColors } from '@/renderer/theme/colors';
import { getModelDisplayLabel } from '@/renderer/utils/agentUiDisplay';
import type { AcpModelInfo } from '../types';
import { getAvailableModels } from '../utils/modelUtils';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Brain, Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';

type GuidModelSelectorProps = {
  // Gemini model state
  isGeminiMode: boolean;
  modelList: IProvider[];
  currentModel: TProviderWithModel | undefined;
  setCurrentModel: (model: TProviderWithModel) => Promise<void>;
  geminiModeLookup: Map<string, any>;

  // ACP model state
  currentAcpCachedModelInfo: AcpModelInfo | null;
  selectedAcpModel: string | null;
  setSelectedAcpModel: React.Dispatch<React.SetStateAction<string | null>>;
};

const GuidModelSelector: React.FC<GuidModelSelectorProps> = ({ isGeminiMode, modelList, currentModel, setCurrentModel, geminiModeLookup, currentAcpCachedModelInfo, selectedAcpModel, setSelectedAcpModel }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const defaultModelLabel = t('common.defaultModel');

  // 获取模型配置数据（包含健康状态）
  const { data: modelConfig } = useSWR<IProvider[]>('model.config', () => ipcBridge.mode.getModelConfig.invoke());

  // 过滤掉被禁用的 provider
  const enabledModelList = React.useMemo(() => {
    return modelList.filter((p) => p.enabled !== false);
  }, [modelList]);

  const geminiSelectedLabel = React.useMemo(() => {
    if (!currentModel?.useModel) return '';
    const isGoogleProvider = currentModel.platform?.toLowerCase().includes('gemini-with-google-auth');
    if (isGoogleProvider) {
      return geminiModeLookup.get(currentModel.useModel)?.label || currentModel.useModel;
    }
    return currentModel.useModel;
  }, [currentModel?.platform, currentModel?.useModel, geminiModeLookup]);

  const geminiButtonLabel = React.useMemo(() => {
    return getModelDisplayLabel({
      selectedValue: currentModel?.useModel,
      selectedLabel: geminiSelectedLabel,
      defaultModelLabel,
      fallbackLabel: defaultModelLabel,
    });
  }, [currentModel?.useModel, defaultModelLabel, geminiSelectedLabel]);

  const acpSelectedLabel = React.useMemo(() => {
    return currentAcpCachedModelInfo?.availableModels?.find((m) => m.id === selectedAcpModel)?.label || currentAcpCachedModelInfo?.currentModelLabel || currentAcpCachedModelInfo?.currentModelId || '';
  }, [currentAcpCachedModelInfo?.availableModels, currentAcpCachedModelInfo?.currentModelId, currentAcpCachedModelInfo?.currentModelLabel, selectedAcpModel]);

  const acpButtonLabel = React.useMemo(() => {
    return getModelDisplayLabel({
      selectedValue: selectedAcpModel || currentAcpCachedModelInfo?.currentModelId,
      selectedLabel: acpSelectedLabel,
      defaultModelLabel,
      fallbackLabel: defaultModelLabel,
    });
  }, [acpSelectedLabel, currentAcpCachedModelInfo?.currentModelId, defaultModelLabel, selectedAcpModel]);

  if (isGeminiMode) {
    return (
      <Dropdown
        trigger='hover'
        droplist={
          <Menu selectedKeys={currentModel ? [currentModel.id + currentModel.useModel] : []}>
            {!enabledModelList || enabledModelList.length === 0
              ? [
                  <Menu.Item key='no-models' className='px-12px py-12px text-t-secondary text-14px text-center flex justify-center items-center' disabled>
                    {t('settings.noAvailableModels')}
                  </Menu.Item>,
                  <Menu.Item key='add-model' className='text-12px text-t-secondary' onClick={() => navigate('/settings/model')}>
                    <Plus theme='outline' size='12' />
                    {t('settings.addModel')}
                  </Menu.Item>,
                ]
              : [
                  ...(enabledModelList || []).map((provider) => {
                    const availableModels = getAvailableModels(provider);
                    if (availableModels.length === 0) return null;
                    return (
                      <Menu.ItemGroup title={provider.name} key={provider.id}>
                        {availableModels.map((modelName) => {
                          const isGoogleProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
                          const option = isGoogleProvider ? geminiModeLookup.get(modelName) : undefined;

                          // 获取模型健康状态
                          const matchedProvider = modelConfig?.find((p) => p.id === provider.id);
                          const healthStatus = matchedProvider?.modelHealth?.[modelName]?.status || 'unknown';
                          const healthColor = healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';

                          // Manual mode: show submenu with specific models
                          if (option?.subModels && option.subModels.length > 0) {
                            return (
                              <Menu.SubMenu
                                key={provider.id + modelName}
                                title={
                                  <div className='flex items-center gap-8px w-full'>
                                    {healthStatus !== 'unknown' && <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />}
                                    <span>{option.label}</span>
                                  </div>
                                }
                              >
                                {option.subModels.map((subModel: { label: string; value: string }) => (
                                  <Menu.Item
                                    key={provider.id + subModel.value}
                                    className={currentModel?.id + currentModel?.useModel === provider.id + subModel.value ? '!bg-2' : ''}
                                    onClick={() => {
                                      setCurrentModel({ ...provider, useModel: subModel.value }).catch((error) => {
                                        console.error('Failed to set current model:', error);
                                      });
                                    }}
                                  >
                                    {subModel.label}
                                  </Menu.Item>
                                ))}
                              </Menu.SubMenu>
                            );
                          }

                          // Normal mode: show single item
                          return (
                            <Menu.Item
                              key={provider.id + modelName}
                              className={currentModel?.id + currentModel?.useModel === provider.id + modelName ? '!bg-2' : ''}
                              onClick={() => {
                                setCurrentModel({ ...provider, useModel: modelName }).catch((error) => {
                                  console.error('Failed to set current model:', error);
                                });
                              }}
                            >
                              {(() => {
                                if (!option) {
                                  return (
                                    <div className='flex items-center gap-8px w-full'>
                                      {healthStatus !== 'unknown' && <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />}
                                      <span>{modelName}</span>
                                    </div>
                                  );
                                }
                                return (
                                  <Tooltip
                                    position='right'
                                    trigger='hover'
                                    content={
                                      <div className='max-w-240px space-y-6px'>
                                        <div className='text-12px text-t-secondary leading-5'>{option.description}</div>
                                        {option.modelHint && <div className='text-11px text-t-tertiary'>{option.modelHint}</div>}
                                      </div>
                                    }
                                  >
                                    <div className='flex items-center gap-8px w-full'>
                                      {healthStatus !== 'unknown' && <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />}
                                      <span>{option.label}</span>
                                    </div>
                                  </Tooltip>
                                );
                              })()}
                            </Menu.Item>
                          );
                        })}
                      </Menu.ItemGroup>
                    );
                  }),
                  <Menu.Item key='add-model' className='text-12px text-t-secondary' onClick={() => navigate('/settings/model')}>
                    <Plus theme='outline' size='12' />
                    {t('settings.addModel')}
                  </Menu.Item>,
                ]}
          </Menu>
        }
      >
        <Button className={'sendbox-model-btn guid-config-btn'} shape='round' size='small'>
          <span className='flex items-center gap-6px min-w-0'>
            <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
            <span>{geminiButtonLabel}</span>
          </span>
        </Button>
      </Dropdown>
    );
  }

  // ACP cached model selector
  if (currentAcpCachedModelInfo && currentAcpCachedModelInfo.availableModels?.length > 0) {
    if (currentAcpCachedModelInfo.canSwitch) {
      return (
        <Dropdown
          trigger='click'
          droplist={
            <Menu selectedKeys={selectedAcpModel ? [selectedAcpModel] : []}>
              {currentAcpCachedModelInfo.availableModels.map((model) => {
                // 获取模型健康状态
                const backend = currentAcpCachedModelInfo.source;
                const providerConfig = modelConfig?.find((p) => p.platform?.includes(backend || ''));
                const healthStatus = providerConfig?.modelHealth?.[model.id]?.status || 'unknown';
                const healthColor = healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'unhealthy' ? 'bg-red-500' : 'bg-gray-400';

                return (
                  <Menu.Item key={model.id} className={model.id === selectedAcpModel ? '!bg-2' : ''} onClick={() => setSelectedAcpModel(model.id)}>
                    <div className='flex items-center gap-8px w-full'>
                      {healthStatus !== 'unknown' && <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />}
                      <span>{model.label}</span>
                    </div>
                  </Menu.Item>
                );
              })}
            </Menu>
          }
        >
          <Button className={'sendbox-model-btn guid-config-btn'} shape='round' size='small'>
            <span className='flex items-center gap-6px min-w-0'>
              <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
              <span>{acpButtonLabel}</span>
            </span>
          </Button>
        </Dropdown>
      );
    }

    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button className={'sendbox-model-btn guid-config-btn'} shape='round' size='small' style={{ cursor: 'default' }}>
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
