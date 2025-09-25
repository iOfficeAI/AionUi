/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/common/acpTypes';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import { useCompositionInput } from '@/renderer/hooks/useCompositionInput';
import { useDragUpload } from '@/renderer/hooks/useDragUpload';
import { geminiModeList } from '@/renderer/hooks/useModeModeList';
import { usePasteService } from '@/renderer/hooks/usePasteService';
import { formatFilesForMessage } from '@/renderer/hooks/useSendBoxFiles';
import { allSupportedExts, type FileMetadata, getCleanFileNames } from '@/renderer/services/FileService';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import { Button, ConfigProvider, Dropdown, Input, Menu, Radio, Space, Tooltip } from '@arco-design/web-react';
import { ArrowUp, Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import styles from './index.module.css';

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
  const cacheKey = `${provider.id}-${(provider.model || []).join(',')}`;

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
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [dir, setDir] = useState<string>('');
  const [currentModel, _setCurrentModel] = useState<TProviderWithModel>();
  // 支持在初始化页展示 Codex（MCP）选项，先做 UI 占位
  const [selectedAgent, setSelectedAgent] = useState<AcpBackend | null>('gemini');
  const [availableAgents, setAvailableAgents] = useState<Array<{ backend: AcpBackend; name: string; cliPath?: string }>>();
  const setCurrentModel = async (modelInfo: TProviderWithModel) => {
    await ConfigStorage.set('gemini.defaultModel', modelInfo.useModel);
    _setCurrentModel(modelInfo);
  };
  const navigate = useNavigate();

  // 处理粘贴的文件
  const handleFilesAdded = useCallback((pastedFiles: FileMetadata[]) => {
    // 直接使用文件路径（现在总是有效的）
    const filePaths = pastedFiles.map((file) => file.path);

    setFiles((prevFiles) => [...prevFiles, ...filePaths]);
    setDir(''); // 清除文件夹选择
  }, []);

  // 使用拖拽 hook
  const { isFileDragging, dragHandlers } = useDragUpload({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesAdded,
  });

  // 使用共享的PasteService集成
  const { onPaste } = usePasteService({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesAdded,
  });

  // 获取可用的 ACP agents - 基于全局标记位
  const { data: availableAgentsData } = useSWR('acp.agents.available', async () => {
    const result = await ipcBridge.acpConversation.getAvailableAgents.invoke();
    if (result.success) {
      // 过滤掉检测到的gemini命令，只保留内置Gemini
      return result.data.filter((agent) => !(agent.backend === 'gemini' && agent.cliPath));
    }
    return [];
  });

  // 更新本地状态
  useEffect(() => {
    if (availableAgentsData) {
      setAvailableAgents(availableAgentsData);
    }
  }, [availableAgentsData]);

  const handleSend = async () => {
    // 默认情况使用 Gemini（参考 main 分支的纯粹逻辑）
    if (!selectedAgent || selectedAgent === 'gemini') {
      if (!currentModel) return;
      try {
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
          input: files.length > 0 ? formatFilesForMessage(files) + ' ' + input : input,
          conversation_id: conversation.id,
          msg_id: uuid(),
        });
        navigate(`/conversation/${conversation.id}`);
      } catch (error: any) {
        console.error('Failed to create or send Gemini message:', error);
        alert(`Failed to create Gemini conversation: ${error.message || error}`);
        throw error; // Re-throw to prevent input clearing
      }
      return;
    } else if (selectedAgent === 'codex') {
      // 创建 Codex 会话并保存初始消息，由对话页负责发送
      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'codex',
          name: input,
          model: currentModel!, // not used by codex, but required by type
          extra: {
            defaultFiles: files,
            workspace: dir,
          },
        });

        if (!conversation || !conversation.id) {
          alert('Failed to create Codex conversation. Please ensure the Codex CLI is installed and accessible in PATH.');
          return;
        }
        // 交给对话页发送，避免事件丢失
        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`codex_initial_message_${conversation.id}`, JSON.stringify(initialMessage));
        navigate(`/conversation/${conversation.id}`);
      } catch (error: any) {
        alert(`Failed to create Codex conversation: ${error.message || error}`);
        throw error;
      }
      return;
    } else {
      // ACP conversation type
      const agentInfo = availableAgents?.find((a) => a.backend === selectedAgent);
      if (!agentInfo) {
        alert(`${selectedAgent} CLI not found or not configured. Please ensure it's installed and accessible.`);
        return;
      }

      // 如果没有工作目录，使用默认目录（参考 AcpSetup 逻辑）
      const workingDir = dir;

      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'acp',
          name: input,
          model: currentModel!, // ACP needs a model too
          extra: {
            defaultFiles: files,
            workspace: workingDir,
            backend: selectedAgent,
            cliPath: agentInfo.cliPath,
          },
        });

        if (!conversation || !conversation.id) {
          alert('Failed to create ACP conversation. Please check your ACP configuration and ensure the CLI is installed.');
          return;
        }

        // For ACP, we need to wait for the connection to be ready before sending the message
        // Store the initial message and let the conversation page handle it when ready
        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };

        // Store initial message in sessionStorage to be picked up by the conversation page
        sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        navigate(`/conversation/${conversation.id}`);
      } catch (error: any) {
        console.error('Failed to create ACP conversation:', error);

        // Check if it's an authentication error
        if (error?.message?.includes('[ACP-AUTH-')) {
          console.error(t('acp.auth.console_error'), error.message);
          const confirmed = window.confirm(t('acp.auth.failed_confirm', { backend: selectedAgent, error: error.message }));
          if (confirmed) {
            navigate('/settings/model');
          }
        } else {
          alert(`Failed to create ${selectedAgent} ACP conversation. Please check your ACP configuration and ensure the CLI is installed.`);
        }
        throw error; // Re-throw to prevent input clearing
      }
    }
  };
  const sendMessageHandler = () => {
    setLoading(true);
    handleSend()
      .then(() => {
        // Only clear input on successful send
        setInput('');
      })
      .catch((error) => {
        console.error('Failed to send message:', error);
        // Keep the input content when there's an error
      })
      .finally(() => {
        setLoading(false);
      });
  };
  // 使用共享的输入法合成处理
  const { compositionHandlers, createKeyDownHandler } = useCompositionInput();
  const { modelList, isGoogleAuth } = useModelList();
  const setDefaultModel = async () => {
    const useModel = await ConfigStorage.get('gemini.defaultModel');
    const defaultModel = modelList.find((m) => m.model.includes(useModel)) || modelList[0];
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
    <ConfigProvider getPopupContainer={() => guidContainerRef.current || document.body}>
      <div ref={guidContainerRef} className='h-full flex-center flex-col px-100px' style={{ position: 'relative' }}>
        <p className='text-2xl font-semibold text-gray-900 mb-8'>{t('conversation.welcome.title')}</p>
        <div
          className={`bg-white b-solid border rd-20px focus-within:shadow-[0px_2px_20px_rgba(77,60,234,0.1)] transition-all duration-200 overflow-hidden p-16px ${isFileDragging ? 'bg-blue-50 border-blue-300 border-dashed' : 'border-#E5E6EB'}`}
          style={{
            width: 'clamp(400px, calc(100% - 80px), 720px)',
            margin: '0 auto',
          }}
          {...dragHandlers}
        >
          <Input.TextArea rows={4} placeholder={t('conversation.welcome.placeholder')} className='text-16px focus:b-none rounded-xl !bg-white !b-none !resize-none !p-0' value={input} onChange={(v) => setInput(v)} onPaste={onPaste} {...compositionHandlers} onKeyDown={createKeyDownHandler(sendMessageHandler)}></Input.TextArea>
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
                            if (files && files.length > 0) {
                              setFiles((prev) => [...prev, ...files]);
                            }
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
                    <Tooltip className={'!max-w-max'} content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}>
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

              {selectedAgent === 'gemini' && (
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
              )}
            </div>
            <Button shape='circle' type='primary' loading={loading} disabled={(!selectedAgent || selectedAgent === 'gemini') && !currentModel} icon={<ArrowUp theme='outline' size='14' fill='white' strokeWidth={2} />} onClick={handleSend} />
          </div>
        </div>

        {/* ACP Agents 选择区域 */}
        {availableAgents && availableAgents.length > 0 && (
          <Space direction='horizontal' className={styles.roundedSpace} style={{ marginTop: 16, width: '100%', justifyContent: 'center' }}>
            <Radio.Group
              type='button'
              className={styles.roundedRadioGroup}
              value={selectedAgent}
              onChange={(value) => {
                setSelectedAgent(value as AcpBackend);
              }}
              options={availableAgents.map((agent) => ({
                label: (
                  <div className='flex items-center gap-2'>
                    <img src={agent.backend === 'claude' ? ClaudeLogo : agent.backend === 'gemini' ? GeminiLogo : agent.backend === 'qwen' ? QwenLogo : agent.backend === 'codex' ? CodexLogo : agent.backend === 'iflow' ? IflowLogo : ''} alt={`${agent.backend} logo`} width={16} height={16} style={{ objectFit: 'contain' }} />
                    <span className='font-medium'>{agent.name}</span>
                  </div>
                ),
                value: agent.backend,
              }))}
            />
          </Space>
        )}
      </div>
    </ConfigProvider>
  );
};

export default Guid;
