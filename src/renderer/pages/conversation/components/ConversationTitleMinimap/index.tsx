/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Empty, Input, Spin } from '@arco-design/web-react';
import { IconSearch } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './ConversationTitleMinimap.module.css';
import type { ConversationTitleMinimapProps } from './minimapTypes';
import { HEADER_HEIGHT, PANEL_MIN_WIDTH } from './minimapTypes';
import { isIndexMatch, renderHighlightedText } from './minimapUtils';
import { useMinimapPanel } from './useMinimapPanel';

const ConversationTitleMinimap: React.FC<ConversationTitleMinimapProps> = ({ conversationId, hideTrigger = false }) => {
  const { t } = useTranslation();
  const {
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
  } = useMinimapPanel(conversationId);

  const contentNode = useMemo(() => {
    const frameStyle: React.CSSProperties = {
      width: '100%',
      minWidth: `${Math.min(PANEL_MIN_WIDTH, panelWidth)}px`,
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
    panelWidth,
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
      {!hideTrigger && (
        <span
          ref={triggerRef}
          role='button'
          tabIndex={0}
          aria-expanded={visible}
          aria-haspopup='dialog'
          aria-label={t('conversation.minimap.searchAria', { defaultValue: 'Search conversation' })}
          title={t('conversation.minimap.searchHint', { defaultValue: 'Click here to search keywords' })}
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
      )}
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
