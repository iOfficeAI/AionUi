/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/office/preview';
import type { ChatFileRef } from '@/common/types/chatFile';
import { chatFileRefKey, isChatFileRef } from '@/common/types/chatFile';
import { emitter } from '@/renderer/utils/emitter';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BROWSER_BLANK_URL, BROWSER_TAB_FALLBACK_TITLE, MAX_BROWSER_TABS } from '../browser/constants';
import { isBrowserMcpActivity, isBrowserMcpSettled } from '../browser/agentActivity';
import { maybeNotifyFirstAgentBrowserUse } from '../browser/firstUseNotice';
import type { PreviewScopeKey } from './previewScope';

/** DOM 片段数据结构 / DOM snippet data structure */
export interface DomSnippet {
  /** 唯一 ID / Unique ID */
  id: string;
  /** 简化标签名（用于显示）/ Simplified tag name (for display) */
  tag: string;
  /** 完整 HTML / Full HTML */
  html: string;
}

export interface PreviewMetadata {
  language?: string;
  title?: string;
  diff?: string;
  file_name?: string;
  // ChatFileRef identity — the terminal identity for preview content I/O
  // (read/write/metadata over /api/fs/content). Project refs carry pe identity
  // (explorer files), local/upload refs carry a backend-host path. Preferred over
  // file_path/workspace, which are retained only for viewers not yet migrated
  // (pdf file://, office, shell.openFile, download).
  fileRef?: ChatFileRef;
  file_path?: string; // 工作空间文件的绝对路径 / Absolute file path in workspace
  workspace?: string; // 工作空间根目录 / Workspace root directory
  editable?: boolean; // 是否可编辑 / Whether editable
  // 文件超过大小上限：内容从未被读取，只显示提示 + 逃生按钮
  // File exceeds its size ceiling: content was never read; the tab shows an
  // explanation plus an escape hatch instead of an editor.
  oversized?: boolean;
  sizeBytes?: number; // 实际文件大小 / Actual file size, for the oversized message
  // 打开时生效的上限快照。刻意不在渲染时重算 —— 否则日后阈值改成设置项时，
  // 调小设置会让已打开的 tab 显示新阈值，破坏「只影响新开 tab」的约束。
  // Ceiling captured at open time. Deliberately not recomputed at render time:
  // once the threshold becomes a setting, recomputing would let a changed
  // setting alter tabs already on screen.
  thresholdBytes?: number;
  // 上次已知修改时间，保存时作为 If-Match 乐观并发条件。
  // openPreview 会把它写进 fileMtimeRef —— 那是这个字段唯一的用途。
  // Last-known mtime, the If-Match condition for save-time conflict detection.
  // openPreview copies it into fileMtimeRef, which is this field's only purpose.
  lastModified?: number;
  targetLine?: number; // 打开文件后定位到的目标行 / Target line to reveal after opening
  targetColumn?: number; // 打开文件后定位到的目标列 / Target column to reveal after opening
  missingFile?: boolean; // 文件不存在或无法读取 / Whether the referenced file is missing or unreadable
  favicon?: string; // 浏览器 tab 的站点图标 URL / Site icon URL for browser tabs
  agentActive?: boolean; // Agent 正在操作该浏览器 tab / Agent is currently driving this browser tab
}

export interface PreviewTab {
  id: string;
  content: string;
  content_type: PreviewContentType;
  metadata?: PreviewMetadata;
  title: string; // Tab 标题
  isDirty?: boolean; // 是否有未保存的修改 / Whether there are unsaved changes
  originalContent?: string; // 原始内容，用于对比 / Original content for comparison
}

export interface OpenPreviewOptions {
  /**
   * Reuse the active tab instead of opening a new one — used by file-tree
   * browsing so switching files swaps the single preview instead of stacking
   * tabs. Ignored when the active tab has unsaved edits (falls back to a new
   * tab to avoid losing changes).
   */
  replace?: boolean;
}

/**
 * `updateTab` 允许修改的字段：标题、地址（content）、metadata。
 * 刻意不含 isDirty / originalContent —— 那是编辑器的账，浏览器 tab 不该碰。
 *
 * Fields `updateTab` may patch: title, address (content) and metadata.
 * Deliberately excludes isDirty / originalContent, which belong to the editor's
 * bookkeeping and must not be disturbed by browser tabs.
 */
export type PreviewTabPatch = {
  title?: string;
  content?: string;
  metadata?: PreviewMetadata;
};

export interface PreviewContextValue {
  // 预览面板状态 / Preview panel state
  isOpen: boolean;
  tabs: PreviewTab[]; // 所有打开的 tabs
  activeTabId: string | null; // 当前激活的 tab ID

  // 获取当前激活的 tab / Get active tab
  activeTab: PreviewTab | null;

