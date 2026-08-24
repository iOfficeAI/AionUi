/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/office/preview';
import type { ChatFileRef, ContentEncoding } from '@/common/types/chatFile';
import { chatFileRefKey, isChatFileRef } from '@/common/types/chatFile';
import { emitter } from '@/renderer/utils/emitter';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BROWSER_BLANK_URL, BROWSER_TAB_FALLBACK_TITLE, MAX_BROWSER_TABS } from '../browser/constants';
import { isBrowserMcpActivity, isBrowserMcpSettled } from '../browser/agentActivity';
import { maybeNotifyFirstAgentBrowserUse } from '../browser/firstUseNotice';
import { listPersistedPreviewScopeKeys, previewScopeStorageKey, type PreviewScopeKey } from './previewScope';
import { peKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import { reflessTabKey } from './reflessTabKey';
import { onPreviewWatchChange, reconcilePreviewWatch, resetPreviewWatch } from './previewWatchStore';

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
  /**
   * 面板是否最大化：隐藏中间聊天区，让预览占满聊天区腾出的空间；左侧边栏与右侧
   * 工作区/资源管理器列均保持不变。纯 session 级视图态，不随 scope 持久化 ——
   * 关闭面板或切换 scope 都会归位，以免下次打开意外进入最大化。
   *
   * Whether the panel is maximized: the middle chat area is hidden and the preview
   * fills the space it vacated, while the left sidebar and right workspace/explorer
   * column stay unchanged. A session-only view state, not persisted per scope —
   * closing the panel or switching scope resets it so reopening never lands in an
   * unexpected maximized state.
   */
  isMaximized: boolean;
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
  /** 切换最大化 / Toggle maximized. */
  toggleMaximized: () => void;
  /** Discard this scope's tabs entirely (see closePreview for the difference). */
  clearPreviewForScope: () => void;
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
  /**
   * Timestamp of the most recent time persisting tabs had to be given up because
   * local storage is full (null when it never happened).
   *
   * Surfaced so the UI can say it out loud: persistence failing silently meant a
   * user's tabs simply stopped coming back after switching projects, with nothing
   * connecting that to a full storage quota.
   */
  persistQuotaExceededAt: number | null;
  saveContent: (tabId?: string) => Promise<boolean>; // 保存内容 / Save content
  /** Re-read a tab from disk, replacing its content and clearing its dirty mark. */
  reloadTabContent: (tabId: string) => Promise<boolean>;
  /**
   * Tab ids with a reported, unconsumed change on disk.
   *
   * Drives the refresh control's amber state. Keyed by tab so two tabs in the same
   * watched directory are flagged independently — the directory changed, but only the
   * tabs whose own file changed should say so.
   */
  tabsWithUpdate: ReadonlySet<string>;
  /** Clear a tab's pending-change mark (after a reload, or when it is dismissed). */
  clearTabUpdate: (tabId: string) => void;
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
// when switching conversations / projects. Key: `preview-ui:<scope>`.

/**
 * How many scopes keep persisted state, least-recently-written evicted first.
 *
 * Sizing: a scope holds at most a handful of text tabs, each capped at
 * {@link MAX_PERSISTED_TAB_CONTENT_LENGTH} (80k chars) — so a *pathological*
 * scope approaches a few hundred KB, while a typical one is a few KB. Browsers
 * give an origin roughly 5–10 MB of localStorage, shared with everything else the
 * app stores. 12 keeps the realistic footprint comfortably inside that (~tens of
 * KB typical) and still bounds the worst case, while being far more scopes than
 * anyone switches between in a session.
 *
 * Previously unbounded: every project ever opened kept its entry forever, with no
 * cleanup anywhere, so the quota could only ever be approached, never released.
 */
const MAX_PERSISTED_SCOPES = 12;

/** Persisted per-scope preview state. */
type PersistedScopeState = { isOpen: boolean; tabs: PreviewTab[]; activeTabId: string | null };

// 仅持久化小体积文本预览，避免大文本导致 localStorage 写入卡顿
// Persist only lightweight text previews to avoid localStorage jank on large files
const MAX_PERSISTED_TAB_CONTENT_LENGTH = 80_000;
// `browser` tabs persist so switching projects/conversations restores the same
// open pages (per-project, see `previewScope.ts`). Their `content` is just a URL,
// so they are always well under the size cap.
/**
 * Types whose content never comes from `/api/fs/content`: pdf streams from a URL,
 * office renders through its own process, and an unsupported format has nothing to
 * render. Reloading these means telling their viewer to re-fetch, not re-reading text.
 */
const CONTENT_FREE_PREVIEW_TYPES = new Set<PreviewContentType>(['pdf', 'word', 'excel', 'ppt', 'unsupported']);

/**
 * Types whose content can be fetched again from the file, so storing it is pointless.
 *
 * The test is **re-obtainability**, not whether the type is editable. Their viewers
 * already re-fetch from the `fileRef`: a pdf builds a stream URL from it, office hands
 * it to its own process and ignores `content` entirely, and the image viewer re-reads
 * whenever `content` is absent. Persisting the bytes buys nothing that reopening does
 * not, and for an image it costs a great deal — a data URL up to the 20 MB image
 * ceiling would exhaust the storage quota on its own and start evicting other projects'
 * tabs through the LRU.
 *
 * ⚠️ Do not extend this by asking "is the type read-only". `diff` and `patch` are
 * declared `editable: false` in the type table, and adding them here would destroy
 * them: a diff tab's content is a patch generated by an agent
 * (`useDiffPreviewHandlers` passes `diffContent` and no file), so there is no file on
 * disk to re-read and blanking it loses the only copy. Read-only says the UI will not
 * offer an editor; it says nothing about where the content came from, and those are
 * different questions.
 *
 * Storing an empty `content` here is safe because the content is recoverable, not
 * because these tabs cannot be edited — an `editable: false` tab CAN currently go
 * dirty (Explorer marks every markdown read-only, yet the markdown branch mounts a
 * writable editor), so "read-only implies clean" is not a property to rely on. What
 * makes the blank safe is that every one of these types renders from its ref, so
 * nothing ever reads the empty string as the file's contents.
 *
 * A tab of one of these types without a `fileRef` has nothing to restore from, so it is
 * dropped rather than restored as a permanently empty viewer.
 */
const REFETCHABLE_CONTENT_TYPES = new Set<PreviewContentType>([...CONTENT_FREE_PREVIEW_TYPES, 'image']);

/**
 * Types worth persisting at all.
 *
 * Everything the panel can open, which is the point: this used to list only the text
 * types, so switching project and back silently dropped every image, pdf and office
 * tab. The tabs were still in memory — collapsing and reopening the panel restored all
 * of them — so the loss appeared only when the panel's state went through storage,
 * which made it look like the file types were unsupported rather than unsaved.
 */
const PERSISTABLE_CONTENT_TYPES = new Set<PreviewContentType>([
  'markdown',
  'html',
  'code',
  'csv',
  'diff',
  'browser',
  'image',
  'pdf',
  'word',
  'excel',
  'ppt',
  'unsupported',
]);

/**
 * Reduce one tab to what should be written, or `null` to drop it.
 *
 * The split is by whether the content can be got back. If it can (a file the viewer
 * re-fetches from its ref), only the identity is stored. If it cannot — text being
 * edited, or a diff generated in a conversation — the content is the only copy and has
 * to be written, which is the data loss this whole area has been about.
 */
const tabForPersistence = (tab: PreviewTab): PreviewTab | null => {
  const shared = {
    ...tab,
    // Agent activity is a live, per-session signal — never restore it as active.
    metadata: tab.metadata?.agentActive ? { ...tab.metadata, agentActive: false } : tab.metadata,
  };

  if (REFETCHABLE_CONTENT_TYPES.has(tab.content_type)) {
    // A missing `fileRef` is not rejected here. Dropping unrestorable tabs is the
    // reader's job, whose guard covers every stored record rather than only the ones
    // this build wrote — refusing here as well would be a second copy of the same rule,
    // and two guards for one rule invite deleting either as "already covered".
    //
    // Blanked before any size check, so a large image is stored rather than dropped for
    // being large: the size cap exists to keep bulky text out of storage, and there is
    // no text here to keep out.
    return { ...shared, content: '', originalContent: '', isDirty: false };
  }

  if (tab.content.length > MAX_PERSISTED_TAB_CONTENT_LENGTH) return null;

  return {
    ...shared,
    // Preserve the edit and the fact that it is unsaved. `originalContent` keeps
    // the last saved text so the dirty comparison still works after restore.
    isDirty: tab.isDirty === true,
    originalContent: typeof tab.originalContent === 'string' ? tab.originalContent : tab.content,
  };
};

/**
 * Prepare tabs for persistence.
 *
 * Unsaved edits are stored **as unsaved** — content, original content and the dirty
 * flag all as they stand. Previously this forced `isDirty: false` and overwrote
 * `originalContent` with the edited text, so an unsaved edit was written to disk
 * looking exactly like a saved one: on restart the tab showed no dirty marker, and
 * the user had no way to tell that their change had never reached the file.
 *
 * Keeping the flag is also what makes "switch away and back leaves things as they
 * were" true rather than approximately true — the restored tab is still dirty, still
 * marked, and Cmd+S still writes it.
 */
const sanitizeTabsForPersistence = (input: PreviewTab[]): PreviewTab[] => {
  return input
    .filter((tab) => PERSISTABLE_CONTENT_TYPES.has(tab.content_type))
    .map(tabForPersistence)
    .filter((tab): tab is PreviewTab => tab !== null);
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

  return (
    value
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
      // The size cap applies to stored text only. Identity-restored tabs were written
      // with an empty content, so they pass it either way — but checking them against a
      // text limit would be asserting something about a value that carries no text.
      .filter(
        (tab) =>
          REFETCHABLE_CONTENT_TYPES.has(tab.content_type) || tab.content.length <= MAX_PERSISTED_TAB_CONTENT_LENGTH
      )
      // An identity-restored tab has nothing but its ref to reopen from, so one without
      // a ref would restore as a viewer that can never show anything.
      .filter((tab) => !REFETCHABLE_CONTENT_TYPES.has(tab.content_type) || Boolean(tab.metadata?.fileRef))
      // A stored ref that no longer matches the ChatFileRef shape (stale or tampered
      // storage) means this tab's identity is unusable. Drop the whole tab.
      //
      // The previous behaviour — strip the ref, keep the tab — was worse than it
      // looked: the tab silently became ref-less, so it no longer matched itself on
      // reopen and the same file opened a second tab. It also could not be saved,
      // since writing goes through the ref. Keeping a tab that can neither dedup nor
      // save only postpones the confusion.
      .filter((tab) => !tab.metadata?.fileRef || isChatFileRef(tab.metadata.fileRef))
      .map((tab) => ({
        ...tab,
        originalContent: typeof tab.originalContent === 'string' ? tab.originalContent : tab.content,
        // Restore the unsaved state as it was stored. Forcing `false` here is what
        // made a restored unsaved edit look saved.
        isDirty: tab.isDirty === true,
      }))
  );
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

/** Parse one stored scope entry, or null when absent/corrupt. */
const readPersistedEntry = (key: string): { tabs?: unknown; savedAt?: unknown } | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { tabs?: unknown; savedAt?: unknown }) : null;
  } catch {
    return null;
  }
};

