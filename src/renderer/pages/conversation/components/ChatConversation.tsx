/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  getWorkspaceEditorLabel,
  getWorkspaceEditorMenuTargets,
  shouldShowWorkspaceEditorLauncher,
  type WorkspaceEditorTarget,
} from '@/common/workspaceEditor';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { resolveAvailableModel, uuid } from '@/common/utils';
import addChatIcon from '@/renderer/assets/icons/add-chat.svg';
import { CronJobManager } from '@/renderer/pages/cron';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { iconColors } from '@/renderer/styles/colors';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { Button, Dropdown, Menu, Message, Tooltip, Typography } from '@arco-design/web-react';
import { Down, FolderOpen, History } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { emitter } from '../../../utils/emitter';
import AcpChat from '../platforms/acp/AcpChat';
import ChatLayout from './ChatLayout';
import ChatSider from './ChatSider';
import NanobotChat from '../platforms/nanobot/NanobotChat';
import OpenClawChat from '../platforms/openclaw/OpenClawChat';
import RemoteChat from '../platforms/remote/RemoteChat';
import GeminiChat from '../platforms/gemini/GeminiChat';
import CodexChat from '../platforms/codex/CodexChat';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import GeminiModelSelector from '../platforms/gemini/GeminiModelSelector';
import { useGeminiModelSelection } from '../platforms/gemini/useGeminiModelSelection';
import AionrsChat from '../platforms/aionrs/AionrsChat';
import AionrsModelSelector from '../platforms/aionrs/AionrsModelSelector';
import { useAionrsCapabilities } from '../platforms/aionrs/useAionrsCapabilities';
import { useAionrsModelSelection } from '../platforms/aionrs/useAionrsModelSelection';
import { usePreviewContext } from '../Preview';
import StarOfficeMonitorCard from '../platforms/openclaw/StarOfficeMonitorCard.tsx';
// import SkillRuleGenerator from './components/SkillRuleGenerator'; // Temporarily hidden

const _AssociatedConversation: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { data } = useSWR(['getAssociateConversation', conversation_id], () =>
    ipcBridge.conversation.getAssociateConversation.invoke({ conversation_id })
  );
  const navigate = useNavigate();
  const list = useMemo(() => {
    if (!data?.length) return [];
    return data.filter((conversation) => conversation.id !== conversation_id);
  }, [data]);
  if (!list.length) return null;
  return (
    <Dropdown
      droplist={
        <Menu
          onClickMenuItem={(key) => {
            Promise.resolve(navigate(`/conversation/${key}`)).catch((error) => {
              console.error('Navigation failed:', error);
            });
          }}
        >
          {list.map((conversation) => {
            return (
              <Menu.Item key={conversation.id}>
                <Typography.Ellipsis className={'max-w-300px'}>{conversation.name}</Typography.Ellipsis>
              </Menu.Item>
            );
          })}
        </Menu>
      }
      trigger={['click']}
    >
      <Button
        size='mini'
        icon={
          <History
            theme='filled'
            size='14'
            fill={iconColors.primary}
            strokeWidth={2}
            strokeLinejoin='miter'
            strokeLinecap='square'
          />
        }
      ></Button>
    </Dropdown>
  );
};

const _AddNewConversation: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isCreatingRef = useRef(false);
  if (!conversation.extra?.workspace) return null;
  return (
    <Tooltip content={t('conversation.workspace.createNewConversation')}>
      <Button
        size='mini'
        icon={<img src={addChatIcon} alt='Add chat' className='w-14px h-14px block m-auto' />}
        onClick={async () => {
          if (isCreatingRef.current) return;
          isCreatingRef.current = true;
          try {
            const id = uuid();
            // Fetch latest conversation from DB to ensure sessionMode is current
            const latest = await ipcBridge.conversation.get.invoke({ id: conversation.id }).catch((): null => null);
            const source = latest || conversation;
            await ipcBridge.conversation.createWithConversation.invoke({
              conversation: {
                ...source,
                id,
                createTime: Date.now(),
                modifyTime: Date.now(),
                // Clear ACP session fields to prevent new conversation from inheriting old session context
                extra:
                  source.type === 'acp'
                    ? { ...source.extra, acpSessionId: undefined, acpSessionUpdatedAt: undefined }
                    : source.extra,
              } as TChatConversation,
            });
            void navigate(`/conversation/${id}`);
            emitter.emit('chat.history.refresh');
          } catch (error) {
            console.error('Failed to create conversation:', error);
          } finally {
            isCreatingRef.current = false;
          }
        }}
      />
    </Tooltip>
  );
};