  // 预览面板操作 / Preview panel operations
  openPreview: (
    content: string,
    type: PreviewContentType,
    metadata?: PreviewMetadata,
    options?: OpenPreviewOptions
  ) => void;
  /**
   * 打开浏览器 tab，省略 url 则开空白页。
   * Open a browser tab; blank page when url is omitted.
   */
  openBrowserTab: (url?: string) => void;
  closePreview: () => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  updateContent: (content: string) => void;
  /**
   * 按 tabId 局部更新 tab（标题 / 地址 / metadata），不影响 dirty 状态。
   * 浏览器 tab 用它把页面标题、favicon、Agent 活动状态同步上来 —— 用 tabId 而非
   * activeTabId 是必须的：后台 tab 的标题也要能更新，不能抢焦点。
   *
   * Patch a tab by id (title / address / metadata) without touching dirty state.
   * Browser tabs use this to sync page title, favicon and agent activity.
   * Addressing by tabId (not activeTabId) is required so background tabs can
   * update without stealing focus.
   */
  updateTab: (tabId: string, patch: PreviewTabPatch) => void;
  /**
   * 浏览器 tab 达到上限、被迫复用旧 tab 的时刻（时间戳）；null 表示未发生。
   * UI 据此提示用户关闭旧 tab，而不是让"复用"看起来像 bug。
   *
   * Timestamp of the most recent browser-tab cap hit (null when it never
   * happened). Lets the UI tell the user to close old tabs instead of leaving
   * the silent tab reuse looking like a bug.
   */
  browserTabLimitHitAt: number | null;
  saveContent: (tabId?: string) => Promise<boolean>; // 保存内容 / Save content
  findPreviewTab: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => PreviewTab | null; // 查找匹配的 tab
  closePreviewByIdentity: (type: PreviewContentType, content?: string, metadata?: PreviewMetadata) => void; // 根据内容关闭指定 tab
  closePreviewIfScopeChanged: (scopeKey: PreviewScopeKey) => void; // 切换隔离 scope(project;见 previewScope.ts):持久化旧 scope、恢复新 scope 的 tabs+可见性(per-project)

  // 发送框集成 / Sendbox integration
  addToSendBox: (text: string) => void;
  setSendBoxHandler: (handler: ((text: string) => void) | null) => void;

  // DOM 片段管理 / DOM snippet management
  domSnippets: DomSnippet[];
  addDomSnippet: (tag: string, html: string) => void;
  removeDomSnippet: (id: string) => void;
  clearDomSnippets: () => void;
}

const PreviewContext = createContext<PreviewContextValue | null>(null);

// Persistence is per **preview scope** (project id, or workspace fallback — see
// `previewScope.ts`), so each project restores its own open tabs + visibility
// when switching conversations / projects. Key: `aionui_preview:<scope>`.
const previewScopeStorageKey = (scope: string): string => `aionui_preview:${scope}`;

/** Persisted per-scope preview state. */
type PersistedScopeState = { isOpen: boolean; tabs: PreviewTab[]; activeTabId: string | null };

// 仅持久化小体积文本预览，避免大文本导致 localStorage 写入卡顿
// Persist only lightweight text previews to avoid localStorage jank on large files
const MAX_PERSISTED_TAB_CONTENT_LENGTH = 80_000;
// `browser` tabs persist so switching projects/conversations restores the same
// open pages (per-project, see `previewScope.ts`). Their `content` is just a URL,
// so they are always well under the size cap.
const PERSISTABLE_CONTENT_TYPES = new Set<PreviewContentType>(['markdown', 'html', 'code', 'diff', 'browser']);

const sanitizeTabsForPersistence = (input: PreviewTab[]): PreviewTab[] => {
  return input
    .filter((tab) => PERSISTABLE_CONTENT_TYPES.has(tab.content_type))
    .filter((tab) => tab.content.length <= MAX_PERSISTED_TAB_CONTENT_LENGTH)
    .map((tab) => ({
      ...tab,
      isDirty: false,
      originalContent: tab.content,
      // Agent activity is a live, per-session signal — never restore it as active.
      metadata: tab.metadata?.agentActive ? { ...tab.metadata, agentActive: false } : tab.metadata,
    }));
};

/**
 * Legacy migration: earlier builds truncated a long text preview to 40,000
 * characters and persisted the remnant (the cap above is 80,000, so it fitted),
 * flagged by a `truncated: true` metadata field that no longer exists.
 *
 * That flag drove the only on-screen warning that the content was a fragment.
 * Restoring such a tab now would show the fragment with no indication at all —
 * silently presenting part of a document as the whole file.
 *
 * So drop these tabs on restore. Note the old threshold compared the *length of
 * content already read*, not the file size, so a file of any size could end up
 * truncated here — reopening one may well land in the oversized state rather than
 * loading fully. Either outcome is honest, which the restored fragment is not.
 * Nothing recoverable is lost: those tabs persisted as read-only, so they hold no
 * unsaved edits, and their remnant was never writable back to disk.
 */
const isLegacyTruncatedTab = (tab: PreviewTab): boolean => {
  // `truncated` is deliberately absent from PreviewMetadata now, so read it
  // through a narrowed view rather than resurrecting the field.
  const legacyMetadata = tab.metadata as (PreviewMetadata & { truncated?: unknown }) | undefined;
  return legacyMetadata?.truncated === true;
};

