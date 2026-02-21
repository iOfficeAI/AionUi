/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { resolveLocaleKey } from '@/common/utils';
import { useInputFocusRing } from '@/renderer/hooks/useInputFocusRing';
import { useConversationTabs } from '@/renderer/pages/conversation/context/ConversationTabsContext';
import AgentPillBar from './components/AgentPillBar';
import AssistantSelectionArea from './components/AssistantSelectionArea';
import GuidActionRow from './components/GuidActionRow';
import GuidInputCard from './components/GuidInputCard';
import GuidModelSelector from './components/GuidModelSelector';
import MentionDropdown from './components/MentionDropdown';
import MentionSelectorBadge from './components/MentionSelectorBadge';
import QuickActionButtons from './components/QuickActionButtons';
import { useGuidAgentSelection } from './hooks/useGuidAgentSelection';
import { useGuidInput } from './hooks/useGuidInput';
import { useGuidMention } from './hooks/useGuidMention';
import { useGuidModelSelection } from './hooks/useGuidModelSelection';
import { useGuidSend } from './hooks/useGuidSend';
import { useTypewriterPlaceholder } from './hooks/useTypewriterPlaceholder';
import { ConfigProvider } from '@arco-design/web-react';
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import styles from './index.module.css';

const GuidPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const guidContainerRef = useRef<HTMLDivElement>(null);
  const { closeAllTabs, openTab } = useConversationTabs();
  const { activeBorderColor, inactiveBorderColor, activeShadow } = useInputFocusRing();
  const localeKey = resolveLocaleKey(i18n.language);

  // Open external link
  const openLink = useCallback(async (url: string) => {
    try {
      await ipcBridge.shell.openExternal.invoke(url);
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
      if (match) {
        mention.setMentionQuery(match[1]);
        mention.setMentionOpen(true);
        mention.setMentionSelectorOpen(false);
      } else {
        mention.setMentionQuery(null);
        mention.setMentionOpen(false);
      }
    },
    [mention.mentionMatchRegex, guidInput.setInput, mention.setMentionQuery, mention.setMentionOpen, mention.setMentionSelectorOpen]
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if ((mention.mentionOpen || mention.mentionSelectorOpen) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
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
          const exactMatch = query ? mention.filteredMentionOptions.find((option) => option.label.toLowerCase() === query || option.tokens.has(query)) : undefined;
          const selected = exactMatch || mention.filteredMentionOptions[mention.mentionActiveIndex] || mention.filteredMentionOptions[0];
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
      if (!mention.mentionOpen && mention.mentionSelectorVisible && !guidInput.input.trim() && (event.key === 'Backspace' || event.key === 'Delete')) {
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
    [agentSelection.setSelectedAgentKey, mention.setMentionOpen, mention.setMentionQuery, mention.setMentionSelectorOpen, mention.setMentionActiveIndex]
  );

  const handleSelectAssistant = useCallback(
    (assistantId: string) => {
      agentSelection.setSelectedAgentKey(assistantId);
      mention.setMentionOpen(false);
      mention.setMentionQuery(null);
      mention.setMentionSelectorOpen(false);
      mention.setMentionActiveIndex(0);
    },
    [agentSelection.setSelectedAgentKey, mention.setMentionOpen, mention.setMentionQuery, mention.setMentionSelectorOpen, mention.setMentionActiveIndex]
  );

  // Typewriter placeholder
  const typewriterPlaceholder = useTypewriterPlaceholder(t('conversation.welcome.placeholder'));

  // Determine if model selector should be in Gemini mode
  const isGeminiMode = (agentSelection.selectedAgent === 'gemini' && !agentSelection.isPresetAgent) || (agentSelection.isPresetAgent && agentSelection.currentEffectiveAgentInfo.agentType === 'gemini' && agentSelection.currentEffectiveAgentInfo.isAvailable);

  // Build the mention dropdown node
  const mentionDropdownNode = <MentionDropdown menuRef={mention.mentionMenuRef} options={mention.filteredMentionOptions} selectedKey={mention.mentionMenuSelectedKey} onSelect={mention.selectMentionAgent} />;

  // Build the model selector node
  const modelSelectorNode = <GuidModelSelector isGeminiMode={isGeminiMode} modelList={modelSelection.modelList} currentModel={modelSelection.currentModel} setCurrentModel={modelSelection.setCurrentModel} geminiModeLookup={modelSelection.geminiModeLookup} formatGeminiModelLabel={modelSelection.formatGeminiModelLabel} currentAcpCachedModelInfo={agentSelection.currentAcpCachedModelInfo} selectedAcpModel={agentSelection.selectedAcpModel} setSelectedAcpModel={agentSelection.setSelectedAcpModel} />;

  // Build the action row
  const actionRowNode = (
    <GuidActionRow
      files={guidInput.files}
      onFilesUploaded={guidInput.handleFilesUploaded}
      onSelectWorkspace={(dir) => guidInput.setDir(dir)}
      modelSelectorNode={modelSelectorNode}
      selectedAgent={agentSelection.selectedAgent}
      selectedMode={agentSelection.selectedMode}
      onModeSelect={agentSelection.setSelectedMode}
      isPresetAgent={agentSelection.isPresetAgent}
      selectedAgentInfo={agentSelection.selectedAgentInfo}
      customAgents={agentSelection.customAgents}
      localeKey={localeKey}
      onClosePresetTag={() => agentSelection.setSelectedAgentKey('gemini')}
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
        <div className={styles.guidLayout}>
          <p className='text-2xl font-semibold mb-8 text-0 text-center'>{t('conversation.welcome.title')}</p>

          {agentSelection.availableAgents && agentSelection.availableAgents.length > 0 && <AgentPillBar availableAgents={agentSelection.availableAgents} selectedAgentKey={agentSelection.selectedAgentKey} getAgentKey={agentSelection.getAgentKey} onSelectAgent={handleSelectAgentFromPillBar} />}

          <GuidInputCard
            input={guidInput.input}
            onInputChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onPaste={guidInput.onPaste}
            onFocus={guidInput.handleTextareaFocus}
            onBlur={guidInput.handleTextareaBlur}
            placeholder={typewriterPlaceholder || t('conversation.welcome.placeholder')}
            isInputActive={guidInput.isInputFocused}
            isFileDragging={guidInput.isFileDragging}
            activeBorderColor={activeBorderColor}
            inactiveBorderColor={inactiveBorderColor}
            activeShadow={activeShadow}
            dragHandlers={guidInput.dragHandlers}
            mentionOpen={mention.mentionOpen}
            mentionSelectorBadge={<MentionSelectorBadge visible={mention.mentionSelectorVisible} open={mention.mentionSelectorOpen} onOpenChange={mention.setMentionSelectorOpen} agentLabel={mention.selectedAgentLabel} mentionMenu={mentionDropdownNode} onResetQuery={() => mention.setMentionQuery(null)} />}
            mentionDropdown={mentionDropdownNode}
            files={guidInput.files}
            onRemoveFile={guidInput.handleRemoveFile}
            dir={guidInput.dir}
            onClearDir={() => guidInput.setDir('')}
            actionRow={actionRowNode}
          />

          <AssistantSelectionArea isPresetAgent={agentSelection.isPresetAgent} selectedAgentInfo={agentSelection.selectedAgentInfo} customAgents={agentSelection.customAgents} localeKey={localeKey} currentEffectiveAgentInfo={agentSelection.currentEffectiveAgentInfo} onSelectAssistant={handleSelectAssistant} onSetInput={guidInput.setInput} onFocusInput={guidInput.handleTextareaFocus} />
        </div>

        <QuickActionButtons onOpenLink={openLink} inactiveBorderColor={inactiveBorderColor} activeShadow={activeShadow} />
      </div>
    </ConfigProvider>
  );
};

export default GuidPage;
