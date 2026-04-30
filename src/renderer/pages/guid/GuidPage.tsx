/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { resolveLocaleKey } from '@/common/utils';

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
import FeedbackReportModal from '@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal';
import { useGuidAgentSelection } from './hooks/useGuidAgentSelection';
import { useGuidInput } from './hooks/useGuidInput';
import { useGuidMention } from './hooks/useGuidMention';
import { useGuidModelSelection } from './hooks/useGuidModelSelection';
import { useGuidSend } from './hooks/useGuidSend';
import { useTypewriterPlaceholder } from './hooks/useTypewriterPlaceholder';
import { configService } from '@/common/config/configService';
import { ACP_BACKENDS_ALL } from '@/common/types/acpTypes';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import type { AcpBackendConfig } from './types';
import { Button, ConfigProvider, Dropdown, Menu, Message } from '@arco-design/web-react';
import { Down, Left, Robot, Write } from '@icon-park/react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './index.module.css';

const GuidPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const openAssistantDetailsRef = useRef<(() => void) | null>(null);
  const descriptionTextRef = useRef<HTMLDivElement>(null);
  const { closeAllTabs, openTab } = useConversationTabs();
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();

  const localeKey = resolveLocaleKey(i18n.language);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // Open external link
  const openLink = useCallback(async (url: string) => {
    try {
      await openExternalUrl(url);
    } catch (error) {
      console.error('Failed to open external link:', error);
    }
  }, []);

  // --- Skills state ---
  const [builtinAutoSkills, setBuiltinAutoSkills] = useState<Array<{ name: string; description: string }>>([]);
  const [guidDisabledBuiltinSkills, setGuidDisabledBuiltinSkills] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    ipcBridge.fs.listBuiltinAutoSkills
      .invoke()
      .then(setBuiltinAutoSkills)
      .catch(() => setBuiltinAutoSkills([]));
  }, []);

  const handleToggleBuiltinSkill = useCallback((skillName: string) => {
    setGuidDisabledBuiltinSkills((prev) => {
      const list = prev ?? [];
      return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
    });
  }, []);

  // --- Hooks ---
  // Only aionrs uses this provider-based model picker now (Gemini runs as a
  // regular ACP backend with its own model selector).
  const modelSelection = useGuidModelSelection('aionrs');

  const resetAssistantRequested = (location.state as { resetAssistant?: boolean } | null)?.resetAssistant === true;
  const agentSelection = useGuidAgentSelection({
    modelList: modelSelection.modelList,
    isGoogleAuth: modelSelection.isGoogleAuth,
    localeKey,
    resetAssistant: resetAssistantRequested,
    locationKey: location.key,
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
    is_presetAgent: agentSelection.is_presetAgent,
    selectedMode: agentSelection.selectedMode,
    selectedAcpModel: agentSelection.selectedAcpModel,
    pending_config_options: agentSelection.pending_config_options,
    cached_config_options: agentSelection.cached_config_options,
    current_model: modelSelection.current_model,

    // Agent helpers
    findAgentByKey: agentSelection.findAgentByKey,
    getEffectiveAgentType: agentSelection.getEffectiveAgentType,
    resolvePresetRulesAndSkills: agentSelection.resolvePresetRulesAndSkills,
    resolveEnabledSkills: agentSelection.resolveEnabledSkills,
    resolveDisabledBuiltinSkills: agentSelection.resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
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
    if (!agentSelection.is_presetAgent || !agentSelection.selectedAgentInfo?.custom_agent_id) return undefined;
    const selectedId = agentSelection.selectedAgentInfo.custom_agent_id;
    const strippedId = selectedId.replace(/^builtin-/, '');
    const candidates = new Set([selectedId, `builtin-${strippedId}`, strippedId]);
    return agentSelection.assistants.find((item) => candidates.has(item.id));
  }, [agentSelection.assistants, agentSelection.is_presetAgent, agentSelection.selectedAgentInfo?.custom_agent_id]);

  // Sync disabledBuiltinSkills from preset assistant config
  useEffect(() => {
    if (agentSelection.is_presetAgent && selectedAssistantRecord) {
      setGuidDisabledBuiltinSkills(selectedAssistantRecord.disabled_builtin_skills ?? []);
    } else {
      setGuidDisabledBuiltinSkills(undefined);
    }
  }, [agentSelection.is_presetAgent, selectedAssistantRecord]);

  const heroTitle = useMemo(() => {
    if (!agentSelection.is_presetAgent) return t('conversation.welcome.title');
    const i18nName = selectedAssistantRecord?.name_i18n?.[localeKey];
    if (i18nName) return i18nName;
    return mention.selectedAgentLabel || t('conversation.welcome.title');
  }, [agentSelection.is_presetAgent, selectedAssistantRecord, localeKey, mention.selectedAgentLabel, t]);
  const selectedAssistantDescription = useMemo(() => {
    return selectedAssistantRecord?.description_i18n?.[localeKey] || selectedAssistantRecord?.description || '';
  }, [selectedAssistantRecord, localeKey]);
  const selectedAssistantAvatar = useMemo(() => {
    if (!agentSelection.is_presetAgent) return null;
    const selectedId = agentSelection.selectedAgentInfo?.custom_agent_id;
    const strippedId = selectedId?.replace(/^builtin-/, '');
    const candidates = new Set(selectedId && strippedId ? [selectedId, `builtin-${strippedId}`, strippedId] : []);
    const selectedAssistant = agentSelection.assistants.find((item) => candidates.has(item.id));
    const avatarValue = selectedAssistant?.avatar?.trim() || agentSelection.selectedAgentInfo?.avatar?.trim();
    if (!avatarValue) return { kind: 'icon' as const };
    const mappedAvatar = CUSTOM_AVATAR_IMAGE_MAP[avatarValue];
    const resolvedAvatar = resolveExtensionAssetUrl(avatarValue);
    const avatarImage = mappedAvatar || resolvedAvatar;
    const isImageAvatar = Boolean(
      avatarImage &&
      (/\.(svg|png|jpe?g|webp|gif)$/i.test(avatarImage) || /^(https?:|file:\/\/|data:|\/)/i.test(avatarImage))
    );
    if (isImageAvatar && avatarImage) {
      return { kind: 'image' as const, value: avatarImage };
    }
    return { kind: 'emoji' as const, value: avatarValue };
  }, [
    agentSelection.assistants,
    agentSelection.is_presetAgent,
    agentSelection.selectedAgentInfo?.avatar,
    agentSelection.selectedAgentInfo?.custom_agent_id,
  ]);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [canExpandDescription, setCanExpandDescription] = useState(false);

  // Reset guid-local UI state before paint so same-route navigations do not
  // briefly show the previous draft or preset assistant layout.
  useLayoutEffect(() => {
    guidInput.setInput('');
    guidInput.setFiles([]);
    guidInput.setLoading(false);
    if (!(location.state as { workspace?: string } | null)?.workspace) {
      guidInput.setDir('');
    }
    setIsDescriptionExpanded(false);
  }, [guidInput.setDir, guidInput.setFiles, guidInput.setInput, guidInput.setLoading, location.key, location.state]);

  // Clear resetAssistant from location.state after the hook has consumed it,
  // so that re-renders don't re-trigger the reset logic.
  //
  // Must go through React Router's navigate — raw window.history.replaceState
  // with `location.pathname` would write the HashRouter virtual path (e.g.
  // '/guid') into the browser's real URL and strip the leading '#'. On the
  // next hard reload, the browser would then request '/guid' directly from
  // the dev server (which has no SPA fallback) and 404.
  useEffect(() => {
    if (!resetAssistantRequested) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [resetAssistantRequested, location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    const node = descriptionTextRef.current;
    if (!node || !agentSelection.is_presetAgent || !selectedAssistantDescription) {
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
  }, [agentSelection.is_presetAgent, selectedAssistantDescription]);

  const currentPresetAgentType = selectedAssistantRecord?.preset_agent_type || 'gemini';
  const agentSwitcherItems = useMemo(() => {
    if (!agentSelection.availableAgents) return [];
    // Build from detected execution engines, excluding preset assistants and remote agents
    return agentSelection.availableAgents
      .filter((a) => !a.is_preset && a.backend !== 'remote')
      .map((a) => ({
        key: a.backend,
        label: a.name,
        isCurrent: a.backend === currentPresetAgentType,
        isExtension: a.isExtension,
      }));
  }, [agentSelection.availableAgents, currentPresetAgentType]);
  const effectiveAgentLogo = useMemo(
    () => getAgentLogo(agentSelection.currentEffectiveAgentInfo.agent_type),
    [agentSelection.currentEffectiveAgentInfo.agent_type]
  );
  const handlePresetAgentTypeSwitch = useCallback(
    async (nextType: string) => {
      const custom_agent_id = agentSelection.selectedAgentInfo?.custom_agent_id;
      if (!custom_agent_id || nextType === currentPresetAgentType) return;
      try {
        const agents = (configService.get('acp.customAgents') || []) as AcpBackendConfig[];
        const idx = agents.findIndex((a) => a.id === custom_agent_id);
        if (idx < 0) {
          Message.warning(t('common.failed', { defaultValue: 'Failed' }));
          return;
        }
        const updated = [...agents];
        updated[idx] = { ...updated[idx], presetAgentType: nextType };
        await configService.set('acp.customAgents', updated);
        await agentSelection.refreshCustomAgents();
        const agent_name = ACP_BACKENDS_ALL[nextType as keyof typeof ACP_BACKENDS_ALL]?.name || nextType;
        Message.success(t('guid.switchedToAgent', { agent: agent_name }));
      } catch (error) {
        console.error('[GuidPage] Failed to switch preset agent type:', error);
        Message.error(t('common.failed', { defaultValue: 'Failed' }));
      }
    },
    [agentSelection, currentPresetAgentType, t]
  );

  // Resolve the effective agent type once — covers both direct selection and preset assistants
  const effectiveAgentType = agentSelection.is_presetAgent
    ? agentSelection.currentEffectiveAgentInfo.agent_type
    : agentSelection.selectedAgent;

  // Agents that use configured model providers instead of ACP probe-based models.
  // Only aionrs now — Gemini runs as a regular ACP backend with ACP-cached models.
  const PROVIDER_BASED_AGENTS = new Set(['aionrs']);
  const isGeminiMode =
    PROVIDER_BASED_AGENTS.has(effectiveAgentType) &&
    (!agentSelection.is_presetAgent || agentSelection.currentEffectiveAgentInfo.isAvailable);

  // Build the mention dropdown node
  const mentionDropdownNode = (
    <MentionDropdown
      menuRef={mention.mentionMenuRef}
      options={mention.filteredMentionOptions}
      selectedKey={mention.mentionMenuSelectedKey}
      onSelect={mention.selectMentionAgent}
    />
  );

  // Build the model selector node
  const modelSelectorNode = (
    <GuidModelSelector
      isGeminiMode={isGeminiMode}
      modelList={modelSelection.modelList}
      current_model={modelSelection.current_model}
      setCurrentModel={modelSelection.setCurrentModel}
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
      effectiveModeAgent={agentSelection.currentEffectiveAgentInfo.agent_type}
      selectedMode={agentSelection.selectedMode}
      onModeSelect={agentSelection.setSelectedMode}
      is_presetAgent={agentSelection.is_presetAgent}
      selectedAgentInfo={agentSelection.selectedAgentInfo}
      assistants={agentSelection.assistants}
      localeKey={localeKey}
      onClosePresetTag={() => agentSelection.setSelectedAgentKey(agentSelection.defaultAgentKey)}
      agentLogo={effectiveAgentLogo}
      agentSwitcherItems={agentSwitcherItems}
      onAgentSwitch={(key) => {
        handlePresetAgentTypeSwitch(key).catch((err) => console.error('Failed to switch agent type:', err));
      }}
      config_optionsBackend={agentSelection.currentEffectiveAgentInfo.agent_type}
      cached_config_options={agentSelection.cached_config_options}
      onConfigOptionSelect={agentSelection.setPendingConfigOption}
      builtinAutoSkills={builtinAutoSkills}
      disabledBuiltinSkills={guidDisabledBuiltinSkills ?? []}
      onToggleBuiltinSkill={handleToggleBuiltinSkill}
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
            {agentSelection.is_presetAgent ? (
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

          {agentSelection.is_presetAgent && selectedAssistantDescription ? (
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
              suppressSelectionAnimation={resetAssistantRequested}
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
            is_presetAgent={agentSelection.is_presetAgent}
            selectedAgentInfo={agentSelection.selectedAgentInfo}
            assistants={agentSelection.assistants}
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
          onOpenBugReport={() => setShowFeedbackModal(true)}
          inactiveBorderColor={inactiveBorderColor}
          activeShadow={activeShadow}
        />
        <FeedbackReportModal visible={showFeedbackModal} onCancel={() => setShowFeedbackModal(false)} />
      </div>
    </ConfigProvider>
  );
};

export default GuidPage;