const parsePersistedTabs = (value: unknown): PreviewTab[] => {
  if (!Array.isArray(value)) return [];

  return value
    .filter((tab): tab is PreviewTab => {
      if (!tab || typeof tab !== 'object') return false;
      const candidate = tab as Partial<PreviewTab>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.title === 'string' &&
        typeof candidate.content === 'string' &&
        typeof candidate.content_type === 'string'
      );
    })
    .filter((tab) => !isLegacyTruncatedTab(tab))
    .filter((tab) => PERSISTABLE_CONTENT_TYPES.has(tab.content_type))
    .filter((tab) => tab.content.length <= MAX_PERSISTED_TAB_CONTENT_LENGTH)
    .map((tab) => {
      // Drop a persisted fileRef that no longer matches the ChatFileRef shape
      // (defensive against stale/tampered localStorage), keeping the rest intact.
      const metadata =
        tab.metadata?.fileRef && !isChatFileRef(tab.metadata.fileRef)
          ? { ...tab.metadata, fileRef: undefined }
          : tab.metadata;
      return {
        ...tab,
        metadata,
        originalContent: typeof tab.originalContent === 'string' ? tab.originalContent : tab.content,
        isDirty: false,
      };
    });
};

const EMPTY_SCOPE_STATE: PersistedScopeState = { isOpen: false, tabs: [], activeTabId: null };

/** Load a scope's persisted preview state (open tabs + visibility). */
const loadScopeState = (scope: string): PersistedScopeState => {
  try {
    const raw = localStorage.getItem(previewScopeStorageKey(scope));
    if (!raw) return EMPTY_SCOPE_STATE;
    const parsed = JSON.parse(raw) as { isOpen?: unknown; tabs?: unknown; activeTabId?: unknown };
    const tabs = parsePersistedTabs(parsed.tabs);
    let activeTabId = typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null;
    if (activeTabId && !tabs.some((tab) => tab.id === activeTabId)) activeTabId = tabs[0]?.id || null;
    return { isOpen: parsed.isOpen === true && tabs.length > 0, tabs, activeTabId };
  } catch {
    return EMPTY_SCOPE_STATE;
  }
};

/** Persist a scope's preview state (lightweight text tabs + active tab + visibility). */
const persistScopeState = (scope: string, state: PersistedScopeState): void => {
  try {
    const tabs = sanitizeTabsForPersistence(state.tabs);
    const activeTabId = tabs.some((t) => t.id === state.activeTabId) ? state.activeTabId : (tabs[0]?.id ?? null);
    localStorage.setItem(previewScopeStorageKey(scope), JSON.stringify({ isOpen: state.isOpen, tabs, activeTabId }));
  } catch {
    // storage full / unavailable — non-fatal
  }
};

