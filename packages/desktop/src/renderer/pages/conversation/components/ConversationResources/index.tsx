/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { useMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import type { TMessage } from '@/common/chat/chatLib';
import { iconColors } from '@/renderer/styles/colors';
import { loadAllConversationMessagesPaged } from '@/renderer/utils/chat/messagePagination';
import { Button, Popover, Tooltip } from '@arco-design/web-react';
import { ApplicationMenu, Earth, FileText, Pic } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './ConversationResources.module.css';
import {
  collectConversationResources,
  conversationResourcesSlotId,
  isImageResource,
  type ConversationResourceItem,
} from './model';

const ResourceIcon: React.FC<{ item: ConversationResourceItem }> = ({ item }) =>
  item.kind === 'url' ? (
    <Earth size={16} fill={iconColors.secondary} />
  ) : isImageResource(item.path) ? (
    <Pic size={16} fill={iconColors.secondary} />
  ) : (
    <FileText size={16} fill={iconColors.secondary} />
  );

const resourceLocation = (item: ConversationResourceItem): string => (item.kind === 'url' ? item.url : item.path);

const ResourceSection: React.FC<{
  title: string;
  emptyText: string;
  items: ConversationResourceItem[];
  testId: string;
  onOpen: (item: ConversationResourceItem) => void;
}> = ({ title, emptyText, items, testId, onOpen }) => {
  return (
    <section className='flex min-h-0 flex-col gap-4px'>
      <div className='h-28px flex items-center px-4px text-13px font-500 text-t-secondary'>{title}</div>
      <div className='max-h-170px min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain' data-testid={testId}>
        {items.map((item) => (
          <Button
            key={`${item.kind}:${resourceLocation(item)}`}
            type='text'
            long
            className={`${styles.resourceButton} !h-34px !px-4px !text-t-primary hover:!bg-2 active:!bg-3`}
            icon={<ResourceIcon item={item} />}
            onClick={() => onOpen(item)}
            title={resourceLocation(item)}
          >
            <span className='min-w-0 flex-1 truncate text-left text-13px'>{item.name}</span>
          </Button>
        ))}
      </div>
      {items.length === 0 && <div className='px-6px py-5px text-13px text-t-tertiary'>{emptyText}</div>}
    </section>
  );
};

export const ConversationResourcesButton: React.FC<{
  outputs: ConversationResourceItem[];
  sources: ConversationResourceItem[];
  onOpen: (item: ConversationResourceItem) => void;
  onRequestOpen?: () => void;
}> = ({ outputs, sources, onOpen, onRequestOpen }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const handleOpen = (item: ConversationResourceItem) => {
    setVisible(false);
    onOpen(item);
  };

  const content = (
    <div
      className='w-300px max-w-[calc(100vw-24px)] flex flex-col gap-8px px-8px py-10px'
      data-testid='conversation-resources-panel'
    >
      <ResourceSection
        title={t('conversation.resources.outputs')}
        emptyText={t('conversation.resources.emptyOutputs')}
        items={outputs}
        testId='conversation-resources-outputs-list'
        onOpen={handleOpen}
      />
      <div className='mx-4px border-t border-[var(--bg-3)]' />
      <ResourceSection
        title={t('conversation.resources.sources')}
        emptyText={t('conversation.resources.emptySources')}
        items={sources}
        testId='conversation-resources-sources-list'
        onOpen={handleOpen}
      />
    </div>
  );

  return (
    <Tooltip content={t('conversation.resources.tooltip')}>
      <Popover
        trigger='click'
        position='br'
        popupVisible={visible}
        onVisibleChange={(nextVisible) => {
          setVisible(nextVisible);
          if (nextVisible) onRequestOpen?.();
        }}
        content={content}
        triggerProps={{ showArrow: false }}
        unmountOnExit
        className={styles.popover}
      >
        <Button
          type='text'
          size='mini'
          shape='circle'
          aria-label={t('conversation.resources.tooltip')}
          className='!h-28px !w-28px !min-w-28px !p-0 !text-t-secondary hover:!bg-2 active:!bg-3'
          icon={<ApplicationMenu size={17} fill={iconColors.secondary} />}
          data-testid='conversation-resources-trigger'
        />
      </Popover>
    </Tooltip>
  );
};

const ConversationResourcesPortal: React.FC<{ conversationId: string; workspace?: string }> = ({
  conversationId,
  workspace,
}) => {
  const messages = useMessageList();
  const openLocalFile = useLocalFilePreview(workspace);
  const { openBrowserTab } = usePreviewContext();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [historyMessages, setHistoryMessages] = useState<TMessage[] | null>(null);
  const loadingConversationRef = useRef<string | undefined>(undefined);
  const resourceMessages = useMemo(() => {
    if (!historyMessages) return messages;
    const messagesById = new Map(historyMessages.map((message) => [message.id, message]));
    for (const message of messages) messagesById.set(message.id, message);
    return Array.from(messagesById.values());
  }, [historyMessages, messages]);
  const resources = useMemo(
    () => collectConversationResources(resourceMessages, workspace),
    [resourceMessages, workspace]
  );

  useEffect(() => {
    const targetId = conversationResourcesSlotId(conversationId);
    const syncTarget = () => {
      const nextTarget = document.getElementById(targetId);
      setTarget((current) => (current === nextTarget ? current : nextTarget));
    };
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['id'] });
    return () => observer.disconnect();
  }, [conversationId]);

  useEffect(() => {
    setHistoryMessages(null);
    loadingConversationRef.current = undefined;
  }, [conversationId]);

  const loadHistory = useCallback(() => {
    if (historyMessages || loadingConversationRef.current === conversationId) return;
    loadingConversationRef.current = conversationId;
    void loadAllConversationMessagesPaged(conversationId, { contentMode: 'compact' })
      .then((loadedMessages) => {
        if (loadingConversationRef.current === conversationId) setHistoryMessages(loadedMessages);
      })
      .catch((error) => {
        console.error('[ConversationResources] Failed to load complete conversation history:', error);
      })
      .finally(() => {
        if (loadingConversationRef.current === conversationId) loadingConversationRef.current = undefined;
      });
  }, [conversationId, historyMessages]);

  if (!target) return null;
  return createPortal(
    <ConversationResourcesButton
      outputs={resources.outputs}
      sources={resources.sources}
      onOpen={(item) => (item.kind === 'url' ? openBrowserTab(item.url) : void openLocalFile(item.path))}
      onRequestOpen={loadHistory}
    />,
    target
  );
};

export default ConversationResourcesPortal;
