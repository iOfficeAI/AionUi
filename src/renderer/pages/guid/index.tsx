/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import { useConversationTabs } from '@/renderer/pages/conversation/context/ConversationTabsContext';
import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import OpenCodeLogo from '@/renderer/assets/logos/opencode.svg';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';
import FilePreview from '@/renderer/components/FilePreview';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { useCompositionInput } from '@/renderer/hooks/useCompositionInput';
import { useDragUpload } from '@/renderer/hooks/useDragUpload';
import { useGeminiGoogleAuthModels } from '@/renderer/hooks/useGeminiGoogleAuthModels';
import { usePasteService } from '@/renderer/hooks/usePasteService';
import { formatFilesForMessage } from '@/renderer/hooks/useSendBoxFiles';
import { allSupportedExts, type FileMetadata, getCleanFileNames } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/theme/colors';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import type { AcpBackend } from '@/types/acpTypes';
import { Button, ConfigProvider, Dropdown, Input, Menu, Tooltip } from '@arco-design/web-react';
import { IconClose } from '@arco-design/web-react/icon';
import { ArrowUp, FolderOpen, Plus, Robot, UploadOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const { geminiModeOptions, isGoogleAuth } = useGeminiGoogleAuthModels();
  const { data: modelConfig } = useSWR('model.config.welcome', () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      return (data || []).filter((platform) => !!platform.model.length);
    });
  });

  const geminiModelValues = useMemo(() => geminiModeOptions.map((option) => option.value), [geminiModeOptions]);

  const modelList = useMemo(() => {
    let allProviders: IProvider[] = [];

    if (isGoogleAuth) {
      const geminiProvider: IProvider = {
        id: uuid(),
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        baseUrl: '',
        apiKey: '',
        model: geminiModelValues,
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
      };
      allProviders = [geminiProvider, ...(modelConfig || [])];
    } else {
      allProviders = modelConfig || [];
    }

    // 过滤出有可用主力模型的提供商
    return allProviders.filter(hasAvailableModels);
  }, [geminiModelValues, isGoogleAuth, modelConfig]);

  return { modelList, isGoogleAuth, geminiModeOptions };
};

// Agent Logo 映射 (custom uses Robot icon from @icon-park/react)
const AGENT_LOGO_MAP: Partial<Record<AcpBackend, string>> = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  codex: CodexLogo,
  iflow: IflowLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpenCodeLogo,
};