export const PreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State starts empty; the active scope's persisted state is loaded on the first
  // `closePreviewIfScopeChanged` (per-project restore, see switchScope below).
  const [isOpen, setIsOpen] = useState(false);
  const [tabs, setTabs] = useState<PreviewTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  // The preview scope currently loaded into state (project id / workspace / null).
  const currentScopeRef = useRef<PreviewScopeKey>(null);
  // Mirror activeTabId in a ref so setTabs updaters can read the latest value
  // without adding activeTabId to their dependencies.
  const activeTabIdRef = useRef<string | null>(null);
  // Mirror tabs in a ref so openPreview can inspect the current tab list before
  // updating state. State updaters must stay pure (StrictMode may run them
  // twice), so decisions with observable side effects are made up front.
  const tabsRef = useRef<PreviewTab[]>([]);
  tabsRef.current = tabs;
  // Set when a browser-tab open was folded into an existing tab because the cap
  // was reached, so the UI can tell the user instead of silently reusing a tab.
  const [browserTabLimitHitAt, setBrowserTabLimitHitAt] = useState<number | null>(null);
  // const [sendBoxHandler, setSendBoxHandlerState] = useState<((text: string) => void) | null>(null);
  const sendBoxHandler = useRef<((text: string) => void) | null>(null);
  const [domSnippets, setDomSnippets] = useState<DomSnippet[]>([]);

  // Persist the active scope's preview state (open tabs + active tab + visibility)
  // to `aionui_preview:<scope>`, debounced. Keeps activeTabIdRef in sync eagerly.
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
    const scope = currentScopeRef.current;
    if (scope == null) return undefined;
    const timer = setTimeout(() => {
      persistScopeState(scope, { isOpen, tabs, activeTabId });
    }, 150);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, isOpen]);

  // 追踪是否正在保存（避免与流式更新冲突）/ Track if currently saving (to avoid conflicts with streaming updates)
  const savingFilesRef = useRef<Set<string>>(new Set());

  // 每个文件上次已知的 mtime，保存时作为 If-Match 条件。
  // 两个填充点：打开 tab 时（openPreview 从 metadata.lastModified 取）和保存成功后。
  // 缺了前者，每个 tab 的首次保存都会不带 If-Match ⇒ 后端跳过冲突检测 ⇒ 静默覆盖。
  //
  // Last-known mtime per file, used as the If-Match condition on save. Two fill
  // points: opening a tab (openPreview, from metadata.lastModified) and a
  // successful save. Without the former, the first save of every tab would carry
  // no If-Match, so the backend would skip conflict detection and silently
  // overwrite a concurrent external edit.
  const fileMtimeRef = useRef<Map<string, number>>(new Map());

  // 获取当前激活的 tab / Get active tab
  const activeTab = useMemo(() => {
    return tabs.find((tab) => tab.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  const normalize = useCallback((value?: string | null) => value?.trim() || '', []);

  // 从可能包含描述的字符串中提取文件名 / Extract filename from string that may contain description
  const extractFileName = useCallback((str?: string): string | undefined => {
    if (!str) return undefined;
    // 匹配 "Writing to xxx.md" 或 "Reading xxx.txt" 等模式，提取文件名 / Match patterns like "Writing to xxx.md" and extract filename
    const match = str.match(/(?:Writing to|Reading|Creating|Updating)\s+(.+)$/i);
    return match ? match[1] : str;
  }, []);

  const findPreviewTabInList = useCallback(
    (tabList: PreviewTab[], type: PreviewContentType, content?: string, meta?: PreviewMetadata) => {
      // Browser tabs are never deduped: each one is an independent page the user
      // (or an agent) opened on purpose. They carry no file identity, so the
      // title/content fallbacks below would wrongly merge two fresh tabs that
      // happen to share a placeholder title.
      if (type === 'browser') return null;

      const normalizedFileName = normalize(meta?.file_name);
      const normalizedTitle = normalize(meta?.title);
      const normalizedFilePath = normalize(meta?.file_path);
      const refKey = meta?.fileRef ? chatFileRefKey(meta.fileRef) : '';

      return (
        tabList.find((tab) => {
          if (tab.content_type !== type) return false;
          const tabFileName = normalize(tab.metadata?.file_name);
          const tabTitle = normalize(tab.metadata?.title);
          const tabFilePath = normalize(tab.metadata?.file_path);
          const tabRefKey = tab.metadata?.fileRef ? chatFileRefKey(tab.metadata.fileRef) : '';

          // 优先通过 ChatFileRef 身份匹配（终态身份，最可靠）
          // Prefer matching by ChatFileRef identity (terminal identity, most reliable)
          if (refKey && tabRefKey && refKey === tabRefKey) return true;

          // 再通过 file_path 匹配（未迁移到 ref 的来源）/ Then match by file_path (sources not yet on a ref)
          if (normalizedFilePath && tabFilePath && normalizedFilePath === tabFilePath) return true;

          // 通过 file_name 匹配时，需要确保路径兼容（避免同名文件在不同目录的冲突）
          // When matching by file_name, ensure path compatibility (avoid conflicts of same-named files in different directories)
          if (normalizedFileName && tabFileName && normalizedFileName === tabFileName) {
            // 如果两边都有 file_path，则必须完全匹配
            // If both have file_path, they must match exactly
            if (normalizedFilePath && tabFilePath) {
              return normalizedFilePath === tabFilePath;
            }
            // 如果只有一边有 file_path，不能仅凭 file_name 匹配
            // If only one side has file_path, cannot match by file_name alone
            if (normalizedFilePath || tabFilePath) {
              return false;
            }
            // 都没有 file_path 时，可以通过 file_name 匹配
            // When neither has file_path, can match by file_name
            return true;
          }

          // 再通过 title 匹配 / Then match by title
          if (!normalizedFileName && normalizedTitle && tabTitle && normalizedTitle === tabTitle) return true;

          // 最后才通过 content 匹配（仅用于小文件）/ Finally match by content (only for small files)
          // 对于大文件（PPT/Excel/Word），不使用 content 比较，避免性能问题
          // For large files (PPT/Excel/Word), skip content comparison to avoid performance issues
          if (!normalizedFileName && !normalizedTitle && !normalizedFilePath && content !== undefined) {
            // 只对小于 100KB 的内容进行比较 / Only compare content smaller than 100KB
            if (content.length < 100000 && tab.content === content) return true;
          }

          return false;
        }) || null
      );
    },
    [normalize]
  );

  const findPreviewTab = useCallback(
    (type: PreviewContentType, content?: string, meta?: PreviewMetadata) => {
      return findPreviewTabInList(tabs, type, content, meta);
    },
    [findPreviewTabInList, tabs]
  );

  const openPreview = useCallback(
    (new_content: string, type: PreviewContentType, meta?: PreviewMetadata, options?: OpenPreviewOptions) => {
      /**
       * 所有决策都在调用 setTabs 之前基于 tabsRef 做完，updater 只负责按决策产出
       * 新数组。
       *
       * 这不是风格问题：React 只在 fiber 没有待处理更新时才会「急切求值」updater，
       * 所以第二次之后 updater 内部的赋值读不到 —— 曾经导致"打开第二个 tab 不切
       * 焦点"。updater 也必须保持纯函数，StrictMode 下会被调用两次。
       *
       * Every decision is made from tabsRef before setTabs is called; the updater
       * only turns those decisions into a new array.
       *
       * This is not stylistic: React eagerly evaluates an updater only while the
       * fiber has no pending update, so assignments made inside it are unreadable
       * from the second call onward — which previously meant "opening a second tab
       * does not focus it". The updater must also stay pure, since StrictMode
       * invokes it twice.
       */
      const currentTabs = tabsRef.current;

      // 记下打开时的 mtime，作为下次保存的 If-Match 条件。
      // 必须在 setTabs 之外做 —— updater 在 StrictMode 下会跑两次，且必须保持纯函数。
      // 这是「打开 tab 时取一次」那个填充点：没有它，每个 tab 的首次保存都不带
      // If-Match，后端会跳过冲突检测并静默覆盖别人的改动。
      //
      // Record the mtime known at open time as the next save's If-Match condition.
      // Done outside setTabs: the updater runs twice under StrictMode and must
      // stay pure. This is the "read once when the tab opens" fill point — without
      // it the first save of every tab carries no If-Match, so the backend skips
      // conflict detection and silently overwrites a concurrent external edit.
      if (meta?.fileRef && meta.lastModified != null) {
        fileMtimeRef.current.set(chatFileRefKey(meta.fileRef), meta.lastModified);
      }

      // 已打开同一内容：聚焦现有 tab，不新建 / Same content already open: focus it
      const existingTab = findPreviewTabInList(currentTabs, type, new_content, meta);

      // 浏览器 tab 上限：满了就复用最旧的一个，并给 UI 一个可提示的信号
      // Browser tab cap: when full, reuse the oldest and raise a signal the UI can
      // surface, so the reuse doesn't look like a bug.
      const atBrowserTabLimit =
        !existingTab &&
        type === 'browser' &&
        currentTabs.filter((tab) => tab.content_type === 'browser').length >= MAX_BROWSER_TABS;
      if (atBrowserTabLimit) setBrowserTabLimitHitAt(Date.now());

      // Tab 标题：优先使用文件名，并从 title 中提取实际文件名
      // Tab title: Prefer file_name and extract actual filename from title
      const fallbackTitle = (() => {
        // 根据内容类型设置默认标题 / Set default title based on content type
        if (type === 'markdown') return 'Markdown';
        if (type === 'diff') return 'Diff';
        if (type === 'code') return `${meta?.language || 'Code'}`;
        if (type === 'image') return 'Image'; // 图片预览默认标题 / Default title for image preview
        if (type === 'browser') return BROWSER_TAB_FALLBACK_TITLE; // 浏览器 tab 标题稍后跟随页面标题 / Browser tab title follows the page title once loaded
        return 'Preview';
      })();

      const title = extractFileName(meta?.file_name) || extractFileName(meta?.title) || fallbackTitle;

      // Single-preview browse mode: reuse the active tab in place instead of
      // stacking a new one — unless it has unsaved edits, then fall back to a
      // new tab so changes aren't lost.
      const replaceTarget = (() => {
        if (existingTab || !options?.replace) return null;
        const activeTab = activeTabIdRef.current
          ? currentTabs.find((tab) => tab.id === activeTabIdRef.current)
          : undefined;
        return activeTab && !activeTab.isDirty ? activeTab : null;
      })();

      // 上限触发时被复用的最旧浏览器 tab / Oldest browser tab reused at the cap
      const cappedTarget = atBrowserTabLimit
        ? (currentTabs.find((tab) => tab.content_type === 'browser') ?? null)
        : null;

      // 生成唯一 ID / Generate unique ID
      const newTabId = `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const targetTabId = existingTab?.id ?? replaceTarget?.id ?? cappedTarget?.id ?? newTabId;

      setTabs((prevTabs) => {
        if (existingTab) {
          return prevTabs.map((tab) => {
            if (tab.id !== existingTab.id) return tab;

            // 如果用户已编辑内容，则保留当前内容，仅更新元数据 / Keep edited content, only merge metadata
            if (tab.isDirty) {
              return meta ? { ...tab, metadata: { ...tab.metadata, ...meta } } : tab;
            }

            return {
              ...tab,
              content: new_content,
              metadata: meta ? { ...tab.metadata, ...meta } : tab.metadata,
              originalContent: new_content,
            };
          });
        }

        const newTab: PreviewTab = {
          id: newTabId,
          content: new_content,
          content_type: type,
          metadata: meta,
          title,
          isDirty: false,
          originalContent: new_content, // 保存原始内容 / Save original content
        };

        if (replaceTarget) {
          const replacedTab: PreviewTab = { ...newTab, id: replaceTarget.id };
          return prevTabs.map((tab) => (tab.id === replaceTarget.id ? replacedTab : tab));
        }

        if (cappedTarget) {
          return prevTabs.map((tab) =>
            tab.id === cappedTarget.id ? { ...tab, content: new_content, title, metadata: meta } : tab
          );
        }

        return [...prevTabs, newTab];
      });

      setActiveTabId(targetTabId);
      setIsOpen(true);
    },
    [extractFileName, findPreviewTabInList]
  );

  /**
   * 打开一个浏览器 tab（省略 url 则开空白页）。
   *
   * 单独提供而不是让调用方拼 openPreview('', 'browser') 的原因：
   * 加号按钮、workspace 下拉入口、Agent 调用是三条独立路径，必须保证
   * 空白页地址、标题兜底完全一致，否则会出现「有的新 tab 是空白、有的是搜索页」。
   *
   * Open a browser tab (blank when no url is given). Exposed as its own method
   * rather than having callers assemble `openPreview('', 'browser')`: the plus
   * button, the workspace dropdown and the agent are three independent entry
   * points, and they must agree on the blank address and fallback title.
   */
  const openBrowserTab = useCallback(
    (url?: string) => {
      openPreview(url?.trim() || BROWSER_BLANK_URL, 'browser');
    },
    [openPreview]
  );

  const closePreview = useCallback(() => {
    setIsOpen(false);
    setTabs([]);
    setActiveTabId(null);
    setDomSnippets([]);
  }, []);

  // Switch the preview scope (project id / workspace fallback / null). Persists
  // the leaving scope's state, then restores the entering scope's persisted open
  // tabs + active tab + visibility — this is what makes preview per-project.
  // Same scope is a no-op. `currentScopeRef` lives in the app-root context so it
  // survives conversation-page remounts.
  const closePreviewIfScopeChanged = useCallback(
    (scopeKey: PreviewScopeKey) => {
      const prev = currentScopeRef.current;
      if (prev === scopeKey) return;
      if (prev != null) persistScopeState(prev, { isOpen, tabs, activeTabId });
      currentScopeRef.current = scopeKey;
      const loaded = scopeKey != null ? loadScopeState(scopeKey) : EMPTY_SCOPE_STATE;
      setTabs(loaded.tabs);
      setActiveTabId(loaded.activeTabId);
      activeTabIdRef.current = loaded.activeTabId;
      setIsOpen(loaded.isOpen);
      setDomSnippets([]);
    },
    [isOpen, tabs, activeTabId]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prevTabs) => {
        // Clean up mtime record for the closed tab (keyed by ChatFileRef identity)
        const tabToClose = prevTabs.find((tab) => tab.id === tabId);
        if (tabToClose?.metadata?.fileRef) {
          fileMtimeRef.current.delete(chatFileRefKey(tabToClose.metadata.fileRef));
        }

        const newTabs = prevTabs.filter((tab) => tab.id !== tabId);

        // 如果关闭的是当前激活的 tab / If closing the active tab
        if (tabId === activeTabId) {
          if (newTabs.length > 0) {
            // 切换到最后一个 tab / Switch to the last tab
            setActiveTabId(newTabs[newTabs.length - 1].id);
          } else {
            // 没有 tab 了，关闭预览面板 / No more tabs, close preview panel
            setIsOpen(false);
            setActiveTabId(null);
          }
        }

        return newTabs;
      });
    },
    [activeTabId]
  );

  const closePreviewByIdentity = useCallback(
    (type: PreviewContentType, content?: string, meta?: PreviewMetadata) => {
      const tab = findPreviewTab(type, content, meta);
      if (tab) {
        closeTab(tab.id);
      }
    },
    [findPreviewTab, closeTab]
  );

  const updateContent = useCallback(
    (new_content: string) => {
      if (!activeTabId) {
        return;
      }

      // 严格的类型检查，防止 Event 对象被错误传递 / Strict type checking to prevent Event object from being passed incorrectly
      if (typeof new_content !== 'string') {
        return;
      }

      try {
        setTabs((prevTabs) => {
          const updated = prevTabs.map((tab) => {
            if (tab.id === activeTabId) {
              // 检查内容是否与原始内容不同 / Check if content differs from original
              const isDirty = new_content !== tab.originalContent;
              return { ...tab, content: new_content, isDirty };
            }
            return tab;
          });
          return updated;
        });
      } catch {
        // Silently ignore errors
      }
    },
    [activeTabId]
  );

  const updateTab = useCallback((tabId: string, patch: PreviewTabPatch) => {
    if (!tabId) return;

    setTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.id !== tabId) return tab;

        const next: PreviewTab = { ...tab };
        if (typeof patch.title === 'string' && patch.title) next.title = patch.title;
        if (typeof patch.content === 'string') next.content = patch.content;
        if (patch.metadata) next.metadata = { ...tab.metadata, ...patch.metadata };
        return next;
      })
    );
  }, []);

  const saveContent = useCallback(
    async (tabId?: string) => {
      const targetTabId = tabId || activeTabId;
      if (!targetTabId) return false;

      const tab = tabs.find((t) => t.id === targetTabId);
      if (!tab) return false;

      // 写回由 ChatFileRef 身份寻址的文件 / Write back to the file addressed by ChatFileRef identity
      const fileRef = tab.metadata?.fileRef;
      if (fileRef) {
        const saveKey = chatFileRefKey(fileRef);
        try {
          // 标记正在保存（避免触发轮询/流式回调）/ Mark as saving (avoid triggering poll/stream callbacks)
          savingFilesRef.current.add(saveKey);

          // PUT /content：带 If-Match(上次已知 mtime) 乐观并发，冲突后端返 409
          // PUT /content: optimistic concurrency via If-Match (last-known mtime); backend returns 409 on conflict
          const ifMatch = fileMtimeRef.current.get(saveKey);
          const success = await ipcBridge.fs.writeContent.invoke({ file: fileRef, data: tab.content, ifMatch });

          if (success) {
            setTabs((prevTabs) =>
              prevTabs.map((t) => {
                if (t.id === targetTabId) {
                  return { ...t, isDirty: false, originalContent: t.content };
                }
                return t;
              })
            );
            // 保存成功后刷新已知 mtime，供下次保存发送新鲜 If-Match
            // Refresh known mtime after a successful save so the next save sends a fresh If-Match
            void ipcBridge.fs.getContentMetadata
              .invoke({ file: fileRef })
              .then((metadata) => {
                if (metadata) fileMtimeRef.current.set(saveKey, metadata.lastModified);
              })
              .catch(() => {
                // metadata refresh is best-effort — a stale If-Match just re-triggers 409, never data loss
              });
          }

          // 延迟移除保存标记（给变更检测一点时间忽略本次写入）/ Delay removing save flag (give change detection time to ignore this write)
          setTimeout(() => {
            savingFilesRef.current.delete(saveKey);
          }, 500);

          return success;
        } catch (error) {
          // 确保移除保存标记 / Ensure save flag is removed
          savingFilesRef.current.delete(saveKey);
          throw error;
        }
      }
      return false;
    },
    [activeTabId, tabs]
  );

  const addToSendBox = useCallback((text: string) => {
    if (sendBoxHandler.current) {
      sendBoxHandler.current(text);
    }
  }, []);

  const setSendBoxHandler = useCallback((handler: ((text: string) => void) | null) => {
    sendBoxHandler.current = handler;
  }, []);

  // DOM 片段管理函数 / DOM snippet management functions
  // 只保留最新的一个片段 / Only keep the latest snippet
  const addDomSnippet = useCallback((tag: string, html: string) => {
    const id = `snippet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setDomSnippets([{ id, tag, html }]);
  }, []);

  const removeDomSnippet = useCallback((id: string) => {
    setDomSnippets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const clearDomSnippets = useCallback(() => {
    setDomSnippets([]);
  }, []);

  // 流式内容订阅：订阅 agent 写入文件时的流式更新（替代文件监听）
  // Streaming content subscription: Subscribe to streaming updates when agent writes files (replaces file watching)
  // 使用防抖优化：等待 agent 完成写入后再更新预览，避免打字动画被频繁中断
  // Use debounce optimization: Wait for agent to finish writing before updating preview, avoiding frequent animation interruptions
  useEffect(() => {
    // 防抖定时器映射：每个文件路径对应一个定时器 / Debounce timer map: one timer per file path
    const debounceTimers = new Map<string, NodeJS.Timeout>();

    const unsubscribe = ipcBridge.fileStream.contentUpdate.on(({ file_path, content, operation }) => {
      // 如果是删除操作，立即处理，不需要防抖 / If delete operation, handle immediately without debounce
      if (operation === 'delete') {
        // 清除该文件的防抖定时器 / Clear debounce timer for this file
        const existingTimer = debounceTimers.get(file_path);
        if (existingTimer) {
          clearTimeout(existingTimer);
          debounceTimers.delete(file_path);
        }

        setTabs((prevTabs) => {
          const tabToClose = prevTabs.find((tab) => tab.metadata?.file_path === file_path);
          if (tabToClose) {
            closeTab(tabToClose.id);
          }
          return prevTabs;
        });
        return;
      }

      // 对写入操作进行防抖：500ms 内没有新的更新才真正更新内容
      // Debounce write operations: Only update content if no new updates within 500ms
      const existingTimer = debounceTimers.get(file_path);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        // 使用函数式更新来访问最新的 tabs 状态 / Use functional update to access latest tabs state
        setTabs((prevTabs) => {
          // 查找受影响的 tabs / Find affected tabs
          const affectedTabs = prevTabs.filter((tab) => tab.metadata?.file_path === file_path);

          if (affectedTabs.length === 0) {
            return prevTabs;
          }

          return prevTabs.map((tab) => {
            if (tab.metadata?.file_path !== file_path) return tab;

            // 如果正在保存或用户已编辑，不更新 / Don't update if saving or user has edited
            // (save flag is keyed by ChatFileRef identity)
            const savingKey = tab.metadata?.fileRef ? chatFileRefKey(tab.metadata.fileRef) : undefined;
            if ((savingKey && savingFilesRef.current.has(savingKey)) || tab.isDirty) {
              return tab;
            }

            return {
              ...tab,
              content,
              originalContent: content,
              isDirty: false,
            };
          });
        });

        // 清除定时器 / Clean up timer
        debounceTimers.delete(file_path);
      }, 500); // 500ms 防抖时间 / 500ms debounce delay

      debounceTimers.set(file_path, timer);
    });

    return () => {
      unsubscribe();
      // 清理所有防抖定时器 / Clean up all debounce timers
      debounceTimers.forEach((timer) => clearTimeout(timer));
      debounceTimers.clear();
    };
  }, [closeTab]); // 只依赖 closeTab，不依赖 tabs，避免重复订阅 / Only depend on closeTab, not tabs, to avoid re-subscribing

  // 监听 preview.open 事件（用于 agent 打开网页预览）/ Listen to preview.open event (for agent to open web preview)
  // 同时监听 IPC 和 renderer emitter 两种方式 / Listen to both IPC and renderer emitter
  useEffect(() => {
    const handleEmitterPreviewOpen = (data: {
      content: string;
      contentType: PreviewContentType;
      metadata?: PreviewMetadata;
    }) => {
      if (data && data.content) {
        openPreview(data.content, data.contentType, data.metadata);
      }
    };

    const handleIpcPreviewOpen = (data: {
      content: string;
      content_type: PreviewContentType;
      metadata?: PreviewMetadata;
    }) => {
      if (data && data.content) {
        openPreview(data.content, data.content_type, data.metadata);
      }
    };

    // 监听 renderer emitter 事件 / Listen to renderer emitter event
    emitter.on('preview.open', handleEmitterPreviewOpen);

    // 监听 IPC 事件（来自主进程，如 chrome-devtools MCP 导航）/ Listen to IPC event (from main process, e.g., chrome-devtools MCP navigation)
    const unsubscribeIpc = ipcBridge.preview.open.on(handleIpcPreviewOpen);

    return () => {
      emitter.off('preview.open', handleEmitterPreviewOpen);
      unsubscribeIpc();
    };
  }, [openPreview]);

  /**
   * 跟踪 Agent 对应用内浏览器的操作，并驱动两件事：
   * 1. tab 上的活动角标（持续显示，用户随时知道浏览器不是自己在动）
   * 2. 首次操作时的一次性提示（不打断、不需要确认）
   *
   * 为什么监听工具调用流而不是等浏览器自己上报：Agent 是通过 CDP 直接操作 webview
   * 的，webview 只会看到"页面变了"，分不清是用户点的还是 Agent 点的。工具调用流是
   * 唯一能区分二者的信号。
   *
   * Tracks the agent's use of the in-app browser and drives two things: the
   * persistent activity badge on the tab (so the user always knows the browser is
   * not moving on its own), and a one-time first-use notice.
   *
   * Why watch the tool-call stream rather than have the browser report itself: the
   * agent drives the webview through CDP, and the webview only sees "the page
   * changed" — indistinguishable from a user click. The tool-call stream is the only
   * signal that separates the two.
   */
  useEffect(() => {
    const markBrowserTabs = (agentActive: boolean) => {
      setTabs((prevTabs) => {
        // 只标记浏览器 tab；没有浏览器 tab 时返回原数组，避免无意义的重渲染
        // Only browser tabs are marked; return the same array when there are none
        // so no pointless re-render is triggered.
        if (
          !prevTabs.some((tab) => tab.content_type === 'browser' && Boolean(tab.metadata?.agentActive) !== agentActive)
        ) {
          return prevTabs;
        }
        return prevTabs.map((tab) =>
          tab.content_type === 'browser' ? { ...tab, metadata: { ...tab.metadata, agentActive } } : tab
        );
      });
    };

    /**
     * 这个订阅纯粹是锦上添花（一个角标 + 一次提示）。如果消息流不可用（WebUI
     * 未连接、测试环境未提供该通道），不能让整个预览面板挂掉 —— 预览是主功能，
     * 角标不是。
     *
     * This subscription is purely cosmetic (a badge and a one-time notice). If the
     * message stream is unavailable (WebUI not connected, a test harness not
     * providing the channel), it must not take the whole preview panel down —
     * previewing is the primary feature, the badge is not.
     */
    const stream = ipcBridge.conversation?.responseStream;
    if (!stream?.on) return;

    const unsubscribe = stream.on((message) => {
      if (isBrowserMcpActivity(message.type, message.data)) {
        markBrowserTabs(true);
        maybeNotifyFirstAgentBrowserUse();
        return;
      }
      if (isBrowserMcpSettled(message.type, message.data)) {
        markBrowserTabs(false);
      }
    });

    return unsubscribe;
  }, []);

  const previewContextValue = useMemo(() => {
    return {
      isOpen,
      tabs,
      activeTabId,
      activeTab,
      openPreview,
      closePreview,
      closeTab,
      switchTab: setActiveTabId,
      updateContent,
      updateTab,
      openBrowserTab,
      browserTabLimitHitAt,
      saveContent,
      findPreviewTab,
      closePreviewByIdentity,
      closePreviewIfScopeChanged,
      addToSendBox,
      setSendBoxHandler,
      domSnippets,
      addDomSnippet,
      removeDomSnippet,
      clearDomSnippets,
    };
  }, [
    isOpen,
    tabs,
    activeTabId,
    activeTab,
    openPreview,
    closePreview,
    closeTab,
    setActiveTabId,
    updateContent,
    updateTab,
    openBrowserTab,
    browserTabLimitHitAt,
    saveContent,
    findPreviewTab,
    closePreviewByIdentity,
    closePreviewIfScopeChanged,
    addToSendBox,
    setSendBoxHandler,
    domSnippets,
    addDomSnippet,
    removeDomSnippet,
    clearDomSnippets,
  ]);

  return <PreviewContext.Provider value={previewContextValue}>{children}</PreviewContext.Provider>;
};

export const usePreviewContext = () => {
  const context = useContext(PreviewContext);
  if (!context) {
    throw new Error('usePreviewContext must be used within PreviewProvider');
  }
  return context;
};

/**
 * 可选版本：不在 PreviewProvider 内时返回 null，而不是抛错。
 *
 * 给「预览只是附带能力」的组件用 —— 例如文件树顶部的工具下拉，它主要负责拉起
 * 外部程序，只是顺带提供一个"打开应用内浏览器"选项。这种组件不该因为一个可选
 * 菜单项就强制要求整个预览上下文存在。
 *
 * Optional variant: returns null outside a PreviewProvider instead of throwing.
 * For components where previewing is incidental — e.g. the file-tree tool dropdown,
 * whose main job is launching external programs and which merely also offers "open
 * the in-app browser". Such a component should not hard-require the entire preview
 * context for one optional menu entry.
 */
export const useOptionalPreviewContext = (): PreviewContextValue | null => {
  return useContext(PreviewContext);
};
