/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import { geminiModeList } from '@/renderer/hooks/useModeModeList';
import { Button, Dropdown, Input, Menu, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Plus } from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';

/**
 * 缓存Provider的可用模型列表，避免重复计算
 */
const availableModelsCache = new Map<string, string[]>();

/**
 * 获取提供商下所有可用的主力模型（带缓存）
 * @param provider - 提供商配置
 * @returns 可用的主力模型名称数组
 */
const getAvailableModels = (provider: IProvider): string[] => {
  // 生成缓存键，包含模型列表以检测变化
  const cacheKey = `${provider.id}-${provider.name}-${(provider.model || []).join(',')}`;

  // 检查缓存
  if (availableModelsCache.has(cacheKey)) {
    return availableModelsCache.get(cacheKey)!;
  }

  // 计算可用模型
  const result: string[] = [];
  for (const modelName of provider.model || []) {
    const functionCalling = hasSpecificModelCapability(provider, modelName, 'function_calling');
    const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');

    if ((functionCalling === true || functionCalling === undefined) && excluded !== true) {
      result.push(modelName);
    }
  }

  // 缓存结果
  availableModelsCache.set(cacheKey, result);
  return result;
};

/**
 * 检查提供商是否有可用的主力对话模型（高效版本）
 * @param provider - 提供商配置
 * @returns true 表示提供商有可用模型，false 表示无可用模型
 */
const hasAvailableModels = (provider: IProvider): boolean => {
  // 直接使用缓存的结果，避免重复计算
  const availableModels = getAvailableModels(provider);
  return availableModels.length > 0;
};

const useModelList = () => {
  const geminiConfig = useSWR('gemini.config', () => {
    return ConfigStorage.get('gemini.config');
  });
  const { data: isGoogleAuth } = useSWR('google.auth.status' + geminiConfig.data?.proxy, () => {
    return ipcBridge.googleAuth.status.invoke({ proxy: geminiConfig.data?.proxy }).then((data) => {
      return data.success;
    });
  });
  const { data: modelConfig } = useSWR('model.config.welcome', () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      return (data || []).filter((platform) => !!platform.model.length);
    });
  });

  const modelList = useMemo(() => {
    let allProviders: IProvider[] = [];

    if (isGoogleAuth) {
      const geminiProvider: IProvider = {
        id: uuid(),
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        baseUrl: '',
        apiKey: '',
        model: geminiModeList.map((v) => v.value),
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
      };
      allProviders = [geminiProvider, ...(modelConfig || [])];
    } else {
      allProviders = modelConfig || [];
    }

    // 过滤出有可用主力模型的提供商
    return allProviders.filter(hasAvailableModels);
  }, [isGoogleAuth, modelConfig]);

  return { modelList, isGoogleAuth };
};

