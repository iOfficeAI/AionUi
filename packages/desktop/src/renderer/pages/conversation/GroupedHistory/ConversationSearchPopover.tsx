/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { IMessageSearchItem } from '@/common/types/team/database';
import AionModal from '@/renderer/components/base/AionModal';
import { AionSearchInput } from '@/renderer/components/base';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { useConversationHistoryContext } from '@/renderer/hooks/context/ConversationHistoryContext';
import { useAgentLogos } from '@/renderer/utils/model/agentLogo';
import { resolveConversationLeadingMark } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { blockMobileInputFocus, blurActiveElement } from '@/renderer/utils/ui/focus';
import { Button, Empty, Spin, Typography } from '@arco-design/web-react';
import { Close, MessageOne, Robot, Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getRecentConversations, moveQuickSwitcherSelection } from './utils/conversationQuickSwitcher';
import './ConversationSearchPopover.css';

const PAGE_SIZE = 20;
const MAX_RECENT_SEARCHES = 8;
const RECENT_SEARCH_STORAGE_KEY = 'conversation.historySearch.recentKeywords';
const SNIPPET_MAX_LENGTH = 110;
const SNIPPET_PREFIX_CONTEXT_LENGTH = 34;
const SNIPPET_SUFFIX_CONTEXT_LENGTH = 58;
const getQuickSwitcherOptionId = (mode: 'recent' | 'search', index: number): string =>
  `conversation-quick-switcher-${mode}-${index}`;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildSnippet = (text: string, keyword: string, maxLength = SNIPPET_MAX_LENGTH): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (!keyword.trim()) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}...` : normalized;
  }

  const lowerText = normalized.toLowerCase();
  const lowerKeyword = keyword.trim().toLowerCase();
  const matchIndex = lowerText.indexOf(lowerKeyword);
  if (matchIndex === -1) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}...` : normalized;
  }

  let start = Math.max(0, matchIndex - SNIPPET_PREFIX_CONTEXT_LENGTH);
  let end = Math.min(normalized.length, matchIndex + lowerKeyword.length + SNIPPET_SUFFIX_CONTEXT_LENGTH);

  if (end - start > maxLength) {
    const centeredStart = Math.max(0, matchIndex - Math.floor((maxLength - lowerKeyword.length) / 2));
    start = Math.min(centeredStart, Math.max(0, normalized.length - maxLength));
    end = Math.min(normalized.length, start + maxLength);
  }

  const snippet = normalized.slice(start, end).trim();
  return `${start > 0 ? '...' : ''}${snippet}${end < normalized.length ? '...' : ''}`;
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
      <mark key={`${part}-${index}`} className='conversation-search-modal__highlight'>
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
  label?: string;
  fullWidth?: boolean;
  renderTrigger?: (props: { onClick: () => void; isActive: boolean }) => React.ReactNode;
}

const ConversationAgentMark: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const logos = useAgentLogos();
  const { info: assistantInfo } = usePresetAssistantInfo(conversation);
  const leadingMark = resolveConversationLeadingMark(conversation, assistantInfo, logos);
  if (leadingMark.kind === 'emoji') {
    return (
      <span className='text-18px leading-none flex-shrink-0' title={leadingMark.label}>
        {leadingMark.value}
      </span>
    );
  }
  if (leadingMark.kind === 'image') {
    return (
      <img
        src={leadingMark.value}
        alt={leadingMark.label}
        title={leadingMark.label}
        className='w-18px h-18px rounded-50% flex-shrink-0'
      />
    );
  }
  if (leadingMark.kind === 'assistant_fallback') {
    return <Robot theme='outline' size='18' className='line-height-0 flex-shrink-0 text-t-secondary' />;
  }

  return <MessageOne theme='outline' size='18' className='line-height-0 flex-shrink-0 text-t-secondary' />;
};