const WorkspaceEditorLauncher: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const { t } = useTranslation();
  const [openingTarget, setOpeningTarget] = useState<WorkspaceEditorTarget | null>(null);

  const workspace = conversation.extra?.workspace;
  const customWorkspace = conversation.extra?.customWorkspace;
  const editorTargets = useMemo(() => getWorkspaceEditorMenuTargets(), []);
  const shouldShow =
    isElectronDesktop() && shouldShowWorkspaceEditorLauncher(workspace, customWorkspace) && editorTargets.length > 0;

  const handleOpenEditor = useCallback(
    async (target: string) => {
      if (!workspace) return;

      const editorTarget = target as WorkspaceEditorTarget;
      setOpeningTarget(editorTarget);

      try {
        await ipcBridge.shell.openWorkspaceInEditor.invoke({ workspace, target: editorTarget });
      } catch (error) {
        console.error(`Failed to open workspace in ${editorTarget}:`, error);
        Message.error(
          t('conversation.workspace.openInEditorFailed', {
            editor: getWorkspaceEditorLabel(editorTarget),
          })
        );
      } finally {
        setOpeningTarget(null);
      }
    },
    [t, workspace]
  );

  const menu = useMemo(() => {
    if (!shouldShow) return null;

    return (
      <Menu onClickMenuItem={(key) => void handleOpenEditor(key)}>
        {editorTargets.map((target) => (
          <Menu.Item key={target} disabled={openingTarget !== null}>
            {getWorkspaceEditorLabel(target)}
          </Menu.Item>
        ))}
      </Menu>
    );
  }, [editorTargets, handleOpenEditor, openingTarget, shouldShow]);

  if (!shouldShow || !menu) {
    return null;
  }

  return (
    <Dropdown droplist={menu} trigger='click' position='bl'>
      <Button
        size='mini'
        className='!px-8px'
        disabled={openingTarget !== null}
        title={t('conversation.workspace.openInEditor')}
        icon={
          <span className='flex items-center gap-2px'>
            <FolderOpen theme='outline' size='14' fill={iconColors.secondary} />
            <Down theme='outline' size='10' fill={iconColors.secondary} className='opacity-70' />
          </span>
        }
      />
    </Dropdown>
  );
};

// 仅抽取 Gemini 会话，确保包含模型信息
// Narrow to Gemini conversations so model field is always available
type GeminiConversation = Extract<TChatConversation, { type: 'gemini' }>;

type ProviderModelSelection = {
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
};

const resolveConfiguredConversationModel = (
  selection: ProviderModelSelection,
  providerId: string,
  requestedModel: string
): string | undefined => {
  const matchedProvider = selection.providers.find((provider) => provider.id === providerId);
  if (!matchedProvider) {
    return undefined;
  }

  return resolveAvailableModel(requestedModel, selection.getAvailableModels(matchedProvider));
};

