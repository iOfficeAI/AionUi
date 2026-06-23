/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Input, Message, Spin, Tooltip } from '@arco-design/web-react';
import { Search, Refresh } from '@icon-park/react';
import AssetCard from './components/AssetCard';
import AssetPopover from './components/AssetPopover';
import AssetDrawer from './components/AssetDrawer';
import FileTile from './components/FileTile';
import FileTile2 from './components/FileTile2';
import FileTile3 from './components/FileTile3';
import FileTileList from './components/FileTileList';
import FilterPopover, { FilterTags, EMPTY_FILTER } from './components/FilterPopover';
import type { LibraryFilter } from './components/FilterPopover';
import { listLibraryAssets, clearLibraryCache, fileTypeOf } from './libraryService';
import { useConversationHistoryContext } from '@renderer/hooks/context/ConversationHistoryContext';
import { BUCKET_ORDER, bucketOf } from './utils';
import type { LibraryAsset, LibraryFile, LibraryFileType, LibraryViewMode } from './types';
import styles from './index.module.css';

const TYPE_TABS: { key: 'all' | LibraryFileType; i18nKey: string }[] = [
  { key: 'all', i18nKey: 'library.tabs.all' },
  { key: 'doc', i18nKey: 'library.tabs.doc' },
  { key: 'slide', i18nKey: 'library.tabs.slide' },
  { key: 'sheet', i18nKey: 'library.tabs.sheet' },
  { key: 'image', i18nKey: 'library.tabs.image' },
  { key: 'html', i18nKey: 'library.tabs.html' },
  { key: 'code', i18nKey: 'library.tabs.code' },
];

const POPOVER_SHOW_DELAY_MS = 220;
const POPOVER_HIDE_DELAY_MS = 150;

interface FlatFile {
  asset: LibraryAsset;
  fileIndex: number;
}

interface FilteredCard {
  asset: LibraryAsset;
  /** Pinned cover file path — set in type tabs to show the specific matched file. */
  coverFilePath?: string;
}

const LibraryPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversations } = useConversationHistoryContext();

  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | LibraryFileType>('all');
  const [viewMode, setViewMode] = useState<LibraryViewMode>('file');
  const [filter, setFilter] = useState<LibraryFilter>(EMPTY_FILTER);
  const [drawerAsset, setDrawerAsset] = useState<LibraryAsset | null>(null);
  const [drawerFile, setDrawerFile] = useState<LibraryFile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Popover state
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [popoverAsset, setPopoverAsset] = useState<LibraryAsset | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<DOMRect | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  // Unique agent names for filter popover
  const allAgents = useMemo(() => {
    const set = new Set<string>();
    for (const a of assets) if (a.agent) set.add(a.agent);
    return [...set].toSorted((a, b) => a.localeCompare(b));
  }, [assets]);

  // Time-bucket boundaries
  const timeBounds = useMemo(() => {
    const now = Date.now();
    const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const today = startOf(new Date(now));
    const weekAgo = today - 6 * 86400_000;
    const monthAgo = today - 29 * 86400_000;
    return { today, weekAgo, monthAgo };
  }, []);

  const matchesTimeFilter = useCallback(
    (updatedAt: number): boolean => {
      if (!filter.time) return true;
      const { today, weekAgo, monthAgo } = timeBounds;
      if (filter.time === 'today') return updatedAt >= today;
      if (filter.time === 'week') return updatedAt >= weekAgo;
      if (filter.time === 'month') return updatedAt >= monthAgo && updatedAt < weekAgo;
      if (filter.time === 'older') return updatedAt < monthAgo;
      return true;
    },
    [filter.time, timeBounds]
  );

  const matchesAgentFilter = useCallback(
    (agent: string): boolean => {
      if (filter.agents.length === 0) return true;
      return filter.agents.includes(agent);
    },
    [filter.agents]
  );

  const supportsHover = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: hover)').matches && window.matchMedia('(min-width: 769px)').matches;
  }, []);

  const hasMounted = useRef(false);

  useEffect(() => {
    // Guard: don't call setState after this component unmounts.
    let cancelled = false;

    // Account switch: conversations cleared → discard cache and reset UI.
    if (conversations.length === 0) {
      if (hasMounted.current) {
        clearLibraryCache();
        hasMounted.current = false;
        setAssets([]);
        setLoading(true);
      }
      return;
    }

    if (hasMounted.current) return;
    hasMounted.current = true;

    listLibraryAssets(conversations, (updated) => {
      if (!cancelled) setAssets(updated);
    })
      .then((initial) => {
        if (!cancelled) {
          setAssets(initial);
          setLoading(false);
        }
      })
      .catch((e) => {
        console.error('[Library] scan failed:', e);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      // Reset so a remount triggers a fresh scan (cache still serves data instantly).
      hasMounted.current = false;
    };
  }, [conversations, refreshKey]);

  const handleRefresh = useCallback(() => {
    clearLibraryCache();
    hasMounted.current = false;
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const filteredAssets = useMemo((): FilteredCard[] => {
    const q = search.trim().toLowerCase();

    const passesFilter = (asset: LibraryAsset) => matchesAgentFilter(asset.agent) && matchesTimeFilter(asset.updatedAt);

    if (activeTab !== 'all') {
      const fileMap = new Map<string, { asset: LibraryAsset; updatedAt: number; filePath: string }>();
      for (const asset of assets) {
        if (!passesFilter(asset)) continue;
        const matchedFiles = asset.files.filter((f) => fileTypeOf(f.ext) === activeTab);
        if (matchedFiles.length === 0) continue;
        if (q) {
          const hit =
            asset.conversationName.toLowerCase().includes(q) ||
            asset.prompt.toLowerCase().includes(q) ||
            matchedFiles.some((f) => f.name.toLowerCase().includes(q));
          if (!hit) continue;
        }
        for (const file of matchedFiles) {
          const existing = fileMap.get(file.path);
          if (!existing || asset.updatedAt > existing.updatedAt) {
            fileMap.set(file.path, { asset, updatedAt: asset.updatedAt, filePath: file.path });
          }
        }
      }
      return [...fileMap.values()]
        .toSorted((a, b) => b.updatedAt - a.updatedAt)
        .map(({ asset, filePath }) => ({ asset, coverFilePath: filePath }));
    }

    return assets
      .filter((asset) => {
        if (!passesFilter(asset)) return false;
        if (q) {
          const hit =
            asset.conversationName.toLowerCase().includes(q) ||
            asset.prompt.toLowerCase().includes(q) ||
            asset.files.some((f) => f.name.toLowerCase().includes(q));
          if (!hit) return false;
        }
        return true;
      })
      .toSorted((a, b) => b.updatedAt - a.updatedAt)
      .map((asset) => ({ asset }));
  }, [assets, search, activeTab, matchesAgentFilter, matchesTimeFilter]);

  const filteredFiles = useMemo<FlatFile[]>(() => {
    const q = search.trim().toLowerCase();
    const items: FlatFile[] = [];
    assets.forEach((asset) => {
      if (!matchesAgentFilter(asset.agent) || !matchesTimeFilter(asset.updatedAt)) return;
      asset.files.forEach((file, fileIndex) => {
        if (activeTab !== 'all' && fileTypeOf(file.ext) !== activeTab) return;
        if (q) {
          const hit =
            file.name.toLowerCase().includes(q) ||
            asset.conversationName.toLowerCase().includes(q) ||
            asset.prompt.toLowerCase().includes(q);
          if (!hit) return;
        }
        items.push({ asset, fileIndex });
      });
    });
    return items.toSorted((a, b) => b.asset.updatedAt - a.asset.updatedAt);
  }, [assets, search, activeTab, matchesAgentFilter, matchesTimeFilter]);

  const filesGroupedByBucket = useMemo(() => {
    const map = new Map<string, FlatFile[]>();
    filteredFiles.forEach((item) => {
      const bucket = bucketOf(item.asset.updatedAt);
      if (!map.has(bucket.key)) map.set(bucket.key, []);
      map.get(bucket.key)!.push(item);
    });
    return map;
  }, [filteredFiles]);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const hidePopover = useCallback(() => {
    hoveredIdRef.current = null;
    setPopoverAsset(null);
    setPopoverAnchor(null);
  }, []);

  const openDrawer = useCallback(
    (asset: LibraryAsset, file?: LibraryFile) => {
      setDrawerAsset(asset);
      setDrawerFile(file ?? asset.files[0] ?? null);
      setDrawerOpen(true);
      clearTimers();
      hidePopover();
    },
    [clearTimers, hidePopover]
  );

  const handleCardEnter = useCallback(
    (asset: LibraryAsset, e: React.MouseEvent<HTMLDivElement>) => {
      if (!supportsHover || viewMode !== 'conversation') return;
      const cardEl = e.currentTarget;
      hoveredIdRef.current = asset.id;
      clearTimers();

      const showNow = () => {
        if (hoveredIdRef.current !== asset.id) return;
        const rect = cardEl.getBoundingClientRect();
        setPopoverAsset(asset);
        setPopoverAnchor(rect);
      };

      if (popoverAsset && popoverAsset.id !== asset.id) {
        // Already showing another popover — switch immediately, no delay.
        showNow();
      } else if (!popoverAsset) {
        showTimerRef.current = window.setTimeout(showNow, POPOVER_SHOW_DELAY_MS);
      }
    },
    [supportsHover, viewMode, clearTimers, popoverAsset]
  );

  const handleCardLeave = useCallback(
    (assetId: string) => {
      if (!supportsHover || viewMode !== 'conversation') return;
      if (hoveredIdRef.current === assetId) hoveredIdRef.current = null;
      clearTimers();
      hideTimerRef.current = window.setTimeout(() => {
        if (!hoveredIdRef.current) hidePopover();
      }, POPOVER_HIDE_DELAY_MS);
    },
    [supportsHover, viewMode, clearTimers, hidePopover]
  );

  const handlePopoverEnter = useCallback(() => {
    clearTimers();
    if (popoverAsset) hoveredIdRef.current = popoverAsset.id;
  }, [clearTimers, popoverAsset]);

  const handlePopoverLeave = useCallback(() => {
    hoveredIdRef.current = null;
    hideTimerRef.current = window.setTimeout(() => {
      if (!hoveredIdRef.current) hidePopover();
    }, POPOVER_HIDE_DELAY_MS);
  }, [hidePopover]);

  const handleJumpToConversation = useCallback(
    (conversationId: string, filePath?: string) => {
      setDrawerOpen(false);
      navigate(`/conversation/${conversationId}`, { state: filePath ? { previewFilePath: filePath } : undefined });
    },
    [navigate]
  );

  const handleFileClick = useCallback(
    (fileName: string) => {
      Message.info(t('library.toast.mockOpen', { name: fileName }));
    },
    [t]
  );

  // Reset popover state whenever view mode changes.
  useEffect(() => {
    clearTimers();
    hidePopover();
  }, [viewMode, clearTimers, hidePopover]);

  // Hide popover on scroll — position would be stale.
  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const onScroll = () => {
      clearTimers();
      hidePopover();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [clearTimers, hidePopover]);

  const renderConversationGrid = () => {
    if (filteredAssets.length === 0) {
      return (
        <div className={styles.gridInner}>
          <div className={styles.empty}>{t('library.empty')}</div>
        </div>
      );
    }
    return (
      <div className={styles.gridInner}>
        <div className={styles.grid}>
          {filteredAssets.map(({ asset, coverFilePath }) => (
            <AssetCard
              key={coverFilePath ?? asset.id}
              asset={asset}
              activeTab={activeTab}
              coverFilePath={coverFilePath}
              onOpen={() => openDrawer(asset)}
              onMouseEnter={(e) => handleCardEnter(asset, e)}
              onMouseLeave={() => handleCardLeave(asset.id)}
              onMenuClick={() => {
                Message.info(t('library.toast.mockMenu'));
              }}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderFileGrid = () => {
    if (filteredFiles.length === 0) {
      return <div className={styles.empty}>{t('library.empty')}</div>;
    }
    return (
      <div>
        {BUCKET_ORDER.map((bucketKey) => {
          const items = filesGroupedByBucket.get(bucketKey);
          if (!items || items.length === 0) return null;
          const i18nKey = `library.bucket.${bucketKey}`;
          return (
            <div key={bucketKey} className={styles.section}>
              <div className={styles.sectionTitle}>
                {t(i18nKey)}
                <span className={styles.sectionTitleCount}>{items.length}</span>
              </div>
              <div className={styles.fileGrid}>
                {items.map(({ asset, fileIndex }) => (
                  <FileTile
                    key={`${asset.id}-${fileIndex}`}
                    file={asset.files[fileIndex]}
                    asset={asset}
                    onClick={() => openDrawer(asset, asset.files[fileIndex])}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFileGrid2 = () => {
    if (filteredFiles.length === 0) {
      return <div className={styles.empty}>{t('library.empty')}</div>;
    }
    return (
      <div>
        {BUCKET_ORDER.map((bucketKey) => {
          const items = filesGroupedByBucket.get(bucketKey);
          if (!items || items.length === 0) return null;
          const i18nKey = `library.bucket.${bucketKey}`;
          return (
            <div key={bucketKey} className={styles.section}>
              <div className={styles.sectionTitle}>
                {t(i18nKey)}
                <span className={styles.sectionTitleCount}>{items.length}</span>
              </div>
              <div className={styles.fileGrid}>
                {items.map(({ asset, fileIndex }) => (
                  <FileTile2
                    key={`${asset.id}-${fileIndex}`}
                    file={asset.files[fileIndex]}
                    asset={asset}
                    onClick={() => openDrawer(asset, asset.files[fileIndex])}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFileGrid3 = () => {
    if (filteredFiles.length === 0) {
      return <div className={styles.empty}>{t('library.empty')}</div>;
    }
    return (
      <div>
        {BUCKET_ORDER.map((bucketKey) => {
          const items = filesGroupedByBucket.get(bucketKey);
          if (!items || items.length === 0) return null;
          const i18nKey = `library.bucket.${bucketKey}`;
          return (
            <div key={bucketKey} className={styles.section}>
              <div className={styles.sectionTitle}>
                {t(i18nKey)}
                <span className={styles.sectionTitleCount}>{items.length}</span>
              </div>
              <div className={styles.fileGrid}>
                {items.map(({ asset, fileIndex }) => (
                  <FileTile3
                    key={`${asset.id}-${fileIndex}`}
                    file={asset.files[fileIndex]}
                    asset={asset}
                    onClick={() => openDrawer(asset, asset.files[fileIndex])}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderFileList = () => {
    if (filteredFiles.length === 0) {
      return <div className={styles.empty}>{t('library.empty')}</div>;
    }
    return (
      <div>
        {BUCKET_ORDER.map((bucketKey) => {
          const items = filesGroupedByBucket.get(bucketKey);
          if (!items || items.length === 0) return null;
          const i18nKey = `library.bucket.${bucketKey}`;
          return (
            <div key={bucketKey} className={styles.section}>
              <div className={styles.sectionTitle}>
                {t(i18nKey)}
                <span className={styles.sectionTitleCount}>{items.length}</span>
              </div>
              <div className={styles.fileList}>
                {items.map(({ asset, fileIndex }) => (
                  <FileTileList
                    key={`${asset.id}-${fileIndex}`}
                    file={asset.files[fileIndex]}
                    asset={asset}
                    onClick={() => openDrawer(asset, asset.files[fileIndex])}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const containerRect = gridWrapRef.current?.getBoundingClientRect() ?? null;
  const containerScrollTop = gridWrapRef.current?.scrollTop ?? 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.title}>
          <h1>{t('library.title')}</h1>
        </div>
      </div>

      <div className={styles.subtitle}>{t('library.subtitle')}</div>

      {/* 白色工作区容器：tabs + 内容 */}
      <div className={styles.workArea}>
        <div className={styles.tabs}>
          {TYPE_TABS.map((tab) => (
            <div
              key={tab.key}
              className={classNames(styles.tab, activeTab === tab.key && styles.activeTab)}
              onClick={() => setActiveTab(tab.key)}
            >
              {t(tab.i18nKey)}
            </div>
          ))}
          <div className={styles.tabsSpacer} />

          {/* 激活的筛选 tags — 搜索展开时收起，紧靠右侧工具栏 */}
          {!searchOpen && (
            <div className={styles.tabsTagsSlot}>
              <FilterTags filter={filter} onChange={setFilter} />
            </div>
          )}

          <div className={styles.tabsFilterSlot}>
            <FilterPopover filter={filter} allAgents={allAgents} onChange={setFilter} />
          </div>

          {/* 搜索展开区 */}
          <div className={classNames(styles.tabsSearchSlot, searchOpen && styles.searchSlotOpen)}>
            {searchOpen && (
              <Input
                allowClear
                autoFocus
                placeholder={t('library.searchPlaceholder')}
                value={search}
                onChange={setSearch}
                onBlur={() => {
                  if (!search) setSearchOpen(false);
                }}
                className={styles.searchInput}
              />
            )}
            <Tooltip content={t('library.search')} mini>
              <button
                type='button'
                className={classNames(styles.iconBtn, (searchOpen || search) && styles.iconBtnActive)}
                onClick={() => {
                  if (searchOpen && search) {
                    setSearch('');
                    setSearchOpen(false);
                    return;
                  }
                  setSearchOpen((v) => !v);
                }}
              >
                <Search theme='outline' size='14' fill='currentColor' />
              </button>
            </Tooltip>
          </div>

          {/* 刷新按钮 */}
          <Tooltip content={t('library.refresh')} mini>
            <button type='button' className={styles.iconBtn} onClick={handleRefresh} disabled={loading}>
              <Refresh theme='outline' size='14' fill='currentColor' />
            </button>
          </Tooltip>

          <div className={styles.modeToggle}>
            <Tooltip content={t('library.view.file')} mini>
              <button
                type='button'
                className={classNames(styles.modeBtn, viewMode === 'file' && styles.active)}
                onClick={() => setViewMode('file')}
              >
                <svg width='14' height='14' viewBox='0 0 14 14' fill='none'>
                  <rect x='1' y='1' width='5.5' height='5.5' rx='1' fill='currentColor' />
                  <rect x='7.5' y='1' width='5.5' height='5.5' rx='1' fill='currentColor' />
                  <rect x='1' y='7.5' width='5.5' height='5.5' rx='1' fill='currentColor' />
                  <rect x='7.5' y='7.5' width='5.5' height='5.5' rx='1' fill='currentColor' />
                </svg>
              </button>
            </Tooltip>
            <Tooltip content={t('library.view.list')} mini>
              <button
                type='button'
                className={classNames(styles.modeBtn, viewMode === 'list' && styles.active)}
                onClick={() => setViewMode('list')}
              >
                <svg width='14' height='14' viewBox='0 0 14 14' fill='none'>
                  <rect x='1' y='2' width='3' height='3' rx='1' fill='currentColor' />
                  <rect x='6' y='3' width='7' height='1.5' rx='0.75' fill='currentColor' />
                  <rect x='1' y='6.25' width='3' height='3' rx='1' fill='currentColor' />
                  <rect x='6' y='7.25' width='7' height='1.5' rx='0.75' fill='currentColor' />
                  <rect x='1' y='10.5' width='3' height='1.5' rx='0.75' fill='currentColor' />
                  <rect x='6' y='10.5' width='5' height='1.5' rx='0.75' fill='currentColor' />
                </svg>
              </button>
            </Tooltip>
          </div>
        </div>

        <div className={styles.gridWrap} ref={gridWrapRef}>
          {loading ? (
            <div className={styles.empty}>
              <Spin size={24} />
              <div style={{ marginTop: 12 }}>{t('library.loading')}</div>
            </div>
          ) : viewMode === 'conversation' ? (
            renderConversationGrid()
          ) : viewMode === 'file' ? (
            renderFileGrid()
          ) : viewMode === 'file2' ? (
            renderFileGrid2()
          ) : viewMode === 'file3' ? (
            renderFileGrid3()
          ) : (
            renderFileList()
          )}
          <AssetPopover
            asset={popoverAsset}
            anchorRect={popoverAnchor}
            containerRect={containerRect}
            containerScrollTop={containerScrollTop}
            onMouseEnter={handlePopoverEnter}
            onMouseLeave={handlePopoverLeave}
            onFileClick={handleFileClick}
          />
        </div>
      </div>

      <AssetDrawer
        asset={drawerAsset}
        file={drawerFile}
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onJumpToConversation={handleJumpToConversation}
      />
    </div>
  );
};

export default LibraryPage;