const Guid: React.FC = () => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [dir, setDir] = useState<string>('');
  const [currentModel, _setCurrentModel] = useState<TProviderWithModel>();
  const setCurrentModel = async (modelInfo: TProviderWithModel) => {
    await ConfigStorage.set('gemini.defaultModel', modelInfo.useModel);
    _setCurrentModel(modelInfo);
  };
  const navigate = useNavigate();
  const handleSend = async () => {
    if (!currentModel) return;
    const conversation = await ipcBridge.conversation.create.invoke({
      type: 'gemini',
      name: input,
      model: currentModel,
      extra: {
        defaultFiles: files,
        workspace: dir,
        webSearchEngine: isGoogleAuth ? 'google' : 'default',
      },
    });
    await ipcBridge.geminiConversation.sendMessage.invoke({
      input:
        files.length > 0
          ? files
              .map((v) => v.split(/[\\/]/).pop() || '')
              .map((v) => `@${v}`)
              .join(' ') +
            ' ' +
            input
          : input,
      conversation_id: conversation.id,
      msg_id: uuid(),
    });

    navigate(`/conversation/${conversation.id}`);
  };
  const sendMessageHandler = () => {
    setLoading(true);
    handleSend().finally(() => {
      setLoading(false);
      setInput('');
    });
  };
  const isComposing = useRef(false);
  const { modelList, isGoogleAuth } = useModelList();
  const setDefaultModel = async () => {
    const useModel = await ConfigStorage.get('gemini.defaultModel');
    const defaultModel = modelList.find((m) => m.model.includes(useModel)) || modelList[0];
    console.log('----->defaultModel', useModel);
    if (!defaultModel) return;
    _setCurrentModel({
      ...defaultModel,
      useModel: defaultModel.model.find((m) => m == useModel) || defaultModel.model[0],
    });
  };
  useEffect(() => {
    setDefaultModel();
  }, [modelList]);
  return (
    <div className='h-full flex-center flex-col px-100px'>
      <p className='text-2xl font-semibold text-gray-900 mb-8'>{t('conversation.welcome.title')}</p>
      <div className='w-full bg-white b-solid border border-#E5E6EB  rd-20px  focus-within:shadow-[0px_2px_20px_rgba(77,60,234,0.1)] transition-all duration-200 overflow-hidden p-16px'>
        <Input.TextArea
          rows={5}
          placeholder={t('conversation.welcome.placeholder')}
          className='text-16px focus:b-none rounded-xl !bg-white !b-none !resize-none'
          value={input}
          onChange={(v) => setInput(v)}
          onCompositionStartCapture={() => {
            isComposing.current = true;
          }}
          onCompositionEndCapture={() => {
            isComposing.current = false;
          }}
          onKeyDown={(e) => {
            if (isComposing.current) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessageHandler();
            }
          }}
        ></Input.TextArea>
        <div className='flex items-center justify-between '>
          <div className='flex items-center gap-10px'>
            <Dropdown
              trigger='hover'
              droplist={
                <Menu
                  onClickMenuItem={(key) => {
                    const isFile = key === 'file';
                    ipcBridge.dialog.showOpen
                      .invoke({
                        properties: isFile ? ['openFile', 'multiSelections'] : ['openDirectory'],
                      })
                      .then((files) => {
                        if (isFile) {
                          setFiles(files || []);
                          setDir('');
                        } else {
                          setFiles([]);
                          setDir(files?.[0] || '');
                        }
                      });
                  }}
                >
                  <Menu.Item key='file'>{t('conversation.welcome.uploadFile')}</Menu.Item>
                  <Menu.Item key='dir'>{t('conversation.welcome.linkFolder')}</Menu.Item>
                </Menu>
              }
            >
              <span className='flex items-center gap-4px cursor-pointer lh-[1]'>
                <Button type='secondary' shape='circle' icon={<Plus theme='outline' size='14' strokeWidth={2} fill='#333' />}></Button>
                {files.length > 0 && (
                  <Tooltip className={'!max-w-max'} content={<span className='whitespace-break-spaces'>{files.join('\n')}</span>}>
                    <span>File({files.length})</span>
                  </Tooltip>
                )}
                {!!dir && (
                  <Tooltip className={'!max-w-max'} content={<span className='whitespace-break-spaces'>{dir}</span>}>
                    <span>Folder(1)</span>
                  </Tooltip>
                )}
              </span>
            </Dropdown>
            <Dropdown
              trigger='hover'
              droplist={
                <Menu selectedKeys={currentModel ? [currentModel.id + currentModel.useModel] : []}>
                  {(modelList || []).map((provider) => {
                    const availableModels = getAvailableModels(provider);
                    return (
                      <Menu.ItemGroup title={provider.name} key={provider.id}>
                        {availableModels.map((modelName) => (
                          <Menu.Item
                            key={provider.id + modelName}
                            className={currentModel?.id + currentModel?.useModel === provider.id + modelName ? '!bg-#f2f3f5' : ''}
                            onClick={() => {
                              setCurrentModel({ ...provider, useModel: modelName });
                            }}
                          >
                            {modelName}
                          </Menu.Item>
                        ))}
                      </Menu.ItemGroup>
                    );
                  })}
                </Menu>
              }
            >
              <Button shape='round'>{currentModel ? currentModel.useModel : 'Select Model'}</Button>
            </Dropdown>
          </div>
          <Button shape='circle' type='primary' loading={loading} disabled={!currentModel} icon={<ArrowUp theme='outline' size='14' fill='white' strokeWidth={2} />} onClick={sendMessageHandler} />
        </div>
      </div>
    </div>
  );
};

export default Guid;