/**
 * Drop the coldest scope entries until at most `keep` remain **in total**.
 *
 * `protectedKey` is never evicted (it is the scope just written, which the user is
 * looking at) but it still counts toward `keep` — otherwise the stored total would
 * settle at `keep + 1`.
 *
 * Recency comes from the `savedAt` stamp written with each entry; entries from
 * before that stamp existed (or with a corrupt one) sort oldest and are evicted
 * first, which is the right bias — they are by definition the least recently
 * written by this build.
 */
const evictColdestScopes = (keep: number, protectedKey?: string): void => {
  const allKeys = listPersistedPreviewScopeKeys();
  const evictable = allKeys
    .filter((key) => key !== protectedKey)
    .map((key) => {
      let savedAt = 0;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as { savedAt?: unknown };
        if (typeof parsed.savedAt === 'number') savedAt = parsed.savedAt;
      } catch {
        // Unparseable entry — treat as coldest so it is the first to go.
      }
      return { key, savedAt };
    })
    .toSorted((a, b) => a.savedAt - b.savedAt);

  // Count every stored scope, including the protected one, against the cap.
  const excess = Math.min(allKeys.length - keep, evictable.length);
  for (let i = 0; i < excess; i++) {
    localStorage.removeItem(evictable[i].key);
  }
};

