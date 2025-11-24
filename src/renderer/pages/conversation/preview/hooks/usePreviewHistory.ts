/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from '@/common/types/preview';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SNAPSHOT_DEBOUNCE_TIME } from '../constants';

/**
 * 预览历史 Hook 配置
 * Preview history hook configuration
 */
interface UsePreviewHistoryOptions {
  /**
   * 当前活动 Tab
   * Current active tab
   */
  activeTab: {
    contentType: string;
    content: string;
    title: string;
    metadata?: {
      filePath?: string;
      workspace?: string;
      fileName?: string;
      title?: string;
      language?: string;
    };
  } | null;

  /**
   * 更新内容回调
   * Update content callback
   */
  updateContent: (content: string) => void;
}

/**
 * 预览历史 Hook 返回值
 * Preview history hook return value
 */
interface UsePreviewHistoryReturn {
  /**
   * 历史版本列表
   * History versions list
   */
  historyVersions: PreviewSnapshotInfo[];

  /**
   * 是否正在加载历史
   * Whether history is loading
   */
  historyLoading: boolean;

  /**
   * 是否正在保存快照
   * Whether snapshot is saving
   */
  snapshotSaving: boolean;

  /**
   * 历史加载错误信息
   * History loading error message
   */
  historyError: string | null;

  /**
   * 历史目标（用于 IPC 调用）
   * History target (for IPC calls)
   */
  historyTarget: PreviewHistoryTarget | null;

  /**
   * 刷新历史列表
   * Refresh history list
   */
  refreshHistory: () => Promise<void>;

  /**
   * 保存快照
   * Save snapshot
   */
  handleSaveSnapshot: () => Promise<void>;

  /**
   * 选择历史快照
   * Select history snapshot
   */
  handleSnapshotSelect: (snapshot: PreviewSnapshotInfo) => Promise<void>;

  /**
   * Message API 实例（用于显示提示信息）
   * Message API instance (for displaying notifications)
   */
  messageApi: ReturnType<typeof Message.useMessage>[0];

  /**
   * Message Context Holder（需要渲染在组件中）
   * Message Context Holder (needs to be rendered in component)
   */
  messageContextHolder: ReturnType<typeof Message.useMessage>[1];
}

/**
 * 预览历史管理 Hook
 * Preview history management hook
 *
 * 处理历史版本的加载、保存和选择
 * Handles loading, saving, and selecting history versions
 *
 * @param options - 配置选项 / Configuration options
 * @returns 历史管理相关状态和方法 / History management related states and methods
 */
export const usePreviewHistory = ({ activeTab, updateContent }: UsePreviewHistoryOptions): UsePreviewHistoryReturn => {
  const { t } = useTranslation();
  const [historyVersions, setHistoryVersions] = useState<PreviewSnapshotInfo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [snapshotSaving, setSnapshotSaving] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [messageApi, messageContextHolder] = Message.useMessage();
  const lastSnapshotTimeRef = useRef<number>(0); // 记录上次快照保存时间 / Track last snapshot save time

  // 构建历史目标对象 / Build history target object
  const historyTarget = useMemo<PreviewHistoryTarget | null>(() => {
    if (!activeTab) return null;
    const meta = activeTab.metadata;
    const fallbackName = meta?.fileName || meta?.title || activeTab.title;
    return {
      contentType: activeTab.contentType as import('@/common/types/preview').PreviewContentType,
      filePath: meta?.filePath,
      workspace: meta?.workspace,
      fileName: fallbackName,
      title: meta?.title || activeTab.title,
      language: meta?.language,
    };
  }, [activeTab]);

  // 刷新历史列表 / Refresh history list
  const refreshHistory = useCallback(async () => {
    if (!historyTarget) {
      setHistoryVersions([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const versions = await ipcBridge.previewHistory.list.invoke({ target: historyTarget });
      setHistoryVersions(versions || []);
      setHistoryError(null);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('common.unknownError');
      setHistoryError(`${t('preview.loadHistoryFailed')}: ${errorMsg}`);
      setHistoryVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [historyTarget, t]);

  // 当 historyTarget 变化时自动刷新历史 / Auto refresh history when historyTarget changes
  useEffect(() => {
    void refreshHistory().catch((): void => undefined);
  }, [refreshHistory]);

  // 保存快照 / Save snapshot
  const handleSaveSnapshot = useCallback(async () => {
    if (!historyTarget || !activeTab) {
      return;
    }
    if (snapshotSaving) return;

    // 防抖检查：如果距离上次保存快照时间小于1秒，则忽略 / Debounce check: Ignore if less than 1 second since last save
    const now = Date.now();
    if (now - lastSnapshotTimeRef.current < SNAPSHOT_DEBOUNCE_TIME) {
      messageApi.info(t('preview.tooFrequent'));
      return;
    }

    try {
      setSnapshotSaving(true);
      lastSnapshotTimeRef.current = now; // 更新最后保存时间 / Update last save time
      await ipcBridge.previewHistory.save.invoke({ target: historyTarget, content: activeTab.content });
      messageApi.success(t('preview.snapshotSaved'));
      await refreshHistory();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('common.unknownError');
      messageApi.error(`${t('preview.snapshotSaveFailed')}: ${errorMsg}`);
    } finally {
      setSnapshotSaving(false);
    }
  }, [historyTarget, activeTab, snapshotSaving, messageApi, refreshHistory, t]);

  // 选择历史快照 / Select history snapshot
  const handleSnapshotSelect = useCallback(
    async (snapshot: PreviewSnapshotInfo) => {
      if (!historyTarget) {
        return;
      }
      try {
        const result = await ipcBridge.previewHistory.getContent.invoke({ target: historyTarget, snapshotId: snapshot.id });
        if (result?.content) {
          updateContent(result.content);
          messageApi.success(t('preview.historyLoaded'));
        } else {
          throw new Error(t('preview.errors.emptySnapshot'));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : t('common.unknownError');
        messageApi.error(`${t('preview.historyLoadFailed')}: ${errorMsg}`);
      }
    },
    [historyTarget, messageApi, updateContent, t]
  );

  return {
    historyVersions,
    historyLoading,
    snapshotSaving,
    historyError,
    historyTarget,
    refreshHistory,
    handleSaveSnapshot,
    handleSnapshotSelect,
    messageApi,
    messageContextHolder,
  };
};
