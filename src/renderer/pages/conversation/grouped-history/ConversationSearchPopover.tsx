/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageSearchItem } from '@/common/types/database';
import AionModal from '@/renderer/components/base/AionModal';
import { usePresetAssistantInfo } from '@/renderer/hooks/usePresetAssistantInfo';
import { useOptionalConversationTabs } from '@/renderer/pages/conversation/context/ConversationTabsContext';
import { useCronJobsMap } from '@/renderer/pages/cron';
import { getAgentLogo } from '@/renderer/utils/agentLogo';
import { blockMobileInputFocus, blurActiveElement } from '@/renderer/utils/focus';
import { Empty, Input, Spin, Typography } from '@arco-design/web-react';
import { Close, MessageOne, Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getBackendKeyFromConversation } from './utils/exportHelpers';
import './ConversationSearchPopover.css';

const PAGE_SIZE = 20;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSnippet = (text: string, keyword: string, maxLength = 120): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (!keyword.trim()) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
  }

  const lowerText = normalized.toLowerCase();
  const lowerKeyword = keyword.trim().toLowerCase();
  const matchIndex = lowerText.indexOf(lowerKeyword);
  if (matchIndex === -1) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
  }

  const start = Math.max(0, matchIndex - 28);
  const end = Math.min(normalized.length, matchIndex + lowerKeyword.length + 72);
  return `${start > 0 ? '...' : ''}${normalized.slice(start, end)}${end < normalized.length ? '...' : ''}`;
};

const renderHighlightedText = (text: string, keyword: string) => {
  if (!keyword.trim()) {
    return text;
  }

  const pattern = new RegExp(`(${escapeRegExp(keyword.trim())})`, 'ig');
  const parts = text.split(pattern);
  const lowerKeyword = keyword.trim().toLowerCase();

  return parts.map((part, index) => {
    if (part.toLowerCase() !== lowerKeyword) {
      return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    }

    return (
      <mark key={`${part}-${index}`} className='px-2px rounded-4px text-[var(--color-aou-6-brand)] bg-[var(--color-aou-8-selected)] text-inherit'>
        {part}
      </mark>
    );
  });
};

const formatTime = (timestamp: number): string => {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
};

interface ConversationSearchPopoverProps {
  onSessionClick?: () => void;
  onConversationSelect?: () => void;
  disabled?: boolean;
  buttonClassName?: string;
}

const ConversationAgentMark: React.FC<{ conversation: IMessageSearchItem['conversation'] }> = ({ conversation }) => {
  const { info: assistantInfo } = usePresetAssistantInfo(conversation);

  if (assistantInfo) {
    if (assistantInfo.isEmoji) {
      return (
        <span className='text-18px leading-none flex-shrink-0' title={assistantInfo.name}>
          {assistantInfo.logo}
        </span>
      );
    }

    return <img src={assistantInfo.logo} alt={assistantInfo.name} title={assistantInfo.name} className='w-18px h-18px rounded-50% flex-shrink-0' />;
  }

  const backendKey = getBackendKeyFromConversation(conversation);
  const logo = getAgentLogo(backendKey);
  if (logo) {
    return <img src={logo} alt={`${backendKey || 'agent'} logo`} title={backendKey || 'agent'} className='w-18px h-18px rounded-50% flex-shrink-0' />;
  }

  return <MessageOne theme='outline' size='18' className='line-height-0 flex-shrink-0 text-t-secondary' />;
};

