/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isSideConversationSupported } from '@/common/chat/sideConversation';
import type { IConversationMcpStatus, IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import addChatIcon from '@/renderer/assets/icons/add-chat.svg';
import { CronJobManager } from '@/renderer/pages/cron';
import { resolveCronJobId } from '@/renderer/pages/cron/cronUtils';
import { classifyConfigSetError, useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Message, Tooltip, Typography } from '@arco-design/web-react';
import { History } from '@icon-park/react';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { emitter } from '../../../utils/emitter';
import ChatLayout from './ChatLayout';
import ChatSlider from './ChatSlider.tsx';
import { SideConversationControlProvider } from '@/renderer/pages/conversation/context/SideConversationControlContext';
import { SideConversationDock, useSideConversation } from './SideConversationPanel';
import { renderPlatformChat } from './renderPlatformChat';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import GoogleModelSelector from '../platforms/gemini/GoogleModelSelector';
import AionrsChat from '../platforms/aionrs/AionrsChat';
import AionrsModelSelector from '../platforms/aionrs/AionrsModelSelector';
import { useAionrsModelSelection } from '../platforms/aionrs/useAionrsModelSelection';
import { useConversationRuntimeView } from '../runtime/useConversationRuntimeView';
import { isLegacyReadOnlyConversationType } from '../utils/conversationRuntime';
import { resolveConversationBackend } from '../utils/conversationAssistantIdentity';
import LegacyReadOnlyConversation from '../platforms/legacy/LegacyReadOnlyConversation';
import { useActiveLease } from '../hooks/useActiveLease';
// import SkillRuleGenerator from './components/SkillRuleGenerator'; // Temporarily hidden

const configErrorMessageKey = (error: unknown) => {
  const errorKind = classifyConfigSetError(error);
  if (errorKind === 'command_ack') return 'agent.config.commandAck';
  if (errorKind === 'confirmation_timeout') return 'agent.config.timeout';
  if (errorKind === 'config_update_in_progress') return 'agent.config.busy';
  return 'agent.config.failed';
};

const SIDE_PARENT_STUB = {
  id: '',
  type: 'acp',
  name: '',
  created_at: 0,
  modified_at: 0,
  extra: { backend: 'claude' },
  model: { id: 'stub', platform: 'stub', name: 'stub', base_url: '', api_key: '', use_model: 'stub' },
} as TChatConversation;

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
            // Fetch latest conversation from DB to ensure session_mode is current
            const latest = await getConversationOrNull(conversation.id);
            const source = latest || conversation;
            await ipcBridge.conversation.createWithConversation.invoke({
              conversation: {
                ...source,
                id,
                created_at: Date.now(),
                modified_at: Date.now(),
                // Clear ACP session fields to prevent new conversation from inheriting old session context
                extra:
                  source.type === 'acp'
                    ? { ...source.extra, acp_session_id: undefined, acp_session_updated_at: undefined }
                    : source.extra,
              } as TChatConversation,
            });
            void navigate(`/conversation/${id}`);
            emitter.emit('chat.history.refresh');
          } catch (error) {
            console.error('Failed to create conversation:', error);
            Message.error(getConversationCreateErrorMessage(error, t));
          } finally {
            isCreatingRef.current = false;
          }
        }}
      />
    </Tooltip>
  );
};

type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;

