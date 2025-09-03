/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/common/acpTypes';
import type { IModel, TModelWithConversation } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import AcpSetup from '@/renderer/components/AcpSetup';
import { geminiModeList } from '@/renderer/hooks/useModeModeList';
import { Button, Dropdown, Input, Menu, Radio, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Plus } from '@icon-park/react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';

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
    if (isGoogleAuth) {
      const geminiModel: IModel = {
        id: uuid(),
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        baseUrl: '',
        apiKey: '',
        model: geminiModeList.map((v) => v.value),
      };
      return [geminiModel, ...(modelConfig || [])];
    }
    return modelConfig || [];
  }, [isGoogleAuth, modelConfig]);
};

const Guid: React.FC = () => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [dir, setDir] = useState<string>('');
  const [currentModel, _setCurrentModel] = useState<TModelWithConversation>();
  const [conversationType, setConversationType] = useState<'gemini' | 'acp'>('gemini');
  const [showAcpSetup, setShowAcpSetup] = useState(false);
  const [acpConfig, setAcpConfig] = useState<{ backend: AcpBackend; cliPath?: string; workingDir: string } | null>(null);
  const setCurrentModel = async (modelInfo: TModelWithConversation) => {
    await ConfigStorage.set('gemini.defaultModel', modelInfo.useModel);
    _setCurrentModel(modelInfo);
  };
  const navigate = useNavigate();
  const handleSend = async () => {
    if (conversationType === 'gemini') {
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
    } else {
      // ACP conversation type
      if (!acpConfig) {
        setShowAcpSetup(true);
        return;
      }

      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'acp',
          name: input,
          extra: {
            defaultFiles: files,
            workspace: acpConfig.workingDir || dir,
            backend: acpConfig.backend,
            cliPath: acpConfig.cliPath,
          },
        });

        if (!conversation || !conversation.id) {
          alert('Failed to create ACP conversation. Please check your ACP configuration and ensure the CLI is installed.');
          return;
        }

        // For ACP, send the initial message directly to the conversation
        await ipcBridge.acpConversation.sendMessage.invoke({
          input,
          conversation_id: conversation.id,
          msg_id: uuid(),
          files: files.length > 0 ? files : undefined,
        });

        navigate(`/conversation/${conversation.id}`);
      } catch (error: any) {
        console.error('Failed to create ACP conversation:', error);
        
        // Check if it's a Gemini authentication error
        if (error?.message?.includes('[ACP-AUTH-')) {
          console.error('ACP认证错误详情:', error.message);
          const confirmed = window.confirm(`ACP Gemini 认证失败：\n\n${error.message}\n\n是否现在前往设置页面配置？`);
          if (confirmed) {
            navigate('/settings/model');
          }
        } else {
          alert('Failed to create ACP conversation. Please check your ACP configuration and ensure the CLI is installed.');
        }
      }
    }
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
    if (!defaultModel) return;
    _setCurrentModel({ ...defaultModel, useModel: defaultModel.model.find((m) => m == useModel) || defaultModel.model[0] });
  };
  useEffect(() => {
    setDefaultModel();
  }, [modelList]);
  return (
    <div className='h-full flex-center flex-col px-100px'>
      <p className='text-2xl font-semibold text-gray-900 mb-8'>{t('conversation.welcome.title')}</p>

      <div className='w-full mb-4'>
        <Radio.Group value={conversationType} onChange={setConversationType} type='button' size='small'>
          <Radio value='gemini'>Gemini</Radio>
          <Radio value='acp'>ACP</Radio>
        </Radio.Group>
      </div>

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

            {conversationType === 'gemini' ? (
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
            ) : (
              <Button shape='round' onClick={() => setShowAcpSetup(true)}>
                {acpConfig ? `${acpConfig.backend} ACP` : 'Configure ACP'}
              </Button>
            )}
          </div>
          <Button shape='circle' type='primary' loading={loading} disabled={conversationType === 'gemini' ? !currentModel : !acpConfig} icon={<ArrowUp theme='outline' size='14' fill='white' strokeWidth={2} />} onClick={sendMessageHandler} />
        </div>
      </div>

      {showAcpSetup && (
        <AcpSetup
          onSetupComplete={(config: { backend: AcpBackend; cliPath?: string; workingDir: string }) => {
            setAcpConfig(config);
            setShowAcpSetup(false);
          }}
          onCancel={() => setShowAcpSetup(false)}
          onNavigateToSettings={() => {
            setShowAcpSetup(false);
            navigate('/settings/gemini');
          }}
        />
      )}
    </div>
  );
};

export default Guid;