const ConversationSearchPopover: React.FC<ConversationSearchPopoverProps> = ({ onSessionClick, onConversationSelect, disabled = false, buttonClassName }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const conversationTabs = useOptionalConversationTabs();
  const { markAsRead } = useCronJobsMap();
  const [visible, setVisible] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [items, setItems] = useState<IMessageSearchItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
    }, 250);

    return () => window.clearTimeout(timer);
  }, [keyword]);

  const runSearch = useCallback(
    async (pageToLoad: number, append: boolean) => {
      if (!debouncedKeyword) {
        setItems([]);
        setPage(0);
        setHasMore(false);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const result = await ipcBridge.database.searchConversationMessages.invoke({
          keyword: debouncedKeyword,
          page: pageToLoad,
          pageSize: PAGE_SIZE,
        });

        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setPage(result.page);
        setHasMore(result.hasMore);
      } catch (error) {
        console.error('[ConversationSearchPopover] Search failed:', error);
        if (!append) {
          setItems([]);
          setPage(0);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedKeyword]
  );

  useEffect(() => {
    void runSearch(0, false);
  }, [runSearch]);

  const handleLoadMore = useCallback(() => {
    if (!visible || !debouncedKeyword || loading || loadingMore || !hasMore) {
      return;
    }

    void runSearch(page + 1, true);
  }, [debouncedKeyword, hasMore, loading, loadingMore, page, runSearch, visible]);

  const handleResultClick = useCallback(
    async (item: IMessageSearchItem) => {
      blockMobileInputFocus();
      blurActiveElement();
      onConversationSelect?.();

      const customWorkspace = item.conversation.extra?.customWorkspace;
      const newWorkspace = item.conversation.extra?.workspace;

      markAsRead(item.conversation.id);

      if (conversationTabs) {
        const { closeAllTabs, openTab, activeTab } = conversationTabs;
        if (!customWorkspace) {
          closeAllTabs();
        } else {
          const currentWorkspace = activeTab?.workspace;
          if (!currentWorkspace || currentWorkspace !== newWorkspace) {
            closeAllTabs();
          }
          openTab(item.conversation);
        }
      }

      setVisible(false);
      await navigate(`/conversation/${item.conversation.id}`, {
        state: {
          targetMessageId: item.messageId,
          fromConversationSearch: true,
        },
      });
      onSessionClick?.();
    },
    [conversationTabs, markAsRead, navigate, onConversationSelect, onSessionClick]
  );

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  const resultContent = useMemo(() => {
    if (!debouncedKeyword) {
      return <div className='text-13px text-t-secondary py-12px'>{t('conversation.historySearch.idle')}</div>;
    }

    if (loading && items.length === 0) {
      return (
        <div className='h-120px flex items-center justify-center'>
          <Spin size={20} />
        </div>
      );
    }

    if (items.length === 0) {
      return <Empty className='py-12px' description={t('conversation.historySearch.empty')} />;
    }

    return (
      <div
        className='h-full min-h-0 overflow-y-auto overflow-x-hidden pr-4px'
        onScroll={(event) => {
          const target = event.currentTarget;
          if (target.scrollHeight - target.scrollTop - target.clientHeight < 48) {
            handleLoadMore();
          }
        }}
      >
        <div className='conversation-search-modal__results flex flex-col'>
          {items.map((item) => {
            const snippet = buildSnippet(item.previewText, debouncedKeyword);
            return (
              <button
                key={`${item.messageId}-${item.messageCreatedAt}`}
                type='button'
                className={classNames('conversation-search-modal__result w-full text-left cursor-pointer transition-all duration-150', 'focus:outline-none')}
                onClick={() => {
                  void handleResultClick(item);
                }}
              >
                <div className='flex items-start justify-between gap-8px mb-6px'>
                  <div className='min-w-0 flex-1'>
                    <div className='conversation-search-modal__result-title-row'>
                      <ConversationAgentMark conversation={item.conversation} />
                      <div className='conversation-search-modal__result-title text-15px font-600 text-t-primary truncate'>{item.conversation.name || t('conversation.historySearch.untitled')}</div>
                    </div>
                  </div>
                  <span className='shrink-0 text-11px text-t-secondary'>{formatTime(item.messageCreatedAt)}</span>
                </div>
                <div className='text-13px leading-22px text-t-primary/92 break-words'>{renderHighlightedText(snippet, debouncedKeyword)}</div>
              </button>
            );
          })}

          {loadingMore && (
            <div className='py-8px flex items-center justify-center gap-8px text-12px text-t-secondary'>
              <Spin size={14} />
              <span>{t('conversation.historySearch.loadingMore')}</span>
            </div>
          )}
        </div>
      </div>
    );
  }, [debouncedKeyword, handleLoadMore, handleResultClick, items, loading, loadingMore, t]);

  return (
    <>
      <div
        className={classNames(
          'h-40px w-40px rd-0.5rem flex items-center justify-center cursor-pointer shrink-0 transition-all border border-solid border-transparent',
          {
            'hover:bg-fill-2 hover:border-[color:var(--color-border-2)]': !disabled,
            'opacity-50 cursor-not-allowed': disabled,
            'bg-aou-2 text-primary border-[color:var(--color-primary-light-3)]': visible && !disabled,
          },
          buttonClassName
        )}
        onClick={() => {
          if (!disabled) {
            setVisible(true);
          }
        }}
      >
        <Search theme='outline' size='20' className='block leading-none shrink-0' style={{ lineHeight: 0 }} />
      </div>

      <AionModal
        visible={visible}
        onCancel={handleClose}
        footer={null}
        showCustomClose={false}
        className='conversation-search-modal'
        maskStyle={{
          background: 'transparent',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}
        style={{
          width: 'min(700px, calc(100vw - 56px))',
          borderRadius: '24px',
          background: 'transparent',
          boxShadow: 'none',
        }}
        contentStyle={{
          background: 'transparent',
          borderRadius: '24px',
          padding: '0',
          overflow: 'hidden',
          height: 'min(70vh, 720px)',
        }}
      >
        <div className='conversation-search-modal__panel h-full min-h-0 flex flex-col'>
          <div className='conversation-search-modal__header'>
            <div className='conversation-search-modal__header-main'>
              <div className='conversation-search-modal__title'>{t('conversation.historySearch.title')}</div>
              <Typography.Paragraph className='conversation-search-modal__description !mb-0 text-13px text-t-secondary'>{t('conversation.historySearch.description')}</Typography.Paragraph>
            </div>
            <button type='button' className='conversation-search-modal__close-btn' onClick={handleClose} aria-label='Close'>
              <Close size={20} />
            </button>
          </div>

          <div className='mb-14px conversation-search-modal__input-wrap'>
            <Input autoFocus={visible} allowClear size='large' value={keyword} placeholder={t('conversation.historySearch.placeholder')} onChange={setKeyword} prefix={<Search theme='outline' size='18' className='text-t-secondary' />} />
          </div>

          <div className='flex-1 min-h-0'>{resultContent}</div>
        </div>
      </AionModal>
    </>
  );
};

export default ConversationSearchPopover;
