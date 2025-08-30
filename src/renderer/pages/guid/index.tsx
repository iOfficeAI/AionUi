/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IModel, TModelWithConversation } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import { hasModelCapability } from '@/renderer/utils/modelCapabilities';
import { geminiModeList } from '@/renderer/hooks/useModeModeList';
import { Button, Dropdown, Input, Menu, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Plus } from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';

/**
 * 检查模型是否适合作为主力对话模型
 * @param model - 要检查的模型
 * @returns true 表示适合作为主力模型，false 表示不适合
 */
const isPrimaryModel = (model: IModel): boolean => {
  // 1. 检查是否明确排除
  const excludeStatus = hasModelCapability(model, 'excludeFromPrimary');
  if (excludeStatus === true) {
    return false; // 明确排除
  }

  // 2. 检查 function_calling 能力
  const functionCallingStatus = hasModelCapability(model, 'function_calling');

  // 3. 判断逻辑：
  // - true (明确支持) → 可作为主力模型
  // - undefined (未知) → 可作为主力模型 (新模型友好)
  // - false (明确不支持) → 不可作为主力模型
  return functionCallingStatus === true || functionCallingStatus === undefined;
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

  return useMemo(() => {
    let allModels: IModel[] = [];

    if (isGoogleAuth) {
      const geminiModel: IModel = {
        id: uuid(),
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        baseUrl: '',
        apiKey: '',
        model: geminiModeList.map((v) => v.value),
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
      };
      allModels = [geminiModel, ...(modelConfig || [])];
    } else {
      allModels = modelConfig || [];
    }

    // 过滤出适合作为主力对话模型的模型
    return allModels.filter(isPrimaryModel);
  }, [isGoogleAuth, modelConfig]);
};

const Guid: React.FC = () => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [dir, setDir] = useState<string>('');
  const [currentModel, _setCurrentModel] = useState<TModelWithConversation>();
  const setCurrentModel = async (modelInfo: TModelWithConversation) => {
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
  const modelList = useModelList();
  const setDefaultModel = async () => {
    const useModel = await ConfigStorage.get('gemini.defaultModel');
    const defaultModel = modelList.find((m) => m.model.includes(useModel)) || modelList[0];
    console.log('----->defaultModel', useModel);
    if (!defaultModel) return;
    _setCurrentModel({ ...defaultModel, useModel: defaultModel.model.find((m) => m == useModel) || defaultModel.model[0] });
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
                  {(modelList || []).map((platform) => {
                    return (
                      <Menu.ItemGroup title={platform.name} key={platform.id}>
                        {platform.model.map((model) => (
                          <Menu.Item
                            key={platform.id + model}
                            className={currentModel?.id + currentModel?.useModel === platform.id + model ? '!bg-#f2f3f5' : ''}
                            onClick={() => {
                              setCurrentModel({ ...platform, useModel: model });
                            }}
                          >
                            {model}
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
