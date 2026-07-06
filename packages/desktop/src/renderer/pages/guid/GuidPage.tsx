/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { buildGuidSlashCommands } from '@/common/chat/slash/guidSlashCommands';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';
import type { AssistantDetail } from '@/common/types/agent/assistantTypes';

import { useInputFocusRing } from '@/renderer/hooks/chat/useInputFocusRing';
import { getFuzzyMatchIndices, useSlashCommandController } from '@/renderer/hooks/chat/useSlashCommandController';
import { openExternalUrl } from '@/renderer/utils/platform';
import SlashCommandMenu, { type SlashCommandMenuItem } from '@/renderer/components/chat/SlashCommandMenu';
import AssistantSelectionArea from './components/AssistantSelectionArea';
import GuidActionRow from './components/GuidActionRow';
import GuidInputCard from './components/GuidInputCard';
import GuidModelSelector from './components/GuidModelSelector';
import QuickActionButtons from './components/QuickActionButtons';
import FeedbackReportModal from '@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal';
import { useGuidAssistantSelection } from './hooks/useGuidAssistantSelection';
import { useGuidInput } from './hooks/useGuidInput';
import { useGuidModelSelection } from './hooks/useGuidModelSelection';
import { useGuidSend } from './hooks/useGuidSend';
import { useTypewriterPlaceholder } from './hooks/useTypewriterPlaceholder';
import { ensureBackendMcpCatalog } from '@/renderer/hooks/mcp/catalog';
import { resolveGuidAssistantDefaults } from './utils/assistantDefaults';
import SpeechInputButton from '@/renderer/components/chat/SpeechInputButton';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import { appendSpeechTranscript } from '@/renderer/hooks/system/useSpeechInput';
import { useLiveTranscriptInsertion } from '@/renderer/hooks/system/useLiveTranscriptInsertion';
import { Button, ConfigProvider } from '@arco-design/web-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import styles from './index.module.css';

const GuidPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const guidContainerRef = useRef<HTMLDivElement>(null);
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
  // Skill metadata comes from the database-backed catalog. Built-in auto-inject
  // skills default checked; the rest are opt-in per conversation or pre-checked
  // by assistant defaults.
  const [allSkills, setAllSkills] = useState<Array<{ name: string; description: string; isAuto: boolean }>>([]);
  const [guidDisabledBuiltinSkills, setGuidDisabledBuiltinSkills] = useState<string[] | undefined>(undefined);
  const [guidEnabledSkills, setGuidEnabledSkills] = useState<string[] | undefined>(undefined);
  const [availableMcpServers, setAvailableMcpServers] = useState<IMcpServer[]>([]);
  const [guidSelectedMcpServerIds, setGuidSelectedMcpServerIds] = useState<string[] | undefined>(undefined);

  useEffect(() => {
    ipcBridge.fs.listAvailableSkills
      .invoke()
      .then((availableSkills) => {
        setAllSkills(
          availableSkills.map((s) => ({
            name: s.name,
            description: s.description,
            isAuto: s.source === 'builtin' && s.is_auto_inject,
          }))
        );
      })
      .catch(() => setAllSkills([]));
  }, []);

  useEffect(() => {
    void ensureBackendMcpCatalog()
      .then(({ allServers }) => {
        setAvailableMcpServers(allServers);
      })
      .catch((error) => {
        console.error('[GuidPage] Failed to load MCP catalog:', error);
        setAvailableMcpServers([]);
      });
  }, []);

  const handleToggleSkill = useCallback((skillName: string, isAuto: boolean) => {
    if (isAuto) {
      setGuidDisabledBuiltinSkills((prev) => {
        const list = prev ?? [];
        return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
      });
    } else {
      setGuidEnabledSkills((prev) => {
        const list = prev ?? [];
        return list.includes(skillName) ? list.filter((s) => s !== skillName) : [...list, skillName];
      });
    }
  }, []);

  const handleToggleMcpServer = useCallback((serverId: string) => {
    setGuidSelectedMcpServerIds((prev) => {
      const current = prev ?? [];
      return current.includes(serverId) ? current.filter((id) => id !== serverId) : [...current, serverId];
    });
  }, []);

  // --- Hooks ---
  // Only aionrs uses this provider-based model picker now (Gemini runs as a
  // regular ACP backend with its own model selector).
  const modelSelection = useGuidModelSelection('aionrs');

  const navState = location.state as {
    resetAssistant?: boolean;
    selectedAssistantId?: string;
  } | null;
  const resetAssistantRequested = navState?.resetAssistant === true;
  const preselectAssistantId = navState?.selectedAssistantId;
  const agentSelection = useGuidAssistantSelection({
    resetAssistant: resetAssistantRequested,
    preselectAssistantId,
    locationKey: location.key,
  });

  const guidInput = useGuidInput({
    locationState: location.state as { workspace?: string } | null,
  });
  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      guidInput.setFiles((prevFiles) => [...prevFiles, ...files]);
    },
    [guidInput.setFiles]
  );
  const { onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  const resetMentionOpen = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(() => {}, []);
  const resetMentionQuery = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(() => {}, []);
  const resetMentionActiveIndex = useCallback<React.Dispatch<React.SetStateAction<number>>>(() => {}, []);

  const selectedAssistantId = agentSelection.selectedAssistantId;
  const hasSelectedAssistant = selectedAssistantId !== null;
  const { data: selectedAssistantDetail } = useSWR(
    selectedAssistantId ? `guid.assistant.detail.${selectedAssistantId}.${localeKey}` : null,
    async (): Promise<AssistantDetail | null> =>
      ipcBridge.assistants.get
        .invoke({ id: selectedAssistantId!, locale: localeKey })
        .catch((_error: unknown): AssistantDetail | null => null)
  );
  const resolvedAssistantDefaults = useMemo(
    () => resolveGuidAssistantDefaults(selectedAssistantDetail),
    [selectedAssistantDetail]
  );
  const selectedSkillNames = useMemo(() => {
    const disabledBuiltinSkillSet = new Set(
      guidDisabledBuiltinSkills ?? resolvedAssistantDefaults.disabledBuiltinSkillIds
    );
    const enabledSkillSet = new Set(guidEnabledSkills ?? resolvedAssistantDefaults.skillIds);

    return allSkills
      .filter((skill) => (skill.isAuto ? !disabledBuiltinSkillSet.has(skill.name) : enabledSkillSet.has(skill.name)))
      .map((skill) => skill.name);
  }, [
    allSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    resolvedAssistantDefaults.disabledBuiltinSkillIds,
    resolvedAssistantDefaults.skillIds,
  ]);
  const skillDescriptionByName = useMemo(
    () => new Map(allSkills.map((skill) => [skill.name, skill.description])),
    [allSkills]
  );
  const guidBuiltinSlashCommands = useMemo<SlashCommandItem[]>(
    () => [
      {
        name: 'open',
        description: t('conversation.workspace.addFile', { defaultValue: 'Add File' }),
        kind: 'builtin',
        source: 'builtin',
      },
    ],
    [t]
  );
  const guidSlashCommands = useMemo(
    () =>
      buildGuidSlashCommands({
        builtinCommands: guidBuiltinSlashCommands,
        agentCommands: agentSelection.currentAgentAvailableCommands,
        selectedSkills: selectedSkillNames,
        descriptionByName: skillDescriptionByName,
        skillFallbackDescription: t('conversation.skills.slashHint', { defaultValue: 'Skill' }),
      }),
    [
      agentSelection.currentAgentAvailableCommands,
      guidBuiltinSlashCommands,
      selectedSkillNames,
      skillDescriptionByName,
      t,
    ]
  );
  const slashController = useSlashCommandController({
    input: guidInput.input,
    commands: guidSlashCommands,
    onExecuteBuiltin: (name) => {
      onSlashBuiltinCommand(name);
      guidInput.setInput('');
    },
    onSelectTemplate: (name) => {
      guidInput.setInput(`/${name} `);
    },
  });
  const slashMenuItems = useMemo<SlashCommandMenuItem[]>(
    () =>
      slashController.filteredCommands.map((command) => ({
        key: command.name,
        label: `/${command.name}`,
        description: command.description,
        badge: command.hint,
        highlightIndices: slashController.query
          ? getFuzzyMatchIndices(command.name, slashController.query)?.map((index) => index + 1)
          : undefined,
      })),
    [slashController.filteredCommands, slashController.query]
  );

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
    selectedAssistantId: agentSelection.selectedAssistantId,
    selectedAssistantBackend: agentSelection.selectedAssistantBackend,
    selectedMode: agentSelection.selectedMode,
    selectedAcpModel: agentSelection.selectedAcpModel,
    selectedThoughtLevelValue: agentSelection.selectedThoughtLevelValue,
    currentAcpCachedModelInfo: agentSelection.currentAcpCachedModelInfo,
    current_model: modelSelection.current_model,

    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds: resolvedAssistantDefaults.skillIds,
    assistantDefaultDisabledBuiltinSkillIds: resolvedAssistantDefaults.disabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds: guidSelectedMcpServerIds,
    assistantDefaultMcpIds: resolvedAssistantDefaults.mcpIds,
    isGoogleAuth: modelSelection.isGoogleAuth,

    // Mention state reset
    setMentionOpen: resetMentionOpen,
    setMentionQuery: resetMentionQuery,
    setMentionSelectorOpen: resetMentionOpen,
    setMentionActiveIndex: resetMentionActiveIndex,

    // Navigation
    navigate,
    t,
    localeKey,
  });

  // --- Coordinated handlers (depend on multiple hooks) ---
  const handleInputChange = useCallback(
    (value: string) => {
      guidInput.setInput(value);
    },
    [guidInput.setInput]
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (slashController.onKeyDown(event)) {
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (!guidInput.input.trim()) return;
        send.sendMessageHandler();
      }
    },
    [guidInput.input, send.sendMessageHandler, slashController]
  );

  const handleSelectAssistant = useCallback(
    (assistantId: string) => {
      agentSelection.setSelectedAssistantId(assistantId);
    },
    [agentSelection.setSelectedAssistantId]
  );

  // Typewriter placeholder
  const typewriterPlaceholder = useTypewriterPlaceholder(t('conversation.welcome.placeholder'));
  const selectedAssistantRecord = useMemo(() => {
    if (!selectedAssistantId) return undefined;
    const selectedId = agentSelection.selectedAssistantId;
    const strippedId = selectedId.replace(/^builtin-/, '');
    const candidates = new Set([selectedId, `builtin-${strippedId}`, strippedId]);
    return agentSelection.assistants.find((item) => candidates.has(item.id));
  }, [agentSelection.assistants, selectedAssistantId, agentSelection.selectedAssistantId]);
  const selectedAssistantPrompts = useMemo(() => {
    if (!selectedAssistantId) return [];
    const resolvedPrompts =
      selectedAssistantDetail?.prompts.recommended_i18n?.[localeKey] ||
      selectedAssistantDetail?.prompts.recommended_i18n?.['en-US'] ||
      selectedAssistantDetail?.prompts.recommended ||
      selectedAssistantRecord?.prompts_i18n?.[localeKey] ||
      selectedAssistantRecord?.prompts_i18n?.['en-US'] ||
      selectedAssistantRecord?.prompts ||
      [];

    if (resolvedPrompts.length > 0) {
      return resolvedPrompts;
    }

    return [t('guid.defaultPrompts.capabilities'), t('guid.defaultPrompts.skills'), t('guid.defaultPrompts.tools')];
  }, [localeKey, selectedAssistantDetail, selectedAssistantRecord, selectedAssistantId, t]);

  // Sync disabledBuiltinSkills + enabledSkills from assistant detail defaults.
  useEffect(() => {
    if (!selectedAssistantId || !selectedAssistantDetail) {
      setGuidDisabledBuiltinSkills(undefined);
      setGuidEnabledSkills(undefined);
      return;
    }

    const resolvedDefaults = resolveGuidAssistantDefaults(selectedAssistantDetail);
    setGuidDisabledBuiltinSkills(resolvedDefaults.disabledBuiltinSkillIds);
    setGuidEnabledSkills(resolvedDefaults.skillIds);
  }, [selectedAssistantDetail, selectedAssistantId]);

  const appliedAssistantDefaultsKeyRef = useRef<string | null>(null);
  const manualModelSelectionAssistantRef = useRef<string | null>(null);
  const manualThoughtLevelSelectionAssistantRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedAssistantId || !selectedAssistantDetail) {
      appliedAssistantDefaultsKeyRef.current = null;
      manualModelSelectionAssistantRef.current = null;
      manualThoughtLevelSelectionAssistantRef.current = null;
      return;
    }

    const signature = JSON.stringify({
      assistantId: selectedAssistantId,
      backend: agentSelection.selectedAssistantBackend,
      defaults: selectedAssistantDetail.defaults,
      preferences: {
        last_model_id: selectedAssistantDetail.preferences.last_model_id,
        last_permission_value: selectedAssistantDetail.preferences.last_permission_value,
        last_thought_level_value: selectedAssistantDetail.preferences.last_thought_level_value,
        last_mcp_ids: selectedAssistantDetail.preferences.last_mcp_ids,
      },
      availableModels: {
        acp: agentSelection.currentAcpCachedModelInfo?.available_models.map((model) => model.id) ?? [],
        aionrs: modelSelection.modelList.map((provider) => ({
          id: provider.id,
          models: provider.models,
        })),
      },
      availableModes: agentSelection.currentAgentModeOptions.map((mode) => mode.value),
      availableThoughtLevels: agentSelection.currentThoughtLevelOption?.options.map((option) => option.value) ?? [],
    });
    if (appliedAssistantDefaultsKeyRef.current === signature) {
      return;
    }
    appliedAssistantDefaultsKeyRef.current = signature;

    const applyAssistantDefaults = async () => {
      const resolvedDefaults = resolveGuidAssistantDefaults(selectedAssistantDetail);
      const effectiveBackend = agentSelection.selectedAssistantBackend;
      const shouldApplyDefaultModel = manualModelSelectionAssistantRef.current !== selectedAssistantId;
      const shouldApplyDefaultThoughtLevel = manualThoughtLevelSelectionAssistantRef.current !== selectedAssistantId;

      if (shouldApplyDefaultModel && effectiveBackend === 'aionrs') {
        if (resolvedDefaults.modelId) {
          const matchedProvider = modelSelection.modelList.find((provider) =>
            provider.models.includes(resolvedDefaults.modelId!)
          );
          if (matchedProvider) {
            await modelSelection.setCurrentModel(
              {
                ...matchedProvider,
                use_model: resolvedDefaults.modelId,
              },
              { persistPreference: false }
            );
          }
        } else {
          await modelSelection.resetCurrentModel({ persistPreference: false });
        }
      } else if (shouldApplyDefaultModel && resolvedDefaults.modelId) {
        const availableModelIds = new Set(agentSelection.currentAcpCachedModelInfo?.available_models.map((m) => m.id));
        agentSelection.setSelectedAcpModel(
          availableModelIds.size === 0 || availableModelIds.has(resolvedDefaults.modelId)
            ? resolvedDefaults.modelId
            : null,
          { persistPreference: false }
        );
      } else if (shouldApplyDefaultModel) {
        agentSelection.setSelectedAcpModel(null, { persistPreference: false });
      }

      if (resolvedDefaults.permissionMode) {
        const availableModeIds = new Set(agentSelection.currentAgentModeOptions.map((mode) => mode.value));
        if (availableModeIds.size === 0 || availableModeIds.has(resolvedDefaults.permissionMode)) {
          agentSelection.setSelectedMode(resolvedDefaults.permissionMode, { persistPreference: false });
        } else {
          const fallbackMode = agentSelection.currentAgentModeOptions[0]?.value;
          if (fallbackMode) {
            agentSelection.setSelectedMode(fallbackMode, { persistPreference: false });
          }
        }
      }
      if (shouldApplyDefaultThoughtLevel && agentSelection.currentThoughtLevelOption) {
        const availableThoughtLevelValues = new Set(
          agentSelection.currentThoughtLevelOption.options.map((option) => option.value)
        );
        if (resolvedDefaults.thoughtLevel && availableThoughtLevelValues.has(resolvedDefaults.thoughtLevel)) {
          agentSelection.setSelectedThoughtLevelValue(resolvedDefaults.thoughtLevel, { persistPreference: false });
        } else {
          const fallbackThoughtLevel =
            agentSelection.currentThoughtLevelOption.currentValue ||
            agentSelection.currentThoughtLevelOption.options[0]?.value ||
            '';
          agentSelection.setSelectedThoughtLevelValue(fallbackThoughtLevel, { persistPreference: false });
        }
      }
      setGuidSelectedMcpServerIds(resolvedDefaults.mcpIds);
    };

    void applyAssistantDefaults().catch((error) => {
      console.error('[GuidPage] Failed to apply assistant defaults:', error);
    });
  }, [
    agentSelection.currentAcpCachedModelInfo?.available_models,
    agentSelection.currentAgentModeOptions,
    agentSelection.currentThoughtLevelOption,
    agentSelection.selectedAssistantBackend,
    agentSelection.setSelectedAcpModel,
    agentSelection.setSelectedMode,
    agentSelection.setSelectedThoughtLevelValue,
    modelSelection.modelList,
    modelSelection.resetCurrentModel,
    modelSelection.setCurrentModel,
    selectedAssistantId,
    selectedAssistantDetail,
  ]);

  const setGuidSelectedMode = useCallback(
    (mode: React.SetStateAction<string>) => {
      agentSelection.setSelectedMode(mode, { persistPreference: !hasSelectedAssistant });
    },
    [agentSelection, hasSelectedAssistant]
  );
  const setGuidSelectedAcpModel = useCallback(
    (model: React.SetStateAction<string | null>) => {
      manualModelSelectionAssistantRef.current = selectedAssistantId;
      agentSelection.setSelectedAcpModel(model, { persistPreference: !hasSelectedAssistant });
    },
    [agentSelection, hasSelectedAssistant, selectedAssistantId]
  );
  const setGuidSelectedThoughtLevel = useCallback(
    (value: string) => {
      manualThoughtLevelSelectionAssistantRef.current = selectedAssistantId;
      agentSelection.setSelectedThoughtLevelValue(value, { persistPreference: !hasSelectedAssistant });
    },
    [agentSelection, hasSelectedAssistant, selectedAssistantId]
  );
  const setGuidCurrentModel = useCallback(
    (model: TProviderWithModel) => {
      manualModelSelectionAssistantRef.current = selectedAssistantId;
      return modelSelection.setCurrentModel(model, { persistPreference: !hasSelectedAssistant });
    },
    [hasSelectedAssistant, modelSelection, selectedAssistantId]
  );

  // Reset guid-local UI state before paint so same-route navigations do not
  // briefly show the previous draft or preset assistant layout. When a caller
  // navigates here with a `prefillPrompt` (e.g. "Create via chat" from the
  // scheduled tasks page), seed the input with it instead of clearing.
  //
  // The prefill is consumed once per navigation: a ref keyed on location.key
  // guards against re-seeding if the user later clears the input and returns to
  // this history entry (e.g. via back navigation), which would otherwise revive
  // the prompt from the still-present location.state.
  const consumedPrefillKeyRef = useRef<string | null>(null);
  // When a "via chat" navigation also pins an assistant (selectedAssistantId),
  // the assistant-selection cleanup effect below fires a state-clearing
  // replace() that churns location.key. That second pass has no prefillPrompt
  // and would otherwise wipe the freshly seeded input. This flag lets exactly
  // one such follow-up pass skip the clear, preserving the seeded prompt.
  const skipNextClearRef = useRef(false);
  useLayoutEffect(() => {
    const prefillState = location.state as { prefillPrompt?: string; prefillFiles?: string[] } | null;
    const prefillPrompt = prefillState?.prefillPrompt;
    const prefillFiles = prefillState?.prefillFiles;
    if (prefillPrompt && consumedPrefillKeyRef.current !== location.key) {
      // Consume prompt + optional attachments (e.g. bug-report screenshots) once.
      consumedPrefillKeyRef.current = location.key;
      skipNextClearRef.current = true;
      guidInput.setInput(prefillPrompt);
      guidInput.setFiles(prefillFiles && prefillFiles.length > 0 ? prefillFiles : []);
    } else if (skipNextClearRef.current) {
      // This pass is the state-clearing replace() right after a prefill — keep
      // the seeded input instead of clearing it.
      skipNextClearRef.current = false;
    } else {
      guidInput.setInput('');
      guidInput.setFiles([]);
    }
    guidInput.setLoading(false);
    if (!(location.state as { workspace?: string } | null)?.workspace) {
      guidInput.setDir('');
    }
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
    if (!resetAssistantRequested && !preselectAssistantId) return;
    navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true, state: null });
  }, [resetAssistantRequested, preselectAssistantId, location.pathname, location.search, location.hash, navigate]);

  // Agents that use configured model providers instead of ACP probe-based models.
  // Only aionrs now — Gemini runs as a regular ACP backend with ACP-cached models.
  const PROVIDER_BASED_AGENTS = new Set(['aionrs']);
  const isGeminiMode = PROVIDER_BASED_AGENTS.has(agentSelection.selectedAssistantBackend);

  // Build the mention dropdown node
  // Build the model selector node
  const modelSelectorNode = (
    <GuidModelSelector
      isGeminiMode={isGeminiMode}
      modelList={modelSelection.modelList}
      current_model={modelSelection.current_model}
      setCurrentModel={setGuidCurrentModel}
      currentAcpCachedModelInfo={agentSelection.currentAcpCachedModelInfo}
      selectedAcpModel={agentSelection.selectedAcpModel}
      setSelectedAcpModel={setGuidSelectedAcpModel}
      thoughtLevelOption={isGeminiMode ? null : agentSelection.currentThoughtLevelOption}
      onThoughtLevelSelect={setGuidSelectedThoughtLevel}
    />
  );

  const handleSpeechTranscript = useCallback(
    (transcript: string) => {
      guidInput.setInput((prev) => appendSpeechTranscript(prev, transcript));
    },
    [guidInput.setInput]
  );
  const { handleLiveTranscript } = useLiveTranscriptInsertion(guidInput.setInput);

  // Build the action row
  const actionRowNode = (
    <GuidActionRow
      files={guidInput.files}
      onFilesUploaded={guidInput.handleFilesUploaded}
      modelSelectorNode={modelSelectorNode}
      modeBackend={agentSelection.selectedAssistantBackend}
      selectedMode={agentSelection.selectedMode}
      dynamicModes={agentSelection.currentAgentModeOptions}
      onModeSelect={setGuidSelectedMode}
      allSkills={allSkills}
      disabledBuiltinSkills={guidDisabledBuiltinSkills ?? []}
      enabledSkills={guidEnabledSkills ?? []}
      onToggleSkill={handleToggleSkill}
      mcpServers={availableMcpServers}
      selectedMcpServerIds={guidSelectedMcpServerIds ?? []}
      onToggleMcpServer={handleToggleMcpServer}
      speechInputNode={
        <SpeechInputButton
          disabled={guidInput.loading}
          onLiveTranscript={handleLiveTranscript}
          onTranscript={handleSpeechTranscript}
        />
      }
      loading={guidInput.loading}
      isButtonDisabled={send.isButtonDisabled}
      onSend={send.sendMessageHandler}
    />
  );
  const slashCommandMenuNode = slashController.isOpen ? (
    <SlashCommandMenu
      title={t('messages.slash.title', { defaultValue: 'Commands' })}
      hint={t('messages.slash.hint', { defaultValue: 'Type / to open command menu' })}
      items={slashMenuItems}
      activeIndex={slashController.activeIndex}
      loading={false}
      onHoverItem={slashController.setActiveIndex}
      onSelectItem={(item) => {
        const targetIndex = slashController.filteredCommands.findIndex((command) => command.name === item.key);
        if (targetIndex >= 0) {
          slashController.onSelectByIndex(targetIndex);
        }
      }}
      emptyText={t('messages.slash.empty', { defaultValue: 'No commands found' })}
    />
  ) : null;

  return (
    <ConfigProvider getPopupContainer={() => guidContainerRef.current || document.body}>
      <div ref={guidContainerRef} className={styles.guidContainer}>
        <div className={styles.guidLayout}>
          <div className={styles.heroHeader}>
            <p className='text-2xl font-semibold mb-0 text-0 text-center'>{t('conversation.welcome.title')}</p>
          </div>

          <AssistantSelectionArea
            selectedAssistantId={agentSelection.selectedAssistantId}
            assistants={agentSelection.assistants}
            localeKey={localeKey}
            onSelectAssistant={handleSelectAssistant}
          />

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
            files={guidInput.files}
            onRemoveFile={guidInput.handleRemoveFile}
            actionRow={actionRowNode}
            slashCommandMenu={slashCommandMenuNode}
            workspaceDir={guidInput.dir}
            onSelectWorkspace={(dir) => guidInput.setDir(dir)}
            onClearWorkspace={() => guidInput.setDir('')}
          />

          {selectedAssistantPrompts.length > 0 ? (
            <div className='mt-18px w-full animate-fade-in'>
              <div className={`${styles.assistantPromptHint} mb-10px text-left`}>
                {t('guid.promptExamplesHint', { defaultValue: 'Try these example prompts:' })}
              </div>
              <div className='flex flex-col gap-9px'>
                {selectedAssistantPrompts.map((prompt, index) => (
                  <Button
                    key={`${index}-${prompt}`}
                    type='text'
                    className='!h-auto !w-full !rounded-10px !border !border-border-2 !bg-bg-base !px-10px !py-10px !text-left !text-12.5px !text-t-secondary !whitespace-normal !break-words transition-colors hover:!border-aou-6 hover:!text-t-primary'
                    onClick={() => {
                      guidInput.setInput(prompt);
                      guidInput.handleTextareaFocus();
                    }}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
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
