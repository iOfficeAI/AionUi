/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TProviderWithModel } from '@/common/storage';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/messageFiles';
import { updateWorkspaceTime } from '@/renderer/utils/workspaceHistory';
import { isAcpRoutedPresetType, type PresetAgentType } from '@/types/acpTypes';
import { Message } from '@arco-design/web-react';
import { useCallback } from 'react';
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

  // Agent state
  selectedAgent: AcpBackend | 'custom';
  selectedAgentKey: string;
  selectedAgentInfo: AvailableAgent | undefined;
  isPresetAgent: boolean;
  selectedMode: string;
  selectedAcpModel: string | null;
  currentModel: TProviderWithModel | undefined;

  // Agent helpers
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  getEffectiveAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => EffectiveAgentInfo;
  resolvePresetRulesAndSkills: (agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined) => Promise<{ rules?: string; skills?: string }>;
  resolveEnabledSkills: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => string[] | undefined;
  isMainAgentAvailable: (agentType: PresetAgentType) => boolean;
  getAvailableFallbackAgent: () => PresetAgentType | null;
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
  openTab: (conversation: any) => void;
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
  const { input, setInput, files, setFiles, dir, setDir, setLoading, selectedAgent, selectedAgentKey, selectedAgentInfo, isPresetAgent, selectedMode, selectedAcpModel, currentModel, findAgentByKey, getEffectiveAgentType, resolvePresetRulesAndSkills, resolveEnabledSkills, isMainAgentAvailable, getAvailableFallbackAgent, currentEffectiveAgentInfo, isGoogleAuth, setMentionOpen, setMentionQuery, setMentionSelectorOpen, setMentionActiveIndex, navigate, closeAllTabs, openTab, t } = deps;

  const handleSend = useCallback(async () => {
    const isCustomWorkspace = !!dir;
    const finalWorkspace = dir || '';

    const agentInfo = selectedAgentInfo;
    const isPreset = isPresetAgent;

    const { agentType: effectiveAgentType } = getEffectiveAgentType(agentInfo);

    const { rules: presetRules } = await resolvePresetRulesAndSkills(agentInfo);
    const enabledSkills = resolveEnabledSkills(agentInfo);

    let finalEffectiveAgentType = effectiveAgentType;
    if (isPreset && !isMainAgentAvailable(effectiveAgentType)) {
      const fallback = getAvailableFallbackAgent();
      if (fallback && fallback !== effectiveAgentType) {
        finalEffectiveAgentType = fallback;
        Message.info(
          t('guid.autoSwitchedAgent', {
            defaultValue: `${effectiveAgentType} is not available, switched to ${fallback}`,
            from: effectiveAgentType,
            to: fallback,
          })
        );
      }
    }

    // Gemini path
    if (!selectedAgent || selectedAgent === 'gemini' || (isPreset && finalEffectiveAgentType === 'gemini')) {
      const placeholderModel = currentModel || {
        id: 'gemini-placeholder',
        name: 'Gemini',
        useModel: 'default',
        platform: 'gemini-with-google-auth' as const,
        baseUrl: '',
        apiKey: '',
      };
      try {
        const presetAssistantIdToPass = isPreset ? agentInfo?.customAgentId : undefined;

        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'gemini',
          name: input,
          model: placeholderModel,
          extra: {
            defaultFiles: files,
            workspace: finalWorkspace,
            customWorkspace: isCustomWorkspace,
            webSearchEngine: placeholderModel.platform === 'gemini-with-google-auth' || placeholderModel.platform === 'gemini-vertex-ai' ? 'google' : 'default',
            presetRules: isPreset ? presetRules : undefined,
            enabledSkills: isPreset ? enabledSkills : undefined,
            presetAssistantId: presetAssistantIdToPass,
            sessionMode: selectedMode,
          },
        });

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

      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'openclaw-gateway',
          name: input,
          model: currentModel!,
          extra: {
            defaultFiles: files,
            workspace: finalWorkspace,
            customWorkspace: isCustomWorkspace,
            backend: openclawAgentInfo?.backend,
            cliPath: openclawAgentInfo?.cliPath,
            agentName: openclawAgentInfo?.name,
            runtimeValidation: {
              expectedWorkspace: finalWorkspace,
              expectedBackend: openclawAgentInfo?.backend,
              expectedAgentName: openclawAgentInfo?.name,
              expectedCliPath: openclawAgentInfo?.cliPath,
              expectedModel: currentModel?.useModel,
              switchedAt: Date.now(),
            },
            enabledSkills: isPreset ? enabledSkills : undefined,
            presetAssistantId: isPreset ? openclawAgentInfo?.customAgentId : undefined,
          },
        });

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

      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'nanobot',
          name: input,
          model: currentModel!,
          extra: {
            defaultFiles: files,
            workspace: finalWorkspace,
            customWorkspace: isCustomWorkspace,
            enabledSkills: isPreset ? enabledSkills : undefined,
            presetAssistantId: isPreset ? nanobotAgentInfo?.customAgentId : undefined,
          },
        });

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

    // ACP path (including preset with claude agent type)
    {
      const agentTypeChanged = selectedAgent !== finalEffectiveAgentType;
      const acpBackend: PresetAgentType | undefined = agentTypeChanged ? finalEffectiveAgentType : isPreset && isAcpRoutedPresetType(finalEffectiveAgentType) ? finalEffectiveAgentType : selectedAgent;

      const acpAgentInfo = agentTypeChanged ? findAgentByKey(acpBackend as string) : agentInfo || findAgentByKey(selectedAgentKey);

      if (!acpAgentInfo && !isPreset) {
        console.warn(`${acpBackend} CLI not found, but proceeding to let conversation panel handle it.`);
      }

      try {
        const conversation = await ipcBridge.conversation.create.invoke({
          type: 'acp',
          name: input,
          model: currentModel!,
          extra: {
            defaultFiles: files,
            workspace: finalWorkspace,
            customWorkspace: isCustomWorkspace,
            backend: acpBackend,
            cliPath: acpAgentInfo?.cliPath,
            agentName: acpAgentInfo?.name,
            customAgentId: acpAgentInfo?.customAgentId,
            presetContext: isPreset ? presetRules : undefined,
            enabledSkills: isPreset ? enabledSkills : undefined,
            presetAssistantId: isPreset ? agentInfo?.customAgentId || acpAgentInfo?.customAgentId : undefined,
            sessionMode: selectedMode,
            currentModelId: selectedAcpModel || undefined,
          },
        });

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
  }, [input, files, dir, selectedAgent, selectedAgentKey, selectedAgentInfo, isPresetAgent, selectedMode, selectedAcpModel, currentModel, findAgentByKey, getEffectiveAgentType, resolvePresetRulesAndSkills, resolveEnabledSkills, isMainAgentAvailable, getAvailableFallbackAgent, navigate, closeAllTabs, openTab, t]);

  const sendMessageHandler = useCallback(() => {
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
        setLoading(false);
      });
  }, [handleSend, setLoading, setInput, setMentionOpen, setMentionQuery, setMentionSelectorOpen, setMentionActiveIndex, setFiles, setDir]);

  // Calculate button disabled state
  const isButtonDisabled = !input.trim() || ((((!selectedAgent || selectedAgent === 'gemini') && !isPresetAgent) || (isPresetAgent && currentEffectiveAgentInfo.agentType === 'gemini' && currentEffectiveAgentInfo.isAvailable)) && !currentModel && isGoogleAuth);

  return {
    handleSend,
    sendMessageHandler,
    isButtonDisabled,
  };
};