/**
 * Called when persistence had to be abandoned because storage is full.
 *
 * Wired by the provider to a visible warning. Silence was the old behaviour and
 * the reason this needed fixing: writes failed, tabs stopped coming back after a
 * project switch, and nothing ever told the user why.
 */
let onPersistQuotaExceeded: (() => void) | null = null;

/** Persist a scope's preview state (lightweight text tabs + active tab + visibility). */
const persistScopeState = (scope: string, state: PersistedScopeState): void => {
  const key = previewScopeStorageKey(scope);
  const write = (): void => {
    const tabs = sanitizeTabsForPersistence(state.tabs);
    const activeTabId = tabs.some((t) => t.id === state.activeTabId) ? state.activeTabId : (tabs[0]?.id ?? null);
    const payload = { isOpen: state.isOpen, tabs, activeTabId };

    // `savedAt` drives LRU eviction, so it has to mean "the tabs here last changed",
    // not "this key was last written". Writes also happen for visibility-only changes
    // — collapsing the panel persists `isOpen` — and letting those bump the stamp
    // would make a scope the user merely glanced at outrank one holding real work,
    // evicting the wrong entry. So carry the previous stamp forward when the stored
    // tab set is unchanged.
    const previous = readPersistedEntry(key);
    const tabsUnchanged = previous !== null && JSON.stringify(previous.tabs) === JSON.stringify(tabs);
    const savedAt = tabsUnchanged && typeof previous.savedAt === 'number' ? previous.savedAt : Date.now();

    localStorage.setItem(key, JSON.stringify({ ...payload, savedAt }));
  };

  try {
    write();
    // Bound the number of scopes kept. Runs after a successful write so the scope
    // just written is never the one evicted.
    evictColdestScopes(MAX_PERSISTED_SCOPES, key);
  } catch {
    // Out of quota (or storage unavailable). Free the coldest scopes and retry
    // once — persistence recovering on its own is better than a warning the user
    // can do nothing about.
    try {
      evictColdestScopes(Math.floor(MAX_PERSISTED_SCOPES / 2), key);
      write();
    } catch {
      // Still failing: this scope's tabs will not come back. Say so rather than
      // letting persistence die quietly.
      onPersistQuotaExceeded?.();
    }
  }
};

