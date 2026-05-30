/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText } from '@/common/chat/chatLib';
import { AIONUI_FILES_MARKER } from '@/common/config/constants';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { iconColors } from '@/renderer/styles/colors';
import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import type { TChatConversation } from '@/common/config/storage';
import AionModal from '@/renderer/components/base/AionModal';
import { useRemoveMessageByMsgId } from '@/renderer/pages/conversation/Messages/hooks';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { Alert, Button, Message, Tooltip } from '@arco-design/web-react';
import { Branch, Copy, Delete, Undo } from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { emitter } from '@/renderer/utils/emitter';
import { copyText } from '@/renderer/utils/ui/clipboard';
import CollapsibleContent from '@renderer/components/chat/CollapsibleContent';
import FilePreview from '@renderer/components/media/FilePreview';
import HorizontalFileList from '@renderer/components/media/HorizontalFileList';
import MarkdownView from '@renderer/components/Markdown';
import { stripThinkTags, hasThinkTags } from '@renderer/utils/chat/thinkTagFilter';
import { stripSkillSuggest, hasSkillSuggest } from '@renderer/utils/chat/skillSuggestParser';

/**
 * Format a timestamp for message display.
 * Today: "HH:mm", older: "MM-DD HH:mm".
 */
export const formatMessageTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  if (
    date.getFullYear() !== now.getFullYear() ||
    date.getMonth() !== now.getMonth() ||
    date.getDate() !== now.getDate()
  ) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${month}-${day} ${time}`;
  }
  return time;
};
import MessageCronBadge from './MessageCronBadge';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import TeammateMessageAvatar from './TeammateMessageAvatar';

const CODE_STYLE = { marginTop: 4, marginBlock: 4 };

const parseFileMarker = (content: string) => {
  const markerIndex = content.indexOf(AIONUI_FILES_MARKER);
  if (markerIndex === -1) {
    return { text: content, files: [] as string[] };
  }
  const text = content.slice(0, markerIndex).trimEnd();
  const afterMarker = content.slice(markerIndex + AIONUI_FILES_MARKER.length).trim();
  const files = afterMarker
    ? afterMarker
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return { text, files };
};

const isAbsoluteMessageFilePath = (file_path: string): boolean =>
  file_path.startsWith('/') || /^[A-Za-z]:/.test(file_path);

export const resolveMessageFilePath = (file_path: string, workspace?: string): string => {
  if (!file_path || isAbsoluteMessageFilePath(file_path) || !workspace) {
    return file_path;
  }

  const normalizedWorkspace = workspace.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  const normalizedFilePath = file_path.replace(/^\.?[\\/]+/, '').replace(/\\/g, '/');
  return `${normalizedWorkspace}/${normalizedFilePath}`.replace(/\/+/g, '/');
};

const useFormatContent = (content: string) => {
  return useMemo(() => {
    try {
      const json = JSON.parse(content);
      const isJson = typeof json === 'object';
      return {
        json: isJson,
        data: isJson ? json : content,
      };
    } catch {
      return { data: content };
    }
  }, [content]);
};

const MessageText: React.FC<{ message: IMessageText }> = ({ message }) => {
  // Filter think tags from content before rendering
  // 在渲染前过滤 think 标签
  const contentToRender = useMemo(() => {
    let content = message.content.content;
    if (typeof content === 'string') {
      if (hasThinkTags(content)) {
        content = stripThinkTags(content);
      }
      // Strip any inline [SKILL_SUGGEST] blocks (now handled via separate skill_suggest message type)
      if (hasSkillSuggest(content)) {
        content = stripSkillSuggest(content);
      }
      return content;
    }
    return content;
  }, [message.content.content]);

  const { text, files } = parseFileMarker(contentToRender);
  const { data, json } = useFormatContent(text);
  const { t } = useTranslation();
  const [showCopyAlert, setShowCopyAlert] = useState(false);
  const isUserMessage = message.position === 'right';
  const isTeammateMessage = message.position === 'left' && message.content.teammateMessage === true;
  const shouldRenderPlainText = isUserMessage;
  const conversationContext = useConversationContextSafe();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const resolvedFiles = useMemo(
    () => files.map((file_path) => resolveMessageFilePath(file_path, conversationContext?.workspace)),
    [conversationContext?.workspace, files]
  );

  // Rules of Hooks: every hook must run unconditionally before any early
  // return. A streaming assistant message transitions empty → non-empty
  // between renders; if these hooks lived below the empty-content guard the
  // hook count would change between renders and React would crash the whole
  // renderer ("rendered more hooks than during the previous render" → white
  // screen). Keep all hook calls above the guard.
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 过滤空内容，避免渲染空DOM
  if (!message.content.content || (typeof message.content.content === 'string' && !message.content.content.trim())) {
    return null;
  }

  const handleCopy = () => {
    const baseText = shouldRenderPlainText ? text : json ? JSON.stringify(data, null, 2) : text;
    const fileList = files.length ? `Files:\n${files.map((path) => `- ${path}`).join('\n')}\n\n` : '';
    const textToCopy = fileList + baseText;
    copyText(textToCopy)
      .then(() => {
        setShowCopyAlert(true);
        setTimeout(() => setShowCopyAlert(false), 2000);
      })
      .catch(() => {
        Message.error(t('common.copyFailed'));
      });
  };

  const copyButton = (
    <Tooltip content={t('common.copy', { defaultValue: 'Copy' })}>
      <div
        className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
        onClick={handleCopy}
        style={{ lineHeight: 0 }}
      >
        <Copy theme='outline' size='16' fill={iconColors.secondary} />
      </div>
    </Tooltip>
  );

  // M07: delete a user message on remote OpenCode conversations. The backend
  // resolves the OpenCode messageID from the local row id (`msg_id`), deletes it
  // server-side, removes the local row, and broadcasts `message.removed`.
  const canDeleteRemote = conversationContext?.type === 'remote' && isUserMessage && Boolean(message.msg_id);

  // M02: revert the remote session to this message (reversible via the header
  // "Restore reverted" action).
  const handleRevertToHere = async () => {
    const msgId = message.msg_id;
    const conversationId = conversationContext?.conversation_id;
    if (!msgId || !conversationId) return;
    try {
      await ipcBridge.conversation.revertRemoteSession.invoke({ conversation_id: conversationId, message_id: msgId });
      Message.success(t('messages.revertSuccess', { defaultValue: 'Reverted to this message' }));
    } catch (error) {
      Message.error(t('messages.revertFailed', { defaultValue: 'Failed to revert' }));
      console.error('[MessageText] revertRemoteSession failed:', error);
    }
  };

  // M01: fork the remote session from this message into a new conversation.
  const handleForkFromHere = async () => {
    const msgId = message.msg_id;
    const conversationId = conversationContext?.conversation_id;
    if (!msgId || !conversationId) return;
    try {
      const { session_id } = await ipcBridge.conversation.forkRemoteSession.invoke({
        conversation_id: conversationId,
        message_id: msgId,
      });
      const source = await getConversationOrNull(conversationId);
      if (!source) {
        Message.error(t('messages.forkFailed', { defaultValue: 'Failed to fork' }));
        return;
      }
      const id = uuid();
      const created = await ipcBridge.conversation.createWithConversation.invoke({
        conversation: {
          ...source,
          id,
          name: t('conversation.session.forkName', { name: source.name, defaultValue: `Fork of ${source.name}` }),
          created_at: Date.now(),
          modified_at: Date.now(),
          extra: { ...source.extra, sessionKey: session_id, history_loaded: false },
        } as unknown as TChatConversation,
        preserve_session_key: true,
      });
      void navigate(`/conversation/${created.id}`);
      emitter.emit('chat.history.refresh');
      Message.success(t('messages.forkSuccess', { defaultValue: 'Forked session' }));
    } catch (error) {
      Message.error(t('messages.forkFailed', { defaultValue: 'Failed to fork' }));
      console.error('[MessageText] forkRemoteSession failed:', error);
    }
  };
  const confirmDeleteRemote = async () => {
    const msgId = message.msg_id;
    const conversationId = conversationContext?.conversation_id;
    if (!msgId || !conversationId) return;
    setDeleting(true);
    try {
      await ipcBridge.conversation.deleteRemoteMessage.invoke({ conversation_id: conversationId, message_id: msgId });
      removeMessageByMsgId(msgId);
      Message.success(t('messages.deleteMessageSuccess'));
      setDeleteOpen(false);
    } catch (error) {
      Message.error(t('messages.deleteMessageFailed'));
      console.error('[MessageText] deleteRemoteMessage failed:', error);
    } finally {
      setDeleting(false);
    }
  };

  const deleteButton = canDeleteRemote ? (
    <Tooltip content={t('common.delete', { defaultValue: 'Delete' })}>
      <div
        className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
        onClick={() => setDeleteOpen(true)}
        style={{ lineHeight: 0 }}
      >
        <Delete theme='outline' size='16' fill={iconColors.secondary} />
      </div>
    </Tooltip>
  ) : null;

  const revertButton = canDeleteRemote ? (
    <Tooltip content={t('messages.revertToHere', { defaultValue: 'Revert to here' })}>
      <div
        className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
        onClick={() => void handleRevertToHere()}
        style={{ lineHeight: 0 }}
      >
        <Undo theme='outline' size='16' fill={iconColors.secondary} />
      </div>
    </Tooltip>
  ) : null;

  const forkButton = canDeleteRemote ? (
    <Tooltip content={t('messages.forkFromHere', { defaultValue: 'Fork from here' })}>
      <div
        className='p-4px rd-4px cursor-pointer hover:bg-3 transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
        onClick={() => void handleForkFromHere()}
        style={{ lineHeight: 0 }}
      >
        <Branch theme='outline' size='16' fill={iconColors.secondary} />
      </div>
    </Tooltip>
  ) : null;

  const deleteModal = canDeleteRemote ? (
    <AionModal
      visible={deleteOpen}
      size='small'
      style={{ width: 420, height: 'auto' }}
      header={{ title: t('messages.deleteMessageTitle'), showClose: true }}
      contentStyle={{ padding: '20px 24px 0' }}
      onCancel={() => !deleting && setDeleteOpen(false)}
      footer={{
        render: () => (
          <div className='flex justify-end gap-10px pt-20px'>
            <Button className='px-20px min-w-80px' style={{ borderRadius: 8 }} onClick={() => setDeleteOpen(false)}>
              {t('conversation.history.cancelDelete')}
            </Button>
            <Button
              type='primary'
              status='warning'
              loading={deleting}
              className='px-20px min-w-80px'
              style={{ borderRadius: 8 }}
              onClick={() => void confirmDeleteRemote()}
            >
              {t('conversation.history.confirmDelete')}
            </Button>
          </div>
        ),
      }}
    >
      <div className='text-14px leading-22px text-t-secondary'>{t('messages.deleteMessageConfirm')}</div>
    </AionModal>
  ) : null;

  const cronMeta = message.content.cronMeta;
  const senderName = message.content.senderName;
  const senderAgentType = message.content.senderAgentType;
  const senderConversationId = message.content.senderConversationId;
  const fallbackBackendLogo = senderAgentType ? getAgentLogo(senderAgentType) : null;

  return (
    <>
      <div className={classNames('min-w-0 flex flex-col group', isUserMessage ? 'items-end' : 'items-start')}>
        {cronMeta && <MessageCronBadge meta={cronMeta} />}
        {isTeammateMessage && senderName && (
          <div className='flex items-center gap-6px mb-4px'>
            <TeammateMessageAvatar
              senderName={senderName}
              senderConversationId={senderConversationId}
              backendLogo={fallbackBackendLogo}
            />
            <span className='text-12px text-t-secondary'>{senderName}</span>
          </div>
        )}
        {files.length > 0 && (
          <div className={classNames('mt-6px', { 'self-end': isUserMessage })}>
            {resolvedFiles.length === 1 ? (
              <div className='flex items-center'>
                <FilePreview path={resolvedFiles[0]} onRemove={() => undefined} readonly />
              </div>
            ) : (
              <HorizontalFileList>
                {resolvedFiles.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => undefined} readonly />
                ))}
              </HorizontalFileList>
            )}
          </div>
        )}
        <div
          className={classNames('min-w-0 [&>p:first-child]:mt-0px [&>p:last-child]:mb-0px md:max-w-1100px', {
            'bg-aou-2 p-4px md:p-6px': isUserMessage || cronMeta,
            'bg-3 p-4px md:p-6px': isTeammateMessage,
            'w-full': !(isUserMessage || cronMeta || isTeammateMessage),
          })}
          style={{
            ...(isUserMessage || cronMeta
              ? { borderRadius: '8px 0 8px 8px', color: 'var(--text-primary)' }
              : isTeammateMessage
                ? { borderRadius: '0 8px 8px 8px' }
                : undefined),
          }}
        >
          {/* JSON 内容使用折叠组件 Use CollapsibleContent for JSON content */}
          {shouldRenderPlainText ? (
            <div className='whitespace-pre-wrap break-words' data-testid='message-text-content'>
              {text}
            </div>
          ) : json ? (
            <CollapsibleContent maxHeight={200} defaultCollapsed={true}>
              <div data-testid='message-text-content'>
                <MarkdownView
                  codeStyle={CODE_STYLE}
                >{`\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``}</MarkdownView>
              </div>
            </CollapsibleContent>
          ) : (
            <div data-testid='message-text-content'>
              <MarkdownView codeStyle={CODE_STYLE}>{data}</MarkdownView>
            </div>
          )}
        </div>
        {!isUserMessage && message.content.model?.providerId && message.content.model?.modelId && (
          <div className='text-12px op-50 mt-2px font-mono select-text leading-none'>
            {message.content.model.providerId}/{message.content.model.modelId}
          </div>
        )}
        {/* Hover-revealed copy + timestamp row. Mobile has no hover affordance,
            so we drop the row entirely — system-level long-press still copies. */}
        {!isMobile && (
          <div
            className={classNames('h-20px flex items-center mt-2px gap-8px', {
              'flex-row-reverse': isUserMessage,
            })}
          >
            {copyButton}
            {revertButton}
            {forkButton}
            {deleteButton}
            {message.created_at && (
              <span className='text-12px text-t-secondary opacity-0 group-hover:opacity-100 transition-opacity select-none'>
                {formatMessageTime(message.created_at)}
              </span>
            )}
          </div>
        )}
      </div>
      {showCopyAlert && (
        <Alert
          type='success'
          content={t('messages.copySuccess')}
          showIcon
          className='fixed top-20px left-50% transform -translate-x-50% z-9999 w-max max-w-[80%]'
          style={{ boxShadow: '0px 2px 12px rgba(0,0,0,0.12)' }}
          closable={false}
        />
      )}
      {deleteModal}
    </>
  );
};

export default MessageText;
