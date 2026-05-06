/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Message, Modal } from '@arco-design/web-react';
import { Down, Right } from '@icon-park/react';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import CronJobSiderItem from './CronJobSiderItem';

interface CronJobSiderSectionProps {
  jobs: ICronJob[];
  pathname: string;
  onNavigate: (path: string) => void;
  batchMode?: boolean;
  onBatchModeChange?: (value: boolean) => void;
}

const CronJobSiderSection: React.FC<CronJobSiderSectionProps> = ({
  jobs,
  pathname,
  onNavigate,
  batchMode = false,
  onBatchModeChange,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(() => new Set());
  const [conversationIdsByJobId, setConversationIdsByJobId] = useState<Map<string, string[]>>(() => new Map());

  // Collect all conversation IDs that belong to cron jobs (for auto-expand detection)
  const cronConversationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const job of jobs) {
      if (job.metadata.conversationId) ids.add(job.metadata.conversationId);
    }
    return ids;
  }, [jobs]);

  // Auto-expand when navigating to a scheduled task detail or a cron-related conversation
  useEffect(() => {
    if (pathname.startsWith('/scheduled/')) {
      setExpanded(true);
      return;
    }
    if (pathname.startsWith('/conversation/')) {
      const convId = pathname.split('/')[2];
      if (!convId) return;
      // Expand for existing-mode conversations (direct match)
      if (cronConversationIds.has(convId)) {
        setExpanded(true);
        return;
      }
      // Expand for new_conversation-mode child conversations (check cronJobId in extra)
      ipcBridge.conversation.get.invoke({ id: convId }).then((conv) => {
        const extra = conv?.extra as Record<string, unknown> | undefined;
        if (extra?.cronJobId) {
          setExpanded(true);
        }
      });
    }
  }, [pathname, cronConversationIds]);

  useEffect(() => {
    if (!batchMode) {
      setSelectedConversationIds(new Set());
    }
  }, [batchMode]);

  // Batch-fetch conversations for all "existing" mode jobs to avoid N+1 IPC calls
  const existingModeConvIds = useMemo(
    () =>
      jobs
        .filter((j) => j.target.executionMode !== 'new_conversation' && j.metadata.conversationId)
        .map((j) => j.metadata.conversationId),
    [jobs]
  );

  const [existingConversations, setExistingConversations] = useState<Map<string, TChatConversation>>(new Map());
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch conversations when conv IDs change or when refresh event is triggered
  useEffect(() => {
    if (existingModeConvIds.length === 0) {
      setExistingConversations(new Map());
      return;
    }
    // Fetch all conversations in parallel
    Promise.all(existingModeConvIds.map((id) => ipcBridge.conversation.get.invoke({ id }))).then((results) => {
      const map = new Map<string, TChatConversation>();
      for (const conv of results) {
        if (conv) map.set(conv.id, conv);
      }
      setExistingConversations(map);
    });
  }, [existingModeConvIds, refreshTrigger]);

  // Listen to chat.history.refresh to re-fetch existing mode conversations
  useEffect(() => {
    const handleRefresh = () => {
      setRefreshTrigger((prev) => prev + 1);
    };
    emitter.on('chat.history.refresh', handleRefresh);
    return () => {
      emitter.off('chat.history.refresh', handleRefresh);
    };
  }, []);

  const allConversationIds = useMemo(() => {
    const ids = new Set<string>();
    conversationIdsByJobId.forEach((conversationIds, jobId) => {
      if (!jobs.some((job) => job.id === jobId)) return;
      conversationIds.forEach((conversationId) => ids.add(conversationId));
    });
    return Array.from(ids);
  }, [conversationIdsByJobId, jobs]);

  const selectedCount = selectedConversationIds.size;
  const allSelected = allConversationIds.length > 0 && selectedCount === allConversationIds.length;

  useEffect(() => {
    if (!batchMode || selectedConversationIds.size === 0) return;
    const existingIds = new Set(allConversationIds);
    setSelectedConversationIds((prev) => {
      const next = new Set<string>();
      prev.forEach((conversationId) => {
        if (existingIds.has(conversationId)) {
          next.add(conversationId);
        }
      });
      return next;
    });
  }, [allConversationIds, batchMode, selectedConversationIds.size]);

  const handleChildConversationIdsChange = useCallback((jobId: string, conversationIds: string[]) => {
    setConversationIdsByJobId((prev) => {
      const prevIds = prev.get(jobId) ?? [];
      if (prevIds.length === conversationIds.length && prevIds.every((id, index) => id === conversationIds[index])) {
        return prev;
      }
      const next = new Map(prev);
      next.set(jobId, conversationIds);
      return next;
    });
  }, []);

  const handleToggleSelectedConversation = useCallback((conversation: TChatConversation) => {
    setSelectedConversationIds((prev) => {
      const next = new Set(prev);
      if (next.has(conversation.id)) {
        next.delete(conversation.id);
      } else {
        next.add(conversation.id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedConversationIds((prev) => {
      if (prev.size === allConversationIds.length) {
        return new Set();
      }
      return new Set(allConversationIds);
    });
  }, [allConversationIds]);

  const removeConversations = useCallback(
    async (conversationIds: string[]) => {
      const results = await Promise.all(
        conversationIds.map(async (conversationId) => {
          const success = await ipcBridge.conversation.remove.invoke({ id: conversationId });
          if (success) {
            emitter.emit('conversation.deleted', conversationId);
          }
          return success;
        })
      );
      const successCount = results.filter(Boolean).length;
      if (successCount > 0) {
        emitter.emit('chat.history.refresh');
        const activeConversationId = pathname.startsWith('/conversation/') ? pathname.split('/')[2] : undefined;
        if (activeConversationId && conversationIds.includes(activeConversationId)) {
          onNavigate('/');
        }
      }
      return successCount;
    },
    [onNavigate, pathname]
  );

  const confirmRemoveConversations = useCallback(
    (conversationIds: string[], confirmKey: string, successKey: string) => {
      if (conversationIds.length === 0) {
        Message.warning(t('cron.batch.noSelection'));
        return;
      }

      Modal.confirm({
        title: t('cron.batch.deleteTitle'),
        content: t(confirmKey, { count: conversationIds.length }),
        okText: t('conversation.history.confirmDelete'),
        cancelText: t('conversation.history.cancelDelete'),
        okButtonProps: { status: 'warning' },
        onOk: async () => {
          try {
            const successCount = await removeConversations(conversationIds);
            if (successCount > 0) {
              Message.success(t(successKey, { count: successCount }));
            } else {
              Message.error(t('conversation.history.deleteFailed'));
            }
          } catch (error) {
            console.error('Failed to delete scheduled task conversations:', error);
            Message.error(t('conversation.history.deleteFailed'));
          } finally {
            setSelectedConversationIds(new Set());
            onBatchModeChange?.(false);
          }
        },
        style: { borderRadius: '12px' },
        alignCenter: true,
        getPopupContainer: () => document.body,
      });
    },
    [onBatchModeChange, removeConversations, t]
  );

  const handleBatchDelete = useCallback(() => {
    confirmRemoveConversations(
      Array.from(selectedConversationIds),
      'cron.batch.deleteConfirm',
      'cron.batch.deleteSuccess'
    );
  }, [confirmRemoveConversations, selectedConversationIds]);

  const handleClearAll = useCallback(() => {
    confirmRemoveConversations(allConversationIds, 'cron.batch.clearAllConfirm', 'cron.batch.clearAllSuccess');
  }, [allConversationIds, confirmRemoveConversations]);

  if (jobs.length === 0) return null;

  return (
    <div className='mb-8px min-w-0'>
      <div
        className='group flex items-center px-12px py-8px cursor-pointer select-none sticky top-0 z-10 bg-fill-2'
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className='text-13px text-t-secondary font-bold leading-20px'>{t('cron.scheduledTasks')}</span>
        <div className='ml-auto h-20px w-20px rd-4px flex items-center justify-center hover:bg-fill-3 transition-all shrink-0 text-t-secondary'>
          {expanded ? <Down theme='outline' size={12} /> : <Right theme='outline' size={12} />}
        </div>
      </div>
      {batchMode && expanded && (
        <div className='px-12px pb-8px'>
          <div className='rd-8px bg-fill-1 p-10px flex flex-col gap-8px border border-solid border-[rgba(var(--primary-6),0.08)]'>
            <div className='text-12px leading-18px text-t-secondary'>
              {t('cron.batch.selectedCount', { count: selectedCount })}
            </div>
            <div className='grid grid-cols-2 gap-6px'>
              <Button
                className='!col-span-2 !w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                type='secondary'
                disabled={allConversationIds.length === 0}
                onClick={handleToggleSelectAll}
              >
                {allSelected ? t('common.cancel') : t('cron.batch.selectAll')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                status='warning'
                disabled={selectedCount === 0}
                onClick={handleBatchDelete}
              >
                {t('cron.batch.batchDelete')}
              </Button>
              <Button
                className='!w-full !justify-center !min-w-0 !h-30px !px-8px !text-12px whitespace-nowrap'
                size='mini'
                status='warning'
                disabled={allConversationIds.length === 0}
                onClick={handleClearAll}
              >
                {t('cron.batch.clearAll')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {expanded &&
        jobs.map((job) => (
          <CronJobSiderItem
            key={job.id}
            job={job}
            pathname={pathname}
            onNavigate={onNavigate}
            existingConversation={existingConversations.get(job.metadata.conversationId)}
            batchMode={batchMode}
            selectedConversationIds={selectedConversationIds}
            onToggleSelectedConversation={handleToggleSelectedConversation}
            onChildConversationIdsChange={handleChildConversationIdsChange}
          />
        ))}
    </div>
  );
};

export default CronJobSiderSection;