const AionrsConversationPanel: React.FC<{ conversation: AionrsConversation; sliderTitle: React.ReactNode }> = ({
  conversation,
  sliderTitle,
}) => {
  const { t } = useTranslation();
  const runtimeView = useConversationRuntimeView(conversation.id);
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, use_model: modelName } as TProviderWithModel;
      // Kill running agent on model switch — will be rebuilt with new model on next message
      if (runtimeView.activeTurnId) {
        const result = await ipcBridge.conversation.stop.invoke({
          conversation_id: conversation.id,
          turn_id: runtimeView.activeTurnId,
        });
        runtimeView.markStopAcknowledged(runtimeView.activeTurnId, result.runtime);
      }
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversation.id, runtimeView]
  );

  const modelSelection = useAionrsModelSelection({
    initialModel: conversation.model,
    onSelectModel,
  });
  const workspaceEnabled = Boolean(conversation.extra?.workspace);
  const cronJobId = resolveCronJobId(conversation.extra);
  const { info: presetAssistantInfo } = usePresetAssistantInfo(conversation);
  const aionrsAssistantId = presetAssistantInfo?.assistantId;
  const layout = useLayoutContext();
  // Mobile: model selection moved into the sendbox `+` action sheet to free up
  // header space; the dropdown stays available on desktop and tablets ≥768px.
  const isMobile = Boolean(layout?.isMobile);
  const runtimeConfig = useAcpConfigOptions({
    conversation_id: conversation.id,
    enabled: !isMobile,
  });
  const handleThoughtLevelSetOption = useCallback(
    async (optionId: string, value: string) => {
      try {
        const result = await runtimeConfig.setConfigOption(optionId, value);
        Message.success(t('agent.thoughtLevel.switchSuccess'));
        return result;
      } catch (error) {
        Message.error(t(configErrorMessageKey(error)));
        throw error;
      }
    },
    [runtimeConfig, t]
  );

  const side = useSideConversation({
    parent: conversation,
    initialChildId: conversation.extra?.side_conversation_id,
  });
  const enableSide = !isMobile && isSideConversationSupported({ type: 'aionrs' });
  const sideDockOpen = side.state === 'empty' || side.state === 'active' || side.state === 'promoted';
  const sideCollapsed = side.state === 'collapsed' && side.tabs.length > 0;
  const sideControlValue = useMemo(
    () => ({
      enableSide,
      onOpenSide: (firstQuestion?: string) => {
        const trimmed = firstQuestion?.trim();
        if (trimmed) {
          void side.openNewTab(trimmed);
          return;
        }
        if (side.tabs.length > 0) {
          void side.openNewTab();
          return;
        }
        void side.open();
      },
      onAskInSide: (text: string) => {
        void side.fillComposer(text);
      },
      sideCollapsed,
      onReopenSide: () => {
        side.reopen();
      },
    }),
    [enableSide, side, sideCollapsed]
  );
  const sideDock = side.childId ? (
    <SideConversationDock
      childId={side.childId}
      tabs={side.tabs}
      activeTabId={side.activeTabId}
      onSelectTab={side.selectTab}
      onCloseTab={(id) => {
        void side.discardTab(id);
      }}
      onNewTab={() => {
        void side.openNewTab();
      }}
      onCollapse={side.collapse}
    />
  ) : null;

  const chatLayoutProps = {
    title: conversation.name,
    siderTitle: sliderTitle,
    sider: <ChatSlider conversation={conversation} />,
    headerExtra: (
      <div className='flex items-center gap-8px'>
        <CronJobManager conversation_id={conversation.id} cron_job_id={cronJobId} />
        {!isMobile && (
          <AionrsModelSelector
            selection={modelSelection}
            thoughtLevel={runtimeConfig.thoughtLevel}
            setStatus={runtimeConfig.setStatus}
            onSetThoughtLevel={handleThoughtLevelSetOption}
          />
        )}
        {sideCollapsed && enableSide && (
          <Button size='small' type='text' className='side-btn-text' onClick={() => side.reopen()}>
            {t('conversation.sideConversation.reopen')}
          </Button>
        )}
      </div>
    ),
    workspaceEnabled,
    workspacePath: conversation.extra?.workspace,
    isTemporaryWorkspace: (conversation.extra as { is_temporary_workspace?: boolean } | undefined)
      ?.is_temporary_workspace,
    backend: 'aionrs' as const,
    presetAssistant: presetAssistantInfo ? { ...presetAssistantInfo, id: aionrsAssistantId } : undefined,
  };

  return (
    <SideConversationControlProvider value={sideControlValue}>
      <ChatLayout
        {...chatLayoutProps}
        conversation_id={conversation.id}
        sideDockOpen={sideDockOpen}
        sideDock={sideDock}
      >
        <AionrsChat
          conversation_id={conversation.id}
          workspace={conversation.extra.workspace}
          modelSelection={modelSelection}
          session_mode={conversation.extra?.session_mode}
          cron_job_id={cronJobId}
          loadedSkills={(conversation.extra as { skills?: string[] } | undefined)?.skills}
          loadedMcpServers={(conversation.extra as { mcp_servers?: string[] } | undefined)?.mcp_servers}
          loadedMcpStatuses={
            (conversation.extra as { mcp_statuses?: IConversationMcpStatus[] } | undefined)?.mcp_statuses
          }
          agent_name={presetAssistantInfo?.name}
          assistantId={aionrsAssistantId}
        />
      </ChatLayout>
    </SideConversationControlProvider>
  );
};

