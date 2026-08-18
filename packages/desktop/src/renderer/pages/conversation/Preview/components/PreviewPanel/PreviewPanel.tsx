/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { downloadFileFromPath, downloadFileFromRef, downloadTextContent } from '@/renderer/utils/file/download';
import { formatFileSize } from '@/renderer/services/FileService';
import { CONTENT_FREE_TYPES, formatSizeAboveLimit } from '@/renderer/utils/file/previewPayload';
import { classifyPreviewError, previewErrorToI18nKey } from '@/renderer/utils/previewError';
import { isRefreshActionable, refreshButtonState, refreshStateToken } from './refreshButtonState';
import { reloadViaViewer } from '../../context/tabReloaderRegistry';
import {
  canOpenInSystem,
  classifySaveOutcome,
  shouldOfferOpenInSystem,
  dirtyTabsInBatch,
  isOpenableFileRef,
  wouldDownloadEmptyFile,
} from './previewToolbarUtils';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { toLocalFileHref } from '@/renderer/components/Markdown/markdownUtils';
import { PreviewToolbarExtrasProvider, type PreviewToolbarExtras } from '../../context/PreviewToolbarExtrasContext';
import { usePreviewContext } from '../../context/PreviewContext';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import { Link, Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DiffPreview from '../viewers/DiffViewer';
import ExcelPreview from '../viewers/ExcelViewer';
import HTMLEditor from '../editors/HTMLEditor';
import HTMLRenderer from '../renderers/HTMLRenderer';
import ImagePreview from '../viewers/ImageViewer';
import MarkdownEditor from '../editors/MarkdownEditor';
import MarkdownPreview from '../viewers/MarkdownViewer';
import PDFPreview from '../viewers/PDFViewer';
import OfficeDocPreview from '../viewers/OfficeDocViewer';
import PptViewer from '../viewers/PptViewer';
import CodeEditor from '../editors/CodeEditor';
import URLViewer from '../viewers/URLViewer';
import BrowserTabLayer from '../../browser/BrowserTabLayer';
import { MAX_BROWSER_TABS } from '../../browser/constants';
import {
  PreviewTabs,
  PreviewToolbar,
  PreviewContextMenu,
  PreviewConfirmModals,
  type ContextMenuState,
  type CloseTabConfirmState,
  type RefreshConfirmState,
  type PreviewTab,
} from '.';
import {
  DEFAULT_SPLIT_RATIO,
  EDITABLE_CONTENT_TYPES,
  FILE_TYPES_WITH_BUILTIN_OPEN,
  MAX_SPLIT_WIDTH,
  MIN_SPLIT_WIDTH,
} from '../../constants';
import { usePreviewKeyboardShortcuts, useScrollSync, useTabOverflow, useThemeDetection } from '../../hooks';
import { useTranslation } from 'react-i18next';
import './preview.css';

/**
 * 预览面板主组件
 * Main preview panel component
 *
 * 支持多 Tab 切换，每个 Tab 可以显示不同类型的内容
 * Supports multiple tabs, each tab can display different types of content
 */
/**
 * A save the backend declined without an error to explain it.
 *
 * Distinct from a thrown backend error so the handler can report a plain failure
 * rather than treating the sentinel's own text as extra detail.
 */
class SaveRefusedError extends Error {
  constructor() {
    super('save refused');
    this.name = 'SaveRefusedError';
  }
}

const PreviewPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const {
    isOpen,
    tabs,
    activeTabId,
    activeTab,
    closeTab,
    switchTab,
    closePreview,
    updateContent,
    saveContent,
    reloadTabContent,
    tabsWithUpdate,
    clearTabUpdate,
    addDomSnippet,
    updateTab,
    openBrowserTab,
    browserTabLimitHitAt,
    persistQuotaExceededAt,
  } = usePreviewContext();
  const layout = useLayoutContext();

  // 视图状态 / View states
  const [viewMode, setViewMode] = useState<'source' | 'preview'>('preview');
  const [isSplitScreenEnabled, setIsSplitScreenEnabled] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [toolbarExtras, setToolbarExtras] = useState<PreviewToolbarExtras | null>(null);

  // 切换文件时把视图模式复位为预览，避免上一个文件的 source 模式串到下一个文件（如代码文件丢失语法高亮）。
  // 注意：单预览浏览模式下打开新文件会复用当前 tab 的 id，所以这里要监听实际显示的文件标识（路径 + 类型），
  // 而不是 activeTabId（它不会变）。
  // Reset view mode to preview when the displayed file changes so a previous file's source mode does not
  // leak into the next one (e.g. a code file losing syntax highlighting). In single-preview browse mode a
  // new file reuses the active tab's id, so we key on the file identity (path + type), not activeTabId.
  useEffect(() => {
    setViewMode('preview');
  }, [activeTabId, activeTab?.metadata?.file_path, activeTab?.content_type]);

  // 确认对话框状态 / Confirmation dialog states
  const [closeTabConfirm, setCloseTabConfirm] = useState<CloseTabConfirmState>({ show: false, tabId: null });
  const [refreshConfirm, setRefreshConfirm] = useState<RefreshConfirmState>({ show: false, tabId: null });

  // 右键菜单状态 / Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ show: false, x: 0, y: 0, tabId: null });

  // 容器引用 / Container refs
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // 使用自定义 Hooks / Use custom hooks
  const currentTheme = useThemeDetection();
  const { tabsContainerRef, tabFadeState } = useTabOverflow([tabs, activeTabId]);
  const { handleEditorScroll, handlePreviewScroll } = useScrollSync({
    enabled: isSplitScreenEnabled,
    editorContainerRef,
    previewContainerRef,
  });

  // Toast handle for this panel's own messages (download failures, the oversized
  // notice, "open in system" errors). Previously supplied by the version-history
  // hook; kept local now that the hook is gone.
  const [messageApi, messageContextHolder] = Message.useMessage();

  /**
   * Save the active tab and report the outcome.
   *
   * The result must not be dropped. `saveContent` rethrows, and a 409 means the
   * file changed on disk since this tab read it, so the write was refused — but
   * the previous `void saveContent()` discarded that rejection: no message, and
   * the tab kept looking exactly as it does after a successful save. The user
   * believed their edit was on disk when nothing had been written.
   *
   * `saveContent` only clears the dirty flag on success, so the tab correctly
   * stays dirty here; all this has to do is say so out loud.
   */
  const handleSaveActiveTab = useCallback(async () => {
    let result: boolean | undefined;
    let thrown: unknown;
    try {
      result = await saveContent();
    } catch (error) {
      thrown = error;
    }

    const outcome = classifySaveOutcome(result, thrown);
    if (outcome.kind === 'saved') return;
    if (outcome.kind === 'conflict') {
      // The file moved under us. Name that specifically and leave the tab dirty so
      // the edit is still there to retry or copy out.
      messageApi.error(t('preview.saveConflict'));
      return;
    }
    messageApi.error(outcome.detail ? `${t('common.saveFailed')}: ${outcome.detail}` : t('common.saveFailed'));
  }, [saveContent, messageApi, t]);

  /**
   * Re-read the active tab from disk and clear its pending-change mark.
   *
   * Only reached once any unsaved edit has been dealt with — see the click handler.
   */
  const runRefresh = useCallback(
    async (tabId: string) => {
      // A viewer that renders its own content knows how to refresh it. pdf registers
      // here because its stream URL never changes, so only the webview can fetch
      // fresh bytes.
      if (reloadViaViewer(tabId)) {
        clearTabUpdate(tabId);
        return;
      }

      // office documents are rendered by a separate process that does not watch the
      // filesystem, so refreshing one means asking that process to re-read the file.
      // Not wired yet — the endpoint exists (POST /api/{word|excel|ppt}-preview/refresh)
      // but connecting it is a follow-up, so say so rather than appear to succeed.
      //
      // When it is wired: the response is `ApiResponse<{ ok: boolean, error?: string }>`
      // and `ok: false` comes back as HTTP 200. That is deliberate on the backend's part
      // — a failed refresh still leaves the previous document being served, so the tab
      // is not broken and an error status would overstate it. The consequence here is
      // that the status code cannot tell success from failure: read `ok` from the body
      // and report `error` through the office error path.
      //
      // Getting that wrong is worse than it looks. A 200 read as success shows the user
      // nothing at all while the content stays stale, so they conclude the file really
      // did not change — doubting their own memory rather than the software, which is
      // the one failure mode no amount of retrying gets them out of.
      const tabType = tabs.find((tab) => tab.id === tabId)?.content_type;
      if (tabType === 'word' || tabType === 'excel' || tabType === 'ppt') {
        messageApi.info(t('preview.refresh.officeNotWired'));
        return;
      }

      if (await reloadTabContent(tabId)) {
        clearTabUpdate(tabId);
        return;
      }
      // The file could not be read. Worth saying: the user asked for this, and what is
      // on screen is now known to be out of date.
      messageApi.error(t('preview.refresh.failed'));
    },
    [tabs, reloadTabContent, clearTabUpdate, messageApi, t]
  );

  /**
   * The refresh button.
   *
   * With unsaved changes, ask first: reloading replaces the content, so doing it
   * silently would discard the edit.
   */
  const handleRefreshClick = useCallback(() => {
    if (!activeTabId) return;
    if (activeTab?.isDirty) {
      setRefreshConfirm({ show: true, tabId: activeTabId });
      return;
    }
    void runRefresh(activeTabId);
  }, [activeTabId, activeTab?.isDirty, runRefresh]);

  /** "Discard my changes and reload" — the edit is knowingly given up. */
  const handleRefreshWithoutSave = useCallback(() => {
    const tabId = refreshConfirm.tabId;
    setRefreshConfirm({ show: false, tabId: null });
    if (tabId) void runRefresh(tabId);
  }, [refreshConfirm.tabId, runRefresh]);

  const handleCancelRefresh = useCallback(() => {
    setRefreshConfirm({ show: false, tabId: null });
  }, []);

  usePreviewKeyboardShortcuts({
    isDirty: activeTab?.isDirty,
    onSave: () => void handleSaveActiveTab(),
  });

  // 新建浏览器 tab（tab 栏加号）/ New browser tab (plus button in the tab bar)
  const handleNewBrowserTab = useCallback(() => openBrowserTab(), [openBrowserTab]);

  /**
   * 浏览器 tab 达上限时提示用户。上限触达会复用最旧的 tab，如果不说一声，
   * 用户看到的是"点了新建但旧 tab 内容变了"——像 bug。
   *
   * Warn when the browser tab cap is hit. Hitting the cap reuses the oldest tab;
   * without this notice the user just sees an old tab's content change, which
   * reads as a bug.
   */
  useEffect(() => {
    if (!browserTabLimitHitAt) return;
    messageApi.warning?.(t('preview.browser.tabLimitReached', { count: MAX_BROWSER_TABS }));
  }, [browserTabLimitHitAt, messageApi, t]);

  /**
   * Local storage filled up, so this scope's tabs will not be restored later.
   * Worth interrupting for: the alternative is tabs quietly failing to come back
   * with nothing linking that to storage.
   */
  useEffect(() => {
    if (!persistQuotaExceededAt) return;
    messageApi.warning?.(t('preview.persistQuotaExceeded'));
  }, [persistQuotaExceededAt, messageApi, t]);

  const setToolbarExtrasCallback = useCallback((extras: PreviewToolbarExtras | null) => {
    setToolbarExtras(extras);
  }, []);

  // 处理 HTML 审核模式元素选中 / Handle HTML inspect mode element selection
  const handleElementSelected = useCallback(
    (element: { html: string; tag: string }) => {
      addDomSnippet(element.tag, element.html);
    },
    [addDomSnippet]
  );

  const toolbarExtrasContextValue = useMemo(
    () => ({
      setExtras: setToolbarExtrasCallback,
    }),
    [setToolbarExtrasCallback]
  );

  // 内层分割：编辑器和预览的分割比例（默认 50/50）
  // Inner split: Split ratio between editor and preview (default 50/50)
  const { splitRatio, createDragHandle } = useResizableSplit({
    defaultWidth: DEFAULT_SPLIT_RATIO,
    minWidth: MIN_SPLIT_WIDTH,
    maxWidth: MAX_SPLIT_WIDTH,
    storageKey: 'preview-panel-split-ratio',
  });

  // 使用 useCallback 包装 updateContent，确保引用稳定 / Wrap updateContent with useCallback for stable reference
  const handleContentChange = useCallback(
    (new_content: string) => {
      // 严格的类型检查，防止 Event 对象被错误传递 / Strict type checking to prevent Event object from being passed incorrectly
      if (typeof new_content !== 'string') {
        return;
      }
      try {
        updateContent(new_content);
      } catch {
        // Silently ignore errors
      }
    },
    [updateContent]
  );

  // 批量关闭的统一入口：有未保存的就先确认，否则直接关。
  // 四个右键项和「收起面板」全部走这里 —— 以前它们各自 forEach(closeTab)，
  // 绕过了单 tab 才有的确认，未保存的编辑被静默丢弃。
  //
  // Single entry point for batch closes: confirm first when anything is unsaved,
  // otherwise close straight away. All four context-menu items and the panel
  // collapse funnel through here; previously each ran its own forEach(closeTab),
  // bypassing the confirmation that a single close had and silently discarding
  // unsaved edits.
  const requestCloseBatch = useCallback(
    (tabsToClose: PreviewTab[], onAllClean?: () => void) => {
      setContextMenu({ show: false, x: 0, y: 0, tabId: null });
      if (tabsToClose.length === 0) return;

      const dirty = dirtyTabsInBatch(tabsToClose);
      if (dirty.length === 0) {
        if (onAllClean) onAllClean();
        else tabsToClose.forEach((tab) => closeTab(tab.id));
        return;
      }

      setCloseTabConfirm({
        show: true,
        // Single dirty tab in the batch → reuse the existing per-tab flow so
        // "save and close" can target it directly.
        tabId: dirty.length === 1 ? dirty[0].id : null,
        batchTabIds: tabsToClose.map((tab) => tab.id),
        dirtyCount: dirty.length,
      });
    },
    [closeTab]
  );

  // 处理关闭tab / Handle close tab
  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      // 如果tab有未保存的修改，显示确认对话框 / If tab has unsaved changes, show confirmation dialog
      if (tab?.isDirty) {
        setCloseTabConfirm({ show: true, tabId });
      } else {
        // 没有未保存的修改，直接关闭 / No unsaved changes, close directly
        closeTab(tabId);
      }
    },
    [tabs, closeTab]
  );

  /** Close everything the pending confirmation covers, then clear it. */
  const finishPendingClose = useCallback(() => {
    setCloseTabConfirm((pending) => {
      const ids = pending.batchTabIds?.length ? pending.batchTabIds : pending.tabId ? [pending.tabId] : [];
      ids.forEach((id) => closeTab(id));
      // A batch that came from collapsing the panel also has to hide it; with no
      // tabs left closeTab already does that, so this only covers the case where
      // the user kept some tabs.
      return { show: false, tabId: null };
    });
  }, [closeTab]);

  // 保存并关闭tab / Save and close tab
  const handleSaveAndCloseTab = useCallback(async () => {
    const pending = closeTabConfirm;
    const dirtyIds = (pending.batchTabIds?.length ? pending.batchTabIds : pending.tabId ? [pending.tabId] : []).filter(
      (id) => tabs.find((tab) => tab.id === id)?.isDirty
    );
    if (dirtyIds.length === 0) return;

    try {
      // Save every unsaved tab in the batch before closing any of them: closing
      // first would destroy the edits this dialog exists to protect.
      //
      // Sequential on purpose — `Promise.all` would be wrong here, not just
      // different: each save reads and writes the shared save-in-flight set and
      // mtime map keyed by file identity, and the first failure must stop the run
      // so the remaining tabs stay open with their edits intact.
      for (const id of dirtyIds) {
        // eslint-disable-next-line no-await-in-loop
        const success = await saveContent(id);
        if (!success) {
          // A refusal with no error to report. Throwing `new Error(t('common.saveFailed'))`
          // here produced "save failed: save failed" — the message became the `detail`
          // that the catch below prefixes, so the same sentence was concatenated onto
          // itself. A sentinel carries the outcome without pretending to add detail.
          throw new SaveRefusedError();
        }
      }
      finishPendingClose();
    } catch (error) {
      // Same conflict case as Ctrl+S: name it, and do NOT close the tab — closing
      // would throw away the edit the save just failed to persist.
      const outcome = classifySaveOutcome(undefined, error);
      if (outcome.kind === 'conflict') {
        messageApi.error(t('preview.saveConflict'));
      } else {
        const detail = outcome.kind === 'failed' ? outcome.detail : undefined;
        messageApi.error(detail ? `${t('common.saveFailed')}: ${detail}` : t('common.saveFailed'));
      }
    }
  }, [closeTabConfirm, tabs, saveContent, finishPendingClose, messageApi, t]);

  // 不保存直接关闭tab / Close tab without saving
  const handleCloseWithoutSave = useCallback(() => {
    finishPendingClose();
  }, [finishPendingClose]);

  // 取消关闭tab / Cancel close tab
  const handleCancelCloseTab = useCallback(() => {
    setCloseTabConfirm({ show: false, tabId: null });
  }, []);

  // 处理 tab 右键菜单 / Handle tab context menu
  const handleTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      tabId,
    });
  }, []);

  // 关闭左侧 tabs / Close tabs to the left
  const handleCloseLeft = useCallback(
    (tabId: string) => {
      const currentIndex = tabs.findIndex((t) => t.id === tabId);
      if (currentIndex <= 0) return;
      requestCloseBatch(tabs.slice(0, currentIndex));
    },
    [tabs, requestCloseBatch]
  );

  // 关闭右侧 tabs / Close tabs to the right
  const handleCloseRight = useCallback(
    (tabId: string) => {
      const currentIndex = tabs.findIndex((t) => t.id === tabId);
      if (currentIndex < 0 || currentIndex >= tabs.length - 1) return;
      requestCloseBatch(tabs.slice(currentIndex + 1));
    },
    [tabs, requestCloseBatch]
  );

  // 关闭其他 tabs / Close other tabs
  const handleCloseOthers = useCallback(
    (tabId: string) => {
      requestCloseBatch(tabs.filter((t) => t.id !== tabId));
    },
    [tabs, requestCloseBatch]
  );

  // 关闭全部 tabs / Close all tabs
  const handleCloseAll = useCallback(() => {
    requestCloseBatch(tabs);
  }, [tabs, requestCloseBatch]);

  // 收起面板：只改可见性，tab 留着照常持久化 —— 但仍要过 dirty 确认，
  // 否则「收起」会变成一条静默丢弃未保存内容的路径。
  //
  // Collapsing the panel only flips visibility and keeps the tabs persisted, but
  // it still has to pass the dirty check: otherwise "collapse" becomes another
  // route that silently discards unsaved edits.
  const handleClosePanel = useCallback(() => {
    requestCloseBatch(tabs, closePreview);
  }, [tabs, requestCloseBatch, closePreview]);

  // 如果预览面板未打开，不渲染 / Don't render if preview panel is not open
  // Destructure defensively and bail out AFTER the last hook below.
  //
  // React requires the same hooks to run on every render of a component, and
  // `handleDownload` / `handleOpenInSystem` are declared further down — so
  // returning here would change the hook count between "panel closed" and "panel
  // open" and React aborts the render with "Rendered more hooks than during the
  // previous render". That is why the panel could not be rendered across an
  // open/close transition at all, which in turn is why it had no render tests.
  const { content, content_type, metadata } = activeTab ?? {
    content: '',
    content_type: 'code' as const,
    metadata: undefined,
  };
  const isMarkdown = content_type === 'markdown';
  const isHTML = content_type === 'html';
  const isEditable = metadata?.editable !== false; // 默认可编辑 / Default editable

  // 「在系统中打开」：有 file_path 或有 fileRef 都能打开。
  // fileRef 分支是超限 / 不支持态的逃生出口 —— Explorer 打开的 tab 刻意不带
  // 绝对路径（见 ExplorerContainer 的 "No absolute path is ever exposed"），
  // 只认 file_path 会让那些 tab 一个能点的按钮都没有。
  //
  // "Open in system": available with either a file_path or a fileRef. The fileRef
  // branch is the escape hatch for oversized / unsupported tabs — explorer-opened
  // tabs deliberately carry no absolute path, so keying off file_path alone left
  // them with no actionable button at all.
  // Needs both an addressable file AND a reason to offer the action. The escape
  // hatch (oversized / unsupported) is inside shouldOfferOpenInSystem and is
  // deliberately not type-filtered — see that function.
  // Recomputed every render, never captured: a chat-link file becomes a project file
  // after an async resolve, which changes what this control can promise.
  const refreshState = refreshButtonState(
    { content_type, metadata },
    activeTabId ? tabsWithUpdate.has(activeTabId) : false
  );

  const showOpenInSystemButton =
    canOpenInSystem(Boolean(metadata?.file_path), metadata?.fileRef) &&
    shouldOfferOpenInSystem(content_type, Boolean(metadata?.oversized), FILE_TYPES_WITH_BUILTIN_OPEN);

  // 下载文件到本地 / Download file to local system
  const handleDownload = useCallback(async () => {
    try {
      const rawFileName = metadata?.file_name || `${content_type}-${Date.now()}`;

      // 超限 tab 的内容从未被读取（content === ''）。若继续往下走，会走到
      // downloadTextContent('') 导出一个 0 字节空文件 —— 用户以为下载成功，
      // 拿到的是空文件。宁可明确报错，也不能产出静默错误的数据。
      //
      // An oversized tab never read its content (content === ''). Falling through
      // would hand downloadTextContent an empty string and produce a 0-byte file:
      // the download looks successful and silently yields nothing. Fail loudly
      // instead — the file itself is still reachable via "open in system".
      if (
        wouldDownloadEmptyFile(
          Boolean(metadata?.oversized) || content_type === 'unsupported',
          Boolean(metadata?.file_path)
        )
      ) {
        // Different reason, different sentence: telling the user an unsupported
        // format is "too large" would be simply false.
        messageApi.error(
          content_type === 'unsupported'
            ? t('preview.unsupported.downloadUnavailable')
            : t('preview.oversized.downloadUnavailable')
        );
        return;
      }

      if (metadata?.file_path) {
        // All files with a disk path (binary, image, zip, etc.) — unified path
        await downloadFileFromPath(metadata.file_path, rawFileName, metadata.workspace);
        return;
      }

      // Content-free previews cannot manufacture a download from `content`.
      // Use the renderer-safe ChatFileRef to download the original file.
      if (CONTENT_FREE_TYPES.has(content_type)) {
        const fileRef = isOpenableFileRef(metadata?.fileRef) ? metadata.fileRef : undefined;
        if (fileRef) {
          await downloadFileFromRef(fileRef, rawFileName);
          return;
        }
        messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
        return;
      }

      if (content_type === 'image') {
        // Pure base64 image (no file path on disk)
        if (!content) {
          messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
          return;
        }
        const blob = await fetch(content).then((res) => res.blob());
        const nameExt = metadata?.file_name?.split('.').pop();
        const mimeExt = blob.type?.includes('/') ? blob.type.split('/').pop() : undefined;
        const ext = nameExt || mimeExt || 'png';
        const normalizedExt = ext.toLowerCase();
        const hasSameExt = rawFileName.toLowerCase().endsWith(`.${normalizedExt}`);
        const file_name = hasSameExt ? rawFileName : `${rawFileName}.${ext}`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file_name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

      // Text / code content (no file path, no binary)
      const nameExt = metadata?.file_name?.split('.').pop();
      let mimeType = 'text/plain;charset=utf-8';
      let ext = 'txt';
      if (content_type === 'markdown') {
        mimeType = 'text/markdown;charset=utf-8';
        ext = 'md';
      } else if (content_type === 'html') {
        mimeType = 'text/html;charset=utf-8';
        ext = 'html';
      } else if (content_type === 'diff') {
        ext = 'diff';
      } else if (content_type === 'code') {
        // Code files: set extension based on language
        const lang = metadata?.language;
        if (lang === 'javascript' || lang === 'js') ext = 'js';
        else if (lang === 'typescript' || lang === 'ts') ext = 'ts';
        else if (lang === 'python' || lang === 'py') ext = 'py';
        else if (lang === 'java') ext = 'java';
        else if (lang === 'cpp' || lang === 'c++') ext = 'cpp';
        else if (lang === 'c') ext = 'c';
        else if (lang === 'html') ext = 'html';
        else if (lang === 'css') ext = 'css';
        else if (lang === 'json') ext = 'json';
      }
      if (nameExt) ext = nameExt;
      const normalizedExt = ext.toLowerCase();
      const hasSameExt = rawFileName.toLowerCase().endsWith(`.${normalizedExt}`);
      const file_name = hasSameExt ? rawFileName : `${rawFileName}.${ext}`;
      downloadTextContent(content, file_name, mimeType);
    } catch (error) {
      console.error('[PreviewPanel] Failed to download file:', error);
      messageApi.error(t('messages.downloadFailed', { defaultValue: 'Failed to download' }));
    }
  }, [
    content,
    content_type,
    metadata?.file_name,
    metadata?.file_path,
    metadata?.fileRef,
    metadata?.language,
    metadata?.oversized,
    metadata?.workspace,
    messageApi,
    t,
  ]);

  // 在系统默认应用中打开文件 / Open file in system default application
  const handleOpenInSystem = useCallback(async () => {
    // 只接受真正指向文件的 ref —— project ref 的空 relative_path 表示 pe root
    // 本身（一个目录），送去 shell 打开就不是这个按钮承诺的行为了。
    // Only accept a ref that addresses a file: an empty relative_path on a project
    // ref denotes the pe root — a directory — and shell-opening that is not what
    // this button promises.
    const fileRef = isOpenableFileRef(metadata?.fileRef) ? metadata?.fileRef : undefined;
    const filePath = metadata?.file_path;

    if (!fileRef && !filePath) {
      try {
        messageApi.error(t('preview.openInSystemFailed'));
      } catch {
        // Context holder may be unmounted
      }
      return;
    }

    try {
      if (fileRef) {
        // 按 ChatFileRef 身份打开：后端 resolve 后调系统打开，前端拿不到绝对路径。
        // 这条分支让 Explorer 打开的 tab（刻意无 file_path）也有逃生出口。
        //
        // Open by ChatFileRef identity: the backend resolves it and shells out, so
        // the renderer never sees an absolute path. This branch is what gives
        // explorer-opened tabs (deliberately without file_path) an escape hatch.
        await ipcBridge.fs.openSystem.invoke({ file: fileRef });
      } else if (filePath) {
        await ipcBridge.shell.openFile.invoke(filePath);
      }
      try {
        messageApi.success(t('preview.openInSystemSuccess'));
      } catch {
        // Context holder may be unmounted after async operation
      }
    } catch (err) {
      try {
        // 按错误码选本地文案，不透传后端 message（后端已保证响应不含绝对路径，
        // 前端也不该把它当文案来源）。
        // Pick a local message from the error code; never surface the backend
        // message (the backend guarantees it holds no absolute path, and the
        // front end should not treat it as copy either).
        messageApi.error(t(previewErrorToI18nKey(classifyPreviewError(err))));
      } catch {
        // Context holder may be unmounted after async operation
      }
    }
  }, [metadata?.fileRef, metadata?.file_path, messageApi, t]);

  // Every hook has now run, so bailing out here keeps the hook count stable.
  if (!isOpen || !activeTab) return null;

  const renderMissingFile = () => {
    const filePath = metadata?.file_path;
    const externalHref = filePath ? toLocalFileHref(filePath) : undefined;

    return (
      <div className='flex flex-1 flex-col items-center justify-center gap-10px px-24px text-center'>
        <div className='text-15px font-medium text-t-primary'>
          {t('preview.missingFile.title', { defaultValue: 'File not found' })}
        </div>
        <div className='max-w-560px break-all text-12px leading-18px text-t-secondary'>
          {filePath || t('preview.errors.missingFilePath')}
        </div>
        {externalHref && (
          <Link href={externalHref} target='_blank' rel='noreferrer' className='text-13px'>
            {t('preview.missingFile.openInNewTab', { defaultValue: 'Try opening in a new tab' })}
          </Link>
        )}
      </div>
    );
  };

  // 超过大小上限：内容从未被读取，所以只说明原因 + 给逃生出口。
  // 刻意不进编辑器 —— 半截内容进了可保存的编辑器就会毁掉未读的部分。
  //
  // Over the size ceiling: content was never read, so explain why and offer the
  // escape hatch. Deliberately never reaches an editor — partial content in a
  // saveable editor is what destroyed the unread remainder of the file.
  const renderOversized = () => {
    const sizeBytes = metadata?.sizeBytes;
    const thresholdBytes = metadata?.thresholdBytes;

    return (
      <div className='flex flex-1 flex-col items-center justify-center gap-10px px-24px text-center'>
        <div className='text-15px font-medium text-t-primary'>{t('preview.oversized.title')}</div>
        <div className='max-w-560px text-12px leading-18px text-t-secondary'>
          {t('preview.oversized.detail', {
            // Rendered at whatever precision it takes to actually look bigger than
            // the limit — at 2 decimals a file one byte over 1 MB also prints
            // "1 MB", making the sentence say "1 MB exceeds 1 MB".
            size: formatSizeAboveLimit(sizeBytes ?? 0, thresholdBytes ?? 0, (value, decimals) =>
              formatFileSize(value, decimals, i18n.language)
            ),
            threshold: formatFileSize(thresholdBytes ?? 0, 2, i18n.language),
          })}
        </div>
      </div>
    );
  };

  // 无法渲染的格式：说明原因 + 给逃生出口，而不是送进一个打不开它的渲染器。
  // 以前这些格式被路由给 officecli，失败提示还引导用户去装 officecli ——
  // 而装了对这些格式也没用。
  //
  // A format we can name but not render: explain that, and offer the escape hatch,
  // instead of handing it to a renderer that cannot open it. These formats used to
  // be routed to officecli, whose failure message told the user to install
  // officecli — which would not have helped for any of them.
  const renderUnsupported = () => (
    <div className='flex flex-1 flex-col items-center justify-center gap-10px px-24px text-center'>
      <div className='text-15px font-medium text-t-primary'>{t('preview.unsupported.title')}</div>
      <div className='max-w-560px text-12px leading-18px text-t-secondary'>
        {t('preview.unsupported.detail', { format: (metadata?.language || '').toUpperCase() })}
      </div>
    </div>
  );

  // 渲染预览内容 / Render preview content
  const renderContent = () => {
    if (metadata?.missingFile) return renderMissingFile();
    if (metadata?.oversized) return renderOversized();
    if (content_type === 'unsupported') return renderUnsupported();

    // 浏览器 tab 由常驻的 BrowserTabLayer 渲染，不能走这里 —— 否则切 tab 会重新加载页面
    // Browser tabs are rendered by the always-mounted BrowserTabLayer; rendering
    // them here would reload the page on every tab switch.
    if (content_type === 'browser') return null;

    // Markdown 模式 / Markdown mode
    if (isMarkdown) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <MarkdownPreview
                content={content}
                file_path={metadata?.file_path}
                workspace={metadata?.workspace}
                fileRef={metadata?.fileRef}
              />
            </div>
          );
        }

        // 桌面端：左右分割布局 / Desktop: Split layout
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col relative' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <MarkdownEditor
                  key={activeTabId ?? undefined}
                  value={content}
                  onChange={updateContent}
                  containerRef={editorContainerRef}
                  onScroll={handleEditorScroll}
                />
              </div>
              {/* 拖动分割线 / Drag handle */}
              {createDragHandle({ className: 'absolute end-0 top-0 bottom-0' })}
            </div>

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col' style={{ width: `${100 - splitRatio}%`, minWidth: 0 }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
              </div>
              <div className='flex flex-col flex-1 overflow-hidden'>
                <MarkdownPreview
                  content={content}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                  file_path={metadata?.file_path}
                  workspace={metadata?.workspace}
                  fileRef={metadata?.fileRef}
                />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      return (
        <MarkdownPreview
          content={content}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onContentChange={updateContent}
          file_path={metadata?.file_path}
          workspace={metadata?.workspace}
          fileRef={metadata?.fileRef}
        />
      );
    }

    // HTML 模式 / HTML mode
    if (isHTML) {
      // 分屏模式：左右分割（编辑器 + 预览）/ Split-screen mode: Editor + Preview
      if (isSplitScreenEnabled) {
        // 移动端：全屏显示预览，隐藏编辑器 / Mobile: Full-screen preview, hide editor
        if (layout?.isMobile) {
          return (
            <div className='flex-1 overflow-hidden'>
              <HTMLRenderer
                content={content}
                file_path={metadata?.file_path}
                workspace={metadata?.workspace}
                isDirty={activeTab?.isDirty}
                copySuccessMessage={t('preview.html.copySuccess')}
                inspectMode={inspectMode}
                onElementSelected={handleElementSelected}
              />
            </div>
          );
        }

        // 桌面端：左右分割布局 / Desktop: Split layout
        return (
          <div className='flex flex-1 relative overflow-hidden'>
            {/* 左侧：编辑器 / Left: Editor */}
            <div className='flex flex-col relative' style={{ width: `${splitRatio}%` }}>
              <div className='h-40px flex items-center px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.editor')}</span>
              </div>
              <div className='flex-1 overflow-hidden'>
                <HTMLEditor
                  key={activeTabId ?? undefined}
                  value={content}
                  onChange={updateContent}
                  containerRef={editorContainerRef}
                  onScroll={handleEditorScroll}
                  file_path={metadata?.file_path}
                />
              </div>
              {/* 拖动分割线 / Drag handle */}
              {createDragHandle({ className: 'absolute end-0 top-0 bottom-0' })}
            </div>

            {/* 右侧：预览 / Right: Preview */}
            <div className='flex flex-col' style={{ width: `${100 - splitRatio}%`, minWidth: 0 }}>
              <div className='h-40px flex items-center justify-between px-12px bg-bg-2'>
                <span className='text-12px text-t-secondary'>{t('preview.preview')}</span>
              </div>
              <div className='flex flex-col flex-1 overflow-hidden'>
                {/* prettier-ignore */}
                {/* eslint-disable-next-line max-len */}
                <HTMLRenderer
                  content={content}
                  file_path={metadata?.file_path}
                  workspace={metadata?.workspace}
                  isDirty={activeTab?.isDirty}
                  containerRef={previewContainerRef}
                  onScroll={handlePreviewScroll}
                  inspectMode={inspectMode}
                  copySuccessMessage={t('preview.html.copySuccess')}
                  onElementSelected={handleElementSelected}
                />
              </div>
            </div>
          </div>
        );
      }

      // 非分屏模式：单栏（原文或预览）/ Non-split mode: Single panel (source or preview)
      if (viewMode === 'source') {
        return (
          <div className='flex-1 overflow-hidden'>
            <HTMLEditor
              key={activeTabId ?? undefined}
              value={content}
              onChange={handleContentChange}
              file_path={metadata?.file_path}
            />
          </div>
        );
      } else {
        // 预览模式 / Preview mode
        return (
          <div className='flex-1 overflow-hidden'>
            <HTMLRenderer
              content={content}
              file_path={metadata?.file_path}
              workspace={metadata?.workspace}
              isDirty={activeTab?.isDirty}
              inspectMode={inspectMode}
              copySuccessMessage={t('preview.html.copySuccess')}
              onElementSelected={handleElementSelected}
            />
          </div>
        );
      }
    }

    // 其他类型：全屏预览 / Other types: Full-screen preview
    if (content_type === 'diff') {
      return (
        <DiffPreview
          content={content}
          metadata={metadata}
          hideToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      );
    } else if (content_type === 'code' || content_type === 'csv') {
      // 统一：始终可编辑的 CodeEditor（看=改）/ Unified: always-editable CodeEditor (view = edit)
      // csv 走同一分支：它本来就是纯文本，只是恰好有表格结构。
      // csv shares this branch: it is plain text that happens to be tabular.
      return (
        <div className='flex-1 overflow-hidden'>
          <CodeEditor
            key={activeTabId ?? undefined}
            value={content}
            onChange={handleContentChange}
            language={metadata?.language}
            fileName={metadata?.file_name}
            readOnly={isEditable === false}
            targetLine={metadata?.targetLine}
            targetColumn={metadata?.targetColumn}
          />
        </div>
      );
    } else if (content_type === 'pdf') {
      return (
        <PDFPreview
          tabId={activeTabId ?? undefined}
          fileRef={metadata?.fileRef}
          file_path={metadata?.file_path}
          content={content}
        />
      );
    } else if (content_type === 'ppt') {
      return (
        <PptViewer
          fileRef={metadata?.fileRef}
          file_path={metadata?.file_path}
          content={content}
          workspace={metadata?.workspace}
        />
      );
    } else if (content_type === 'word') {
      return (
        <OfficeDocPreview
          fileRef={metadata?.fileRef}
          file_path={metadata?.file_path}
          content={content}
          workspace={metadata?.workspace}
        />
      );
    } else if (content_type === 'excel') {
      return (
        <ExcelPreview
          fileRef={metadata?.fileRef}
          file_path={metadata?.file_path}
          content={content}
          workspace={metadata?.workspace}
        />
      );
    } else if (content_type === 'image') {
      return (
        <ImagePreview
          fileRef={metadata?.fileRef}
          file_path={metadata?.file_path}
          content={content}
          file_name={metadata?.file_name || metadata?.title}
          workspace={metadata?.workspace}
        />
      );
    } else if (content_type === 'url') {
      // URL 预览模式 / URL preview mode
      return <URLViewer url={content} title={metadata?.title} />;
    }

    return null;
  };

  // 将 tabs 转换为 PreviewTab 类型 / Convert tabs to PreviewTab type
  const previewTabs: PreviewTab[] = tabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    isDirty: tab.isDirty,
    favicon: tab.content_type === 'browser' ? tab.metadata?.favicon : undefined,
    agentActive: tab.content_type === 'browser' ? tab.metadata?.agentActive : undefined,
  }));

  // 浏览器 tab 常驻挂载，切 tab 不销毁 webview / Browser tabs stay mounted across switches
  const browserTabs = tabs.filter((tab) => tab.content_type === 'browser');

  return (
    <PreviewToolbarExtrasProvider value={toolbarExtrasContextValue}>
      {/* bg-1 是必需的：面板必须自己铺满底色，不能依赖外层容器
          bg-1 is required: the panel paints its own background rather than
          relying on an outer container, so no window backdrop shows through. */}
      <div className='h-full flex flex-col bg-1'>
        {messageContextHolder}

        {/* 确认对话框 / Confirmation modals */}
        {/* eslint-disable-next-line max-len */}
        <PreviewConfirmModals
          closeTabConfirm={closeTabConfirm}
          refreshConfirm={refreshConfirm}
          onRefreshWithoutSave={handleRefreshWithoutSave}
          onCancelRefresh={handleCancelRefresh}
          onSaveAndCloseTab={handleSaveAndCloseTab}
          onCloseWithoutSave={handleCloseWithoutSave}
          onCancelCloseTab={handleCancelCloseTab}
        />

        {/* Tab 栏 / Tab bar */}
        {/* eslint-disable-next-line max-len */}
        <PreviewTabs
          tabs={previewTabs}
          activeTabId={activeTabId}
          tabFadeState={tabFadeState}
          tabsContainerRef={tabsContainerRef}
          onSwitchTab={switchTab}
          onCloseTab={handleCloseTab}
          onContextMenu={handleTabContextMenu}
          onClosePanel={handleClosePanel}
          // 只要面板里已经有任意 tab（文件或浏览器），就露出「新建浏览器 tab」的加号，
          // 不必等用户先手动开过一次浏览器。面板本身为空时才隐藏，避免出现一个没有
          // 上下文的孤立加号。
          // Show the "new browser tab" plus as soon as the panel holds any tab (file or
          // browser) instead of requiring the user to open a browser first. It stays
          // hidden only while the panel is empty, so the plus never appears alone.
          onNewBrowserTab={previewTabs.length > 0 ? handleNewBrowserTab : undefined}
        />

        {/* 工具栏（URL / 浏览器 类型不显示工具栏，因为不需要下载/编辑等功能）
            Toolbar (hidden for URL and browser types — no download/edit needed) */}
        {content_type !== 'url' && content_type !== 'browser' && !metadata?.missingFile && (
          <PreviewToolbar
            content_type={content_type}
            isMarkdown={isMarkdown}
            isHTML={isHTML}
            viewMode={viewMode}
            isSplitScreenEnabled={isSplitScreenEnabled}
            file_name={metadata?.file_name || activeTab.title}
            showOpenInSystemButton={showOpenInSystemButton}
            hasFilePath={Boolean(metadata?.file_path)}
            refreshState={refreshStateToken(refreshState)}
            refreshActionable={isRefreshActionable(refreshState)}
            onRefresh={handleRefreshClick}
            showSave={
              isEditable &&
              (EDITABLE_CONTENT_TYPES as readonly string[]).includes(content_type) &&
              !(Boolean(metadata?.oversized) || content_type === 'unsupported')
            }
            saveActionable={Boolean(activeTab?.isDirty)}
            onSave={() => void handleSaveActiveTab()}
            hasNoRenderableContent={Boolean(metadata?.oversized) || content_type === 'unsupported'}
            onViewModeChange={(mode) => {
              setViewMode(mode);
              setIsSplitScreenEnabled(false); // 切换视图模式时关闭分屏 / Disable split when switching view mode
            }}
            onSplitScreenToggle={() => setIsSplitScreenEnabled(!isSplitScreenEnabled)}
            onOpenInSystem={handleOpenInSystem}
            onDownload={handleDownload}
            onClose={handleClosePanel}
            inspectMode={inspectMode}
            onInspectModeToggle={() => setInspectMode(!inspectMode)}
            leftExtra={toolbarExtras?.left}
            rightExtra={toolbarExtras?.right}
          />
        )}

        {/* 预览内容 / Preview content */}
        {renderContent()}

        {/* 浏览器层：常驻挂载，切 tab 不重新加载页面
            Browser layer: always mounted so tab switches don't reload pages */}
        <BrowserTabLayer browserTabs={browserTabs} activeTabId={activeTabId} updateTab={updateTab} />

        {/* Tab 右键菜单 / Tab context menu */}
        {/* eslint-disable-next-line max-len */}
        <PreviewContextMenu
          contextMenu={contextMenu}
          tabs={previewTabs}
          currentTheme={currentTheme}
          onClose={() => setContextMenu({ show: false, x: 0, y: 0, tabId: null })}
          onCloseLeft={handleCloseLeft}
          onCloseRight={handleCloseRight}
          onCloseOthers={handleCloseOthers}
          onCloseAll={handleCloseAll}
        />
      </div>
    </PreviewToolbarExtrasProvider>
  );
};

export default PreviewPanel;
