/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { dispatchChatMessageJump } from '@/renderer/utils/chat/chatMinimapEvents';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MinimapVisualStyle, TurnPreviewItem } from './minimapTypes';
import {
  defaultVisualStyle,
  HEADER_HEIGHT,
  ITEM_ROW_ESTIMATED_HEIGHT,
  PANEL_HEIGHT,
  PANEL_MARGIN,
  PANEL_MIN_HEIGHT,
  PANEL_OFFSET,
  PANEL_VISIBLE_ITEM_CAP,
} from './minimapTypes';
import { buildTurnPreview, getPanelWidth, isIndexMatch, normalizeText, readPopoverVisualStyle } from './minimapUtils';

// Return type for the useMinimapPanel hook
type UseMinimapPanelReturn = {
  visible: boolean;
  loading: boolean;
  items: TurnPreviewItem[];
  searchKeyword: string;
  isSearchMode: boolean;
  activeResultIndex: number;
  panelWidth: number;
  panelPos: { left: number; top: number };
  visualStyle: MinimapVisualStyle;
  triggerRef: React.RefObject<HTMLSpanElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<RefInputType | null>;
  normalizedKeyword: string;
  filteredItems: TurnPreviewItem[];
  panelHeight: number;
  setSearchKeyword: (keyword: string) => void;
  setActiveResultIndex: React.Dispatch<React.SetStateAction<number>>;
  togglePanel: () => void;
  openSearchPanel: () => void;
  jumpToItem: (item?: TurnPreviewItem) => void;
  handleSearchInputBlur: () => void;
  handleSearchInputCompositionStart: () => void;
  handleSearchInputCompositionEnd: () => void;
};

/**
 * Extracts all state management and side effects for the ConversationTitleMinimap component.
 */
export const useMinimapPanel = (conversationId?: string): UseMinimapPanelReturn => {
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

  // Reset on conversation switch
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

  // Sync searchKeyword to ref
  useEffect(() => {
    searchKeywordRef.current = searchKeyword;
  }, [searchKeyword]);

  // Visual style theme listener
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

  // Fetch data
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

  // Derived values
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

  // Panel positioning — always center within the chat header area
  const updatePanelLayout = useCallback((height = PANEL_HEIGHT) => {
    if (typeof window === 'undefined') return;
    const width = getPanelWidth();

    let left: number;
    let top: number;

    const isNarrow = window.innerWidth < 768;
    const header = document.querySelector('.chat-layout-header');
    if (isNarrow) {
      // On narrow viewports, align flush with margins
      left = PANEL_MARGIN;
      top = header ? header.getBoundingClientRect().bottom + PANEL_OFFSET : 60;
    } else if (header) {
      const headerRect = header.getBoundingClientRect();
      left = headerRect.left + Math.round((headerRect.width - width) / 2);
      top = headerRect.bottom + PANEL_OFFSET;
    } else {
      left = Math.round((window.innerWidth - width) / 2);
      top = 60;
    }

    left = Math.max(PANEL_MARGIN, Math.min(left, window.innerWidth - width - PANEL_MARGIN));
    top = Math.max(PANEL_MARGIN, Math.min(top, window.innerHeight - height - PANEL_MARGIN));
    setPanelWidth(width);
    setPanelPos({ left: Math.round(left), top: Math.round(top) });
  }, []);

  // Handlers
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

  // Panel positioning on visibility change
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

  // Click-outside to close
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

  // Global search shortcut (Cmd/Ctrl+F)
  useEffect(() => {
    const handleGlobalSearchShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event as unknown as { isComposing?: boolean }).isComposing) return;
      const key = event.key.toLowerCase();
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;
      if (!isCmdOrCtrl || event.shiftKey || key !== 'f' || event.altKey) return;
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

  // Search focus
  useEffect(() => {
    if (!visible || !isSearchMode) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isSearchMode, visible]);

  // Active result index management
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

  // Scroll active result into view
  useEffect(() => {
    if (!visible || !isSearchMode) return;
    if (activeResultIndex < 0 || !filteredItems.length) return;
    const currentItem = panelRef.current?.querySelector<HTMLButtonElement>(
      `[data-minimap-item-index="${activeResultIndex}"]`
    );
    currentItem?.scrollIntoView({ block: 'nearest' });
  }, [activeResultIndex, filteredItems.length, isSearchMode, visible]);

  // Jump to item
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

  // Keyboard navigation for search results
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

  return {
    visible,
    loading,
    items,
    searchKeyword,
    isSearchMode,
    activeResultIndex,
    panelWidth,
    panelPos,
    visualStyle,
    triggerRef,
    panelRef,
    searchInputRef,
    normalizedKeyword,
    filteredItems,
    panelHeight,
    setSearchKeyword,
    setActiveResultIndex,
    togglePanel,
    openSearchPanel,
    jumpToItem,
    handleSearchInputBlur,
    handleSearchInputCompositionStart,
    handleSearchInputCompositionEnd,
  };
};