const ChatConversation: React.FC<{
  conversation?: TChatConversation;
  hideSendBox?: boolean;
}> = ({ conversation, hideSendBox }) => {
  const { t } = useTranslation();
  useActiveLease({ type: 'conversation', id: conversation?.id });
  const workspaceEnabled = Boolean(conversation?.extra?.workspace);
  const cronJobId = resolveCronJobId(conversation?.extra);
  const layout = useLayoutContext();
  const isMobile = Boolean(layout?.isMobile);

  const isAionrsConversation = conversation?.type === 'aionrs';
  const isLegacyReadOnlyConversation = isLegacyReadOnlyConversationType(conversation?.type);
  const resolvedHideSendBox = hideSendBox || isLegacyReadOnlyConversationType(conversation?.type);

  // 使用统一的 Hook 获取预设助手信息（ACP/Codex 会话）
  // Use unified hook for preset assistant info (ACP/Codex conversations)
  const acpConversation = isAionrsConversation ? undefined : conversation;
  const { info: presetAssistantInfo, isLoading: isLoadingPreset } = usePresetAssistantInfo(acpConversation);
  const acpAssistantId = presetAssistantInfo?.assistantId;
  const resolvedConversationBackend = resolveConversationBackend(conversation, presetAssistantInfo?.backend);

  const conversationAgentName = (conversation?.extra as { agent_name?: string } | undefined)?.agent_name;
  const assistantDisplayName = presetAssistantInfo?.name || conversationAgentName;

  const initialSideChildId = conversation?.extra?.side_conversation_id;
  const side = useSideConversation({
    parent: conversation ?? SIDE_PARENT_STUB,
    initialChildId: initialSideChildId,
  });

  const sideBackend =
    conversation?.type === 'acp' ? resolvedConversationBackend : conversation?.type === 'codex' ? 'codex' : undefined;
  const enableSide = Boolean(
    conversation &&
    !isMobile &&
    isSideConversationSupported({
      type: conversation.type,
      backend: sideBackend,
    })
  );

  const sideDockOpen = side.state === 'empty' || side.state === 'active' || side.state === 'promoted';
  const sideCollapsed = side.state === 'collapsed' && side.tabs.length > 0;

  const sideControlValue = useMemo(
    () => ({
      enableSide,
      onOpenSide: (firstQuestion?: string) => {
        const trimmed = firstQuestion?.trim();
        if (trimmed) {
          void side.openNewTab(trimmed);
          return;
        }
        if (side.tabs.length > 0) {
          void side.openNewTab();
          return;
        }
        void side.open();
      },
      onAskInSide: (text: string) => {
        void side.fillComposer(text);
      },
      sideCollapsed,
      onReopenSide: () => {
        side.reopen();
      },
    }),
    [enableSide, side, sideCollapsed]
  );

  const sideDock =
    side.childId && conversation ? (
      <SideConversationDock
        childId={side.childId}
        tabs={side.tabs}
        activeTabId={side.activeTabId}
        onSelectTab={side.selectTab}
        onCloseTab={(id) => {
          void side.discardTab(id);
        }}
        onNewTab={() => {
          void side.openNewTab();
        }}
        onCollapse={side.collapse}
      />
    ) : null;

  const conversationNode = useMemo(() => {
    if (!conversation || isAionrsConversation) return null;
    if (isLegacyReadOnlyConversation) {
      return <LegacyReadOnlyConversation key={conversation.id} conversation={conversation} />;
    }
    return renderPlatformChat({
      conversation,
      assistantDisplayName,
      hideSendBox: resolvedHideSendBox,
      backend: resolvedConversationBackend,
      cronJobId,
      assistantId: acpAssistantId,
    });
  }, [
    conversation,
    isAionrsConversation,
    isLegacyReadOnlyConversation,
    resolvedConversationBackend,
    assistantDisplayName,
    cronJobId,
    resolvedHideSendBox,
    acpAssistantId,
  ]);

  const sliderTitle = useMemo(() => {
    return (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{t('conversation.workspace.title')}</span>
      </div>
    );
  }, [t]);

  // For ACP/Codex conversations, use AcpModelSelector that can show/switch models.
  // For other conversations, show disabled model selector.
  // Mobile: model selection moves into the sendbox `+` action sheet, so the
  // header selector is suppressed to free up vertical space.
  const modelSelector = useMemo(() => {
    if (!conversation || isAionrsConversation) return undefined;
    if (isMobile) return undefined;
    if (isLegacyReadOnlyConversation) return undefined;
    if (conversation.type === 'acp') {
      const extra = conversation.extra as { current_model_id?: string };
      return (
        <AcpModelSelector
          conversation_id={conversation.id}
          backend={resolvedConversationBackend}
          initialModelId={extra.current_model_id}
          waitForWarmup
        />
      );
    }
    return <GoogleModelSelector disabled={true} />;
  }, [conversation, isAionrsConversation, isMobile, isLegacyReadOnlyConversation, resolvedConversationBackend]);

  if (conversation && conversation.type === 'aionrs') {
    return <AionrsConversationPanel key={conversation.id} conversation={conversation} sliderTitle={sliderTitle} />;
  }

  // 如果有预设助手信息，使用预设助手的 logo 和名称；加载中时不进入 fallback；否则使用 backend 的 logo
  // If preset assistant info exists, use preset logo/name; while loading, avoid fallback; otherwise use backend logo
  const chatLayoutProps = presetAssistantInfo
    ? {
        presetAssistant: { ...presetAssistantInfo, id: acpAssistantId },
      }
    : isLoadingPreset
      ? {} // Still loading custom agents — avoid showing backend logo prematurely
      : {
          backend: resolvedConversationBackend,
          agent_name: conversationAgentName,
        };

  const headerExtraNode = (
    <div className='flex items-center gap-8px'>
      {conversation && (
        <div className='shrink-0'>
          <CronJobManager conversation_id={conversation.id} cron_job_id={cronJobId} />
        </div>
      )}
      {modelSelector && <div className='shrink-0'>{modelSelector}</div>}
      {sideCollapsed && enableSide && (
        <Button size='mini' type='text' className='side-btn-text' onClick={() => side.reopen()}>
          {t('conversation.sideConversation.reopen')}
        </Button>
      )}
    </div>
  );

  return (
    <SideConversationControlProvider value={sideControlValue}>
      <ChatLayout
        title={conversation?.name}
        {...chatLayoutProps}
        headerExtra={headerExtraNode}
        siderTitle={sliderTitle}
        sider={<ChatSlider conversation={conversation} />}
        workspaceEnabled={workspaceEnabled}
        workspacePath={conversation?.extra?.workspace}
        isTemporaryWorkspace={
          (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)?.is_temporary_workspace
        }
        conversation_id={conversation?.id}
        sideDockOpen={sideDockOpen}
        sideDock={sideDock}
      >
        {conversationNode}
      </ChatLayout>
    </SideConversationControlProvider>
  );
};

export default ChatConversation;
