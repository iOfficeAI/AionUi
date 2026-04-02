/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import classNames from 'classnames';
import { Down } from '@icon-park/react';
import { Input, Message, Modal } from '@arco-design/web-react';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import { isConversationPinned } from '@renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { useCronJobConversations } from '@renderer/pages/cron/useCronJobs';
import ConversationRow from '@renderer/pages/conversation/GroupedHistory/ConversationRow';

interface CronJobSiderItemProps {
  job: ICronJob;
  pathname: string;
  onNavigate: (path: string) => void;
  /** Pre-fetched conversation for existing mode (fetched by parent to avoid N+1 IPC) */
  existingConversation?: TChatConversation;
}

const CronJobSiderItem: React.FC<CronJobSiderItemProps> = ({
  job,
  pathname,
  onNavigate,
  existingConversation: existingConversationProp,
}) => {
  const { t } = useTranslation();
  const { id: currentConversationId } = useParams();
  const navigate = useNavigate();
  const isNewConversationMode = job.target.executionMode === 'new_conversation';
  const { conversations } = useCronJobConversations(isNewConversationMode ? job.id : undefined);

  // Unified child conversation list for both modes
  const childConversations = useMemo(() => {
    if (isNewConversationMode) return conversations;
    if (existingConversationProp) return [existingConversationProp];
    return [];
  }, [isNewConversationMode, conversations, existingConversationProp]);

  // Auto-expand when the current route matches this job or any child conversation
  const childConversationIds = useMemo(() => new Set(childConversations.map((c) => c.id)), [childConversations]);
  const isActiveChild = pathname.startsWith('/conversation/') && childConversationIds.has(pathname.split('/')[2]);
  const isActiveDetail = pathname === `/scheduled/${job.id}`;

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (isActiveChild || isActiveDetail) {
      setExpanded(true);
    }
  }, [isActiveChild, isActiveDetail]);

  // --- ConversationRow action state ---
  const [dropdownVisibleId, setDropdownVisibleId] = useState<string | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameModalName, setRenameModalName] = useState('');
  const [renameModalId, setRenameModalId] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);

  // --- ConversationRow action handlers ---
  const handleConversationClick = useCallback(
    (conv: TChatConversation) => {
      onNavigate(`/conversation/${conv.id}`);
    },
    [onNavigate]
  );

  const handleDelete = useCallback(
    (convId: string) => {
      Modal.confirm({
        title: t('conversation.history.deleteTitle'),
        content: t('conversation.history.deleteConfirm'),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            const success = await ipcBridge.conversation.remove.invoke({ id: convId });
            if (success) {
              emitter.emit('conversation.deleted', convId);
              emitter.emit('chat.history.refresh');
              Message.success(t('conversation.history.deleteSuccess'));
              if (currentConversationId === convId) {
                void navigate('/');
              }
            } else {
              Message.error(t('conversation.history.deleteFailed'));
            }
          } catch (err) {
            console.error('Failed to delete conversation:', err);
            Message.error(t('conversation.history.deleteFailed'));
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [t, currentConversationId, navigate]
  );

  const handleEditStart = useCallback((conv: TChatConversation) => {
    setRenameModalId(conv.id);
    setRenameModalName(conv.name);
    setRenameModalVisible(true);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameModalId || !renameModalName.trim()) return;
    setRenameLoading(true);
    try {
      const success = await ipcBridge.conversation.update.invoke({
        id: renameModalId,
        updates: { name: renameModalName.trim() },
      });
      if (success) {
        await refreshConversationCache(renameModalId);
        emitter.emit('chat.history.refresh');
        setRenameModalVisible(false);
        setRenameModalId(null);
        setRenameModalName('');
        Message.success(t('conversation.history.renameSuccess'));
      } else {
        Message.error(t('conversation.history.renameFailed'));
      }
    } catch (err) {
      console.error('Failed to rename conversation:', err);
      Message.error(t('conversation.history.renameFailed'));
    } finally {
      setRenameLoading(false);
    }
  }, [renameModalId, renameModalName, t]);

  const handleRenameCancel = useCallback(() => {
    setRenameModalVisible(false);
    setRenameModalId(null);
    setRenameModalName('');
  }, []);

  const handleTogglePin = useCallback(
    async (conv: TChatConversation) => {
      const pinned = isConversationPinned(conv);
      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conv.id,
          updates: {
            extra: {
              pinned: !pinned,
              pinnedAt: pinned ? undefined : Date.now(),
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          mergeExtra: true,
        });
        if (success) {
          emitter.emit('chat.history.refresh');
        } else {
          Message.error(t('conversation.history.pinFailed'));
        }
      } catch (err) {
        console.error('Failed to toggle pin:', err);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [t]
  );

  const handleMenuVisibleChange = useCallback((conversationId: string, visible: boolean) => {
    setDropdownVisibleId(visible ? conversationId : null);
  }, []);

  const handleOpenMenu = useCallback((conv: TChatConversation) => {
    setDropdownVisibleId(conv.id);
  }, []);

  const hasChildren = childConversations.length > 0;

  return (
    <div className='min-w-0 px-8px'>
      {/* Header - arrow toggles expand, text navigates to detail */}
      <div
        className={classNames(
          'flex items-center ml-2px gap-8px h-32px p-4px rd-4px transition-colors min-w-0',
          pathname === `/scheduled/${job.id}` ? 'bg-[rgba(var(--primary-6),0.12)]' : 'hover:bg-fill-3 active:bg-fill-4'
        )}
      >
        {/* Expand/collapse arrow */}
        {hasChildren && (
          <Down
            size={16}
            className={classNames(
              'line-height-0 transition-transform duration-200 flex-shrink-0 cursor-pointer',
              expanded ? 'rotate-0' : '-rotate-90'
            )}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }}
          />
        )}

        {/* Title - click to navigate to task detail */}
        <div
          className='flex-1 ml-6px min-w-0 overflow-hidden cursor-pointer'
          onClick={() => onNavigate(`/scheduled/${job.id}`)}
        >
          <div className='flex items-center gap-8px text-14px min-w-0'>
            <span className='font-medium truncate flex-1 text-t-primary min-w-0'>{job.name}</span>
          </div>
        </div>
      </div>

      {/* Child conversations using ConversationRow */}
      {expanded && hasChildren && (
        <div className='ml-8px'>
          <div className='flex flex-col gap-2px min-w-0 mt-4px'>
            {childConversations.map((conv) => (
              <ConversationRow
                key={conv.id}
                conversation={conv}
                isGenerating={false}
                hasCompletionUnread={false}
                collapsed={false}
                tooltipEnabled={false}
                batchMode={false}
                checked={false}
                selected={currentConversationId === conv.id}
                menuVisible={dropdownVisibleId === conv.id}
                onToggleChecked={() => {}}
                onConversationClick={handleConversationClick}
                onOpenMenu={handleOpenMenu}
                onMenuVisibleChange={handleMenuVisibleChange}
                onEditStart={handleEditStart}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
                getJobStatus={() => 'none'}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rename Modal */}
      <Modal
        title={t('conversation.history.renameTitle')}
        visible={renameModalVisible}
        onOk={() => void handleRenameConfirm()}
        onCancel={handleRenameCancel}
        okText={t('conversation.history.saveName')}
        cancelText={t('conversation.history.cancelEdit')}
        confirmLoading={renameLoading}
        okButtonProps={{ disabled: !renameModalName.trim() }}
        style={{ borderRadius: '12px' }}
        alignCenter
        getPopupContainer={() => document.body}
      >
        <Input
          autoFocus
          value={renameModalName}
          onChange={setRenameModalName}
          onPressEnter={() => void handleRenameConfirm()}
          placeholder={t('conversation.history.renamePlaceholder')}
          allowClear
        />
      </Modal>
    </div>
  );
};

export default CronJobSiderItem;