const GeminiConversationPanel: React.FC<{
  conversation: GeminiConversation;
  sliderTitle: React.ReactNode;
  hideSendBox?: boolean;
}> = ({ conversation, sliderTitle, hideSendBox }) => {
  const modelNormalizationRef = useRef<string | null>(null);
  // Save model selection to conversation via IPC
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, useModel: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversation.id]
  );

  // Share model selection state between header and send box
  const modelSelection = useGeminiModelSelection({ initialModel: conversation.model, onSelectModel });

  useEffect(() => {
    const normalizedModelId = resolveConfiguredConversationModel(
      modelSelection,
      conversation.model.id,
      conversation.model.useModel
    );

    if (!normalizedModelId || normalizedModelId === conversation.model.useModel) {
      modelNormalizationRef.current = null;
      return;
    }

    const normalizationKey = `${conversation.id}:${conversation.model.useModel}->${normalizedModelId}`;
    if (modelNormalizationRef.current === normalizationKey) {
      return;
    }

    modelNormalizationRef.current = normalizationKey;
    void ipcBridge.conversation.update
      .invoke({
        id: conversation.id,
        updates: {
          model: {
            ...conversation.model,
            useModel: normalizedModelId,
          },
        },
      })
      .then((ok) => {
        if (!ok) {
          modelNormalizationRef.current = null;
        }
      })
      .catch(() => {
        modelNormalizationRef.current = null;
      });
  }, [conversation.id, conversation.model, modelSelection.getAvailableModels, modelSelection.providers]);
  const workspaceEnabled = Boolean(conversation.extra?.workspace);

  // 使用统一的 Hook 获取预设助手信息 / Use unified hook for preset assistant info
  const { info: presetAssistantInfo } = usePresetAssistantInfo(conversation);

  const chatLayoutProps = {
    title: conversation.name,
    siderTitle: sliderTitle,
    sider: <ChatSider conversation={conversation} />,
    headerLeft: <GeminiModelSelector selection={modelSelection} />,
    headerExtra: (
      <CronJobManager
        conversationId={conversation.id}
        cronJobId={conversation.extra?.cronJobId as string | undefined}
      />
    ),
    workspaceEnabled,
    backend: 'gemini' as const,
    // 传递预设助手信息 / Pass preset assistant info
    agentName: presetAssistantInfo?.name,
    agentLogo: presetAssistantInfo?.logo,
    agentLogoIsEmoji: presetAssistantInfo?.isEmoji,
  };

  return (
    <ChatLayout {...chatLayoutProps} conversationId={conversation.id} workspacePath={conversation.extra.workspace}>
      <GeminiChat
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        modelSelection={modelSelection}
        sessionMode={conversation.extra?.sessionMode}
        cronJobId={conversation.extra?.cronJobId as string | undefined}
        hideSendBox={hideSendBox}
      />
    </ChatLayout>
  );
};

type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;

