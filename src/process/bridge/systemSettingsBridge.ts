/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 系统设置桥接模块
 * System Settings Bridge Module
 *
 * 负责���理系统级设置的读写操作（如关闭到托盘）
 * Handles read/write operations for system-level settings (e.g. close to tray)
 */

import { ipcBridge } from '@/common';
import { getPlatformServices } from '@/common/platform';
import { ProcessConfig } from '@process/utils/initStorage';
import { changeLanguage } from '@process/services/i18n';
import type { PetSize } from '@process/pet/petTypes';

// Keep-awake power blocker state
let _keepAwakeBlockerId: number | null = null;

type CloseToTrayChangeListener = (enabled: boolean) => void;
let _changeListener: CloseToTrayChangeListener | null = null;

type LanguageChangeListener = () => void;
let _languageChangeListener: LanguageChangeListener | null = null;

/**
 * 注册关闭到托盘设置变更监听器（供主进程 index.ts 使用）
 * Register a listener for close-to-tray setting changes (used by main process index.ts)
 */
export function onCloseToTrayChanged(listener: CloseToTrayChangeListener): void {
  _changeListener = listener;
}

/**
 * 注册语言变更监听器（供主进程 index.ts 使用）
 * Register a listener for language changes (used by main process index.ts)
 */
export function onLanguageChanged(listener: LanguageChangeListener): void {
  _languageChangeListener = listener;
}