const ConversationSearchPopover: React.FC<ConversationSearchPopoverProps> = ({
  onSessionClick,
  onConversationSelect,
  disabled = false,
  buttonClassName,
  label,
  fullWidth = false,
  renderTrigger,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { groupedHistory } = useConversationHistoryContext();
  const [visible, setVisible] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [items, setItems] = useState<IMessageSearchItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [recentKeywords, setRecentKeywords] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const recentConversations = useMemo(() => getRecentConversations(groupedHistory), [groupedHistory]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sanitized = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        setRecentKeywords(sanitized.slice(0, MAX_RECENT_SEARCHES));
      }
    } catch {
      // Ignore storage parse errors and fallback to empty history.
    }
  }, []);

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
          page_size: PAGE_SIZE,
        });

        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        if (!append) {
          setSelectedIndex(result.items.length > 0 ? 0 : -1);
        }
        setPage(pageToLoad);
        setHasMore(result.has_more);
      } catch (error) {
        console.error('[ConversationSearchPopover] Search failed:', error);
        if (!append) {
          setItems([]);
          setPage(0);
          setHasMore(false);
          setSelectedIndex(-1);
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

  useEffect(() => {
    if (!visible) return;
    setSelectedIndex(!debouncedKeyword && recentConversations.length > 0 ? 0 : -1);
  }, [debouncedKeyword, recentConversations.length, visible]);

  useEffect(() => {
    if (!debouncedKeyword) return;
    const normalized = debouncedKeyword.trim();
    if (!normalized) return;

    setRecentKeywords((prev) => {
      const nextKeywords = [normalized, ...prev.filter((item) => item !== normalized)].slice(0, MAX_RECENT_SEARCHES);
      const unchanged =
        nextKeywords.length === prev.length && nextKeywords.every((item, index) => item === prev[index]);
      if (unchanged) {
        return prev;
      }

      try {
        localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, JSON.stringify(nextKeywords));
      } catch {
        // Ignore storage write errors in private mode / restricted environments.
      }

      return nextKeywords;
    });
  }, [debouncedKeyword]);

  const resetSearchState = useCallback(() => {
    setVisible(false);
    setKeyword('');
    setDebouncedKeyword('');
    setItems([]);
    setPage(0);
    setHasMore(false);
    setLoading(false);
    setLoadingMore(false);
    setSelectedIndex(-1);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!visible || !debouncedKeyword || loading || loadingMore || !hasMore) {
      return;
    }

    void runSearch(page + 1, true);
  }, [debouncedKeyword, hasMore, loading, loadingMore, page, runSearch, visible]);

  const handleConversationOpen = useCallback(
    async (conversationId: string, targetMessageId?: string) => {
      blockMobileInputFocus();
      blurActiveElement();

      flushSync(() => {
        resetSearchState();
      });

      onConversationSelect?.();

      await Promise.resolve(
        navigate(`/conversation/${conversationId}`, {
          state: {
            ...(targetMessageId ? { targetMessageId } : {}),
            fromConversationSearch: true,
          },
        })
      );
      onSessionClick?.();
    },
    [navigate, onConversationSelect, onSessionClick, resetSearchState]
  );

  const handleResultClick = useCallback(
    (item: IMessageSearchItem) => handleConversationOpen(item.conversation.id, item.message_id),
    [handleConversationOpen]
  );

  const handleRecentConversationClick = useCallback(
    (conversation: TChatConversation) => handleConversationOpen(conversation.id),
    [handleConversationOpen]
  );

  const handleClose = useCallback(() => {
    resetSearchState();
  }, [resetSearchState]);

  const handleClearKeyword = useCallback(() => {
    setKeyword('');
    setDebouncedKeyword('');
    setItems([]);
    setPage(0);
    setHasMore(false);
    setLoading(false);
    setLoadingMore(false);
    setSelectedIndex(-1);
  }, []);

  const handleKeywordChange = useCallback((nextKeyword: string) => {
    setKeyword(nextKeyword);
    setSelectedIndex(-1);
  }, []);

  const handleOpen = useCallback(() => {
    if (!disabled) {
      setVisible(true);
    }
  }, [disabled]);

  const isSearchMode = Boolean(debouncedKeyword);
  const hasPendingKeyword = keyword.trim() !== debouncedKeyword;
  const activeItemCount = hasPendingKeyword ? 0 : isSearchMode ? items.length : recentConversations.length;
  const activeOptionId =
    selectedIndex >= 0 && selectedIndex < activeItemCount
      ? getQuickSwitcherOptionId(isSearchMode ? 'search' : 'recent', selectedIndex)
      : undefined;

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        handleClose();
        return;
      }

      if (event.key === 'Enter' && hasPendingKeyword) {
        event.preventDefault();
        setDebouncedKeyword(keyword.trim());
        setSelectedIndex(-1);
        return;
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (activeItemCount === 0) return;
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setSelectedIndex((currentIndex) => moveQuickSwitcherSelection(currentIndex, direction, activeItemCount));
        return;
      }

      if (event.key !== 'Enter' || selectedIndex < 0) return;
      const selectedSearchItem = isSearchMode ? items[selectedIndex] : undefined;
      const selectedRecentConversation = isSearchMode ? undefined : recentConversations[selectedIndex];
      if (!selectedSearchItem && !selectedRecentConversation) return;

      event.preventDefault();
      if (selectedSearchItem) {
        void handleResultClick(selectedSearchItem);
      } else if (selectedRecentConversation) {
        void handleRecentConversationClick(selectedRecentConversation);
      }
    },
    [
      activeItemCount,
      handleClose,
      handleRecentConversationClick,
      handleResultClick,
      hasPendingKeyword,
      isSearchMode,
      items,
      keyword,
      recentConversations,
      selectedIndex,
    ]
  );

  useEffect(() => {
    if (!visible || !activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeOptionId, visible]);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event as unknown as { isComposing?: boolean }).isComposing) return;
      const key = event.key.toLowerCase();
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      if (!isCmdOrCtrl || !event.shiftKey || key !== 'f' || event.altKey) return;
      // Preserve browser behavior in WebUI; only intercept in the desktop runtime.
      if (typeof window !== 'undefined' && !window.electronAPI) return;
      event.preventDefault();
      handleOpen();
    };

    document.addEventListener('keydown', handleGlobalSearchShortcut, true);
    return () => {
      document.removeEventListener('keydown', handleGlobalSearchShortcut, true);
    };
  }, [handleOpen]);

  const triggerAriaLabel = t('conversation.historySearch.tooltip');

  const resultContent = useMemo(() => {
    if (!debouncedKeyword) {
      if (recentConversations.length > 0) {
        return (
          <div className='h-full min-h-0 overflow-y-auto overflow-x-hidden pr-4px'>
            <div className='px-16px pb-8px text-12px font-600 text-t-secondary'>
              {t('conversation.historySearch.recentConversations')}
            </div>
            <div
              id='conversation-quick-switcher-results'
              className='conversation-search-modal__results flex flex-col'
              role='listbox'
              aria-label={t('conversation.historySearch.recentConversations')}
            >
              {recentConversations.map((conversation, index) => (
                <Button
                  key={conversation.id}
                  id={getQuickSwitcherOptionId('recent', index)}
                  type='text'
                  long
                  role='option'
                  aria-selected={selectedIndex === index}
                  className={classNames(
                    'conversation-search-modal__result !h-auto !m-0 !px-18px !py-13px !justify-start text-left transition-all duration-150',
                    {
                      '!bg-fill-2': selectedIndex === index,
                    }
                  )}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    void handleRecentConversationClick(conversation);
                  }}
                >
                  <div className='w-full min-w-0 flex items-center justify-between gap-8px'>
                    <div className='conversation-search-modal__result-title-row min-w-0 flex-1'>
                      <ConversationAgentMark conversation={conversation} />
                      <div className='conversation-search-modal__result-title text-14px font-600 text-t-primary truncate'>
                        {conversation.name || t('conversation.historySearch.untitled')}
                      </div>
                    </div>
                    <span className='shrink-0 text-11px text-t-secondary'>
                      {formatTime(getActivityTime(conversation))}
                    </span>
                  </div>
                </Button>
              ))}
            </div>
            {recentKeywords.length > 0 ? (
              <div className='conversation-search-modal__recent-wrap pt-14px'>
                {recentKeywords.map((item) => (
                  <Button
                    key={item}
                    type='text'
                    className='conversation-search-modal__recent-chip'
                    onClick={() => handleKeywordChange(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        );
      }

      return (
        <div className='conversation-search-modal__state'>
          <div className='conversation-search-modal__state-content'>
            <span className='text-13px'>{t('conversation.historySearch.idle')}</span>
            {recentKeywords.length > 0 ? (
              <div className='conversation-search-modal__recent-wrap'>
                {recentKeywords.map((item) => (
                  <Button
                    key={item}
                    type='text'
                    className='conversation-search-modal__recent-chip'
                    onClick={() => handleKeywordChange(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (loading && items.length === 0) {
      return (
        <div className='h-120px flex items-center justify-center'>
          <Spin size={20} />
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className='conversation-search-modal__state'>
          <Empty className='py-2px' description={t('conversation.historySearch.empty')} />
        </div>
      );
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
        <div
          id='conversation-quick-switcher-results'
          className='conversation-search-modal__results flex flex-col'
          role='listbox'
          aria-label={t('conversation.historySearch.title')}
        >
          {items.map((item, index) => {
            const snippet = buildSnippet(item.preview_text, debouncedKeyword);
            return (
              <button
                key={`${item.message_id}-${item.message_created_at}`}
                id={getQuickSwitcherOptionId('search', index)}
                type='button'
                role='option'
                aria-selected={selectedIndex === index}
                className={classNames(
                  'conversation-search-modal__result w-full text-left cursor-pointer transition-all duration-150',
                  'focus:outline-none',
                  {
                    'bg-fill-2': selectedIndex === index,
                  }
                )}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  void handleResultClick(item);
                }}
              >
                <div className='flex items-start justify-between gap-8px mb-6px'>
                  <div className='min-w-0 flex-1'>
                    <div className='conversation-search-modal__result-title-row'>
                      <ConversationAgentMark conversation={item.conversation} />
                      <div className='conversation-search-modal__result-title text-15px font-600 text-t-primary truncate'>
                        {item.conversation.name || t('conversation.historySearch.untitled')}
                      </div>
                    </div>
                  </div>
                  <span className='shrink-0 text-11px text-t-secondary'>{formatTime(item.message_created_at)}</span>
                </div>
                <div className='conversation-search-modal__snippet text-13px leading-22px text-t-primary/92 break-words'>
                  {renderHighlightedText(snippet, debouncedKeyword)}
                </div>
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
  }, [
    debouncedKeyword,
    handleKeywordChange,
    handleLoadMore,
    handleRecentConversationClick,
    handleResultClick,
    items,
    loading,
    loadingMore,
    recentConversations,
    recentKeywords,
    selectedIndex,
    t,
  ]);

  const hasSearchResults = items.length > 0;
  const useCompactHeight =
    (!debouncedKeyword && recentConversations.length === 0) || (!loading && debouncedKeyword && !hasSearchResults);
  const triggerClassName = fullWidth
    ? 'conversation-search-trigger-full h-34px w-full p-0 bg-transparent border-none outline-none flex items-center justify-start gap-8px pl-10px pr-8px rd-0.5rem cursor-pointer shrink-0 transition-all group text-t-primary focus:outline-none focus-visible:outline-none'
    : 'h-34px w-34px p-0 bg-transparent rd-0.5rem flex items-center justify-center cursor-pointer shrink-0 transition-all border border-solid border-transparent text-t-secondary hover:text-t-primary';

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ onClick: handleOpen, isActive: visible })
      ) : (
        <button
          type='button'
          aria-label={triggerAriaLabel}
          className={classNames(
            triggerClassName,
            {
              'hover:bg-fill-3 active:bg-fill-4': !disabled && fullWidth,
              'hover:bg-fill-2 hover:border-[color:var(--color-border-2)]': !disabled && !fullWidth,
              'opacity-50 cursor-not-allowed': disabled,
              'bg-aou-2 text-primary border-[color:var(--color-primary-light-3)]': visible && !disabled && !fullWidth,
            },
            buttonClassName
          )}
          onClick={handleOpen}
          disabled={disabled}
        >
          {fullWidth ? (
            <span className='size-22px flex items-center justify-center shrink-0 text-t-primary'>
              <Search
                theme='outline'
                size='16'
                fill='currentColor'
                className='block leading-none'
                style={{ lineHeight: 0 }}
              />
            </span>
          ) : (
            <Search
              theme='outline'
              size='16'
              fill='currentColor'
              className='block leading-none shrink-0'
              style={{ lineHeight: 0 }}
            />
          )}
          {fullWidth && label ? (
            <span className='collapsed-hidden text-t-primary text-14px font-[500] leading-24px'>{label}</span>
          ) : null}
        </button>
      )}

      <AionModal
        visible={visible}
        onCancel={handleClose}
        footer={null}
        showCustomClose={false}
        unmountOnExit
        className='conversation-search-modal'
        maskStyle={{
          background: 'var(--conversation-search-mask-bg)',
          backdropFilter: 'blur(1px)',
          WebkitBackdropFilter: 'blur(1px)',
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
          height: useCompactHeight ? 'auto' : 'min(70vh, 720px)',
          minHeight: useCompactHeight ? '300px' : undefined,
          maxHeight: 'min(70vh, 720px)',
        }}
      >
        <div
          className={classNames('conversation-search-modal__panel flex flex-col', {
            'h-full min-h-0': !useCompactHeight,
          })}
        >
          <div className='conversation-search-modal__header'>
            <div className='conversation-search-modal__header-main'>
              <div className='conversation-search-modal__title'>{t('conversation.historySearch.title')}</div>
              <Typography.Paragraph className='conversation-search-modal__description !mb-0 text-13px text-t-secondary'>
                {t('conversation.historySearch.description')}
              </Typography.Paragraph>
            </div>
            <button
              type='button'
              className='conversation-search-modal__close-btn'
              onClick={handleClose}
              aria-label='Close'
            >
              <Close size={16} />
            </button>
          </div>

          <div className='mb-14px conversation-search-modal__input-wrap'>
            <AionSearchInput
              className='w-full'
              autoFocus={visible}
              value={keyword}
              placeholder={t('conversation.historySearch.placeholder')}
              onChange={handleKeywordChange}
              onClear={handleClearKeyword}
              inputProps={{
                role: 'combobox',
                'aria-expanded': visible,
                'aria-controls': 'conversation-quick-switcher-results',
                'aria-activedescendant': activeOptionId,
                'aria-autocomplete': 'list',
                onKeyDown: handleInputKeyDown,
              }}
            />
          </div>

          <div className='flex-1 min-h-0'>{resultContent}</div>
        </div>
      </AionModal>
    </>
  );
};

export default ConversationSearchPopover;
