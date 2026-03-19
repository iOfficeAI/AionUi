/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { dispatchChatMessageJump } from '@/renderer/utils/chat/chatMinimapEvents';
import { Empty, Input, Spin } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import classNames from 'classnames';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './ConversationTitleMinimap.module.css';
import type { ConversationTitleMinimapProps, MinimapVisualStyle, TurnPreviewItem } from './minimapTypes';
import {
  defaultVisualStyle,
  HEADER_HEIGHT,
  ITEM_ROW_ESTIMATED_HEIGHT,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_MIN_HEIGHT,
  PANEL_MIN_WIDTH,
  PANEL_OFFSET,
  PANEL_VISIBLE_ITEM_CAP,
} from './minimapTypes';
import {
  buildTurnPreview,
  getPanelWidth,
  isIndexMatch,
  normalizeText,
  readPopoverVisualStyle,
  renderHighlightedText,
} from './minimapUtils';

const ConversationTitleMinimap: React.FC<ConversationTitleMinimapProps> = ({ conversationId }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TurnPreviewItem[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [panelWidth, setPanelWidth] = useState(getPanelWidth);
  const [panelPos, setPanelPos] = useState({ left: PANEL_MARGIN, top: PANEL_MARGIN });
  const [visualStyle, setVisualStyle] = useState<MinimapVisualStyle>(defaultVisualStyle);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<RefInputType | null>(null);
  const isSearchInputComposingRef = useRef(false);
  const pendingCloseAfterCompositionRef = useRef(false);
  const searchKeywordRef = useRef('');

  useEffect(() => {
    setVisible(false);
    setLoading(false);
    setItems([]);
    setSearchKeyword('');
    searchKeywordRef.current = '';
    setIsSearchMode(false);
    setActiveResultIndex(-1);
    isSearchInputComposingRef.current = false;
    pendingCloseAfterCompositionRef.current = false;
  }, [conversationId]);

  useEffect(() => {
    searchKeywordRef.current = searchKeyword;
  }, [searchKeyword]);

  useEffect(() => {
    const refresh = () => {
      setVisualStyle(readPopoverVisualStyle());
    };
    refresh();
    const handleCssUpdated = () => refresh();
    window.addEventListener('custom-css-updated', handleCssUpdated as EventListener);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => {
      window.removeEventListener('custom-css-updated', handleCssUpdated as EventListener);
      observer.disconnect();
    };
  }, []);

  const fetchTurnPreview = useCallback(async () => {
    if (!conversationId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const messages = await ipcBridge.database.getConversationMessages.invoke({
        conversation_id: conversationId,
        page: 0,
        pageSize: 10000,
      });
      setItems(buildTurnPreview(messages || []));
    } catch (error) {
      console.error('[ConversationTitleMinimap] Failed to load conversation messages:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const normalizedKeyword = useMemo(() => normalizeText(searchKeyword).toLowerCase(), [searchKeyword]);

  const filteredItems = useMemo(() => {
    if (!normalizedKeyword) return items;
    return items.filter((item) => {
      return (
        item.questionRaw.toLowerCase().includes(normalizedKeyword) ||
        item.answerRaw.toLowerCase().includes(normalizedKeyword) ||
        isIndexMatch(item.index, normalizedKeyword)
      );
    });
  }, [items, normalizedKeyword]);

  const panelHeight = useMemo(() => {
    if (loading) return PANEL_MIN_HEIGHT;
    if (!items.length || !filteredItems.length) return PANEL_MIN_HEIGHT;
    const visibleRows = Math.min(filteredItems.length, PANEL_VISIBLE_ITEM_CAP);
    const computed = HEADER_HEIGHT + 12 + visibleRows * ITEM_ROW_ESTIMATED_HEIGHT;
    return Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_HEIGHT, computed));
  }, [filteredItems.length, items.length, loading]);

  const updatePanelLayout = useCallback((height = PANEL_HEIGHT) => {
    if (typeof window === 'undefined' || !triggerRef.current) return;
    const width = getPanelWidth();
    const rect = triggerRef.current.getBoundingClientRect();
    let left = rect.left;
    left = Math.max(PANEL_MARGIN, Math.min(left, window.innerWidth - width - PANEL_MARGIN));
    let top = rect.bottom + PANEL_OFFSET;
    const maxTop = window.innerHeight - height - PANEL_MARGIN;
    if (top > maxTop) {
      top = Math.max(PANEL_MARGIN, rect.top - height - PANEL_OFFSET);
    }
    setPanelWidth(width);
    setPanelPos({ left: Math.round(left), top: Math.round(top) });
  }, []);

  const openSearchPanel = useCallback(() => {
    if (!conversationId) return;
    updatePanelLayout(panelHeight);
    setVisualStyle(readPopoverVisualStyle());
    setVisible(true);
    setIsSearchMode(true);
    void fetchTurnPreview();
  }, [conversationId, fetchTurnPreview, panelHeight, updatePanelLayout]);

  const togglePanel = useCallback(() => {
    setVisible((prev) => {
      const next = !prev;
      if (next) {
        updatePanelLayout(panelHeight);
        setVisualStyle(readPopoverVisualStyle());
        void fetchTurnPreview();
      } else {
        setIsSearchMode(false);
      }
      return next;
    });
  }, [fetchTurnPreview, panelHeight, updatePanelLayout]);

  const collapseSearchModeIfIdle = useCallback(() => {
    if (isSearchInputComposingRef.current) return;
    if (normalizeText(searchKeywordRef.current)) return;
    if (searchInputRef.current?.dom === document.activeElement) return;
    setIsSearchMode(false);
  }, []);

  const handleSearchInputBlur = useCallback(() => {
    window.setTimeout(() => {
      collapseSearchModeIfIdle();
    }, 0);
  }, [collapseSearchModeIfIdle]);

  const handleSearchInputCompositionStart = useCallback(() => {
    isSearchInputComposingRef.current = true;
    pendingCloseAfterCompositionRef.current = false;
  }, []);

  const handleSearchInputCompositionEnd = useCallback(() => {
    isSearchInputComposingRef.current = false;
    if (pendingCloseAfterCompositionRef.current) {
      pendingCloseAfterCompositionRef.current = false;
      setVisible(false);
      return;
    }
    window.setTimeout(() => {
      collapseSearchModeIfIdle();
    }, 0);
  }, [collapseSearchModeIfIdle]);

  useLayoutEffect(() => {
    if (!visible) return;
    updatePanelLayout(panelHeight);
    setVisualStyle(readPopoverVisualStyle());
    const handleViewportChange = () => {
      updatePanelLayout(panelHeight);
    };
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [panelHeight, visible, updatePanelLayout]);

  useEffect(() => {
    if (!visible) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      if (isSearchInputComposingRef.current) {
        pendingCloseAfterCompositionRef.current = true;
        return;
      }
      setVisible(false);
      setIsSearchMode(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setVisible(false);
        setIsSearchMode(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visible]);

  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event as unknown as { isComposing?: boolean }).isComposing) return;
      const key = event.key.toLowerCase();
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      if (!isCmdOrCtrl || key !== 'f' || event.altKey) return;
      // Keep browser/native find behavior in WebUI; intercept only desktop runtime.
      if (typeof window !== 'undefined' && !window.electronAPI) return;
      event.preventDefault();
      openSearchPanel();
    };
    document.addEventListener('keydown', handleGlobalSearchShortcut, true);
    return () => {
      document.removeEventListener('keydown', handleGlobalSearchShortcut, true);
    };
  }, [openSearchPanel]);

  useEffect(() => {
    if (!visible || !isSearchMode) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isSearchMode, visible]);

  useEffect(() => {
    if (!visible || !isSearchMode || loading || !filteredItems.length) {
      setActiveResultIndex(-1);
      return;
    }
    setActiveResultIndex((prev) => {
      if (prev < 0 || prev >= filteredItems.length) return 0;
      return prev;
    });
  }, [filteredItems.length, isSearchMode, loading, visible]);

  useEffect(() => {
    if (!visible || !isSearchMode) return;
    if (activeResultIndex < 0 || !filteredItems.length) return;
    const currentItem = panelRef.current?.querySelector<HTMLButtonElement>(
      `[data-minimap-item-index="${activeResultIndex}"]`
    );
    currentItem?.scrollIntoView({ block: 'nearest' });
  }, [activeResultIndex, filteredItems.length, isSearchMode, visible]);

  const jumpToItem = useCallback(
    (item?: TurnPreviewItem) => {
      if (!conversationId || !item) return;
      dispatchChatMessageJump({
        conversationId,
        messageId: item.messageId,
        msgId: item.msgId,
        align: 'start',
        behavior: 'smooth',
      });
      setVisible(false);
      setIsSearchMode(false);
    },
    [conversationId]
  );

  useEffect(() => {
    if (!visible || !isSearchMode) return;
    const handleResultNavigate = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event as unknown as { isComposing?: boolean }).isComposing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if ((key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Enter') || !filteredItems.length) return;

      event.preventDefault();
      if (key === 'ArrowDown') {
        setActiveResultIndex((prev) => {
          const from = prev < 0 ? 0 : prev;
          return (from + 1) % filteredItems.length;
        });
        return;
      }
      if (key === 'ArrowUp') {
        setActiveResultIndex((prev) => {
          const from = prev < 0 ? 0 : prev;
          return (from - 1 + filteredItems.length) % filteredItems.length;
        });
        return;
      }
      const targetIndex = activeResultIndex >= 0 && activeResultIndex < filteredItems.length ? activeResultIndex : 0;
      jumpToItem(filteredItems[targetIndex]);
    };
    document.addEventListener('keydown', handleResultNavigate, true);
    return () => {
      document.removeEventListener('keydown', handleResultNavigate, true);
    };
  }, [activeResultIndex, filteredItems, isSearchMode, jumpToItem, visible]);

  const contentNode = useMemo(() => {
    const frameStyle: React.CSSProperties = {
      width: '100%',
      minWidth: `${PANEL_MIN_WIDTH}px`,
      height: `${panelHeight}px`,
      boxSizing: 'border-box',
      overflow: 'hidden',
      background: visualStyle.background,
      border: visualStyle.border,
      borderRadius: visualStyle.borderRadius,
      boxShadow: visualStyle.boxShadow,
    };

    const countNode = (
      <span
        className={classNames('conversation-minimap-count shrink-0 text-12px font-semibold leading-none', styles.count)}
        style={{
          color: normalizedKeyword
            ? filteredItems.length > 0
              ? 'rgb(var(--primary-6))'
              : 'var(--color-danger)'
            : 'var(--color-text-2)',
        }}
      >
        {normalizedKeyword
          ? `${filteredItems.length}/${items.length}`
          : t('conversation.minimap.count', { count: items.length })}
      </span>
    );

    const titleNode = (
      <div className={styles.headerShell} style={{ height: `${HEADER_HEIGHT}px` }}>
        <div className='conversation-minimap-header h-34px flex items-center gap-8px w-full min-w-0 text-12px text-t-secondary box-border'>
          <Input
            ref={searchInputRef}
            size='small'
            readOnly={!isSearchMode}
            allowClear={isSearchMode}
            aria-label={t('conversation.minimap.searchAria')}
            className={classNames(
              'conversation-minimap-search-input min-w-0 flex-1',
              styles.searchInput,
              !isSearchMode && styles.searchInputIdle
            )}
            value={searchKeyword}
            onClick={() => {
              if (!isSearchMode) {
                openSearchPanel();
              }
            }}
            onFocus={() => {
              if (!isSearchMode) {
                openSearchPanel();
              }
            }}
            onChange={setSearchKeyword}
            onBlur={handleSearchInputBlur}
            onCompositionStartCapture={handleSearchInputCompositionStart}
            onCompositionEndCapture={handleSearchInputCompositionEnd}
            prefix={<IconSearch className='text-14px text-t-secondary' />}
            placeholder={isSearchMode ? '' : t('conversation.minimap.searchHint')}
          />
          {countNode}
        </div>
        <div className={styles.sectionDivider} style={{ backgroundColor: visualStyle.borderColor }} />
      </div>
    );

    if (loading) {
      return (
        <div className='conversation-minimap-panel' style={frameStyle}>
          {titleNode}
          <div className='flex-center' style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
            <Spin size={18} />
          </div>
        </div>
      );
    }

    if (!items.length) {
      return (
        <div className='conversation-minimap-panel' style={frameStyle}>
          {titleNode}
          <div className='flex-center p-12px box-border' style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
            <Empty description={t('conversation.minimap.empty')} />
          </div>
        </div>
      );
    }

    if (!filteredItems.length) {
      return (
        <div className='conversation-minimap-panel' style={frameStyle}>
          {titleNode}
          <div className='flex-center p-12px box-border' style={{ height: `calc(100% - ${HEADER_HEIGHT}px)` }}>
            <Empty description={t('conversation.minimap.noMatch')} />
          </div>
        </div>
      );
    }

    return (
      <div className='conversation-minimap-panel' style={frameStyle}>
        {titleNode}
        <div
          className='conversation-minimap-body-shell box-border'
          style={{ height: `calc(100% - ${HEADER_HEIGHT}px)`, padding: '10px 12px 12px' }}
        >
          <div
            className='conversation-minimap-body h-full overflow-y-auto overflow-x-hidden box-border'
            style={{ paddingRight: '14px', scrollbarGutter: 'stable' }}
          >
            <div className='conversation-minimap-list flex flex-col gap-6px'>
              {filteredItems.map((item, idx) => (
                <button
                  key={`${item.index}-${item.messageId || item.msgId || 'unknown'}`}
                  type='button'
                  data-minimap-item-index={idx}
                  aria-selected={activeResultIndex === idx}
                  className={classNames(
                    'conversation-minimap-item w-full text-left px-12px py-10px border-none rounded-10px hover:bg-fill-2 transition-colors cursor-pointer block',
                    isSearchMode && activeResultIndex === idx ? 'bg-fill-2' : 'bg-transparent'
                  )}
                  onMouseEnter={() => {
                    if (!isSearchMode) return;
                    setActiveResultIndex(idx);
                  }}
                  onClick={() => {
                    jumpToItem(item);
                  }}
                >
                  <div
                    className={classNames(
                      'text-11px mb-2px',
                      isIndexMatch(item.index, normalizedKeyword)
                        ? 'text-[rgb(var(--primary-6))] font-semibold'
                        : 'text-t-secondary'
                    )}
                  >
                    #{item.index}
                  </div>
                  <div
                    className='text-13px text-t-primary font-medium leading-18px'
                    style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                  >
                    Q: {renderHighlightedText(item.questionRaw || item.question, normalizedKeyword)}
                  </div>
                  {item.answer && (
                    <div
                      className='text-12px text-t-secondary leading-18px mt-2px'
                      style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}
                    >
                      A: {renderHighlightedText(item.answerRaw || item.answer, normalizedKeyword)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }, [
    activeResultIndex,
    filteredItems,
    isSearchMode,
    items.length,
    jumpToItem,
    loading,
    normalizedKeyword,
    panelHeight,
    searchKeyword,
    t,
    visualStyle.borderColor,
    visualStyle.border,
    visualStyle.borderRadius,
    visualStyle.boxShadow,
    visualStyle.background,
  ]);

  return (
    <>
      <span
        ref={triggerRef}
        role='button'
        tabIndex={0}
        aria-expanded={visible}
        aria-haspopup='dialog'
        aria-label={t('conversation.minimap.searchAria', { defaultValue: 'Search conversation' })}
        title={t('conversation.minimap.searchHint', { defaultValue: '点击这里搜索关键词' })}
        className={classNames(
          'conversation-minimap-trigger inline-flex h-24px w-24px items-center justify-center cursor-pointer rounded-full border border-solid border-transparent bg-transparent text-t-secondary transition-all duration-150 focus:outline-none hover:border-[color:color-mix(in_srgb,var(--color-border-2)_72%,transparent)] hover:bg-fill-3 hover:text-[rgb(var(--primary-6))] focus:border-[color:color-mix(in_srgb,var(--color-border-2)_72%,transparent)] focus:bg-fill-3 focus:text-[rgb(var(--primary-6))]',
          visible &&
            'border-[color:color-mix(in_srgb,var(--color-border-2)_72%,transparent)] bg-fill-3 text-[rgb(var(--primary-6))]'
        )}
        onClick={togglePanel}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            togglePanel();
          }
        }}
      >
        <IconSearch
          className={classNames(
            'text-15px transition-all duration-150',
            visible
              ? 'scale-103 opacity-100 text-[rgb(var(--primary-6))]'
              : 'opacity-76 hover:scale-103 hover:opacity-100 focus:scale-103 focus:opacity-100'
          )}
        />
      </span>
      {visible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            className='conversation-minimap-layer'
            style={{
              position: 'fixed',
              left: `${panelPos.left}px`,
              top: `${panelPos.top}px`,
              width: `${panelWidth}px`,
              zIndex: 1200,
            }}
          >
            {contentNode}
          </div>,
          document.body
        )}
    </>
  );
};

export default ConversationTitleMinimap;
