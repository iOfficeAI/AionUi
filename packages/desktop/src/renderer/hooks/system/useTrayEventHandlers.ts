/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isElectronDesktop } from '@renderer/utils/platform';

/**
 * Handle tray-icon events dispatched from the main process.
 *
 * Registered events:
 *  - `tray:navigate-to-guid`        → /guid
 *  - `tray:navigate-to-conversation` → /conversation/:id
 *  - `tray:open-about`              → /settings/about
 *  - `tray:pause-all-tasks`         → stop-all then /settings/system
 *  - `tray:check-update`            → /settings/about + open update modal
 *
 * Bilingual comments mirror the existing Layout.tsx style.
 */
export const useTrayEventHandlers = (): void => {
  const navigate = useNavigate();

  // Navigate to guid page when requested from tray / 托盘请求导航到 guid 页面
  const handleNavigateToGuid = useCallback(() => {
    void navigate('/guid');
  }, [navigate]);

  // Navigate to conversation when requested from tray / 托盘请求导航到对话页面
  const handleNavigateToConversation = useCallback(
    (event: CustomEvent<{ conversation_id: string }>) => {
      void navigate(`/conversation/${event.detail.conversation_id}`);
    },
    [navigate]
  );

  // Open about dialog when requested from tray / 托盘请求打开关于对话框
  const handleOpenAbout = useCallback(() => {
    // Navigate to settings/about page / 导航到设置/关于页面
    void navigate('/settings/about');
  }, [navigate]);

  // Handle pause all tasks request from tray / 托盘请求暂停所有任务
  const handlePauseAllTasks = useCallback(async () => {
    const { ipcBridge } = await import('@/common');
    const result = await ipcBridge.task.stopAll.invoke();
    if (result?.success) {
      // Navigate to settings page to show task status
      void navigate('/settings/system');
    }
  }, [navigate]);

  // Handle check update request from tray / 托盘请求检查更新
  // 1. Navigate to about page / 导航到关于页面
  // 2. Trigger update modal check / 触发更新模态框检查
  const handleCheckUpdate = useCallback(() => {
    void navigate('/settings/about');
    // Trigger update modal after a short delay to ensure page is loaded
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('aionui-open-update-modal', { detail: { source: 'tray' } }));
    }, 100);
  }, [navigate]);

  useEffect(() => {
    if (!isElectronDesktop()) return;

    // Listen for tray events / 监听托盘事件
    window.addEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
    window.addEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
    window.addEventListener('tray:open-about', handleOpenAbout as EventListener);
    window.addEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
    window.addEventListener('tray:check-update', handleCheckUpdate as EventListener);

    return () => {
      window.removeEventListener('tray:navigate-to-guid', handleNavigateToGuid as EventListener);
      window.removeEventListener('tray:navigate-to-conversation', handleNavigateToConversation as EventListener);
      window.removeEventListener('tray:open-about', handleOpenAbout as EventListener);
      window.removeEventListener('tray:pause-all-tasks', handlePauseAllTasks as EventListener);
      window.removeEventListener('tray:check-update', handleCheckUpdate as EventListener);
    };
  }, [handleNavigateToGuid, handleNavigateToConversation, handleOpenAbout, handlePauseAllTasks, handleCheckUpdate]);
};
