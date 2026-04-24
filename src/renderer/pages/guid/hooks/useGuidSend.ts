/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TProviderWithModel } from '@/common/config/storage';
import type { TChatConversation } from '@/common/config/storage';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import type { AcpBackend, AvailableAgent, EffectiveAgentInfo } from '../types';

export type GuidSendDeps = {
  // Input state
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  files: string[];
  setFiles: React.Dispatch<React.SetStateAction<string[]>>;
  dir: string;
  setDir: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;

  // Agent state
  selectedAgent: string;
  selectedAgentKey: string;
  selectedAgentInfo: AvailableAgent | undefined;
  is_presetAgent: boolean;
  selectedMode: string;
  selectedAcpModel: string | null;
  pending_config_options: Record<string, string>;
  cached_config_options: import('@/common/types/acpTypes').AcpSessionConfigOption[];
  current_model: TProviderWithModel | undefined;

  // Agent helpers
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  getEffectiveAgentType: (
    agentInfo: { backend: AcpBackend; custom_agent_id?: string } | undefined
  ) => EffectiveAgentInfo;
  resolvePresetRulesAndSkills: (
    agentInfo: { backend: AcpBackend; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolveEnabledSkills: (
    agentInfo: { backend: AcpBackend; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { backend: AcpBackend; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  guidDisabledBuiltinSkills: string[] | undefined;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  isGoogleAuth: boolean;

  // Mention state reset
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;

  // Navigation & tabs
  navigate: NavigateFunction;
  closeAllTabs: () => void;
  openTab: (conversation: TChatConversation) => void;
  t: TFunction;
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
};

/**
 * Hook that manages the send logic for all conversation types (gemini/openclaw/nanobot/acp).
 */
export const useGuidSend = (deps: GuidSendDeps): GuidSendResult => {
  const {
    input,
    setInput,
    files,
    setFiles,
    dir,
    setDir,
    setLoading,
    loading,
    selectedAgent,
    selectedAgentKey,
    selectedAgentInfo,
    is_presetAgent,
    selectedMode,
    selectedAcpModel,
    pending_config_options,
    cached_config_options,
    current_model,
    findAgentByKey,
    getEffectiveAgentType,
    resolvePresetRulesAndSkills,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    currentEffectiveAgentInfo,
    isGoogleAuth,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    closeAllTabs,
    openTab,
    t,
  } = deps;
  const sendingRef = useRef(false);

  const handleSend = useCallback(async () => {
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    const agentInfo = selectedAgentInfo;
    const is_preset = is_presetAgent;
    const preset_assistant_id = is_preset ? agentInfo?.custom_agent_id : undefined;

    const { agent_type: effectiveAgentType } = getEffectiveAgentType(agentInfo);

    const { rules: preset_rules } = await resolvePresetRulesAndSkills(agentInfo);
    const enabled_skills = resolveEnabledSkills(agentInfo);
    // Use guid page's local skill state (initialized from assistant config, overridable by user)
    const excludeBuiltinSkills = guidDisabledBuiltinSkills ?? resolveDisabledBuiltinSkills(agentInfo);

    const finalEffectiveAgentType = effectiveAgentType;

    // Gemini path
    if (!selectedAgent || selectedAgent === 'gemini' || (is_preset && finalEffectiveAgentType === 'gemini')) {
      // The placeholder only makes sense while Google Auth is active — otherwise
      // it fabricates a logged-out auth type and the chat page fails to load.
      if (!current_model && !isGoogleAuth) {
        Message.warning(t('conversation.noModelConfigured'));
        return;
      }
      const placeholderModel = current_model || {
        id: 'gemini-placeholder',
        name: 'Gemini',
        useModel: 'default',
        platform: 'gemini-with-google-auth' as const,
        base_url: '',
        api_key: '',
      };
      try {
        const geminiConversationParams = buildAgentConversationParams({
          backend: 'gemini',
          name: input,
          agent_name: agentInfo?.name,
          preset_assistant_id,
          workspace: finalWorkspace,
          model: placeholderModel,
          custom_agent_id: agentInfo?.custom_agent_id,
          custom_workspace: isCustomWorkspace,
          is_preset,
          presetAgentType: finalEffectiveAgentType,
          presetResources: is_preset
            ? {
                rules: preset_rules,
                enabled_skills,
                excludeBuiltinSkills,
              }
            : undefined,
          session_mode: selectedMode,
          extra: {
            defaultFiles: files,
            excludeBuiltinSkills,
            web_search_engine:
              placeholderModel.platform === 'gemini-with-google-auth' ||
              placeholderModel.platform === 'gemini-vertex-ai'
                ? 'google'
                : 'default',
          },
        });

        const conversation = await ipcBridge.conversation.create.invoke(geminiConversationParams);

        if (!conversation || !conversation.id) {
          throw new Error('Failed to create conversation - conversation object is null or missing id');
        }

        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          openTab(conversation);
        }

        emitter.emit('chat.history.refresh');

        const workspacePath = conversation.extra?.workspace || '';
        const displayMessage = buildDisplayMessage(input, files, workspacePath);
        const initialMessage = {
          input: displayMessage,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`gemini_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        void navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create Gemini conversation:', error);
        throw error;
      }
      return;
    }

    // OpenClaw Gateway path
    if (selectedAgent === 'openclaw-gateway') {
      const openclawAgentInfo = agentInfo || findAgentByKey(selectedAgentKey);
      const openclawConversationParams = buildAgentConversationParams({
        backend: openclawAgentInfo?.backend || 'openclaw-gateway',
        name: input,
        agent_name: openclawAgentInfo?.name,
        preset_assistant_id,
        workspace: finalWorkspace,
        model: current_model!,
        cli_path: openclawAgentInfo?.cli_path,
        custom_agent_id: openclawAgentInfo?.custom_agent_id,
        custom_workspace: isCustomWorkspace,
        extra: {
          defaultFiles: files,
          runtimeValidation: {
            expectedWorkspace: finalWorkspace,
            expectedBackend: openclawAgentInfo?.backend,
            expectedAgentName: openclawAgentInfo?.name,
            expectedCliPath: openclawAgentInfo?.cli_path,
            expectedModel: current_model?.useModel,
            switchedAt: Date.now(),
          },
          enabled_skills: is_preset ? enabled_skills : undefined,
          excludeBuiltinSkills,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(openclawConversationParams);

        if (!conversation || !conversation.id) {
          alert('Failed to create OpenClaw conversation. Please ensure the OpenClaw Gateway is running.');
          return;
        }

        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          openTab(conversation);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`openclaw_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create OpenClaw conversation: ${errorMessage}`);
        throw error;
      }
      return;
    }

    // Nanobot path
    if (selectedAgent === 'nanobot') {
      const nanobotAgentInfo = agentInfo || findAgentByKey(selectedAgentKey);
      const nanobotConversationParams = buildAgentConversationParams({
        backend: nanobotAgentInfo?.backend || 'nanobot',
        name: input,
        agent_name: nanobotAgentInfo?.name,
        preset_assistant_id,
        workspace: finalWorkspace,
        model: current_model!,
        custom_agent_id: nanobotAgentInfo?.custom_agent_id,
        custom_workspace: isCustomWorkspace,
        extra: {
          defaultFiles: files,
          enabled_skills: is_preset ? enabled_skills : undefined,
          excludeBuiltinSkills,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(nanobotConversationParams);

        if (!conversation || !conversation.id) {
          alert('Failed to create Nanobot conversation. Please ensure nanobot is installed.');
          return;
        }

        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          openTab(conversation);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`nanobot_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create Nanobot conversation: ${errorMessage}`);
        throw error;
      }
      return;
    }

    // Aionrs path (direct selection or preset assistant with aionrs as main agent)
    if (selectedAgent === 'aionrs' || (is_preset && finalEffectiveAgentType === 'aionrs')) {
      if (!current_model) {
        Message.warning(t('conversation.noModelConfigured'));
        return;
      }
      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'aionrs',
          name: input,
          model: current_model,
          extra: {
            defaultFiles: files,
            workspace: finalWorkspace,
            custom_workspace: isCustomWorkspace,
            preset_rules: is_preset ? preset_rules : undefined,
            enabled_skills: is_preset ? enabled_skills : undefined,
            excludeBuiltinSkills,
            preset_assistant_id,
            session_mode: selectedMode,
          },
        });

        if (!conversation || !conversation.id) {
          alert('Failed to create Aion CLI conversation. Please ensure aionrs is installed.');
          return;
        }

        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          openTab(conversation);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`aionrs_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to create Aion CLI conversation: ${errorMessage}`);
        throw error;
      }
      return;
    }

    // Remaining agent path (ACP/remote/custom, including preset fallbacks)
    {
      // Agent-type fallback only applies to preset assistants whose primary agent
      // was unavailable and got switched (e.g. claude → gemini).  For non-preset
      // agents (including extension-contributed ACP adapters with backend='custom'),
      // we must keep the original selectedAgent so the correct backend/cli_path is used.
      const agent_typeChanged = is_preset && selectedAgent !== finalEffectiveAgentType;
      const acpBackend: string | undefined = agent_typeChanged
        ? finalEffectiveAgentType
        : is_preset
          ? finalEffectiveAgentType
          : selectedAgent;

      const acpAgentInfo = agent_typeChanged
        ? findAgentByKey(acpBackend as string)
        : agentInfo || findAgentByKey(selectedAgentKey);

      if (!acpAgentInfo && !is_preset) {
        console.warn(`${acpBackend} CLI not found, but proceeding to let conversation panel handle it.`);
      }
      const agentBackend = acpBackend || selectedAgent;
      const agentConversationParams = buildAgentConversationParams({
        backend: agentBackend,
        name: input,
        agent_name: acpAgentInfo?.name,
        preset_assistant_id,
        workspace: finalWorkspace,
        model: current_model!,
        cli_path: acpAgentInfo?.cli_path,
        custom_agent_id: acpAgentInfo?.custom_agent_id,
        custom_workspace: isCustomWorkspace,
        is_preset,
        presetAgentType: finalEffectiveAgentType,
        presetResources: is_preset
          ? {
              rules: preset_rules,
              enabled_skills,
              excludeBuiltinSkills,
            }
          : undefined,
        session_mode: selectedMode,
        current_model_id: selectedAcpModel || undefined,
        extra: {
          defaultFiles: files,
          excludeBuiltinSkills,
        },
      });

      try {
        // Merge pending selections into cached options so the UI shows the user's choice immediately
        const mergedCachedConfigOptions =
          cached_config_options.length > 0
            ? Object.keys(pending_config_options).length > 0
              ? cached_config_options.map((opt) => {
                  const pending = opt.id ? pending_config_options[opt.id] : undefined;
                  return pending ? { ...opt, current_value: pending, selected_value: pending } : opt;
                })
              : cached_config_options
            : undefined;

        // Inject cached_config_options & pending_config_options into the params built by utility
        if (mergedCachedConfigOptions) {
          agentConversationParams.extra = {
            ...agentConversationParams.extra,
            cached_config_options: mergedCachedConfigOptions,
          };
        }
        if (Object.keys(pending_config_options).length > 0) {
          agentConversationParams.extra = { ...agentConversationParams.extra, pending_config_options };
        }

        const conversation = await ipcBridge.conversation.create.invoke(agentConversationParams);
        if (!conversation || !conversation.id) {
          console.error('Failed to create ACP conversation - conversation object is null or missing id');
          return;
        }

        if (isCustomWorkspace) {
          closeAllTabs();
          updateWorkspaceTime(finalWorkspace);
          openTab(conversation);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`acp_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create ACP conversation:', error);
        throw error;
      }
    }
  }, [
    input,
    files,
    dir,
    selectedAgent,
    selectedAgentKey,
    selectedAgentInfo,
    is_presetAgent,
    selectedMode,
    selectedAcpModel,
    pending_config_options,
    cached_config_options,
    current_model,
    findAgentByKey,
    getEffectiveAgentType,
    resolvePresetRulesAndSkills,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    navigate,
    closeAllTabs,
    openTab,
    t,
  ]);

  const sendMessageHandler = useCallback(() => {
    if (loading || sendingRef.current) return;
    sendingRef.current = true;
    setLoading(true);
    handleSend()
      .then(() => {
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
      })
      .finally(() => {
        sendingRef.current = false;
        setLoading(false);
      });
  }, [
    loading,
    handleSend,
    setLoading,
    setInput,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    setFiles,
    setDir,
  ]);

  // Calculate button disabled state
  const isButtonDisabled =
    loading ||
    !input.trim() ||
    ((((!selectedAgent || selectedAgent === 'gemini') && !is_presetAgent) ||
      (is_presetAgent && currentEffectiveAgentInfo.agent_type === 'gemini' && currentEffectiveAgentInfo.isAvailable)) &&
      !current_model &&
      isGoogleAuth);

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
