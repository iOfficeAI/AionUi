/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import SettingsModal, { type SettingTab } from './index';

/**
 * 设置弹窗 Hook 返回值类型 / Settings modal hook return type
 */
interface UseSettingsModalReturn {
  /** 打开设置弹窗 / Open settings modal */
  openSettings: (tab?: SettingTab) => void;
  /** 关闭设置弹窗 / Close settings modal */
  closeSettings: () => void;
  /** 设置弹窗组件 / Settings modal component */
  settingsModal: React.ReactNode;
  /** 弹窗可见状态 / Modal visibility state */
  visible: boolean;
}

/**
 * 使用设置弹窗的 Hook / Hook for using the settings modal
 *
 * 提供设置弹窗的状态管理和操作方法
 * Provides state management and operation methods for settings modal
 *
 * @returns Hook 返回值对象 / Hook return object
 *
 * @example
 * ```tsx
 * const { openSettings, settingsModal } = useSettingsModal();
 *
 * return (
 *   <>
 *     <Button onClick={() => openSettings()}>Open Settings</Button>
 *     <Button onClick={() => openSettings('model')}>Open Model Settings</Button>
 *     {settingsModal}
 *   </>
 * );
 * ```
 */
export const useSettingsModal = (): UseSettingsModalReturn => {
  // 弹窗可见状态 / Modal visibility state
  const [visible, setVisible] = useState(false);
  // 默认选中的标签页 / Default selected tab
  const [defaultTab, setDefaultTab] = useState<SettingTab>('gemini');

  /**
   * 打开设置弹窗 / Open settings modal
   * @param tab - 可选，指定打开的标签页 / Optional, specify which tab to open
   */
  const openSettings = useCallback((tab?: SettingTab) => {
    if (tab) {
      setDefaultTab(tab);
    }
    setVisible(true);
  }, []);

  /**
   * 关闭设置弹窗 / Close settings modal
   */
  const closeSettings = useCallback(() => {
    setVisible(false);
  }, []);

  // 渲染设置弹窗组件 / Render settings modal component
  const settingsModal = <SettingsModal visible={visible} onCancel={closeSettings} defaultTab={defaultTab} />;

  return {
    openSettings,
    closeSettings,
    settingsModal,
    visible,
  };
};

export default useSettingsModal;