export const PreviewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State starts empty; the active scope's persisted state is loaded on the first
  // `closePreviewIfScopeChanged` (per-project restore, see switchScope below).
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
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
  // Set when a persist attempt was abandoned on a full quota, so the UI can warn
  // instead of letting persistence stop working unannounced.
  const [persistQuotaExceededAt, setPersistQuotaExceededAt] = useState<number | null>(null);

  // Tabs whose file has been reported as changed and not yet re-read.
  const [tabsWithUpdate, setTabsWithUpdate] = useState<ReadonlySet<string>>(() => new Set());

  const clearTabUpdate = useCallback((tabId: string) => {
    setTabsWithUpdate((prev) => {
      if (!prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.delete(tabId);
      return next;
    });
  }, []);

  // Translate "a watched directory changed" into "these tabs may be stale".
  //
  // Marking rather than reloading is deliberate: silently replacing what is on screen
  // is what the old poller did, and it could overwrite an edit in progress. The user
  // decides when to take the new content.
  //
  // If you are here because the refresh indicator did not light up: check what the
  // signal was. A `files` signal only flags the tabs it names, so a change to a file no
  // tab has open correctly flags nothing. A `directory` signal flags every tab in that
  // directory, because the report could not say which file changed.
  //
  // What still gets lost: a change the backend never reported at all. The kernel drops
  // events under load, and the rescan that follows *replaces* the per-file changes
  // coalesced into its window rather than accompanying them — those are gone, not
  // delayed. The directory signal is what keeps that from passing as silence.
  useEffect(() => {
    return onPreviewWatchChange((changedDir, signal) => {
      const affected = tabsRef.current
        .filter((tab) => {
          const ref = tab.metadata?.fileRef;
          if (!ref || ref.kind !== 'project') return false;
          const lastSlash = ref.relative_path.lastIndexOf('/');
          const dir = lastSlash < 0 ? '' : ref.relative_path.slice(0, lastSlash);
          if (peKey(ref.pe_id, dir) !== changedDir) return false;
          // A named report is matched per file: several tabs usually share a directory,
          // and flagging all of them would send the user to re-read files that never
          // changed. Without names there is nothing to narrow by, so living in the
          // directory is enough.
          if (signal.kind === 'directory') return true;
          const name = lastSlash < 0 ? ref.relative_path : ref.relative_path.slice(lastSlash + 1);
          return signal.names.includes(name);
        })
        .map((tab) => tab.id);
      if (affected.length === 0) return;
      setTabsWithUpdate((prev) => {
        const next = new Set(prev);
        for (const id of affected) next.add(id);
        return next;
      });
    });
  }, []);

  // Route the module-level persist failure hook into this provider's state.
  useEffect(() => {
    onPersistQuotaExceeded = () => setPersistQuotaExceededAt(Date.now());
    return () => {
      onPersistQuotaExceeded = null;
    };
  }, []);
  // const [sendBoxHandler, setSendBoxHandlerState] = useState<((text: string) => void) | null>(null);
  const sendBoxHandler = useRef<((text: string) => void) | null>(null);
  const [domSnippets, setDomSnippets] = useState<DomSnippet[]>([]);

  // Persist the active scope's preview state (open tabs + active tab + visibility)
  // to `preview-ui:<scope>`, debounced. Keeps activeTabIdRef in sync eagerly.
  useEffect(() => {
    activeTabIdRef.current = activeTabId;
    const scope = currentScopeRef.current;
    if (scope == null) return undefined;
    const timer = setTimeout(() => {
      persistScopeState(scope, { isOpen, tabs, activeTabId });
    }, 150);
    return () => clearTimeout(timer);
  }, [tabs, activeTabId, isOpen]);

  // Keep the panel's directory subscriptions in step with its open tabs.
  //
  // Driven by tab state, not by an "a tab opened" event: a file reached from a chat
  // link starts with a local ref and only gains its project identity after an async
  // upgrade, whose write-back lands here as a metadata change. Recomputing on every
  // tabs change is what picks that up — deciding once at open time would leave that
  // file without signals forever, and without any error to notice.
  //
  // Reconciliation diffs wanted against subscribed, so the extra passes this causes
  // (StrictMode, or any other feature writing to tab metadata) cost nothing.
  useEffect(() => {
    reconcilePreviewWatch(tabs);
  }, [tabs]);

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

  // 从可能包含描述的字符串中提取文件名 / Extract filename from string that may contain description
  const extractFileName = useCallback((str?: string): string | undefined => {
    if (!str) return undefined;
    // 匹配 "Writing to xxx.md" 或 "Reading xxx.txt" 等模式，提取文件名 / Match patterns like "Writing to xxx.md" and extract filename
    const match = str.match(/(?:Writing to|Reading|Creating|Updating)\s+(.+)$/i);
    return match ? match[1] : str;
  }, []);

  /**
   * Find an already-open tab with the same identity, or null.
   *
   * Two levels, and nothing else:
   *
   *   L1  both sides carry a ChatFileRef → compare `chatFileRefKey`
   *   L2  neither carries one            → compare the ref-less namespace key
   *   one side has a ref, the other does not → not the same tab
   *
   * The mixed case returns false on purpose rather than guessing. This replaced a
   * five-level fallback chain (ref → file_path → file_name+path → title → whole
   * content) whose lower levels caused real damage: two diffs of same-named files
   * in different directories were treated as one tab and overwrote each other,
   * while the same file opened from two entry points produced two tabs — the exact
   * inverse of what dedup is for.
   *
   * `file_path` is deliberately not a fallback. Once entry points upgrade a local
   * path to a project ref, the same file always yields the same ref, so path
   * matching adds nothing — and a display path is the last thing that should carry
   * identity.
   */
  const findPreviewTabInList = useCallback(
    (tabList: PreviewTab[], type: PreviewContentType, content?: string, meta?: PreviewMetadata) => {
      // Browser tabs are never deduped: each one is an independent page the user
      // (or an agent) opened on purpose, and they carry no file identity.
      if (type === 'browser') return null;

      const refKey = meta?.fileRef ? chatFileRefKey(meta.fileRef) : '';
      const reflessKey = refKey ? null : reflessTabKey(type, content, meta);

      return (
        tabList.find((tab) => {
          // Type is a precondition, not a tiebreaker: the same path rendered as
          // source and as a diff are legitimately two different tabs.
          if (tab.content_type !== type) return false;

          const tabRefKey = tab.metadata?.fileRef ? chatFileRefKey(tab.metadata.fileRef) : '';

          // L1 — the only authoritative identity.
          if (refKey && tabRefKey) return refKey === tabRefKey;

          // Mixed: one side has an identity and the other does not. They may well
          // be the same file, but merging on a guess risks silent overwrites.
          if (refKey || tabRefKey) return false;

          // L2 — both ref-less. Only the cases with an explicit key dedup at all.
          if (!reflessKey) return false;
          return reflessKey === reflessTabKey(tab.content_type, tab.content, tab.metadata);
        }) || null
      );
    },
    []
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

  /**
   * Hide the preview panel, keeping its tabs.
   *
   * Only visibility changes. The tabs stay in memory and stay persisted, so the
   * user gets them back when the panel reopens — which is what "collapse" should
   * mean and what the persisted shape already supported: `loadScopeState` restores
   * on `isOpen === true && tabs.length > 0`, so `isOpen` and `tabs` were always
   * independent and "closed but holding tabs" was already a legal state.
   *
   * This used to also `setTabs([])`, and the damage went well beyond the current
   * view: the persist effect depends on `tabs`, so ~150ms later it wrote the now-
   * empty list back over `preview-ui:<scope>`. One click on "new conversation"
   * erased that project's entire remembered tab list — saved tabs included, not
   * just unsaved ones. A dirty-state confirmation would not have helped, because
   * clean tabs were being destroyed too.
   *
   * Use {@link clearPreviewForScope} when the intent really is to discard.
   */
  const closePreview = useCallback(() => {
    setIsMaximized(false);
    setIsOpen(false);
    // DOM snippets are per-session scratch state tied to the visible HTML inspector,
    // not tab content, so they are cleared with the view.
    setDomSnippets([]);
  }, []);

  /**
   * Discard this scope's tabs outright — the panel closes and nothing is restored.
   *
   * Separated from {@link closePreview} because "I am done with these files" and "get
   * this panel out of my way" were the same function, and every caller meant the
   * latter.
   */
  const toggleMaximized = useCallback(() => setIsMaximized((prev) => !prev), []);

  const clearPreviewForScope = useCallback(() => {
    setIsMaximized(false);
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
      // Release the leaving scope's directory subscriptions.
      //
      // Placed before the state updates as a matter of habit, not because the position
      // currently matters: this callback is synchronous, so React flushes the tabs
      // effect only after the whole body returns, and the release therefore happens
      // first wherever it is written. Measured both orders — the resulting subscription
      // set is identical.
      //
      // Kept here because that stops being true the moment anything in this function
      // awaits: the effect could then run mid-body, and a release placed afterwards
      // would drop the subscriptions the restore had just created.
      resetPreviewWatch();
      currentScopeRef.current = scopeKey;
      const loaded = scopeKey != null ? loadScopeState(scopeKey) : EMPTY_SCOPE_STATE;
      // Subscriptions for these tabs come from the tabs effect, which this setTabs
      // triggers — restored tabs are subscribed exactly like freshly opened ones.
      setTabs(loaded.tabs);
      setActiveTabId(loaded.activeTabId);
      activeTabIdRef.current = loaded.activeTabId;
      setIsOpen(loaded.isOpen);
      setIsMaximized(false);
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

  /**
   * Re-read a tab's content from disk, replacing what is on screen.
   *
   * Used by the refresh control once the user has decided what to do about any unsaved
   * edit. The tab comes back clean, because after this its content *is* what the file
   * holds — leaving the dirty marker set would claim there are unsaved changes when
   * there are none.
   *
   * Refreshes the save-conflict timestamp too. Without that, the very next save would
   * carry the mtime from before this reload and be rejected as a conflict against a
   * change the user has already taken on board.
   *
   * Returns false when there is nothing to re-read (no ref, or the read failed); the
   * caller decides whether that is worth reporting.
   */
  const reloadTabContent = useCallback(async (tabId: string): Promise<boolean> => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    const fileRef = tab?.metadata?.fileRef;
    if (!tab || !fileRef) return false;

    // pdf and office render from their own sources rather than from `content`, so
    // there is nothing to fetch here; their reload paths live in the viewers.
    if (CONTENT_FREE_PREVIEW_TYPES.has(tab.content_type)) return false;

    const encoding: ContentEncoding = tab.content_type === 'image' ? 'dataurl' : 'utf8';
    try {
      const content = await ipcBridge.fs.readContent.invoke({ file: fileRef, encoding });
      if (content == null) return false;

      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, content, originalContent: content, isDirty: false } : t))
      );

      // Best-effort: a stale timestamp only costs one rejected save, which the user
      // is told about, so it is not worth failing the reload over.
      void ipcBridge.fs.getContentMetadata
        .invoke({ file: fileRef })
        .then((metadata) => {
          if (metadata) fileMtimeRef.current.set(chatFileRefKey(fileRef), metadata.lastModified);
        })
        .catch(() => {});

      return true;
    } catch {
      return false;
    }
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
      isMaximized,
      tabs,
      activeTabId,
      activeTab,
      openPreview,
      closePreview,
      toggleMaximized,
      clearPreviewForScope,
      closeTab,
      switchTab: setActiveTabId,
      updateContent,
      updateTab,
      openBrowserTab,
      browserTabLimitHitAt,
      persistQuotaExceededAt,
      saveContent,
      reloadTabContent,
      tabsWithUpdate,
      clearTabUpdate,
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
    isMaximized,
    tabs,
    activeTabId,
    activeTab,
    openPreview,
    closePreview,
    toggleMaximized,
    clearPreviewForScope,
    closeTab,
    setActiveTabId,
    updateContent,
    updateTab,
    openBrowserTab,
    browserTabLimitHitAt,
    persistQuotaExceededAt,
    saveContent,
    reloadTabContent,
    tabsWithUpdate,
    clearTabUpdate,
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