const Guid: React.FC = () => {
  const { t } = useTranslation();
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const { activeTab } = useConversationTabs();

  // 打开外部链接 / Open external link
  const openLink = useCallback(async (url: string) => {
    try {
      await ipcBridge.shell.openExternal.invoke(url);
    } catch (error) {
      console.error('Failed to open external link:', error);
    }
  }, []);
  const location = useLocation();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [dir, setDir] = useState<string>('');
  const [currentModel, _setCurrentModel] = useState<TProviderWithModel>();

  // 从 location.state 中读取 workspace（从 tabs 的添加按钮传递）
  useEffect(() => {
    const state = location.state as { workspace?: string } | null;
    if (state?.workspace) {
      setDir(state.workspace);
    }
  }, [location.state]);
  const { modelList, isGoogleAuth, geminiModeOptions } = useModelList();
  const geminiModeLookup = useMemo(() => {
    const lookup = new Map<string, (typeof geminiModeOptions)[number]>();
    geminiModeOptions.forEach((option) => lookup.set(option.value, option));
    return lookup;
  }, [geminiModeOptions]);
  const formatGeminiModelLabel = useCallback(
    (provider: { platform?: string } | undefined, modelName?: string) => {
      if (!modelName) return '';
      const isGoogleProvider = provider?.platform?.toLowerCase().includes('gemini-with-google-auth');
      if (isGoogleProvider) {
        return geminiModeLookup.get(modelName)?.label || modelName;
      }
      return modelName;
    },
    [geminiModeLookup]
  );
  // 记录当前选中的 provider+model，方便列表刷新时判断是否仍可用
  const selectedModelKeyRef = useRef<string | null>(null);
  // 支持在初始化页展示 Codex（MCP）选项，先做 UI 占位
  // 对于自定义代理，使用 "custom:uuid" 格式来区分多个自定义代理
  // For custom agents, we store "custom:uuid" format to distinguish between multiple custom agents
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>('gemini');
  const [availableAgents, setAvailableAgents] = useState<Array<{ backend: AcpBackend; name: string; cliPath?: string; customAgentId?: string }>>();

  /**
   * 获取代理的唯一选择键
   * 对于自定义代理返回 "custom:uuid"，其他代理返回 backend 类型
   * Helper to get agent key for selection
   * Returns "custom:uuid" for custom agents, backend type for others
   */
  const getAgentKey = (agent: { backend: AcpBackend; customAgentId?: string }) => {
    return agent.backend === 'custom' && agent.customAgentId ? `custom:${agent.customAgentId}` : agent.backend;
  };

  /**
   * 通过选择键查找代理
   * 支持 "custom:uuid" 格式和普通 backend 类型
   * Helper to find agent by key
   * Supports both "custom:uuid" format and plain backend type
   */
  const findAgentByKey = (key: string) => {
    if (key.startsWith('custom:')) {
      const customAgentId = key.slice(7);
      return availableAgents?.find((a) => a.backend === 'custom' && a.customAgentId === customAgentId);
    }
    return availableAgents?.find((a) => a.backend === key);
  };

  // 获取选中的后端类型（向后兼容）/ Get the selected backend type (for backward compatibility)
  const selectedAgent = selectedAgentKey.startsWith('custom:') ? 'custom' : (selectedAgentKey as AcpBackend);
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
  const [typewriterPlaceholder, setTypewriterPlaceholder] = useState('');
  const [_isTyping, setIsTyping] = useState(true);

  /**
   * 生成唯一模型 key（providerId:model）
   * Build a unique key for provider/model pair
   */
  const buildModelKey = (providerId?: string, modelName?: string) => {
    if (!providerId || !modelName) return null;
    return `${providerId}:${modelName}`;
  };

  /**
   * 检查当前 key 是否仍存在于新模型列表中
   * Check if selected model key still exists in the new provider list
   */
  const isModelKeyAvailable = (key: string | null, providers?: IProvider[]) => {
    if (!key || !providers || providers.length === 0) return false;
    return providers.some((provider) => {
      if (!provider.id || !provider.model?.length) return false;
      return provider.model.some((modelName) => buildModelKey(provider.id, modelName) === key);
    });
  };

  const setCurrentModel = async (modelInfo: TProviderWithModel) => {
    // 记录最新的选中 key，避免列表刷新后被错误重置
    selectedModelKeyRef.current = buildModelKey(modelInfo.id, modelInfo.useModel);
    await ConfigStorage.set('gemini.defaultModel', modelInfo.useModel).catch((error) => {
      console.error('Failed to save default model:', error);
    });
    _setCurrentModel(modelInfo);
  };
  const navigate = useNavigate();
  const _layout = useLayoutContext();

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
    // 如果用户没有选择工作目录，尝试继承当前活动会话的 workspace
    // If user hasn't selected a workspace, try to inherit from active conversation
    let finalWorkspace = dir;
    if (!finalWorkspace && activeTab) {
      finalWorkspace = activeTab.workspace;
    }

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
            workspace: finalWorkspace,
            customWorkspace: !!finalWorkspace, // 标记为自定义工作空间
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
      } catch (error: unknown) {
        console.error('Failed to create or send Gemini message:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create Gemini conversation: ${errorMessage}`);
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
            workspace: finalWorkspace,
            customWorkspace: !!finalWorkspace, // 标记为自定义工作空间
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
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create Codex conversation: ${errorMessage}`);
        throw error;
      }
      return;
    } else {
      // ACP conversation type
      const agentInfo = findAgentByKey(selectedAgentKey);
      if (!agentInfo) {
        alert(`${selectedAgent} CLI not found or not configured. Please ensure it's installed and accessible.`);
        return;
      }

      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'acp',
          name: input,
          model: currentModel!, // ACP needs a model too
          extra: {
            defaultFiles: files,
            workspace: finalWorkspace,
            customWorkspace: !!finalWorkspace, // 标记为自定义工作空间
            backend: selectedAgent,
            cliPath: agentInfo.cliPath,
            agentName: agentInfo.name, // 存储自定义代理的配置名称 / Store configured name for custom agents
            customAgentId: agentInfo.customAgentId, // 自定义代理的 UUID / UUID for custom agents
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
      } catch (error: unknown) {
        console.error('Failed to create ACP conversation:', error);

        // Check if it's an authentication error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('[ACP-AUTH-')) {
          console.error(t('acp.auth.console_error'), errorMessage);
          const confirmed = window.confirm(t('acp.auth.failed_confirm', { backend: selectedAgent, error: errorMessage }));
          if (confirmed) {
            void navigate('/settings/model');
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
  const setDefaultModel = async () => {
    if (!modelList || modelList.length === 0) {
      return;
    }
    const currentKey = selectedModelKeyRef.current || buildModelKey(currentModel?.id, currentModel?.useModel);
    // 当前选择仍然可用则不重置 / Keep current selection when still available
    if (isModelKeyAvailable(currentKey, modelList)) {
      if (!selectedModelKeyRef.current && currentKey) {
        selectedModelKeyRef.current = currentKey;
      }
      return;
    }
    // 读取默认配置，或回落到新的第一个模型
    const useModel = await ConfigStorage.get('gemini.defaultModel');
    const defaultModel = modelList.find((m) => m.model.includes(useModel)) || modelList[0];
    if (!defaultModel || !defaultModel.model.length) return;
    const resolvedUseModel = defaultModel.model.includes(useModel) ? useModel : defaultModel.model[0];
    await setCurrentModel({
      ...defaultModel,
      useModel: resolvedUseModel,
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
                  const isSelected = selectedAgentKey === getAgentKey(agent);
                  const logoSrc = AGENT_LOGO_MAP[agent.backend];

                  return (
                    <React.Fragment key={getAgentKey(agent)}>
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
                        onClick={() => setSelectedAgentKey(getAgentKey(agent))}
                      >
                        {logoSrc ? <img src={logoSrc} alt={`${agent.backend} logo`} width={20} height={20} style={{ objectFit: 'contain', flexShrink: 0 }} /> : <Robot theme='outline' size={20} style={{ flexShrink: 0 }} />}
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
            className={`${styles.guidInputCard} bg-border-2 b-solid border rd-20px transition-all duration-200 overflow-hidden p-12px bg-[var(--fill-0)] ${isFileDragging ? 'border-dashed' : 'border-3'}`}
            style={{
              zIndex: 1,
              ...(isFileDragging
                ? {
                    backgroundColor: 'var(--color-primary-light-1)',
                    borderColor: 'rgb(var(--primary-3))',
                    borderWidth: '1px',
                  }
                : {
                    borderWidth: '1px',
                    borderColor: 'var(--border-special, #60577E)',
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
                      className='min-w-200px'
                      onClickMenuItem={(key) => {
                        if (key === 'file') {
                          ipcBridge.dialog.showOpen
                            .invoke({ properties: ['openFile', 'multiSelections'] })
                            .then((files) => {
                              if (files && files.length > 0) {
                                setFiles((prev) => [...prev, ...files]);
                              }
                            })
                            .catch((error) => {
                              console.error('Failed to open file dialog:', error);
                            });
                        } else if (key === 'workspace') {
                          ipcBridge.dialog.showOpen
                            .invoke({ properties: ['openDirectory'] })
                            .then((files) => {
                              if (files && files[0]) {
                                setDir(files[0]);
                              }
                            })
                            .catch((error) => {
                              console.error('Failed to open directory dialog:', error);
                            });
                        }
                      }}
                    >
                      <Menu.Item key='file'>
                        <div className='flex items-center gap-8px'>
                          <UploadOne theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
                          <span>{t('conversation.welcome.uploadFile')}</span>
                        </div>
                      </Menu.Item>
                      <Menu.Item key='workspace'>
                        <div className='flex items-center gap-8px'>
                          <FolderOpen theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
                          <span>{t('conversation.welcome.specifyWorkspace')}</span>
                        </div>
                      </Menu.Item>
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
                        {!modelList || modelList.length === 0
                          ? [
                              /* 暂无可用模型提示 */
                              <Menu.Item key='no-models' className='px-12px py-12px text-t-secondary text-14px text-center flex justify-center items-center' disabled>
                                {t('settings.noAvailableModels')}
                              </Menu.Item>,
                              /* Add Model 选项 */
                              <Menu.Item key='add-model' className='text-12px text-t-secondary' onClick={() => navigate('/settings/model')}>
                                <Plus theme='outline' size='12' />
                                {t('settings.addModel')}
                              </Menu.Item>,
                            ]
                          : [
                              ...(modelList || []).map((provider) => {
                                const availableModels = getAvailableModels(provider);
                                // 只渲染有可用模型的 provider
                                if (availableModels.length === 0) return null;
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
                                        {(() => {
                                          const isGoogleProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
                                          const option = isGoogleProvider ? geminiModeLookup.get(modelName) : undefined;
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
                                    ))}
                                  </Menu.ItemGroup>
                                );
                              }),
                              /* Add Model 选项 */
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
            {dir && (
              <div className='flex items-center justify-between gap-6px h-28px mt-12px px-12px text-13px text-t-secondary ' style={{ borderTop: '1px solid var(--border-base)' }}>
                <div className='flex items-center'>
                  <FolderOpen className='m-r-8px flex-shrink-0' theme='outline' size='16' fill={iconColors.secondary} style={{ lineHeight: 0 }} />
                  <Tooltip content={dir} position='top'>
                    <span className='truncate'>
                      {t('conversation.welcome.currentWorkspace')}: {dir}
                    </span>
                  </Tooltip>
                </div>
                <Tooltip content={t('conversation.welcome.clearWorkspace')} position='top'>
                  <IconClose className='hover:text-[rgb(var(--danger-6))] hover:bg-3 transition-colors' strokeWidth={3} style={{ fontSize: 16 }} onClick={() => setDir('')} />
                </Tooltip>
              </div>
            )}
          </div>
        </div>

        {/* 底部快捷按钮 */}
        <div className='absolute bottom-32px left-50% -translate-x-1/2 flex flex-col justify-center items-center'>
          {/* <div className='text-text-3 text-14px mt-24px mb-12px'>{t('conversation.welcome.quickActionsTitle')}</div> */}
          <div className='flex justify-center items-center gap-24px'>
            <div className='group flex items-center justify-center w-44px h-44px rd-50% bg-fill-0 b-solid border border-1 cursor-pointer overflow-hidden whitespace-nowrap hover:w-200px hover:rd-28px hover:px-20px hover:justify-start hover:gap-10px transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.3,1)]' style={{ borderColor: 'var(--border-special, #60577E)', boxShadow: '0px 2px 12px rgba(var(--primary-rgb, 77, 60, 234), 0.1)' }} onClick={() => openLink('https://x.com/AionUi')}>
              <svg className='flex-shrink-0 text-[var(--color-text-3)] group-hover:text-[#2C7FFF] transition-colors duration-300' width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path d='M6.58335 16.6674C8.17384 17.4832 10.0034 17.7042 11.7424 17.2905C13.4814 16.8768 15.0155 15.8555 16.0681 14.4108C17.1208 12.9661 17.6229 11.1929 17.4838 9.41082C17.3448 7.6287 16.5738 5.95483 15.3099 4.69085C14.0459 3.42687 12.372 2.6559 10.5899 2.51687C8.80776 2.37784 7.03458 2.8799 5.58987 3.93256C4.14516 4.98523 3.12393 6.51928 2.71021 8.25828C2.29648 9.99729 2.51747 11.8269 3.33335 13.4174L1.66669 18.334L6.58335 16.6674Z' stroke='currentColor' strokeWidth='1.66667' strokeLinecap='round' strokeLinejoin='round' />
              </svg>
              <span className='opacity-0 max-w-0 overflow-hidden text-14px text-[var(--color-text-2)] font-bold group-hover:opacity-100 group-hover:max-w-250px transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.3,1)]'>{t('conversation.welcome.quickActionFeedback')}</span>
            </div>
            <div className='group flex items-center justify-center w-44px h-44px rd-50% bg-fill-0 b-solid border border-1 cursor-pointer overflow-hidden whitespace-nowrap hover:w-200px hover:rd-28px hover:px-20px hover:justify-start hover:gap-10px transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.3,1)]' style={{ borderColor: 'var(--border-special, #60577E)', boxShadow: '0px 2px 12px rgba(var(--primary-rgb, 77, 60, 234), 0.1)' }} onClick={() => openLink('https://github.com/iOfficeAI/AionUi')}>
              <svg className='flex-shrink-0 text-[var(--color-text-3)] group-hover:text-[#FE9900] transition-colors duration-300' width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path
                  d='M9.60416 1.91176C9.64068 1.83798 9.6971 1.77587 9.76704 1.73245C9.83698 1.68903 9.91767 1.66602 9.99999 1.66602C10.0823 1.66602 10.163 1.68903 10.233 1.73245C10.3029 1.77587 10.3593 1.83798 10.3958 1.91176L12.3208 5.81093C12.4476 6.06757 12.6348 6.2896 12.8663 6.45797C13.0979 6.62634 13.3668 6.73602 13.65 6.77759L17.955 7.40759C18.0366 7.41941 18.1132 7.45382 18.1762 7.50693C18.2393 7.56003 18.2862 7.62972 18.3117 7.7081C18.3372 7.78648 18.3402 7.87043 18.3205 7.95046C18.3007 8.03048 18.259 8.10339 18.2 8.16093L15.0867 11.1926C14.8813 11.3927 14.7277 11.6397 14.639 11.9123C14.5503 12.1849 14.5292 12.475 14.5775 12.7576L15.3125 17.0409C15.3269 17.1225 15.3181 17.2064 15.2871 17.2832C15.2561 17.3599 15.2041 17.4264 15.1371 17.4751C15.0701 17.5237 14.9908 17.5526 14.9082 17.5583C14.8256 17.5641 14.7431 17.5465 14.67 17.5076L10.8217 15.4843C10.5681 15.3511 10.286 15.2816 9.99958 15.2816C9.71318 15.2816 9.43106 15.3511 9.17749 15.4843L5.32999 17.5076C5.25694 17.5463 5.17449 17.5637 5.09204 17.5578C5.00958 17.5519 4.93043 17.5231 4.86357 17.4744C4.79672 17.4258 4.74485 17.3594 4.71387 17.2828C4.68289 17.2061 4.67404 17.1223 4.68833 17.0409L5.42249 12.7584C5.47099 12.4757 5.44998 12.1854 5.36128 11.9126C5.27257 11.6398 5.11883 11.3927 4.91333 11.1926L1.79999 8.16176C1.74049 8.10429 1.69832 8.03126 1.6783 7.95099C1.65827 7.87072 1.66119 7.78644 1.68673 7.70775C1.71226 7.62906 1.75938 7.55913 1.82272 7.50591C1.88607 7.4527 1.96308 7.41834 2.04499 7.40676L6.34916 6.77759C6.63271 6.73634 6.90199 6.62681 7.13381 6.45842C7.36564 6.29002 7.55308 6.06782 7.67999 5.81093L9.60416 1.91176Z'
                  stroke='currentColor'
                  strokeWidth='1.66667'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
              <span className='opacity-0 max-w-0 overflow-hidden text-14px text-[var(--color-text-2)] font-bold group-hover:opacity-100 group-hover:max-w-250px transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.3,1)]'>{t('conversation.welcome.quickActionStar')}</span>
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

export default Guid;
