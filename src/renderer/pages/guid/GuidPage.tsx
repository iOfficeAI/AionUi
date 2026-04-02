/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveLocaleKey } from '@/common/utils';
import { useAssistantBackends } from '@/renderer/hooks/assistant';
import { useInputFocusRing } from '@/renderer/hooks/chat/useInputFocusRing';
import { openExternalUrl, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { useConversationTabs } from '@/renderer/pages/conversation/hooks/ConversationTabsContext';
import { CUSTOM_AVATAR_IMAGE_MAP } from './constants';
import AgentPillBar from './components/AgentPillBar';
import AssistantSelectionArea from './components/AssistantSelectionArea';
import { AgentPillBarSkeleton } from './components/GuidSkeleton';
import GuidActionRow from './components/GuidActionRow';
import GuidInputCard from './components/GuidInputCard';
import GuidModelSelector from './components/GuidModelSelector';
import MentionDropdown, { MentionSelectorBadge } from './components/MentionDropdown';
import QuickActionButtons from './components/QuickActionButtons';
import SkillsMarketBanner from './components/SkillsMarketBanner';
import { useGuidAgentSelection } from './hooks/useGuidAgentSelection';
import { useGuidInput } from './hooks/useGuidInput';
import { useGuidMention } from './hooks/useGuidMention';
import { useGuidModelSelection } from './hooks/useGuidModelSelection';
import { useGuidSend } from './hooks/useGuidSend';
import { useTypewriterPlaceholder } from './hooks/useTypewriterPlaceholder';
import { ConfigStorage } from '@/common/config/storage';
import { ACP_BACKENDS_ALL, type PresetAgentType } from '@/common/types/acpTypes';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import type { AcpBackendConfig } from './types';
import { Button, ConfigProvider, Dropdown, Menu, Message } from '@arco-design/web-react';
import { Down, Left, Robot, Write } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './index.module.css';

// Agent switcher options — same list as AssistantEditDrawer
const BUILTIN_AGENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'gemini', label: 'Gemini CLI' },
  { value: 'claude', label: 'Claude Code' },
  { value: 'qwen', label: 'Qwen Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'codebuddy', label: 'CodeBuddy' },
  { value: 'opencode', label: 'OpenCode' },
];

const GuidPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const openAssistantDetailsRef = useRef<(() => void) | null>(null);
  const descriptionTextRef = useRef<HTMLDivElement>(null);
  const { closeAllTabs, openTab } = useConversationTabs();
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();
  const { availableBackends, extensionAcpAdapters } = useAssistantBackends();
  const localeKey = resolveLocaleKey(i18n.language);

  // Open external link
  const openLink = useCallback(async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.error('Failed to open external link:', error);
    }
  }, []);

  // --- Hooks ---
  const modelSelection = useGuidModelSelection();

  const agentSelection = useGuidAgentSelection({
    modelList: modelSelection.modelList,
    isGoogleAuth: modelSelection.isGoogleAuth,
    localeKey,
  });

  const guidInput = useGuidInput({
    locationState: location.state as { workspace?: string } | null,
  });

  const mention = useGuidMention({
    availableAgents: agentSelection.availableAgents,
    customAgentAvatarMap: agentSelection.customAgentAvatarMap,
    selectedAgentKey: agentSelection.selectedAgentKey,
    setSelectedAgentKey: agentSelection.setSelectedAgentKey,
    setInput: guidInput.setInput,
    selectedAgentInfo: agentSelection.selectedAgentInfo,
  });

  const send = useGuidSend({
    // Input state
    input: guidInput.input,
    setInput: guidInput.setInput,
    files: guidInput.files,
    setFiles: guidInput.setFiles,
    dir: guidInput.dir,
    setDir: guidInput.setDir,
    setLoading: guidInput.setLoading,
    loading: guidInput.loading,

    // Agent state
    selectedAgent: agentSelection.selectedAgent,
    selectedAgentKey: agentSelection.selectedAgentKey,
    selectedAgentInfo: agentSelection.selectedAgentInfo,
    isPresetAgent: agentSelection.isPresetAgent,
    selectedMode: agentSelection.selectedMode,
    selectedAcpModel: agentSelection.selectedAcpModel,
    currentModel: modelSelection.currentModel,

    // Agent helpers
    findAgentByKey: agentSelection.findAgentByKey,
    getEffectiveAgentType: agentSelection.getEffectiveAgentType,
    resolvePresetRulesAndSkills: agentSelection.resolvePresetRulesAndSkills,
    resolveEnabledSkills: agentSelection.resolveEnabledSkills,
    isMainAgentAvailable: agentSelection.isMainAgentAvailable,
    getAvailableFallbackAgent: agentSelection.getAvailableFallbackAgent,
    currentEffectiveAgentInfo: agentSelection.currentEffectiveAgentInfo,
    isGoogleAuth: modelSelection.isGoogleAuth,

    // Mention state reset
    setMentionOpen: mention.setMentionOpen,
    setMentionQuery: mention.setMentionQuery,
    setMentionSelectorOpen: mention.setMentionSelectorOpen,
    setMentionActiveIndex: mention.setMentionActiveIndex,

    // Navigation & tabs
    navigate,
    closeAllTabs,
    openTab,
    t,
  });

  // --- Coordinated handlers (depend on multiple hooks) ---
  const handleInputChange = useCallback(
    (value: string) => {
      guidInput.setInput(value);
      const match = value.match(mention.mentionMatchRegex);
      // 首页不根据输入 @ 呼起 mention 列表，占位符里的 @agent 仅为提示，选 agent 用顶部栏或下拉手动选
      if (match) {
        mention.setMentionQuery(match[1]);
        mention.setMentionOpen(false);
      } else {
        mention.setMentionQuery(null);
        mention.setMentionOpen(false);
      }
    },
    [mention.mentionMatchRegex, guidInput.setInput, mention.setMentionQuery, mention.setMentionOpen]
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (
        (mention.mentionOpen || mention.mentionSelectorOpen) &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        if (mention.filteredMentionOptions.length === 0) return;
        mention.setMentionActiveIndex((prev) => {
          if (event.key === 'ArrowDown') {
            return (prev + 1) % mention.filteredMentionOptions.length;
          }
          return (prev - 1 + mention.filteredMentionOptions.length) % mention.filteredMentionOptions.length;
        });
        return;
      }
      if ((mention.mentionOpen || mention.mentionSelectorOpen) && event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (mention.filteredMentionOptions.length > 0) {
          const query = mention.mentionQuery?.toLowerCase();
          const exactMatch = query
            ? mention.filteredMentionOptions.find(
                (option) => option.label.toLowerCase() === query || option.tokens.has(query)
              )
            : undefined;
          const selected =
            exactMatch ||
            mention.filteredMentionOptions[mention.mentionActiveIndex] ||
            mention.filteredMentionOptions[0];
          if (selected) {
            mention.selectMentionAgent(selected.key);
            return;
          }
        }
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (mention.mentionOpen && (event.key === 'Backspace' || event.key === 'Delete') && !mention.mentionQuery) {
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (
        !mention.mentionOpen &&
        mention.mentionSelectorVisible &&
        !guidInput.input.trim() &&
        (event.key === 'Backspace' || event.key === 'Delete')
      ) {
        event.preventDefault();
        mention.setMentionSelectorVisible(false);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if ((mention.mentionOpen || mention.mentionSelectorOpen) && event.key === 'Escape') {
        event.preventDefault();
        mention.setMentionOpen(false);
        mention.setMentionQuery(null);
        mention.setMentionSelectorOpen(false);
        mention.setMentionActiveIndex(0);
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!guidInput.input.trim()) return;
        send.sendMessageHandler();
      }
    },
    [mention, guidInput.input, send.sendMessageHandler]
  );

  const handleSelectAgentFromPillBar = useCallback(
    (key: string) => {
      agentSelection.setSelectedAgentKey(key);
      mention.setMentionOpen(false);
      mention.setMentionQuery(null);
      mention.setMentionSelectorOpen(false);
      mention.setMentionActiveIndex(0);
    },
    [
      agentSelection.setSelectedAgentKey,
      mention.setMentionOpen,
      mention.setMentionQuery,
      mention.setMentionSelectorOpen,
      mention.setMentionActiveIndex,
    ]
  );

  const handleSelectAssistant = useCallback(
    (assistantId: string) => {
      agentSelection.setSelectedAgentKey(assistantId);
      mention.setMentionOpen(false);
      mention.setMentionQuery(null);
      mention.setMentionSelectorOpen(false);
      mention.setMentionActiveIndex(0);
    },
    [
      agentSelection.setSelectedAgentKey,
      mention.setMentionOpen,
      mention.setMentionQuery,
      mention.setMentionSelectorOpen,
      mention.setMentionActiveIndex,
    ]
  );

  // Typewriter placeholder
  const typewriterPlaceholder = useTypewriterPlaceholder(t('conversation.welcome.placeholder'));
  const selectedAssistantRecord = useMemo(() => {
    if (!agentSelection.isPresetAgent || !agentSelection.selectedAgentInfo?.customAgentId) return undefined;
    const selectedId = agentSelection.selectedAgentInfo.customAgentId;
    const strippedId = selectedId.replace(/^builtin-/, '');
    const candidates = new Set([selectedId, `builtin-${strippedId}`, strippedId]);
    return agentSelection.customAgents.find((item) => candidates.has(item.id));
  }, [agentSelection.customAgents, agentSelection.isPresetAgent, agentSelection.selectedAgentInfo?.customAgentId]);
  const heroTitle = useMemo(() => {
    if (!agentSelection.isPresetAgent) return t('conversation.welcome.title');
    const i18nName = selectedAssistantRecord?.nameI18n?.[localeKey];
    if (i18nName) return i18nName;
    return mention.selectedAgentLabel || t('conversation.welcome.title');
  }, [agentSelection.isPresetAgent, selectedAssistantRecord, localeKey, mention.selectedAgentLabel, t]);
  const selectedAssistantDescription = useMemo(() => {
    return selectedAssistantRecord?.descriptionI18n?.[localeKey] || selectedAssistantRecord?.description || '';
  }, [selectedAssistantRecord, localeKey]);
  const selectedAssistantAvatar = useMemo(() => {
    if (!agentSelection.isPresetAgent) return null;
    const selectedId = agentSelection.selectedAgentInfo?.customAgentId;
    const strippedId = selectedId?.replace(/^builtin-/, '');
    const candidates = new Set(selectedId && strippedId ? [selectedId, `builtin-${strippedId}`, strippedId] : []);
    const selectedAssistant = agentSelection.customAgents.find((item) => candidates.has(item.id));
    const avatarValue = selectedAssistant?.avatar?.trim() || agentSelection.selectedAgentInfo?.avatar?.trim();
    if (!avatarValue) return { kind: 'icon' as const };
    const mappedAvatar = CUSTOM_AVATAR_IMAGE_MAP[avatarValue];
    const resolvedAvatar = resolveExtensionAssetUrl(avatarValue);
    const avatarImage = mappedAvatar || resolvedAvatar;
    const isImageAvatar = Boolean(
      avatarImage &&
      (/\.(svg|png|jpe?g|webp|gif)$/i.test(avatarImage) ||
        /^(https?:|aion-asset:\/\/|file:\/\/|data:)/i.test(avatarImage))
    );
    if (isImageAvatar && avatarImage) {
      return { kind: 'image' as const, value: avatarImage };
    }
    return { kind: 'emoji' as const, value: avatarValue };
  }, [
    agentSelection.customAgents,
    agentSelection.isPresetAgent,
    agentSelection.selectedAgentInfo?.avatar,
    agentSelection.selectedAgentInfo?.customAgentId,
  ]);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [canExpandDescription, setCanExpandDescription] = useState(false);

  // Reset UI state whenever the user navigates to /guid fresh
  // (agent selection is preserved via saved preference in useGuidAgentSelection)
  useEffect(() => {
    guidInput.setInput('');
    setIsDescriptionExpanded(false);
  }, [location.key]);

  useEffect(() => {
    const node = descriptionTextRef.current;
    if (!node || !agentSelection.isPresetAgent || !selectedAssistantDescription) {
      setCanExpandDescription(false);
      return;
    }

    const checkExpandable = () => {
      // In line-clamp mode, scrollWidth/scrollHeight can be unreliable in some engines.
      // Measure the natural multi-line height via an off-screen clone.
      const clone = node.cloneNode(true) as HTMLDivElement;
      const computed = window.getComputedStyle(node);
      clone.style.position = 'absolute';
      clone.style.visibility = 'hidden';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = '-1';
      clone.style.left = '-99999px';
      clone.style.top = '0';
      clone.style.width = `${node.clientWidth}px`;
      clone.style.display = 'block';
      clone.style.overflow = 'visible';
      clone.style.whiteSpace = 'normal';
      clone.style.webkitLineClamp = 'unset';
      clone.style.webkitBoxOrient = 'unset';
      clone.style.lineHeight = computed.lineHeight;
      clone.style.fontSize = computed.fontSize;
      clone.style.fontWeight = computed.fontWeight;
      clone.style.letterSpacing = computed.letterSpacing;
      clone.style.fontFamily = computed.fontFamily;
      document.body.appendChild(clone);

      const expandedHeight = clone.scrollHeight;
      document.body.removeChild(clone);
      const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
      const canExpand = expandedHeight > lineHeight + 1;
      setCanExpandDescription(canExpand);
      if (!canExpand) {
        setIsDescriptionExpanded(false);
      }
    };

    checkExpandable();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => checkExpandable());
    observer.observe(node);
    return () => observer.disconnect();
  }, [agentSelection.isPresetAgent, selectedAssistantDescription]);

  const currentPresetAgentType = (selectedAssistantRecord?.presetAgentType as PresetAgentType | undefined) || 'gemini';
  const agentSwitcherItems = useMemo(() => {
    const builtinItems = BUILTIN_AGENT_OPTIONS.filter((opt) => availableBackends.has(opt.value)).map((opt) => ({
      key: opt.value,
      label: opt.label,
      isCurrent: opt.value === currentPresetAgentType,
    }));
    const extensionItems = (extensionAcpAdapters || []).map((adapter) => ({
      key: adapter.id as string,
      label: (adapter.name as string) || (adapter.id as string),
      isCurrent: (adapter.id as string) === currentPresetAgentType,
      isExtension: true,
    }));
    return [...builtinItems, ...extensionItems];
  }, [availableBackends, extensionAcpAdapters, currentPresetAgentType]);
  const effectiveAgentLogo = useMemo(
    () => getAgentLogo(agentSelection.currentEffectiveAgentInfo.agentType),
    [agentSelection.currentEffectiveAgentInfo.agentType]
  );
  const handlePresetAgentTypeSwitch = useCallback(
    async (nextType: string) => {
      const customAgentId = agentSelection.selectedAgentInfo?.customAgentId;
      if (!customAgentId || nextType === currentPresetAgentType) return;
      try {
        const agents = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
        const idx = agents.findIndex((a) => a.id === customAgentId);
        if (idx < 0) {
          Message.warning(t('common.failed', { defaultValue: 'Failed' }));
          return;
        }
        const updated = [...agents];
        updated[idx] = { ...updated[idx], presetAgentType: nextType as PresetAgentType };
        await ConfigStorage.set('acp.customAgents', updated);
        await agentSelection.refreshCustomAgents();
        const agentName = ACP_BACKENDS_ALL[nextType as PresetAgentType]?.name || nextType;
        Message.success(t('guid.switchedToAgent', { agent: agentName }));
      } catch (error) {
        console.error('[GuidPage] Failed to switch preset agent type:', error);
        Message.error(t('common.failed', { defaultValue: 'Failed' }));
      }
    },
    [agentSelection, currentPresetAgentType, t]
  );

  // Determine if model selector should use provider-based mode (Gemini & Aion CLI)
  // Both gemini and aionrs use configured model providers, not ACP probe-based models
  const PROVIDER_BASED_AGENTS = new Set(['gemini', 'aionrs']);
  const isGeminiMode =
    (PROVIDER_BASED_AGENTS.has(agentSelection.selectedAgent) && !agentSelection.isPresetAgent) ||
    (agentSelection.isPresetAgent &&
      agentSelection.currentEffectiveAgentInfo.agentType === 'gemini' &&
      agentSelection.currentEffectiveAgentInfo.isAvailable);

  // Build the mention dropdown node
  const mentionDropdownNode = (
    <MentionDropdown
      menuRef={mention.mentionMenuRef}
      options={mention.filteredMentionOptions}
      selectedKey={mention.mentionMenuSelectedKey}
      onSelect={mention.selectMentionAgent}
    />
  );

  // AionCLI does not support Google Auth — filter it out when aionrs is selected
  const isAionrs = agentSelection.selectedAgent === 'aionrs';
  const filteredModelList = useMemo(
    () =>
      isAionrs
        ? modelSelection.modelList.filter((p) => !p.platform?.toLowerCase().includes('gemini-with-google-auth'))
        : modelSelection.modelList,
    [isAionrs, modelSelection.modelList]
  );

  // Build the model selector node
  const modelSelectorNode = (
    <GuidModelSelector
      isGeminiMode={isGeminiMode}
      modelList={filteredModelList}
      currentModel={modelSelection.currentModel}
      setCurrentModel={modelSelection.setCurrentModel}
      geminiModeLookup={modelSelection.geminiModeLookup}
      currentAcpCachedModelInfo={agentSelection.currentAcpCachedModelInfo}
      selectedAcpModel={agentSelection.selectedAcpModel}
      setSelectedAcpModel={agentSelection.setSelectedAcpModel}
    />
  );

  // Build the action row
  const actionRowNode = (
    <GuidActionRow
      files={guidInput.files}
      onFilesUploaded={guidInput.handleFilesUploaded}
      onSelectWorkspace={(dir) => guidInput.setDir(dir)}
      modelSelectorNode={modelSelectorNode}
      selectedAgent={agentSelection.selectedAgent}
      effectiveModeAgent={agentSelection.currentEffectiveAgentInfo.agentType}
      selectedMode={agentSelection.selectedMode}
      onModeSelect={agentSelection.setSelectedMode}
      isPresetAgent={agentSelection.isPresetAgent}
      selectedAgentInfo={agentSelection.selectedAgentInfo}
      customAgents={agentSelection.customAgents}
      localeKey={localeKey}
      onClosePresetTag={() => agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey)}
      agentLogo={effectiveAgentLogo}
      agentSwitcherItems={agentSwitcherItems}
      onAgentSwitch={(key) => {
        handlePresetAgentTypeSwitch(key).catch((err) => console.error('Failed to switch agent type:', err));
      }}
      hidePresetTag
      loading={guidInput.loading}
      isButtonDisabled={send.isButtonDisabled}
      onSend={() => {
        send.handleSend().catch((error) => {
          console.error('Failed to send message:', error);
        });
      }}
    />
  );

  return (
    <ConfigProvider getPopupContainer={() => guidContainerRef.current || document.body}>
      <div ref={guidContainerRef} className={styles.guidContainer}>
        <SkillsMarketBanner />
        <div className={styles.guidLayout}>
          <div className={styles.heroHeader}>
            {agentSelection.isPresetAgent ? (
              <div className={styles.heroHeaderControls}>
                <div className={styles.heroHeaderLeft}>
                  <Button
                    size='mini'
                    type='text'
                    shape='circle'
                    icon={<Left theme='outline' size={18} fill='currentColor' />}
                    className={styles.heroBackButton}
                    onClick={() => {
                      agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey);
                      guidInput.setInput('');
                      setIsDescriptionExpanded(false);
                    }}
                    aria-label={t('common.back')}
                  />
                  <p className={`${styles.heroTitle} text-2xl font-semibold mb-0 text-0`}>
                    <span className={styles.heroTitleInlineIcon} aria-hidden='true'>
                      {selectedAssistantAvatar?.kind === 'image' ? (
                        <img
                          src={selectedAssistantAvatar.value}
                          alt=''
                          width={28}
                          height={28}
                          style={{ objectFit: 'contain' }}
                        />
                      ) : selectedAssistantAvatar?.kind === 'emoji' ? (
                        <span className={styles.heroTitleEmoji}>{selectedAssistantAvatar.value}</span>
                      ) : (
                        <Robot theme='outline' size={26} fill='currentColor' />
                      )}
                    </span>
                    <span>{heroTitle}</span>
                  </p>
                  <Button
                    size='mini'
                    type='text'
                    icon={<Write theme='outline' size={16} fill='currentColor' />}
                    className={styles.heroTitleEdit}
                    onClick={() => openAssistantDetailsRef.current?.()}
                    aria-label={t('settings.editAssistant', { defaultValue: 'Assistant Details' })}
                  />
                </div>
                <div className={styles.heroHeaderRight}>
                  <Dropdown
                    trigger='click'
                    position='bl'
                    droplist={
                      <Menu
                        onClickMenuItem={(key) => {
                          handlePresetAgentTypeSwitch(String(key)).catch((err) =>
                            console.error('Failed to switch agent type:', err)
                          );
                        }}
                      >
                        {agentSwitcherItems.map((item) => {
                          const logo = getAgentLogo(item.key);
                          return (
                            <Menu.Item key={item.key}>
                              <div className='flex items-center justify-between gap-12px min-w-120px'>
                                <span className='flex items-center gap-6px'>
                                  {logo ? (
                                    <img
                                      src={logo}
                                      alt=''
                                      width={16}
                                      height={16}
                                      style={{ objectFit: 'contain', flexShrink: 0 }}
                                    />
                                  ) : (
                                    <Robot theme='outline' size={16} fill='currentColor' style={{ flexShrink: 0 }} />
                                  )}
                                  {item.label}
                                  {'isExtension' in item && item.isExtension ? (
                                    <span className='text-11px px-4px py-1px rd-4px bg-[rgb(var(--arcoblue-1))] text-[rgb(var(--arcoblue-6))]'>
                                      ext
                                    </span>
                                  ) : null}
                                </span>
                                {item.isCurrent ? <span>✓</span> : null}
                              </div>
                            </Menu.Item>
                          );
                        })}
                      </Menu>
                    }
                  >
                    <Button size='mini' type='text' className={styles.heroAgentSwitchButton}>
                      <span className='inline-flex items-center gap-4px'>
                        {effectiveAgentLogo ? (
                          <img
                            src={effectiveAgentLogo}
                            alt=''
                            width={20}
                            height={20}
                            className={styles.heroAgentSwitchIcon}
                          />
                        ) : (
                          <Robot theme='outline' size={20} fill='currentColor' />
                        )}
                        <Down theme='outline' size={16} fill='currentColor' />
                      </span>
                    </Button>
                  </Dropdown>
                </div>
              </div>
            ) : (
              <p className='text-2xl font-semibold mb-0 text-0 text-center'>{heroTitle}</p>
            )}
          </div>

          {agentSelection.isPresetAgent && selectedAssistantDescription ? (
            <div
              className={`${styles.heroSubtitle} ${isDescriptionExpanded ? styles.heroSubtitleExpanded : ''}`}
              onClick={() => {
                if (!canExpandDescription) return;
                setIsDescriptionExpanded((v) => !v);
              }}
            >
              <div
                ref={descriptionTextRef}
                className={`${styles.heroSubtitleText} ${isDescriptionExpanded ? styles.heroSubtitleTextExpanded : ''}`}
              >
                {selectedAssistantDescription}
              </div>
              {canExpandDescription ? (
                <Button
                  size='mini'
                  type='secondary'
                  shape='circle'
                  icon={<Down theme='outline' size={12} fill='currentColor' />}
                  className={`${styles.heroSubtitleToggle} ${isDescriptionExpanded ? styles.heroSubtitleToggleExpanded : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDescriptionExpanded((v) => !v);
                  }}
                  aria-label={
                    isDescriptionExpanded
                      ? t('common.collapse', { defaultValue: 'Collapse' })
                      : t('common.expand', { defaultValue: 'Expand' })
                  }
                />
              ) : null}
            </div>
          ) : agentSelection.availableAgents === undefined ? (
            <AgentPillBarSkeleton />
          ) : agentSelection.availableAgents.length > 0 ? (
            <AgentPillBar
              availableAgents={agentSelection.availableAgents}
              selectedAgentKey={agentSelection.selectedAgentKey}
              getAgentKey={agentSelection.getAgentKey}
              onSelectAgent={handleSelectAgentFromPillBar}
            />
          ) : null}

          <GuidInputCard
            input={guidInput.input}
            onInputChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onPaste={guidInput.onPaste}
            onFocus={guidInput.handleTextareaFocus}
            onBlur={guidInput.handleTextareaBlur}
            placeholder={`${mention.selectedAgentLabel}, ${typewriterPlaceholder || t('conversation.welcome.placeholder')}`}
            isInputActive={guidInput.isInputFocused}
            isFileDragging={guidInput.isFileDragging}
            activeBorderColor={activeBorderColor}
            inactiveBorderColor={inactiveBorderColor}
            activeShadow={activeShadow}
            dragHandlers={guidInput.dragHandlers}
            mentionOpen={mention.mentionOpen}
            mentionSelectorBadge={
              <MentionSelectorBadge
                visible={mention.mentionSelectorVisible}
                open={mention.mentionSelectorOpen}
                onOpenChange={mention.setMentionSelectorOpen}
                agentLabel={mention.selectedAgentLabel}
                mentionMenu={mentionDropdownNode}
                onResetQuery={() => mention.setMentionQuery(null)}
              />
            }
            mentionDropdown={mentionDropdownNode}
            files={guidInput.files}
            onRemoveFile={guidInput.handleRemoveFile}
            dir={guidInput.dir}
            onClearDir={() => guidInput.setDir('')}
            actionRow={actionRowNode}
          />

          <AssistantSelectionArea
            isPresetAgent={agentSelection.isPresetAgent}
            selectedAgentInfo={agentSelection.selectedAgentInfo}
            customAgents={agentSelection.customAgents}
            localeKey={localeKey}
            currentEffectiveAgentInfo={agentSelection.currentEffectiveAgentInfo}
            onSelectAssistant={handleSelectAssistant}
            onSetInput={guidInput.setInput}
            onFocusInput={guidInput.handleTextareaFocus}
            onRegisterOpenDetails={(openDetails) => {
              openAssistantDetailsRef.current = openDetails;
            }}
          />
        </div>

        <QuickActionButtons
          onOpenLink={openLink}
          inactiveBorderColor={inactiveBorderColor}
          activeShadow={activeShadow}
        />
      </div>
    </ConfigProvider>
  );
};

export default GuidPage;