export function initSystemSettingsBridge(): void {
  // 获取"关闭到托盘"设置 / Get "close to tray" setting
  ipcBridge.systemSettings.getCloseToTray.provider(async () => {
    const value = await ProcessConfig.get('system.closeToTray');
    return value ?? false;
  });

  // 设置"关闭到托盘"，先持久化再通知主进程
  // Set "close to tray", persist first then notify main process
  ipcBridge.systemSettings.setCloseToTray.provider(async ({ enabled }) => {
    // 先持久化到配置存储
    await ProcessConfig.set('system.closeToTray', enabled);
    // 然后通知主进程更新托盘状态
    _changeListener?.(enabled);
  });

  // 获取"任务完成通知"设置 / Get "task completion notification" setting
  ipcBridge.systemSettings.getNotificationEnabled.provider(async () => {
    const value = await ProcessConfig.get('system.notificationEnabled');
    return value ?? true; // 默认开启 / Default enabled
  });

  // 设置"任务完成通知" / Set "task completion notification"
  ipcBridge.systemSettings.setNotificationEnabled.provider(async ({ enabled }) => {
    // 先持久化到配置存储
    await ProcessConfig.set('system.notificationEnabled', enabled);
  });

  // 获取"定时任务通知"设置 / Get "scheduled task notification" setting
  ipcBridge.systemSettings.getCronNotificationEnabled.provider(async () => {
    const value = await ProcessConfig.get('system.cronNotificationEnabled');
    return value ?? false; // 默认关闭 / Default disabled
  });

  // 设置"定时任务通知" / Set "scheduled task notification"
  ipcBridge.systemSettings.setCronNotificationEnabled.provider(async ({ enabled }) => {
    // 先持久化到配置存储
    await ProcessConfig.set('system.cronNotificationEnabled', enabled);
  });

  // Get "keep awake" setting
  ipcBridge.systemSettings.getKeepAwake.provider(async () => {
    const value = await ProcessConfig.get('system.keepAwake');
    return value ?? false;
  });

  // Set "keep awake" — toggle prevent-display-sleep blocker
  ipcBridge.systemSettings.setKeepAwake.provider(async ({ enabled }) => {
    await ProcessConfig.set('system.keepAwake', enabled);
    const power = getPlatformServices().power;
    if (enabled && _keepAwakeBlockerId === null) {
      _keepAwakeBlockerId = power.preventDisplaySleep();
    } else if (!enabled && _keepAwakeBlockerId !== null) {
      power.allowSleep(_keepAwakeBlockerId);
      _keepAwakeBlockerId = null;
    }
  });

  // 语言变更通知，同步主进程 i18n 并通知托盘重建
  // Language change notification, sync main process i18n and notify tray rebuild
  ipcBridge.systemSettings.changeLanguage.provider(async ({ language }) => {
    // Broadcast to all renderers FIRST (desktop + WebUI) for real-time sync.
    // This must happen before the potentially slow main-process i18n switch.
    ipcBridge.systemSettings.languageChanged.emit({ language });
    _languageChangeListener?.();

    // Update main process i18n (non-blocking – don't let a hang here block the provider)
    changeLanguage(language).catch((error) => {
      console.error('[SystemSettings] Main process changeLanguage failed:', error);
    });
  });

  // Restore keep-awake state on startup
  ProcessConfig.get('system.keepAwake')
    .then((enabled) => {
      if (enabled) {
        _keepAwakeBlockerId = getPlatformServices().power.preventDisplaySleep();
        console.log('[SystemSettings] Keep-awake restored on startup');
      }
    })
    .catch((err) => {
      console.warn('[SystemSettings] Failed to restore keep-awake:', err);
    });

  // 获取"上传文件保存到工作区"设置 / Get "save uploads to workspace" setting
  ipcBridge.systemSettings.getSaveUploadToWorkspace.provider(async () => {
    const value = await ProcessConfig.get('upload.saveToWorkspace');
    return value ?? false; // 默认关闭 / Default disabled
  });

  // 设置"上传文件保存到工作区" / Set "save uploads to workspace"
  ipcBridge.systemSettings.setSaveUploadToWorkspace.provider(async ({ enabled }) => {
    await ProcessConfig.set('upload.saveToWorkspace', enabled);
  });

  // 获取"自动预览新建 Office 文件"设置 / Get "auto preview new Office files" setting
  ipcBridge.systemSettings.getAutoPreviewOfficeFiles.provider(async () => {
    const value = await ProcessConfig.get('system.autoPreviewOfficeFiles');
    return value ?? true; // 默认开启 / Default enabled
  });

  // 设置"自动预览新建 Office 文件" / Set "auto preview new Office files"
  ipcBridge.systemSettings.setAutoPreviewOfficeFiles.provider(async ({ enabled }) => {
    await ProcessConfig.set('system.autoPreviewOfficeFiles', enabled);
  });

  // Desktop pet settings
  ipcBridge.systemSettings.getPetEnabled.provider(async () => {
    const value = await ProcessConfig.get('pet.enabled');
    return value ?? false;
  });

  ipcBridge.systemSettings.setPetEnabled.provider(async ({ enabled }) => {
    const { createPetWindow, destroyPetWindow, isPetSupported } = await import('@process/pet/petManager');
    if (enabled && !isPetSupported()) {
      console.warn('[SystemSettings] Desktop pet is not supported in headless mode');
      return;
    }
    await ProcessConfig.set('pet.enabled', enabled);
    if (enabled) {
      createPetWindow();
    } else {
      destroyPetWindow();
    }
  });

  ipcBridge.systemSettings.getPetSize.provider(async () => {
    const value = await ProcessConfig.get('pet.size');
    return value ?? 280;
  });

  ipcBridge.systemSettings.setPetSize.provider(async ({ size }) => {
    await ProcessConfig.set('pet.size', size);
    const { resizePetWindow } = await import('@process/pet/petManager');
    resizePetWindow(size as PetSize);
  });

  ipcBridge.systemSettings.getPetDnd.provider(async () => {
    const value = await ProcessConfig.get('pet.dnd');
    return value ?? false;
  });

  ipcBridge.systemSettings.setPetDnd.provider(async ({ dnd }) => {
    await ProcessConfig.set('pet.dnd', dnd);
    const { setPetDndMode } = await import('@process/pet/petManager');
    setPetDndMode(dnd);
  });

  // Pet confirm-bubble toggle: when disabled, AI tool-call confirmations
  // are not routed to the pet's bubble window. Default true.
  ipcBridge.systemSettings.getPetConfirmEnabled.provider(async () => {
    const value = await ProcessConfig.get('pet.confirmEnabled');
    return value ?? true;
  });

  ipcBridge.systemSettings.setPetConfirmEnabled.provider(async ({ enabled }) => {
    await ProcessConfig.set('pet.confirmEnabled', enabled);
    const { setPetConfirmEnabled } = await import('@process/pet/petManager');
    setPetConfirmEnabled(enabled);
  });

  ipcBridge.systemSettings.getCommandQueueEnabled.provider(async () => {
    const value = await ProcessConfig.get('system.commandQueueEnabled');
    return value ?? true;
  });

  ipcBridge.systemSettings.setCommandQueueEnabled.provider(async ({ enabled }) => {
    await ProcessConfig.set('system.commandQueueEnabled', enabled);
  });
}
