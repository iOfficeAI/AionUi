/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import FilePreview from '@/renderer/components/FilePreview';
import { useCompositionInput } from '@/renderer/hooks/useCompositionInput';
import { useDragUpload } from '@/renderer/hooks/useDragUpload';
import { geminiModeList } from '@/renderer/hooks/useModeModeList';
import { usePasteService } from '@/renderer/hooks/usePasteService';
import { formatFilesForMessage } from '@/renderer/hooks/useSendBoxFiles';
import { allSupportedExts, type FileMetadata, getCleanFileNames } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/theme/colors';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import type { AcpBackend } from '@/types/acpTypes';
import { Button, ConfigProvider, Dropdown, Input, Menu, Tooltip } from '@arco-design/web-react';
import { ArrowUp, FolderOpen, MenuUnfold, Plus, Up } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import styles from './index.module.css';
import { useLayoutContext } from '@/renderer/context/LayoutContext';

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

// Agent Logo 映射
const AGENT_LOGO_MAP: Record<AcpBackend, string> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  codex: CodexLogo,
  iflow: IflowLogo,
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
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
  const [typewriterPlaceholder, setTypewriterPlaceholder] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [isWorkspaceExpanded, setIsWorkspaceExpanded] = useState(false);

  const setCurrentModel = async (modelInfo: TProviderWithModel) => {
    await ConfigStorage.set('gemini.defaultModel', modelInfo.useModel).catch((error) => {
      console.error('Failed to save default model:', error);
    });
    _setCurrentModel(modelInfo);
  };
  const navigate = useNavigate();
  const layout = useLayoutContext();

  // 处理粘贴的文件
  const handleFilesAdded = useCallback((pastedFiles: FileMetadata[]) => {
    // 直接使用文件路径（现在总是有效的）/ Use file paths directly (always valid now)
    const filePaths = pastedFiles.map((file) => file.path);

    setFiles((prevFiles) => [...prevFiles, ...filePaths]);
    setDir(''); // 清除文件夹选择 / Clear selected directory
  }, []);

  const handleRemoveFile = useCallback((targetPath: string) => {
    // 删除初始化面板中的已选文件 / Remove files already selected on the welcome screen
    setFiles((prevFiles) => prevFiles.filter((file) => file !== targetPath));
  }, []);

  // 使用拖拽 hook
  const { isFileDragging, dragHandlers } = useDragUpload({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesAdded,
  });

  // 使用共享的PasteService集成
  const { onPaste, onFocus } = usePasteService({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesAdded,
    onTextPaste: (text: string) => {
      // 按光标位置插入文本，保持现有内容
      const textarea = document.activeElement as HTMLTextAreaElement | null;
      if (textarea && textarea.tagName === 'TEXTAREA') {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? start;
        const currentValue = textarea.value;
        const newValue = currentValue.slice(0, start) + text + currentValue.slice(end);
        setInput(newValue);
        setTimeout(() => {
          textarea.setSelectionRange(start + text.length, start + text.length);
        }, 0);
      } else {
        setInput((prev) => prev + text);
      }
    },
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

        if (!conversation || !conversation.id) {
          throw new Error('Failed to create conversation - conversation object is null or missing id');
        }

        await ipcBridge.geminiConversation.sendMessage
          .invoke({
            input: files.length > 0 ? formatFilesForMessage(files) + ' ' + input : input,
            conversation_id: conversation.id,
            msg_id: uuid(),
          })
          .catch((error) => {
            console.error('Failed to send message:', error);
            throw error;
          });
        await navigate(`/conversation/${conversation.id}`);
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
        await navigate(`/conversation/${conversation.id}`);
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

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: any) {
        console.error('Failed to create ACP conversation:', error);

        // Check if it's an authentication error
        if (error?.message?.includes('[ACP-AUTH-')) {
          console.error(t('acp.auth.console_error'), error.message);
          const confirmed = window.confirm(t('acp.auth.failed_confirm', { backend: selectedAgent, error: error.message }));
          if (confirmed) {
            await navigate('/settings/model');
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
    setDefaultModel().catch((error) => {
      console.error('Failed to set default model:', error);
    });
  }, [modelList]);

  // 打字机效果
  useEffect(() => {
    const fullText = t('conversation.welcome.placeholder');
    let currentIndex = 0;
    const typingSpeed = 80; // 每个字符的打字速度（毫秒）

    const typeNextChar = () => {
      if (currentIndex <= fullText.length) {
        // 在打字过程中添加光标
        setTypewriterPlaceholder(fullText.slice(0, currentIndex) + (currentIndex < fullText.length ? '|' : ''));
        currentIndex++;
      }
    };

    // 初始延迟，让用户看到页面加载完成
    const initialDelay = setTimeout(() => {
      const intervalId = setInterval(() => {
        typeNextChar();
        if (currentIndex > fullText.length) {
          clearInterval(intervalId);
          setIsTyping(false); // 打字完成
          setTypewriterPlaceholder(fullText); // 移除光标
        }
      }, typingSpeed);

      return () => clearInterval(intervalId);
    }, 300);

    return () => clearTimeout(initialDelay);
  }, [t]);
  return (
    <ConfigProvider getPopupContainer={() => guidContainerRef.current || document.body}>
      <div ref={guidContainerRef} className='h-full flex-center flex-col px-10px' style={{ position: 'relative' }}>
        {layout?.isMobile && layout?.siderCollapsed && (
          <button type='button' className='mobile-toggle-btn fixed top-0 left-0 z-50 flex items-center justify-center w-16 h-16' style={{ background: 'transparent', border: 'none', outline: 'none', padding: 0, margin: 0 }} onClick={() => layout.setSiderCollapsed(false)}>
            <MenuUnfold theme='outline' size={24} fill={iconColors.secondary} strokeWidth={3} />
          </button>
        )}
        <div className={styles.guidLayout}>
          <p className={`text-2xl font-semibold mb-8 text-0 text-center`}>{t('conversation.welcome.title')}</p>

          {/* Agent 选择器 - 在标题下方 */}
          {availableAgents && availableAgents.length > 0 && (
            <div className='w-full flex justify-center'>
              <div
                className='inline-flex items-center bg-fill-2'
                style={{
                  marginBottom: 16,
                  padding: '4px',
                  borderRadius: '30px',
                  transition: 'all 0.6s cubic-bezier(0.2, 0.8, 0.3, 1)',
                  width: 'fit-content',
                  gap: 0,
                }}
              >
                {availableAgents.map((agent, index) => {
                  const isSelected = selectedAgent === agent.backend;
                  const logoSrc = AGENT_LOGO_MAP[agent.backend];

                  return (
                    <React.Fragment key={agent.backend}>
                      {index > 0 && <div className='text-white/30 text-16px lh-1 p-2px select-none'>|</div>}
                      <div
                        className={`group flex items-center cursor-pointer whitespace-nowrap overflow-hidden ${isSelected ? 'opacity-100 px-12px py-8px rd-20px mx-2px' : 'opacity-60 p-4px hover:opacity-100'}`}
                        style={
                          isSelected
                            ? {
                                transition: 'opacity 0.5s cubic-bezier(0.2, 0.8, 0.3, 1)',
                                backgroundColor: 'var(--fill-0)',
                              }
                            : { transition: 'opacity 0.5s cubic-bezier(0.2, 0.8, 0.3, 1)' }
                        }
                        onClick={() => setSelectedAgent(agent.backend)}
                      >
                        <img src={logoSrc} alt={`${agent.backend} logo`} width={20} height={20} style={{ objectFit: 'contain', flexShrink: 0 }} />
                        <span
                          className={`font-medium text-14px ${isSelected ? 'font-semibold' : 'max-w-0 opacity-0 overflow-hidden group-hover:max-w-100px group-hover:opacity-100 group-hover:ml-8px'}`}
                          style={{
                            color: 'var(--color-text-1)',
                            transition: isSelected ? 'color 0.5s cubic-bezier(0.2, 0.8, 0.3, 1), font-weight 0.5s cubic-bezier(0.2, 0.8, 0.3, 1)' : 'max-width 0.6s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.5s cubic-bezier(0.2, 0.8, 0.3, 1) 0.05s, margin 0.6s cubic-bezier(0.2, 0.8, 0.3, 1)',
                          }}
                        >
                          {agent.name}
                        </span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          <div
            className={`${styles.guidInputCard} bg-border-2 b-solid border rd-20px transition-all duration-200 overflow-hidden p-16px ${isFileDragging ? 'border-dashed' : 'border-3'}`}
            style={{
              zIndex: 1,
              ...(isFileDragging
                ? {
                    backgroundColor: 'var(--color-primary-light-1)',
                    borderColor: 'rgb(var(--primary-3))',
                  }
                : {
                    boxShadow: '0px 2px 20px rgba(var(--primary-rgb, 77, 60, 234), 0.1)',
                  }),
            }}
            {...dragHandlers}
          >
            <Input.TextArea rows={3} placeholder={typewriterPlaceholder || t('conversation.welcome.placeholder')} className={`text-16px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !p-0 ${styles.lightPlaceholder}`} value={input} onChange={(v) => setInput(v)} onPaste={onPaste} onFocus={onFocus} {...compositionHandlers} onKeyDown={createKeyDownHandler(sendMessageHandler)}></Input.TextArea>
            {files.length > 0 && (
              // 展示待发送的文件并允许取消 / Show pending files and allow cancellation
              <div className='flex flex-wrap items-center gap-8px mt-12px mb-12px'>
                {files.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => handleRemoveFile(path)} />
                ))}
              </div>
            )}
            <div className={styles.actionRow}>
              <div className={`${styles.actionTools} flex items-center gap-10px`}>
                <Dropdown
                  trigger='hover'
                  onVisibleChange={setIsPlusDropdownOpen}
                  droplist={
                    <Menu
                      onClickMenuItem={(key) => {
                        if (key === 'file') {
                          ipcBridge.dialog.showOpen
                            .invoke({
                              properties: ['openFile', 'multiSelections'],
                            })
                            .then((files) => {
                              if (files && files.length > 0) {
                                setFiles((prev) => [...prev, ...files]);
                              }
                            })
                            .catch((error) => {
                              console.error('Failed to open file dialog:', error);
                            });
                        }
                      }}
                    >
                      <Menu.Item key='file'>{t('conversation.welcome.uploadFile')}</Menu.Item>
                    </Menu>
                  }
                >
                  <span className='flex items-center gap-4px cursor-pointer lh-[1]'>
                    <Button type='secondary' shape='circle' className={isPlusDropdownOpen ? styles.plusButtonRotate : ''} icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}></Button>
                    {files.length > 0 && (
                      <Tooltip className={'!max-w-max'} content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}>
                        <span className='text-t-primary'>File({files.length})</span>
                      </Tooltip>
                    )}
                  </span>
                </Dropdown>

                {selectedAgent === 'gemini' && (
                  <Dropdown
                    trigger='hover'
                    droplist={
                      <Menu selectedKeys={currentModel ? [currentModel.id + currentModel.useModel] : []}>
                        {!modelList || modelList.length === 0 ? (
                          <>
                            {/* 暂无可用模型提示 */}
                            <Menu.Item key='no-models' className='px-12px py-12px text-t-secondary text-14px text-center flex justify-center items-center' disabled>
                              {t('settings.noAvailableModels')}
                            </Menu.Item>
                            {/* Add Model 选项 */}
                            <Menu.Item key='add-model' className='text-12px text-t-secondary' onClick={() => navigate('/settings/model')}>
                              <Plus theme='outline' size='12' />
                              {t('settings.addModel')}
                            </Menu.Item>
                          </>
                        ) : (
                          <>
                            {(modelList || []).map((provider) => {
                              const availableModels = getAvailableModels(provider);
                              return (
                                <Menu.ItemGroup title={provider.name} key={provider.id}>
                                  {availableModels.map((modelName) => (
                                    <Menu.Item
                                      key={provider.id + modelName}
                                      className={currentModel?.id + currentModel?.useModel === provider.id + modelName ? '!bg-2' : ''}
                                      onClick={() => {
                                        setCurrentModel({ ...provider, useModel: modelName }).catch((error) => {
                                          console.error('Failed to set current model:', error);
                                        });
                                      }}
                                    >
                                      {modelName}
                                    </Menu.Item>
                                  ))}
                                </Menu.ItemGroup>
                              );
                            })}
                            {/* Add Model 选项 */}
                            <Menu.Item key='add-model' className='text-12px text-t-secondary' onClick={() => navigate('/settings/model')}>
                              <Plus theme='outline' size='12' />
                              {t('settings.addModel')}
                            </Menu.Item>
                          </>
                        )}
                      </Menu>
                    }
                  >
                    <Button className={'sendbox-model-btn'} shape='round'>
                      {currentModel ? currentModel.useModel : t('conversation.welcome.selectModel')}
                    </Button>
                  </Dropdown>
                )}
              </div>
              <div className={styles.actionSubmit}>
                <Button
                  shape='circle'
                  type='primary'
                  loading={loading}
                  disabled={!input.trim() || ((!selectedAgent || selectedAgent === 'gemini') && !currentModel)}
                  icon={<ArrowUp theme='outline' size='14' fill='white' strokeWidth={2} />}
                  onClick={() => {
                    handleSend().catch((error) => {
                      console.error('Failed to send message:', error);
                    });
                  }}
                />
              </div>
            </div>
          </div>

          {/* 工作空间选择区域 */}
          <div
            className={`${styles.guidInputCard} overflow-hidden transition-all duration-200`}
            style={{
              marginTop: '-20px',
            }}
          >
            {!isWorkspaceExpanded ? (
              <div className='flex items-end h-40px w-150px rd-8px gap-8px px-16px py-10px cursor-pointer' onClick={() => setIsWorkspaceExpanded(true)}>
                <FolderOpen className='line-height-4' theme='outline' size='16' fill={iconColors.secondary} />
                <span className='text-14px text-t-secondary'>{t('conversation.welcome.specifyWorkspace')}</span>
              </div>
            ) : (
              <div className='flex items-center justify-between pt-25px'>
                <div className='flex items-center gap-2 flex-1 min-w-0'>
                  <Up theme='outline' size='16' fill={iconColors.secondary} className='cursor-pointer flex-shrink-0' onClick={() => setIsWorkspaceExpanded(false)} />
                  <FolderOpen className='flex-shrink-0 line-height-4' theme='outline' size='16' fill={iconColors.secondary} />
                  <Tooltip content={dir || t('conversation.welcome.none')} position='top'>
                    <span className='text-13px text-t-secondary truncate'>
                      {t('conversation.welcome.currentWorkspace')}: {dir || t('conversation.welcome.none')}
                    </span>
                  </Tooltip>
                </div>
                <Button
                  size='small'
                  icon={<Plus theme='outline' size='14' />}
                  className='w-124px h-28px rounded-[20px] bg-2'
                  onClick={(e) => {
                    e.stopPropagation();
                    ipcBridge.dialog.showOpen
                      .invoke({
                        properties: ['openDirectory'],
                      })
                      .then((files) => {
                        setFiles([]);
                        setDir(files?.[0] || '');
                      })
                      .catch((error) => {
                        console.error('Failed to open directory dialog:', error);
                      });
                  }}
                >
                  <span className='mr-8px'> {t('conversation.welcome.openFolder')} </span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default Guid;
