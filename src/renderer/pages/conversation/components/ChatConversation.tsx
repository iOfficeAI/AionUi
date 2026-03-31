/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import addChatIcon from '@/renderer/assets/icons/add-chat.svg';
import { CronJobManager } from '@/renderer/pages/cron';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip, Typography } from '@arco-design/web-react';
import { History } from '@icon-park/react';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { emitter } from '../../../utils/emitter';
import AcpChat from '../platforms/acp/AcpChat';
import ChatLayout from './ChatLayout';
import ChatSider from './ChatSider';
import CodexChat from '../platforms/codex/CodexChat';
import NanobotChat from '../platforms/nanobot/NanobotChat';
import OpenClawChat from '../platforms/openclaw/OpenClawChat';
import RemoteChat from '../platforms/remote/RemoteChat';
import GeminiChat from '../platforms/gemini/GeminiChat';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import GeminiModelSelector from '../platforms/gemini/GeminiModelSelector';
import { useGeminiModelSelection } from '../platforms/gemini/useGeminiModelSelection';
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

// 仅抽取 Gemini 会话，确保包含模型信息
// Narrow to Gemini conversations so model field is always available
type GeminiConversation = Extract<TChatConversation, { type: 'gemini' }>;

const GeminiConversationPanel: React.FC<{ conversation: GeminiConversation; sliderTitle: React.ReactNode }> = ({
  conversation,
  sliderTitle,
}) => {
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
  const workspaceEnabled = Boolean(conversation.extra?.workspace);

  // 使用统一的 Hook 获取预设助手信息 / Use unified hook for preset assistant info
  const { info: presetAssistantInfo } = usePresetAssistantInfo(conversation);

  const chatLayoutProps = {
    title: conversation.name,
    siderTitle: sliderTitle,
    sider: <ChatSider conversation={conversation} />,
    headerLeft: <GeminiModelSelector selection={modelSelection} />,
    headerExtra: <CronJobManager conversationId={conversation.id} />,
    workspaceEnabled,
    backend: 'gemini' as const,
    // 传递预设助手信息 / Pass preset assistant info
    agentName: presetAssistantInfo?.name,
    agentLogo: presetAssistantInfo?.logo,
    agentLogoIsEmoji: presetAssistantInfo?.isEmoji,
  };

  return (
    <ChatLayout {...chatLayoutProps} conversationId={conversation.id}>
      <GeminiChat
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        modelSelection={modelSelection}
      />
    </ChatLayout>
  );
};

const ChatConversation: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const workspaceEnabled = Boolean(conversation?.extra?.workspace);

  const isGeminiConversation = conversation?.type === 'gemini';

  const conversationNode = useMemo(() => {
    if (!conversation || isGeminiConversation) return null;
    switch (conversation.type) {
      case 'acp':
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            backend={conversation.extra?.backend || 'claude'}
            sessionMode={conversation.extra?.sessionMode}
            agentName={(conversation.extra as { agentName?: string })?.agentName}
          ></AcpChat>
        );
      case 'codex': // Legacy: new Codex conversations use ACP protocol. Kept for existing sessions.
        return (
          <CodexChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
          />
        );
      case 'openclaw-gateway':
        return (
          <OpenClawChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
          />
        );
      case 'nanobot':
        return (
          <NanobotChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
          />
        );
      case 'remote':
        return (
          <RemoteChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
          />
        );
      default:
        return null;
    }
  }, [conversation, isGeminiConversation]);

  // 使用统一的 Hook 获取预设助手信息（ACP/Codex 会话）
  // Use unified hook for preset assistant info (ACP/Codex conversations)
  const { info: presetAssistantInfo, isLoading: isLoadingPreset } = usePresetAssistantInfo(
    isGeminiConversation ? undefined : conversation
  );

  const sliderTitle = useMemo(() => {
    return (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{t('conversation.workspace.title')}</span>
      </div>
    );
  }, [t]);

  // For ACP/Codex conversations, use AcpModelSelector that can show/switch models.
  // For other non-Gemini conversations, show disabled GeminiModelSelector.
  // NOTE: This must be placed before the Gemini early return to maintain consistent hook order.
  const modelSelector = useMemo(() => {
    if (!conversation || isGeminiConversation) return undefined;
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
      return <AcpModelSelector conversationId={conversation.id} />;
    }
    return <GeminiModelSelector disabled={true} />;
  }, [conversation, isGeminiConversation]);

  if (conversation && conversation.type === 'gemini') {
    // Gemini 会话独立渲染，带右上角模型选择
    // Render Gemini layout with dedicated top-right model selector
    return <GeminiConversationPanel key={conversation.id} conversation={conversation} sliderTitle={sliderTitle} />;
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
              : conversation?.type === 'codex'
                ? 'codex'
                : conversation?.type === 'openclaw-gateway'
                  ? 'openclaw-gateway'
                  : conversation?.type === 'nanobot'
                    ? 'nanobot'
                    : conversation?.type === 'remote'
                      ? 'remote'
                      : undefined,
          agentName: (conversation?.extra as { agentName?: string })?.agentName,
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
      {conversation ? (
        <div className='shrink-0'>
          <CronJobManager conversationId={conversation.id} />
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
      conversationId={conversation?.id}
    >
      {conversationNode}
    </ChatLayout>
  );
};

export default ChatConversation;