const AionrsConversationPanel: React.FC<{ conversation: AionrsConversation; sliderTitle: React.ReactNode }> = ({
  conversation,
  sliderTitle,
}) => {
  const { capabilities, dynamicModes, initialized } = useAionrsCapabilities(conversation.id);
  const modelNormalizationRef = useRef<string | null>(null);
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, useModel: modelName } as TProviderWithModel;
      // Kill running agent on model switch — will be rebuilt with new model on next message
      await ipcBridge.conversation.stop.invoke({ conversation_id: conversation.id });
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversation.id]
  );

  const modelSelection = useAionrsModelSelection({
    initialModel: conversation.model,
    onSelectModel,
    runtimeCapabilities: capabilities,
  });

  useEffect(() => {
    const runtimeModels = capabilities?.available_models ?? [];
    const selectedModelId = conversation.model.useModel;
    const configuredModelId = resolveConfiguredConversationModel(
      modelSelection,
      conversation.model.id,
      selectedModelId
    );

    if (!initialized || runtimeModels.length === 0) {
      if (!configuredModelId || configuredModelId === selectedModelId) {
        modelNormalizationRef.current = null;
        return;
      }

      const normalizationKey = `${conversation.id}:${selectedModelId}->${configuredModelId}`;
      if (modelNormalizationRef.current === normalizationKey) {
        return;
      }

      modelNormalizationRef.current = normalizationKey;
      void ipcBridge.conversation.update
        .invoke({
          id: conversation.id,
          updates: {
            model: {
              ...conversation.model,
              useModel: configuredModelId,
            },
          },
        })
        .then((ok) => {
          if (!ok) {
            modelNormalizationRef.current = null;
          }
        })
        .catch(() => {
          modelNormalizationRef.current = null;
        });
      return;
    }

    const runtimeCurrentModelId = capabilities?.current_model;
    if (runtimeCurrentModelId === selectedModelId) {
      modelNormalizationRef.current = null;
      return;
    }

    if (runtimeModels.some((model) => model.id === selectedModelId)) {
      modelNormalizationRef.current = null;
      return;
    }

    const shouldPreferConfiguredChatgptModel =
      conversation.model.platform === 'chatgpt' && Boolean(configuredModelId);
    if (shouldPreferConfiguredChatgptModel && configuredModelId === selectedModelId) {
      modelNormalizationRef.current = null;
      return;
    }

    const fallbackModelId =
      (shouldPreferConfiguredChatgptModel ? configuredModelId : runtimeCurrentModelId) ||
      resolveAvailableModel(
        selectedModelId,
        runtimeModels.map((model) => model.id)
      ) ||
      configuredModelId ||
      runtimeModels[0]?.id ||
      null;

    if (!fallbackModelId || fallbackModelId === selectedModelId) {
      modelNormalizationRef.current = null;
      return;
    }

    const normalizationKey = `${conversation.id}:${selectedModelId}->${fallbackModelId}`;
    if (modelNormalizationRef.current === normalizationKey) {
      return;
    }

    modelNormalizationRef.current = normalizationKey;
    void ipcBridge.conversation.update
      .invoke({
        id: conversation.id,
        updates: {
          model: {
            ...conversation.model,
            useModel: fallbackModelId,
          },
        },
      })
      .then((ok) => {
        if (!ok) {
          modelNormalizationRef.current = null;
        }
      })
      .catch(() => {
        modelNormalizationRef.current = null;
      });
  }, [
    capabilities?.available_models,
    capabilities?.current_model,
    conversation.id,
    conversation.model,
    initialized,
    modelSelection.getAvailableModels,
    modelSelection.providers,
  ]);

  const workspaceEnabled = Boolean(conversation.extra?.workspace);
  const { info: presetAssistantInfo } = usePresetAssistantInfo(conversation);

  const chatLayoutProps = {
    title: conversation.name,
    siderTitle: sliderTitle,
    sider: <ChatSider conversation={conversation} />,
    headerLeft: <AionrsModelSelector selection={modelSelection} capabilities={capabilities} />,
    headerExtra: (
      <CronJobManager
        conversationId={conversation.id}
        cronJobId={conversation.extra?.cronJobId as string | undefined}
      />
    ),
    workspaceEnabled,
    backend: 'aionrs' as const,
    agentName: presetAssistantInfo?.name,
    agentLogo: presetAssistantInfo?.logo,
    agentLogoIsEmoji: presetAssistantInfo?.isEmoji,
  };

  return (
    <ChatLayout {...chatLayoutProps} conversationId={conversation.id}>
      <AionrsChat
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        modelSelection={modelSelection}
        sessionMode={conversation.extra?.sessionMode}
        capabilities={capabilities}
        dynamicModes={dynamicModes}
        initialContextLimit={conversation.extra?.lastContextLimit}
        initialEffort={conversation.extra?.reasoningEffort}
      />
    </ChatLayout>
  );
};

