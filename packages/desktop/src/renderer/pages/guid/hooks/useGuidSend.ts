/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';
import { buildAgentConversationParams } from '@/common/utils/buildAgentConversationParams';
import { toSessionMcpServer } from '@/renderer/hooks/mcp/catalog';
import { emitter } from '@/renderer/utils/emitter';
import { updateWorkspaceTime } from '@/renderer/utils/workspace/workspaceHistory';
import { Message } from '@arco-design/web-react';
import { useCallback, useRef } from 'react';
import { type TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import { mutate as swrMutate } from 'swr';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import type { AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import { getPreferredThoughtLevel } from './agentSelectionUtils';

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
  currentAcpCachedModelInfo: AcpModelInfo | null;
  current_model: TProviderWithModel | undefined;

  // Agent helpers
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  getEffectiveAgentType: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => EffectiveAgentInfo;
  resolveEnabledSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  guidDisabledBuiltinSkills: string[] | undefined;
  guidEnabledSkills: string[] | undefined;
  assistantDefaultSkillIds?: string[];
  assistantDefaultDisabledBuiltinSkillIds?: string[];
  availableMcpServers: IMcpServer[];
  selectedMcpServerIds: string[] | undefined;
  assistantDefaultMcpIds?: string[];
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  isGoogleAuth: boolean;

  // Mention state reset
  setMentionOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionQuery: React.Dispatch<React.SetStateAction<string | null>>;
  setMentionSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setMentionActiveIndex: React.Dispatch<React.SetStateAction<number>>;

  // Navigation
  navigate: NavigateFunction;
  t: TFunction;
  localeKey: string;
};

export type GuidSendResult = {
  handleSend: () => Promise<void>;
  sendMessageHandler: () => void;
  isButtonDisabled: boolean;
};

/**
 * Hook that manages the send logic for ACP and Aion CLI conversations.
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
    currentAcpCachedModelInfo,
    current_model,
    findAgentByKey,
    getEffectiveAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds,
    assistantDefaultMcpIds,
    currentEffectiveAgentInfo: _currentEffectiveAgentInfo,
    setMentionOpen,
    setMentionQuery,
    setMentionSelectorOpen,
    setMentionActiveIndex,
    navigate,
    t,
    localeKey,
  } = deps;
  const sendingRef = useRef(false);

  const handleSend = useCallback(async () => {
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    const agentInfo = selectedAgentInfo;
    const is_preset = is_presetAgent;
    const preset_assistant_id = is_preset ? agentInfo?.custom_agent_id : undefined;

    const { agent_type: effectiveAgentType } = getEffectiveAgentType(agentInfo);

    // Guid page's per-conversation skill overrides take precedence over the
    // assistant's saved defaults. The combined skills menu lets the user pick
    // any custom skill — not just preset-declared ones — so for non-preset
    // agents we still forward the user's selection (the backend accepts
    // `preset_enabled_skills` regardless of `is_preset`).
    const presetEnabledSkillsDefault = resolveEnabledSkills(agentInfo);
    const enabled_skills =
      guidEnabledSkills ?? (is_presetAgent ? assistantDefaultSkillIds : presetEnabledSkillsDefault);
    const enabled_skills_to_send = is_presetAgent
      ? enabled_skills
      : guidEnabledSkills?.length
        ? guidEnabledSkills
        : undefined;
    const excludeBuiltinSkills =
      guidDisabledBuiltinSkills ??
      (is_presetAgent ? assistantDefaultDisabledBuiltinSkillIds : resolveDisabledBuiltinSkills(agentInfo));
    const selectedAllMcpServerIds = selectedMcpServerIds ?? [];
    const selectedMcpServerIdSet = new Set(selectedAllMcpServerIds);
    const selectedUserMcpServerIds = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const selectedAllSessionMcpServers = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id))
      .map((server) => toSessionMcpServer(server));
    const selectedSessionMcpServers = availableMcpServers
      .filter((server) => selectedMcpServerIdSet.has(server.id) && server.builtin === true)
      .map((server) => toSessionMcpServer(server));
    const defaultSelectedMcpServerIds = assistantDefaultMcpIds;
    const defaultSelectedUserMcpServerIds = availableMcpServers
      .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id) && server.builtin !== true)
      .map((server) => server.id);
    const assistantOverrideMcpIds =
      selectedMcpServerIds !== undefined ? selectedAllMcpServerIds : defaultSelectedMcpServerIds;
    const selectedUserMcpServerIdsToSend =
      selectedMcpServerIds !== undefined ? selectedUserMcpServerIds : defaultSelectedUserMcpServerIds;
    const selectedSessionMcpServersToSend =
      selectedMcpServerIds !== undefined
        ? selectedAllSessionMcpServers
        : availableMcpServers
            .filter((server) => (defaultSelectedMcpServerIds ?? []).includes(server.id))
            .map((server) => toSessionMcpServer(server));

    const finalEffectiveAgentType = effectiveAgentType;
    const assistantOverrideModel =
      selectedAcpModel || currentAcpCachedModelInfo?.current_model_id || current_model?.use_model || undefined;
    const assistantOverrides = {
      model: assistantOverrideModel,
      permission: selectedMode || undefined,
      skill_ids: enabled_skills_to_send,
      disabled_builtin_skill_ids: excludeBuiltinSkills,
      mcp_ids: assistantOverrideMcpIds,
    };

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
          assistant:
            preset_assistant_id && is_preset
              ? {
                  id: preset_assistant_id,
                  locale: localeKey,
                  conversation_overrides: assistantOverrides,
                }
              : undefined,
          extra: {
            default_files: files,
            workspace: finalWorkspace,
            custom_workspace: isCustomWorkspace,
            preset_assistant_id,
            ...(!is_preset && enabled_skills_to_send?.length ? { enabled_skills: enabled_skills_to_send } : {}),
            ...(!is_preset && excludeBuiltinSkills?.length ? { exclude_builtin_skills: excludeBuiltinSkills } : {}),
            selected_mcp_server_ids: selectedUserMcpServerIdsToSend,
            selected_session_mcp_servers: selectedSessionMcpServersToSend,
            session_mode: selectedMode,
          },
        });

        if (!conversation || !conversation.id) {
          Message.error(t('conversation.createFailed'));
          return;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        if (preset_assistant_id) {
          await Promise.all([
            swrMutate(`guid.assistant.detail.${preset_assistant_id}.${localeKey}`),
            swrMutate('assistants.list'),
          ]);
        }

        emitter.emit('chat.history.refresh');

        const initialMessage = {
          input,
          files: files.length > 0 ? files : undefined,
        };
        sessionStorage.setItem(`aionrs_initial_message_${conversation.id}`, JSON.stringify(initialMessage));

        await navigate(`/conversation/${conversation.id}`);
      } catch (error: unknown) {
        console.error('Failed to create Aion CLI conversation:', error);
        throw error;
      }
      return;
    }

    // Remaining agent path (ACP/remote/custom, including preset fallbacks)
    {
      // Agent-type fallback only applies to preset assistants whose primary agent
      // was unavailable and got switched. For non-preset
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
      const preferredThoughtLevel = getPreferredThoughtLevel(agentBackend);
      const agentConversationParams = buildAgentConversationParams({
        backend: agentBackend,
        name: input,
        // For row-scoped rows (custom ACP / remote) the backend factory
        // needs the actual catalog id — `backend` collapses to the `custom`
        // slot so it cannot discriminate between rows on its own.
        agent_id: acpAgentInfo?.id,
        agent_name: acpAgentInfo?.name,
        preset_assistant_id,
        workspace: finalWorkspace,
        model: current_model!,
        cli_path: acpAgentInfo?.cli_path,
        custom_agent_id: acpAgentInfo?.custom_agent_id,
        custom_workspace: isCustomWorkspace,
        is_preset,
        preset_agent_type: finalEffectiveAgentType,
        session_mode: selectedMode,
        current_model_id: selectedAcpModel || currentAcpCachedModelInfo?.current_model_id || undefined,
        thought_level: preferredThoughtLevel,
        assistant_locale: localeKey,
        assistant_conversation_overrides: assistantOverrides,
        extra: {
          default_files: files,
          ...(!is_preset && enabled_skills_to_send?.length ? { enabled_skills: enabled_skills_to_send } : {}),
          ...(!is_preset && excludeBuiltinSkills?.length ? { exclude_builtin_skills: excludeBuiltinSkills } : {}),
          selected_mcp_server_ids: selectedUserMcpServerIdsToSend,
          selected_session_mcp_servers:
            selectedMcpServerIds !== undefined ? selectedSessionMcpServers : selectedSessionMcpServersToSend,
        },
      });

      try {
        const conversation = await ipcBridge.conversation.create.invoke(agentConversationParams);
        if (!conversation || !conversation.id) {
          console.error('Failed to create ACP conversation - conversation object is null or missing id');
          return;
        }

        if (isCustomWorkspace) {
          updateWorkspaceTime(finalWorkspace);
        }

        if (preset_assistant_id) {
          await Promise.all([
            swrMutate(`guid.assistant.detail.${preset_assistant_id}.${localeKey}`),
            swrMutate('assistants.list'),
          ]);
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
    currentAcpCachedModelInfo,
    current_model,
    findAgentByKey,
    getEffectiveAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    guidDisabledBuiltinSkills,
    guidEnabledSkills,
    assistantDefaultSkillIds,
    assistantDefaultDisabledBuiltinSkillIds,
    availableMcpServers,
    selectedMcpServerIds,
    assistantDefaultMcpIds,
    navigate,
    t,
    localeKey,
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
        Message.error(getConversationCreateErrorMessage(error, t));
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
    t,
  ]);

  // Calculate button disabled state
  const isButtonDisabled = loading || !input.trim();

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
