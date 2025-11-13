/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import SettingsModal from './index';

type SettingTab = 'gemini' | 'model' | 'tools' | 'system' | 'about';

/**
 * Hook for using the settings modal
 * 使用设置弹窗的 Hook
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
export const useSettingsModal = () => {
  const [visible, setVisible] = useState(false);
  const [defaultTab, setDefaultTab] = useState<SettingTab>('gemini');

  const openSettings = useCallback((tab?: SettingTab) => {
    if (tab) {
      setDefaultTab(tab);
    }
    setVisible(true);
  }, []);

  const closeSettings = useCallback(() => {
    setVisible(false);
  }, []);

  const settingsModal = <SettingsModal visible={visible} onCancel={closeSettings} defaultTab={defaultTab} />;

  return {
    openSettings,
    closeSettings,
    settingsModal,
    visible,
  };
};

export default useSettingsModal;