const ChatConversation: React.FC<{
  conversation?: TChatConversation;
  hideSendBox?: boolean;
}> = ({ conversation, hideSendBox }) => {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const workspaceEnabled = Boolean(conversation?.extra?.workspace);

  const isGeminiConversation = conversation?.type === 'gemini';
  const isAionrsConversation = conversation?.type === 'aionrs';

  // 使用统一的 Hook 获取预设助手信息（ACP/Codex 会话）
  // Use unified hook for preset assistant info (ACP/Codex conversations)
  const { info: presetAssistantInfo, isLoading: isLoadingPreset } = usePresetAssistantInfo(
    isGeminiConversation || isAionrsConversation ? undefined : conversation
  );

  const conversationAgentName = (conversation?.extra as { agentName?: string } | undefined)?.agentName;
  const assistantDisplayName = presetAssistantInfo?.name || conversationAgentName;

  const conversationNode = useMemo(() => {
    if (!conversation || isGeminiConversation || isAionrsConversation) return null;
    switch (conversation.type) {
      case 'acp':
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            backend={conversation.extra?.backend || 'claude'}
            sessionMode={conversation.extra?.sessionMode}
            cachedConfigOptions={conversation.extra?.cachedConfigOptions}
            agentName={assistantDisplayName}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
            hideSendBox={hideSendBox}
          ></AcpChat>
        );
      case 'codex':
        return (
          <CodexChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            sessionMode={conversation.extra?.sessionMode}
            cachedConfigOptions={conversation.extra?.cachedConfigOptions}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
            hideSendBox={hideSendBox}
          />
        );
      case 'openclaw-gateway':
        return (
          <OpenClawChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
          />
        );
      case 'nanobot':
        return (
          <NanobotChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
          />
        );
      case 'remote':
        return (
          <RemoteChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
          />
        );
      default:
        return null;
    }
  }, [conversation, isGeminiConversation, isAionrsConversation, assistantDisplayName, hideSendBox]);

  const sliderTitle = useMemo(() => {
    return (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{t('conversation.workspace.title')}</span>
      </div>
    );
  }, [t]);

  // For ACP conversations, use AcpModelSelector that can show/switch models.
  // For other non-Gemini conversations, show disabled GeminiModelSelector.
  // NOTE: This must be placed before the Gemini early return to maintain consistent hook order.
  const modelSelector = useMemo(() => {
    if (!conversation || isGeminiConversation || isAionrsConversation) return undefined;
    if (conversation.type === 'acp') {
      const extra = conversation.extra as { backend?: string; currentModelId?: string };
      return (
        <AcpModelSelector
          conversationId={conversation.id}
          backend={extra.backend}
          initialModelId={extra.currentModelId}
        />
      );
    }
    if (conversation.type === 'codex') {
      const extra = conversation.extra as { codexModel?: string; currentModelId?: string };
      return (
        <AcpModelSelector
          conversationId={conversation.id}
          backend='codex'
          initialModelId={extra.currentModelId || extra.codexModel}
        />
      );
    }
    return <GeminiModelSelector disabled={true} />;
  }, [conversation, isGeminiConversation, isAionrsConversation]);

  if (conversation && conversation.type === 'aionrs') {
    return <AionrsConversationPanel key={conversation.id} conversation={conversation} sliderTitle={sliderTitle} />;
  }

  if (conversation && conversation.type === 'gemini') {
    // Gemini 会话独立渲染，带右上角模型选择
    // Render Gemini layout with dedicated top-right model selector
    return (
      <GeminiConversationPanel
        key={conversation.id}
        conversation={conversation}
        sliderTitle={sliderTitle}
        hideSendBox={hideSendBox}
      />
    );
  }

  // 如果有预设助手信息，使用预设助手的 logo 和名称；加载中时不进入 fallback；否则使用 backend 的 logo
  // If preset assistant info exists, use preset logo/name; while loading, avoid fallback; otherwise use backend logo
  const chatLayoutProps = presetAssistantInfo
    ? {
        agentName: presetAssistantInfo.name,
        agentLogo: presetAssistantInfo.logo,
        agentLogoIsEmoji: presetAssistantInfo.isEmoji,
      }
    : isLoadingPreset
      ? {} // Still loading custom agents — avoid showing backend logo prematurely
      : {
          backend:
            conversation?.type === 'acp'
              ? conversation?.extra?.backend
              : conversation?.type === 'aionrs'
                ? 'aionrs'
                : conversation?.type === 'codex'
                  ? 'codex'
                  : conversation?.type === 'openclaw-gateway'
                    ? 'openclaw-gateway'
                    : conversation?.type === 'nanobot'
                      ? 'nanobot'
                      : conversation?.type === 'remote'
                        ? 'remote'
                        : undefined,
          agentName: conversationAgentName,
        };

  const headerExtraNode = (
    <div className='flex items-center gap-8px'>
      {conversation?.type === 'openclaw-gateway' && (
        <div className='shrink-0'>
          <StarOfficeMonitorCard
            conversationId={conversation.id}
            onOpenUrl={(url, metadata) => {
              openPreview(url, 'url', metadata);
            }}
          />
        </div>
      )}
      {conversation && (
        <div className='shrink-0'>
          <CronJobManager
            conversationId={conversation.id}
            cronJobId={conversation.extra?.cronJobId as string | undefined}
          />
        </div>
      )}
      {conversation ? (
        <div className='shrink-0'>
          <WorkspaceEditorLauncher conversation={conversation} />
        </div>
      ) : null}
    </div>
  );

  return (
    <ChatLayout
      title={conversation?.name}
      {...chatLayoutProps}
      headerLeft={modelSelector}
      headerExtra={headerExtraNode}
      siderTitle={sliderTitle}
      sider={<ChatSider conversation={conversation} />}
      workspaceEnabled={workspaceEnabled}
      workspacePath={conversation?.extra?.workspace}
      conversationId={conversation?.id}
    >
      {conversationNode}
    </ChatLayout>
  );
};

export default ChatConversation;
