/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/storage';
import type { AcpModelInfo } from '../types';
import { getAvailableModels } from '../utils/modelUtils';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type GuidModelSelectorProps = {
  // Gemini model state
  isGeminiMode: boolean;
  modelList: IProvider[];
  currentModel: TProviderWithModel | undefined;
  setCurrentModel: (model: TProviderWithModel) => Promise<void>;
  geminiModeLookup: Map<string, any>;
  formatGeminiModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;

  // ACP model state
  currentAcpCachedModelInfo: AcpModelInfo | null;
  selectedAcpModel: string | null;
  setSelectedAcpModel: React.Dispatch<React.SetStateAction<string | null>>;
};

const GuidModelSelector: React.FC<GuidModelSelectorProps> = ({ isGeminiMode, modelList, currentModel, setCurrentModel, geminiModeLookup, formatGeminiModelLabel, currentAcpCachedModelInfo, selectedAcpModel, setSelectedAcpModel }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (isGeminiMode) {
    return (
      <Dropdown
        trigger='hover'
        droplist={
          <Menu selectedKeys={currentModel ? [currentModel.id + currentModel.useModel] : []}>
            {!modelList || modelList.length === 0
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
                  ...(modelList || []).map((provider) => {
                    const availableModels = getAvailableModels(provider);
                    if (availableModels.length === 0) return null;
                    return (
                      <Menu.ItemGroup title={provider.name} key={provider.id}>
                        {availableModels.map((modelName) => {
                          const isGoogleProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
                          const option = isGoogleProvider ? geminiModeLookup.get(modelName) : undefined;

                          // Manual mode: show submenu with specific models
                          if (option?.subModels && option.subModels.length > 0) {
                            return (
                              <Menu.SubMenu
                                key={provider.id + modelName}
                                title={
                                  <div className='flex items-center justify-between gap-12px w-full'>
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
                                  return modelName;
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
                                    <div className='flex items-center justify-between gap-12px w-full'>
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
        <Button className={'sendbox-model-btn'} shape='round'>
          {currentModel ? formatGeminiModelLabel(currentModel, currentModel.useModel) : t('conversation.welcome.selectModel')}
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
              {currentAcpCachedModelInfo.availableModels.map((model) => (
                <Menu.Item key={model.id} className={model.id === selectedAcpModel ? '!bg-2' : ''} onClick={() => setSelectedAcpModel(model.id)}>
                  <span>{model.label}</span>
                </Menu.Item>
              ))}
            </Menu>
          }
        >
          <Button className={'sendbox-model-btn'} shape='round'>
            {currentAcpCachedModelInfo.availableModels.find((m) => m.id === selectedAcpModel)?.label || selectedAcpModel || t('conversation.welcome.useCliModel')}
          </Button>
        </Dropdown>
      );
    }

    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button className={'sendbox-model-btn'} shape='round' style={{ cursor: 'default' }}>
          {currentAcpCachedModelInfo.currentModelLabel || currentAcpCachedModelInfo.currentModelId || t('conversation.welcome.useCliModel')}
        </Button>
      </Tooltip>
    );
  }

  // Fallback: no model switching
  return (
    <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
      <Button className={'sendbox-model-btn'} shape='round' style={{ cursor: 'default' }}>
        {t('conversation.welcome.useCliModel')}
      </Button>
    </Tooltip>
  );
};

export default GuidModelSelector;
