/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { resolveLocaleKey, uuid } from '@/common/utils';
import coworkSvg from '@/renderer/assets/cowork.svg';
import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import DroidLogo from '@/renderer/assets/logos/droid.svg';
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
import { useInputFocusRing } from '@/renderer/hooks/useInputFocusRing';
import { usePasteService } from '@/renderer/hooks/usePasteService';
import { useConversationTabs } from '@/renderer/pages/conversation/context/ConversationTabsContext';
import { allSupportedExts, type FileMetadata, getCleanFileNames } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/theme/colors';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/messageFiles';
import { hasSpecificModelCapability } from '@/renderer/utils/modelCapabilities';
import { updateWorkspaceTime } from '@/renderer/utils/workspaceHistory';
import { isAcpRoutedPresetType, type AcpBackend, type AcpBackendConfig, type PresetAgentType } from '@/types/acpTypes';
import { Button, ConfigProvider, Dropdown, Input, Menu, Tooltip } from '@arco-design/web-react';
import { IconClose } from '@arco-design/web-react/icon';
import { ArrowUp, Down, FolderOpen, Plus, Robot, UploadOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import useSWR, { mutate } from 'swr';
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

/**
 * 测量 textarea 中指定位置的垂直坐标
 * @param textarea - 目标 textarea 元素
 * @param position - 文本位置
 * @returns 该位置的垂直像素坐标
 */
const measureCaretTop = (textarea: HTMLTextAreaElement, position: number): number => {
  const textBefore = textarea.value.slice(0, position);
  const measure = document.createElement('div');
  const style = getComputedStyle(textarea);
  measure.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    width: ${textarea.clientWidth}px;
    font: ${style.font};
    line-height: ${style.lineHeight};
    padding: ${style.padding};
    border: ${style.border};
    box-sizing: ${style.boxSizing};
  `;
  measure.textContent = textBefore;
  document.body.appendChild(measure);
  const caretTop = measure.scrollHeight;
  document.body.removeChild(measure);
  return caretTop;
};

/**
 * 滚动 textarea 使光标位于视口最后一行
 * @param textarea - 目标 textarea 元素
 * @param caretTop - 光标的垂直坐标
 */
const scrollCaretToLastLine = (textarea: HTMLTextAreaElement, caretTop: number): void => {
  const style = getComputedStyle(textarea);
  const lineHeight = parseInt(style.lineHeight, 10) || 20;
  // 滚动使光标位于视口最后一行
  textarea.scrollTop = Math.max(0, caretTop - textarea.clientHeight + lineHeight);
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
  droid: DroidLogo,
  iflow: IflowLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpenCodeLogo,
};
const CUSTOM_AVATAR_IMAGE_MAP: Record<string, string> = {
  'cowork.svg': coworkSvg,
  '🛠️': coworkSvg,
};

const Guid: React.FC = () => {
  const { t, i18n } = useTranslation();
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const { closeAllTabs, openTab } = useConversationTabs();
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();
  const localeKey = resolveLocaleKey(i18n.language);

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
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionSelectorVisible, setMentionSelectorVisible] = useState(false);
  const [mentionSelectorOpen, setMentionSelectorOpen] = useState(false);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [dir, setDir] = useState<string>('');
  const [currentModel, _setCurrentModel] = useState<TProviderWithModel>();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const isInputActive = isInputFocused;
  const [hoveredQuickAction, setHoveredQuickAction] = useState<'feedback' | 'repo' | null>(null);
  const quickActionStyle = useCallback(
    (isActive: boolean) => ({
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: inactiveBorderColor,
      boxShadow: isActive ? activeShadow : 'none',
    }),
    [activeBorderColor, activeShadow, inactiveBorderColor]
  );

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
  const [selectedAgentKey, _setSelectedAgentKey] = useState<string>('gemini');

  // 封装 setSelectedAgentKey 以同时保存到 storage
  // Wrap setSelectedAgentKey to also save to storage
  const setSelectedAgentKey = useCallback((key: string) => {
    _setSelectedAgentKey(key);
    // 保存选择到 storage / Save selection to storage
    ConfigStorage.set('guid.lastSelectedAgent', key).catch((error) => {
      console.error('Failed to save selected agent:', error);
    });
  }, []);
  const [availableAgents, setAvailableAgents] = useState<
    Array<{
      backend: AcpBackend;
      name: string;
      cliPath?: string;
      customAgentId?: string;
      isPreset?: boolean;
      context?: string;
      avatar?: string;
      presetAgentType?: PresetAgentType;
    }>
  >();
  const [customAgents, setCustomAgents] = useState<AcpBackendConfig[]>([]);

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
      // First check availableAgents
      const foundInAvailable = availableAgents?.find((a) => a.backend === 'custom' && a.customAgentId === customAgentId);
      if (foundInAvailable) return foundInAvailable;

      // Then check customAgents for presets
      const assistant = customAgents.find((a) => a.id === customAgentId);
      if (assistant) {
        return {
          backend: 'custom' as AcpBackend,
          name: assistant.name,
          customAgentId: assistant.id,
          isPreset: true,
          context: '', // Context loaded via other means
          avatar: assistant.avatar,
        };
      }
    }
    return availableAgents?.find((a) => a.backend === key);
  };

  // 获取选中的后端类型（向后兼容）/ Get the selected backend type (for backward compatibility)
  const selectedAgent = selectedAgentKey.startsWith('custom:') ? 'custom' : (selectedAgentKey as AcpBackend);
  const selectedAgentInfo = useMemo(() => findAgentByKey(selectedAgentKey), [selectedAgentKey, availableAgents, customAgents]);
  const isPresetAgent = Boolean(selectedAgentInfo?.isPreset);
  const [isPlusDropdownOpen, setIsPlusDropdownOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(true);
  const [typewriterPlaceholder, setTypewriterPlaceholder] = useState('');
  const [_isTyping, setIsTyping] = useState(true);
  const mentionMatchRegex = useMemo(() => /(?:^|\s)@([^\s@]*)$/, []);

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

  // 处理粘贴的文件（替换模式，避免累积旧文件路径）
  // Handle pasted files (replace mode to avoid accumulating old file paths)
  const handleFilesPasted = useCallback((pastedFiles: FileMetadata[]) => {
    const filePaths = pastedFiles.map((file) => file.path);
    // 粘贴操作替换现有文件，而不是追加
    // Paste operation replaces existing files instead of appending
    setFiles(filePaths);
    setDir('');
  }, []);

  // 处理通过对话框上传的文件（追加模式）
  // Handle files uploaded via dialog (append mode)
  const handleFilesUploaded = useCallback((uploadedPaths: string[]) => {
    setFiles((prevFiles) => [...prevFiles, ...uploadedPaths]);
  }, []);

  const handleRemoveFile = useCallback((targetPath: string) => {
    // 删除初始化面板中的已选文件 / Remove files already selected on the welcome screen
    setFiles((prevFiles) => prevFiles.filter((file) => file !== targetPath));
  }, []);

  // 使用拖拽 hook（拖拽视为粘贴操作，替换现有文件）
  // Use drag upload hook (drag is treated like paste, replaces existing files)
  const { isFileDragging, dragHandlers } = useDragUpload({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesPasted,
  });

  // 使用共享的PasteService集成（粘贴操作替换现有文件）
  // Use shared PasteService integration (paste replaces existing files)
  const { onPaste, onFocus } = usePasteService({
    supportedExts: allSupportedExts,
    onFilesAdded: handleFilesPasted,
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
          const newPos = start + text.length;
          textarea.setSelectionRange(newPos, newPos);
          const caretTop = measureCaretTop(textarea, newPos);
          scrollCaretToLastLine(textarea, caretTop);
        }, 0);
      } else {
        setInput((prev) => prev + text);
      }
    },
  });
  const handleTextareaFocus = useCallback(() => {
    onFocus();
    setIsInputFocused(true);
  }, [onFocus]);
  const handleTextareaBlur = useCallback(() => {
    setIsInputFocused(false);
  }, []);

  const customAgentAvatarMap = useMemo(() => {
    return new Map(customAgents.map((agent) => [agent.id, agent.avatar]));
  }, [customAgents]);

  const mentionOptions = useMemo(() => {
    const agents = availableAgents || [];
    return agents.map((agent) => {
      const key = getAgentKey(agent);
      const label = agent.name || agent.backend;
      const avatarValue = agent.backend === 'custom' ? agent.avatar || customAgentAvatarMap.get(agent.customAgentId || '') : undefined;
      const avatar = avatarValue ? avatarValue.trim() : undefined;
      const tokens = new Set<string>();
      const normalizedLabel = label.toLowerCase();
      tokens.add(normalizedLabel);
      tokens.add(normalizedLabel.replace(/\s+/g, '-'));
      tokens.add(normalizedLabel.replace(/\s+/g, ''));
      tokens.add(agent.backend.toLowerCase());
      if (agent.customAgentId) {
        tokens.add(agent.customAgentId.toLowerCase());
      }
      return {
        key,
        label,
        tokens,
        avatar,
        avatarImage: avatar ? CUSTOM_AVATAR_IMAGE_MAP[avatar] : undefined,
        logo: AGENT_LOGO_MAP[agent.backend],
      };
    });
  }, [availableAgents, customAgentAvatarMap]);

  const filteredMentionOptions = useMemo(() => {
    if (!mentionQuery) return mentionOptions;
    const query = mentionQuery.toLowerCase();
    return mentionOptions.filter((option) => Array.from(option.tokens).some((token) => token.startsWith(query)));
  }, [mentionOptions, mentionQuery]);

  const stripMentionToken = useCallback(
    (value: string) => {
      if (!mentionMatchRegex.test(value)) return value;
      return value.replace(mentionMatchRegex, (_match, _query) => '').trimEnd();
    },
    [mentionMatchRegex]
  );

  const selectMentionAgent = useCallback(
    (key: string) => {
      setSelectedAgentKey(key);
      setInput((prev) => stripMentionToken(prev));
      setMentionOpen(false);
      setMentionSelectorOpen(false);
      setMentionSelectorVisible(true);
      setMentionQuery(null);
      setMentionActiveIndex(0);
    },
    [stripMentionToken]
  );

  const selectedAgentLabel = selectedAgentInfo?.name || selectedAgentKey;
  const mentionMenuActiveOption = filteredMentionOptions[mentionActiveIndex] || filteredMentionOptions[0];
  const mentionMenuSelectedKey = mentionOpen || mentionSelectorOpen ? mentionMenuActiveOption?.key || selectedAgentKey : selectedAgentKey;
  const mentionMenuRef = useRef<HTMLDivElement>(null);

  const mentionMenu = useMemo(
    () => (
      <div ref={mentionMenuRef} className='bg-bg-2 border border-[var(--color-border-2)] rd-12px shadow-lg overflow-hidden' style={{ boxShadow: '0 0 0 1px var(--color-border-2), 0 12px 24px rgba(0, 0, 0, 0.12)' }}>
        <Menu selectedKeys={[mentionMenuSelectedKey]} onClickMenuItem={(key) => selectMentionAgent(String(key))} className='min-w-180px max-h-200px overflow-auto'>
          {filteredMentionOptions.length > 0 ? (
            filteredMentionOptions.map((option, index) => (
              <Menu.Item key={option.key} data-mention-index={index}>
                <div className='flex items-center gap-8px'>
                  {option.avatarImage ? <img src={option.avatarImage} alt='' width={16} height={16} style={{ objectFit: 'contain' }} /> : option.avatar ? <span style={{ fontSize: 14, lineHeight: '16px' }}>{option.avatar}</span> : option.logo ? <img src={option.logo} alt={option.label} width={16} height={16} style={{ objectFit: 'contain' }} /> : <Robot theme='outline' size={16} />}
                  <span>{option.label}</span>
                </div>
              </Menu.Item>
            ))
          ) : (
            <Menu.Item key='empty' disabled>
              {t('conversation.welcome.none', { defaultValue: 'None' })}
            </Menu.Item>
          )}
        </Menu>
      </div>
    ),
    [filteredMentionOptions, mentionMenuSelectedKey, selectMentionAgent, t]
  );

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

  // 加载上次选择的 agent / Load last selected agent
  useEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;

    let cancelled = false;

    const loadLastSelectedAgent = async () => {
      try {
        const savedAgentKey = await ConfigStorage.get('guid.lastSelectedAgent');
        if (cancelled || !savedAgentKey) return;

        // 1. Check availableAgents first
        const isInAvailable = availableAgents.some((agent) => {
          const key = agent.backend === 'custom' && agent.customAgentId ? `custom:${agent.customAgentId}` : agent.backend;
          return key === savedAgentKey;
        });

        if (isInAvailable) {
          _setSelectedAgentKey(savedAgentKey);
          return;
        }

        // 2. For custom agents, check storage
        if (savedAgentKey.startsWith('custom:')) {
          const customId = savedAgentKey.slice(7);
          const agents = await ConfigStorage.get('acp.customAgents');
          if (cancelled) return;

          if (agents?.some((a: AcpBackendConfig) => a.id === customId)) {
            _setSelectedAgentKey(savedAgentKey);
          }
        }
      } catch (error) {
        console.error('Failed to load last selected agent:', error);
      }
    };

    void loadLastSelectedAgent();

    return () => {
      cancelled = true;
    };
  }, [availableAgents]);

  useEffect(() => {
    let isActive = true;
    ConfigStorage.get('acp.customAgents')
      .then((agents) => {
        if (!isActive) return;
        setCustomAgents(agents || []);
      })
      .catch((error) => {
        console.error('Failed to load custom agents:', error);
      });
    return () => {
      isActive = false;
    };
  }, [availableAgentsData]);

  useEffect(() => {
    if (mentionOpen) {
      setMentionActiveIndex(0);
      return;
    }
    if (mentionSelectorOpen) {
      const selectedIndex = filteredMentionOptions.findIndex((option) => option.key === selectedAgentKey);
      setMentionActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [filteredMentionOptions, mentionOpen, mentionQuery, mentionSelectorOpen, selectedAgentKey]);

  useEffect(() => {
    if (!mentionOpen && !mentionSelectorOpen) return;
    const container = mentionMenuRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-mention-index="${mentionActiveIndex}"]`);
    if (!target) return;
    target.scrollIntoView({ block: 'nearest' });
  }, [mentionActiveIndex, mentionOpen, mentionSelectorOpen]);

  const { compositionHandlers, isComposing } = useCompositionInput();

  /**
   * 解析预设助手的 rules 和 skills
   * Resolve preset assistant rules and skills
   *
   * - rules: 系统规则，在会话初始化时注入到 userMemory
   * - skills: 技能定义，在首次请求时注入到消息前缀
   */
  const resolvePresetRulesAndSkills = useCallback(
    async (agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined): Promise<{ rules?: string; skills?: string }> => {
      if (!agentInfo) return {};
      if (agentInfo.backend !== 'custom') {
        return { rules: agentInfo.context };
      }

      const customAgentId = agentInfo.customAgentId;
      if (!customAgentId) return { rules: agentInfo.context };

      let rules = '';
      let skills = '';

      // 1. 加载 rules / Load rules
      try {
        rules = await ipcBridge.fs.readAssistantRule.invoke({
          assistantId: customAgentId,
          locale: localeKey,
        });
      } catch (error) {
        console.warn(`Failed to load rules for ${customAgentId}:`, error);
      }

      // 2. 加载 skills / Load skills
      try {
        skills = await ipcBridge.fs.readAssistantSkill.invoke({
          assistantId: customAgentId,
          locale: localeKey,
        });
      } catch (error) {
        // skills 可能不存在，这是正常的 / skills may not exist, this is normal
      }

      // 3. Fallback: 如果是内置助手且文件为空，从内置资源加载
      // Fallback: If builtin assistant and files are empty, load from builtin resources
      if (customAgentId.startsWith('builtin-')) {
        const presetId = customAgentId.replace('builtin-', '');
        const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
        if (preset) {
          // Fallback for rules
          if (!rules && preset.ruleFiles) {
            try {
              const ruleFile = preset.ruleFiles[localeKey] || preset.ruleFiles['en-US'];
              if (ruleFile) {
                rules = await ipcBridge.fs.readBuiltinRule.invoke({ fileName: ruleFile });
              }
            } catch (e) {
              console.warn(`Failed to load builtin rules for ${customAgentId}:`, e);
            }
          }
          // Fallback for skills
          if (!skills && preset.skillFiles) {
            try {
              const skillFile = preset.skillFiles[localeKey] || preset.skillFiles['en-US'];
              if (skillFile) {
                skills = await ipcBridge.fs.readBuiltinSkill.invoke({ fileName: skillFile });
              }
            } catch (e) {
              // skills fallback failure is ok
            }
          }
        }
      }

      return { rules: rules || agentInfo.context, skills };
    },
    [localeKey]
  );

  // 保持向后兼容的 resolvePresetContext（只返回 rules）
  // Backward compatible resolvePresetContext (returns only rules)
  const resolvePresetContext = useCallback(
    async (agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined): Promise<string | undefined> => {
      const { rules } = await resolvePresetRulesAndSkills(agentInfo);
      return rules;
    },
    [resolvePresetRulesAndSkills]
  );

  const resolvePresetAgentType = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => {
      if (!agentInfo) return 'gemini';
      if (agentInfo.backend !== 'custom') return 'gemini';
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.customAgentId);
      return customAgent?.presetAgentType || 'gemini';
    },
    [customAgents]
  );

  // 解析助手启用的 skills 列表 / Resolve enabled skills for the assistant
  const resolveEnabledSkills = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined): string[] | undefined => {
      if (!agentInfo) return undefined;
      if (agentInfo.backend !== 'custom') return undefined;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.customAgentId);
      return customAgent?.enabledSkills;
    },
    [customAgents]
  );

  const refreshCustomAgents = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch (error) {
      console.error('Failed to refresh custom agents:', error);
    }
  }, []);

  useEffect(() => {
    void refreshCustomAgents();
  }, [refreshCustomAgents]);

  const handleInputChange = useCallback(
    (value: string) => {
      setInput(value);
      const match = value.match(mentionMatchRegex);
      if (match) {
        setMentionQuery(match[1]);
        setMentionOpen(true);
        setMentionSelectorOpen(false);
      } else {
        setMentionQuery(null);
        setMentionOpen(false);
      }
    },
    [mentionMatchRegex]
  );

  const handleSend = async () => {
    // 用户明确选择的目录 -> customWorkspace = true, 使用用户选择的目录
    // 未选择时 -> customWorkspace = false, 传空让后端创建临时目录 (gemini-temp-xxx)
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || ''; // 不指定时传空，让后端创建临时目录

    const agentInfo = selectedAgentInfo;
    const isPreset = isPresetAgent;
    const presetAgentType = resolvePresetAgentType(agentInfo);

    // 加载 rules（skills 已迁移到 SkillManager）/ Load rules (skills migrated to SkillManager)
    const { rules: presetRules } = await resolvePresetRulesAndSkills(agentInfo);
    // 获取启用的 skills 列表 / Get enabled skills list
    const enabledSkills = resolveEnabledSkills(agentInfo);

    // 默认情况使用 Gemini，或 Preset 配置为 Gemini
    if (!selectedAgent || selectedAgent === 'gemini' || (isPreset && presetAgentType === 'gemini')) {
      if (!currentModel) return;
      try {
        const presetAssistantIdToPass = isPreset ? agentInfo?.customAgentId : undefined;

        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'gemini',
          name: input,
          model: currentModel,
          extra: {
            defaultFiles: files,
            workspace: finalWorkspace,
            customWorkspace: isCustomWorkspace,
            webSearchEngine: isGoogleAuth ? 'google' : 'default',
            // 传递 rules（skills 通过 SkillManager 加载）
            // Pass rules (skills loaded via SkillManager)
            presetRules: isPreset ? presetRules : undefined,
            // 启用的 skills 列表 / Enabled skills list
            enabledSkills: isPreset ? enabledSkills : undefined,
            // 预设助手 ID，用于在会话面板显示助手名称和头像
            // Preset assistant ID for displaying name and avatar in conversation panel
            presetAssistantId: presetAssistantIdToPass,
          },
        });

        if (!conversation || !conversation.id) {
          throw new Error('Failed to create conversation - conversation object is null or missing id');
        }

        // 更新 workspace 时间戳，确保分组会话能正确排序（仅自定义工作空间）
        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          // 将新会话添加到 tabs
          openTab(conversation);
        }

        // 立即触发刷新，让左侧栏开始加载新会话（在导航前）
        emitter.emit('chat.history.refresh');

        // Store initial message to sessionStorage for GeminiSendBox to send after navigation
        // This enables instant page transition without waiting for API response
        const workspacePath = conversation.extra?.workspace || '';
        const displayMessage = buildDisplayMessage(input, files, workspacePath);
        const initialMessage = {
          input: displayMessage,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`gemini_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        // Navigate immediately for instant page transition
        void navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create or send Gemini message:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create Gemini conversation: ${errorMessage}`);
        throw error; // Re-throw to prevent input clearing
      }
      return;
    } else if (selectedAgent === 'codex' || (isPreset && presetAgentType === 'codex')) {
      // Codex conversation type (including preset with codex agent type)
      const codexAgentInfo = agentInfo || findAgentByKey(selectedAgentKey);

      // 创建 Codex 会话并保存初始消息，由对话页负责发送
      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'codex',
          name: input,
          model: currentModel!, // not used by codex, but required by type
          extra: {
            defaultFiles: files,
            workspace: finalWorkspace,
            customWorkspace: isCustomWorkspace,
            // Pass preset context (rules only)
            presetContext: isPreset ? presetRules : undefined,
            // 启用的 skills 列表（通过 SkillManager 加载）/ Enabled skills list (loaded via SkillManager)
            enabledSkills: isPreset ? enabledSkills : undefined,
            // 预设助手 ID，用于在会话面板显示助手名称和头像
            // Preset assistant ID for displaying name and avatar in conversation panel
            presetAssistantId: isPreset ? codexAgentInfo?.customAgentId : undefined,
          },
        });

        if (!conversation || !conversation.id) {
          alert('Failed to create Codex conversation. Please ensure the Codex CLI is installed and accessible in PATH.');
          return;
        }

        // 更新 workspace 时间戳，确保分组会话能正确排序（仅自定义工作空间）
        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          // 将新会话添加到 tabs
          openTab(conversation);
        }

        // 立即触发刷新，让左侧栏开始加载新会话（在导航前）
        emitter.emit('chat.history.refresh');

        // 交给对话页发送，避免事件丢失
        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`codex_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        // 然后导航到会话页面
        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create Codex conversation: ${errorMessage}`);
        throw error;
      }
      return;
    } else {
      // ACP conversation type (including preset with claude agent type)
      const acpAgentInfo = agentInfo || findAgentByKey(selectedAgentKey);

      // For preset with ACP-routed agent type (claude/opencode), use corresponding backend
      const acpBackend = isPreset && isAcpRoutedPresetType(presetAgentType) ? presetAgentType : selectedAgent;

      if (!acpAgentInfo && !isPreset) {
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
            customWorkspace: isCustomWorkspace,
            backend: acpBackend,
            cliPath: acpAgentInfo?.cliPath,
            agentName: acpAgentInfo?.name, // 存储自定义代理的配置名称 / Store configured name for custom agents
            customAgentId: acpAgentInfo?.customAgentId, // 自定义代理的 UUID / UUID for custom agents
            // Pass preset context (rules only)
            presetContext: isPreset ? presetRules : undefined,
            // 启用的 skills 列表（通过 SkillManager 加载）/ Enabled skills list (loaded via SkillManager)
            enabledSkills: isPreset ? enabledSkills : undefined,
            // 预设助手 ID，用于在会话面板显示助手名称和头像
            // Preset assistant ID for displaying name and avatar in conversation panel
            presetAssistantId: isPreset ? acpAgentInfo?.customAgentId : undefined,
          },
        });

        if (!conversation || !conversation.id) {
          alert('Failed to create ACP conversation. Please check your ACP configuration and ensure the CLI is installed.');
          return;
        }

        // 更新 workspace 时间戳，确保分组会话能正确排序（仅自定义工作空间）
        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          // 将新会话添加到 tabs
          openTab(conversation);
        }

        // 立即触发刷新，让左侧栏开始加载新会话（在导航前）
        emitter.emit('chat.history.refresh');

        // For ACP, we need to wait for the connection to be ready before sending the message
        // Store the initial message and let the conversation page handle it when ready
        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };

        // Store initial message in sessionStorage to be picked up by the conversation page
        sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        // 然后导航到会话页面
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
        // Clear all input states on successful send
        setInput('');
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        setFiles([]);
        setDir('');
      })
      .catch((error) => {
        console.error('Failed to send message:', error);
        // Keep the input content when there's an error
      })
      .finally(() => {
        setLoading(false);
      });
  };
  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (isComposing.current) return;
      if ((mentionOpen || mentionSelectorOpen) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        if (filteredMentionOptions.length === 0) return;
        setMentionActiveIndex((prev) => {
          if (event.key === 'ArrowDown') {
            return (prev + 1) % filteredMentionOptions.length;
          }
          return (prev - 1 + filteredMentionOptions.length) % filteredMentionOptions.length;
        });
        return;
      }
      if ((mentionOpen || mentionSelectorOpen) && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (filteredMentionOptions.length > 0) {
          const query = mentionQuery?.toLowerCase();
          const exactMatch = query ? filteredMentionOptions.find((option) => option.label.toLowerCase() === query || option.tokens.has(query)) : undefined;
          const selected = exactMatch || filteredMentionOptions[mentionActiveIndex] || filteredMentionOptions[0];
          if (selected) {
            selectMentionAgent(selected.key);
            return;
          }
        }
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        return;
      }
      if (mentionOpen && (event.key === 'Backspace' || event.key === 'Delete') && !mentionQuery) {
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionActiveIndex(0);
        return;
      }
      if (!mentionOpen && mentionSelectorVisible && !input.trim() && (event.key === 'Backspace' || event.key === 'Delete')) {
        event.preventDefault();
        setMentionSelectorVisible(false);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        return;
      }
      if ((mentionOpen || mentionSelectorOpen) && event.key === 'Escape') {
        event.preventDefault();
        setMentionOpen(false);
        setMentionQuery(null);
        setMentionSelectorOpen(false);
        setMentionActiveIndex(0);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!input.trim()) return;
        sendMessageHandler();
      }
    },
    [filteredMentionOptions, mentionOpen, mentionQuery, mentionSelectorOpen, selectMentionAgent, sendMessageHandler, mentionActiveIndex, mentionSelectorVisible, input, isComposing]
  );
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

  // 打字机效果 / Typewriter effect
  useEffect(() => {
    const fullText = t('conversation.welcome.placeholder');
    let currentIndex = 0;
    const typingSpeed = 80; // 每个字符的打字速度（毫秒）/ Typing speed per character (ms)
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const typeNextChar = () => {
      if (currentIndex <= fullText.length) {
        // 在打字过程中添加光标 / Add cursor during typing
        setTypewriterPlaceholder(fullText.slice(0, currentIndex) + (currentIndex < fullText.length ? '|' : ''));
        currentIndex++;
      }
    };

    // 初始延迟，让用户看到页面加载完成 / Initial delay to let user see page loaded
    const initialDelay = setTimeout(() => {
      intervalId = setInterval(() => {
        typeNextChar();
        if (currentIndex > fullText.length) {
          if (intervalId) clearInterval(intervalId);
          setIsTyping(false); // 打字完成 / Typing complete
          setTypewriterPlaceholder(fullText); // 移除光标 / Remove cursor
        }
      }, typingSpeed);
    }, 300);

    // 清理函数：同时清理 timeout 和 interval / Cleanup: clear both timeout and interval
    return () => {
      clearTimeout(initialDelay);
      if (intervalId) clearInterval(intervalId);
    };
  }, [t]);
  return (
    <ConfigProvider getPopupContainer={() => guidContainerRef.current || document.body}>
      <div ref={guidContainerRef} className={styles.guidContainer}>
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
                  color: 'var(--text-primary)',
                }}
              >
                {availableAgents
                  .filter((agent) => agent.backend !== 'custom')
                  .map((agent, index) => {
                    const isSelected = selectedAgentKey === getAgentKey(agent);
                    const logoSrc = AGENT_LOGO_MAP[agent.backend];

                    return (
                      <React.Fragment key={getAgentKey(agent)}>
                        {index > 0 && <div className='text-16px lh-1 p-2px select-none opacity-30'>|</div>}
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
                          onClick={() => {
                            setSelectedAgentKey(getAgentKey(agent));
                            setMentionOpen(false);
                            setMentionQuery(null);
                            setMentionSelectorOpen(false);
                            setMentionActiveIndex(0);
                          }}
                        >
                          {logoSrc ? <img src={logoSrc} alt={`${agent.backend} logo`} width={20} height={20} style={{ objectFit: 'contain', flexShrink: 0 }} /> : <Robot theme='outline' size={20} fill='currentColor' style={{ flexShrink: 0 }} />}
                          <span
                            className={`font-medium text-14px ${isSelected ? 'font-semibold ml-4px' : 'max-w-0 opacity-0 overflow-hidden group-hover:max-w-100px group-hover:opacity-100 group-hover:ml-8px'}`}
                            style={{
                              color: 'var(--text-primary)',
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
            className={`${styles.guidInputCard} relative p-16px border-3 b bg-dialog-fill-0 b-solid rd-20px flex flex-col ${mentionOpen ? 'overflow-visible' : 'overflow-hidden'} transition-all duration-200 ${isFileDragging ? 'border-dashed' : ''}`}
            style={{
              zIndex: 1,
              transition: 'box-shadow 0.25s ease, border-color 0.25s ease, border-width 0.25s ease',
              ...(isFileDragging
                ? {
                    backgroundColor: 'var(--color-primary-light-1)',
                    borderColor: 'rgb(var(--primary-3))',
                    borderWidth: '1px',
                  }
                : {
                    borderWidth: '1px',
                    borderColor: isInputActive ? activeBorderColor : inactiveBorderColor,
                    boxShadow: isInputActive ? activeShadow : 'none',
                  }),
            }}
            {...dragHandlers}
          >
            {mentionSelectorVisible && (
              <div className='flex items-center gap-8px mb-8px'>
                <Dropdown
                  trigger='click'
                  popupVisible={mentionSelectorOpen}
                  onVisibleChange={(visible) => {
                    setMentionSelectorOpen(visible);
                    if (visible) {
                      setMentionQuery(null);
                    }
                  }}
                  droplist={mentionMenu}
                >
                  <div className='flex items-center gap-6px bg-fill-2 px-10px py-4px rd-16px cursor-pointer select-none'>
                    <span className='text-14px font-medium text-t-primary'>@{selectedAgentLabel}</span>
                    <Down theme='outline' size={12} />
                  </div>
                </Dropdown>
              </div>
            )}
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 20 }} placeholder={typewriterPlaceholder || t('conversation.welcome.placeholder')} className={`text-16px focus:b-none rounded-xl !bg-transparent !b-none !resize-none !p-0 ${styles.lightPlaceholder}`} value={input} onChange={handleInputChange} onPaste={onPaste} onFocus={handleTextareaFocus} onBlur={handleTextareaBlur} {...compositionHandlers} onKeyDown={handleInputKeyDown}></Input.TextArea>
            {mentionOpen && (
              <div className='absolute z-50' style={{ left: 16, top: 44 }}>
                {mentionMenu}
              </div>
            )}
            {files.length > 0 && (
              // 展示待发送的文件并允许取消 / Show pending files and allow cancellation
              <div className='flex flex-wrap items-center gap-8px mt-12px mb-12px'>
                {files.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => handleRemoveFile(path)} />
                ))}
              </div>
            )}
            <div className={styles.actionRow}>
              <div className={styles.actionTools}>
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
                            .then((uploadedFiles) => {
                              if (uploadedFiles && uploadedFiles.length > 0) {
                                // 通过对话框上传的文件使用追加模式
                                // Files uploaded via dialog use append mode
                                handleFilesUploaded(uploadedFiles);
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
                    <Button type='text' shape='circle' className={isPlusDropdownOpen ? styles.plusButtonRotate : ''} icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}></Button>
                    {files.length > 0 && (
                      <Tooltip className={'!max-w-max'} content={<span className='whitespace-break-spaces'>{getCleanFileNames(files).join('\n')}</span>}>
                        <span className='text-t-primary'>File({files.length})</span>
                      </Tooltip>
                    )}
                  </span>
                </Dropdown>

                {(selectedAgent === 'gemini' || (isPresetAgent && resolvePresetAgentType(selectedAgentInfo) === 'gemini')) && (
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
                                    {availableModels.map((modelName) => {
                                      const isGoogleProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
                                      const option = isGoogleProvider ? geminiModeLookup.get(modelName) : undefined;

                                      // Manual 模式：显示带子菜单的选项
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
                                            {option.subModels.map((subModel) => (
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

                                      // 普通模式：显示单个选项
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

                {isPresetAgent && selectedAgentInfo && (
                  <div
                    className={styles.presetAgentTag}
                    onClick={() => {
                      /* Optional: Open assistant settings or do nothing, removal is via the X icon */
                    }}
                  >
                    {(() => {
                      const avatarValue = selectedAgentInfo.avatar?.trim();
                      const avatarImage = avatarValue ? CUSTOM_AVATAR_IMAGE_MAP[avatarValue] : undefined;
                      return avatarImage ? <img src={avatarImage} alt='' width={16} height={16} style={{ objectFit: 'contain', flexShrink: 0 }} /> : avatarValue ? <span style={{ fontSize: 14, lineHeight: '16px', flexShrink: 0 }}>{avatarValue}</span> : <Robot theme='outline' size={16} style={{ flexShrink: 0 }} />;
                    })()}
                    {(() => {
                      const agent = customAgents.find((a) => a.id === selectedAgentInfo.customAgentId);
                      const name = agent?.nameI18n?.[localeKey] || agent?.name || selectedAgentInfo.name;
                      return <span className={styles.presetAgentTagName}>{name}</span>;
                    })()}
                    <div
                      className={styles.presetAgentTagClose}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAgentKey('gemini'); // Reset to default
                      }}
                    >
                      <IconClose style={{ fontSize: 12, color: 'var(--color-text-3)' }} />
                    </div>
                  </div>
                )}
              </div>
              <div className={styles.actionSubmit}>
                <Button
                  shape='circle'
                  type='primary'
                  loading={loading}
                  disabled={!input.trim() || ((!selectedAgent || selectedAgent === 'gemini' || (isPresetAgent && resolvePresetAgentType(selectedAgentInfo) === 'gemini')) && !currentModel)}
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

          {/* Assistant Selection Area */}
          {customAgents && customAgents.some((a) => a.isPreset) && (
            <div className='mt-16px w-full'>
              {isPresetAgent && selectedAgentInfo ? (
                // Selected Assistant View
                <div className='flex flex-col w-full animate-fade-in'>
                  <div className='w-full'>
                    <div className='flex items-center justify-between py-8px cursor-pointer select-none' onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}>
                      <span className='text-13px text-[rgb(var(--primary-6))] opacity-80'>{t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}</span>
                      <Down theme='outline' size={14} fill='rgb(var(--primary-6))' className={`transition-transform duration-300 ${isDescriptionExpanded ? 'rotate-180' : ''}`} />
                    </div>
                    <div className={`overflow-hidden transition-all duration-300 ${isDescriptionExpanded ? 'max-h-500px mt-4px opacity-100' : 'max-h-0 opacity-0'}`}>
                      <div
                        className='p-12px rd-14px text-13px text-3 text-t-secondary whitespace-pre-wrap leading-relaxed '
                        style={{
                          border: '1px solid var(--color-border-2)',
                          background: 'var(--color-fill-1)',
                        }}
                      >
                        {customAgents.find((a) => a.id === selectedAgentInfo.customAgentId)?.descriptionI18n?.[localeKey] || customAgents.find((a) => a.id === selectedAgentInfo.customAgentId)?.description || t('settings.assistantDescriptionPlaceholder', { defaultValue: 'No description' })}
                      </div>
                    </div>
                  </div>

                  {/* Prompts Section */}
                  {(() => {
                    const agent = customAgents.find((a) => a.id === selectedAgentInfo.customAgentId);
                    const prompts = agent?.promptsI18n?.[localeKey] || agent?.promptsI18n?.['en-US'] || agent?.prompts;
                    if (prompts && prompts.length > 0) {
                      return (
                        <div className='flex flex-wrap gap-8px mt-16px'>
                          {prompts.map((prompt: string, index: number) => (
                            <div
                              key={index}
                              className='px-12px py-6px bg-fill-2 hover:bg-fill-3 text-[rgb(var(--primary-6))] text-13px rd-16px cursor-pointer transition-colors shadow-sm'
                              onClick={() => {
                                setInput(prompt);
                                handleTextareaFocus();
                              }}
                            >
                              {prompt}
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              ) : (
                // Assistant List View
                <div className='flex flex-wrap gap-8px justify-center'>
                  {customAgents
                    .filter((a) => a.isPreset && a.enabled !== false)
                    .sort((a, b) => {
                      if (a.id === 'cowork') return -1;
                      if (b.id === 'cowork') return 1;
                      return 0;
                    })
                    .map((assistant) => {
                      const avatarValue = assistant.avatar?.trim();
                      const avatarImage = avatarValue ? CUSTOM_AVATAR_IMAGE_MAP[avatarValue] : undefined;
                      return (
                        <div
                          key={assistant.id}
                          className='h-28px group flex items-center gap-8px px-16px rd-100px cursor-pointer transition-all b-1 b-solid border-arco-2 hover:bg-fill-0 select-none'
                          onClick={() => {
                            setSelectedAgentKey(`custom:${assistant.id}`);
                            setMentionOpen(false);
                            setMentionQuery(null);
                            setMentionSelectorOpen(false);
                            setMentionActiveIndex(0);
                          }}
                        >
                          {avatarImage ? <img src={avatarImage} alt='' width={16} height={16} style={{ objectFit: 'contain' }} /> : avatarValue ? <span style={{ fontSize: 16, lineHeight: '18px' }}>{avatarValue}</span> : <Robot theme='outline' size={16} />}
                          <span className='text-14px text-4 hover:text-2'>{assistant.nameI18n?.[localeKey] || assistant.name}</span>
                        </div>
                      );
                    })}
                  <div className='h-28px flex items-center gap-8px px-16px rd-100px cursor-pointer transition-all text-t-secondary hover:text-t-primary hover:bg-fill-2 b-1 b-dashed b-aou-2 select-none' onClick={() => navigate('/settings/agent')}>
                    <Plus theme='outline' size={14} className='line-height-0' />
                    <span className='text-13px'>{t('settings.createAssistant', { defaultValue: 'Create' })}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部快捷按钮 */}
        <div className='absolute bottom-32px left-50% -translate-x-1/2 flex flex-col justify-center items-center'>
          {/* <div className='text-text-3 text-14px mt-24px mb-12px'>{t('conversation.welcome.quickActionsTitle')}</div> */}
          <div className='flex justify-center items-center gap-24px'>
            <div className='group flex items-center justify-center w-36px h-36px rd-50% bg-fill-0 cursor-pointer overflow-hidden whitespace-nowrap hover:w-200px hover:rd-28px hover:px-20px hover:justify-start hover:gap-10px transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.3,1)]' style={quickActionStyle(hoveredQuickAction === 'feedback')} onMouseEnter={() => setHoveredQuickAction('feedback')} onMouseLeave={() => setHoveredQuickAction(null)} onClick={() => openLink('https://x.com/AionUi')}>
              <svg className='flex-shrink-0 text-[var(--color-text-3)] group-hover:text-[#2C7FFF] transition-colors duration-300' width='20' height='20' viewBox='0 0 20 20' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <path d='M6.58335 16.6674C8.17384 17.4832 10.0034 17.7042 11.7424 17.2905C13.4814 16.8768 15.0155 15.8555 16.0681 14.4108C17.1208 12.9661 17.6229 11.1929 17.4838 9.41082C17.3448 7.6287 16.5738 5.95483 15.3099 4.69085C14.0459 3.42687 12.372 2.6559 10.5899 2.51687C8.80776 2.37784 7.03458 2.8799 5.58987 3.93256C4.14516 4.98523 3.12393 6.51928 2.71021 8.25828C2.29648 9.99729 2.51747 11.8269 3.33335 13.4174L1.66669 18.334L6.58335 16.6674Z' stroke='currentColor' strokeWidth='1.66667' strokeLinecap='round' strokeLinejoin='round' />
              </svg>
              <span className='opacity-0 max-w-0 overflow-hidden text-14px text-[var(--color-text-2)] font-bold group-hover:opacity-100 group-hover:max-w-250px transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.3,1)]'>{t('conversation.welcome.quickActionFeedback')}</span>
            </div>
            <div className='group flex items-center justify-center w-36px h-36px rd-50% bg-fill-0 cursor-pointer overflow-hidden whitespace-nowrap hover:w-200px hover:rd-28px hover:px-20px hover:justify-start hover:gap-10px transition-all duration-400 ease-[cubic-bezier(0.2,0.8,0.3,1)]' style={quickActionStyle(hoveredQuickAction === 'repo')} onMouseEnter={() => setHoveredQuickAction('repo')} onMouseLeave={() => setHoveredQuickAction(null)} onClick={() => openLink('https://github.com/iOfficeAI/AionUi')}>
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
