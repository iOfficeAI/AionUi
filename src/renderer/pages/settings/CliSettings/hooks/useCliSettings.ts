/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import type { CliSettingsConfig } from '@/common/storage';
import { cliSettings, acpConversation } from '@/common/ipcBridge';
import type { CliSettingsState, DetectedCliAgent } from '../types';

/**
 * CLI 设置管理 Hook
 * CLI Settings Management Hook
 */
export function useCliSettings() {
  const [state, setState] = useState<CliSettingsState>({
    settings: {},
    loading: true,
    error: null,
  });

  const [detectedAgents, setDetectedAgents] = useState<DetectedCliAgent[]>([]);

  // 本地待保存的更改（不会立即保存到后端）
  // Local pending changes (not saved to backend immediately)
  const [pendingSettings, setPendingSettings] = useState<Record<string, CliSettingsConfig>>({});
  const [isDirty, setIsDirty] = useState(false);

  /**
   * 加载所有 CLI 设置
   * Load all CLI settings
   */
  const loadSettings = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await cliSettings.getAll.invoke();
      if (response.success && response.data) {
        setState({
          settings: response.data,
          loading: false,
          error: null,
        });
        // 同步初始化本地待保存状态 / Sync initialize local pending state
        setPendingSettings(response.data);
        setIsDirty(false);
      } else {
        setState({
          settings: {},
          loading: false,
          error: response.error || 'Failed to load CLI settings',
        });
      }
    } catch (error) {
      setState({
        settings: {},
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  /**
   * 加载检测到的 CLI agents
   * Load detected CLI agents
   */
  const loadDetectedAgents = useCallback(async () => {
    try {
      const response = await acpConversation.getAvailableAgents.invoke();
      if (response.success && response.data) {
        // 过滤掉 gemini, custom, codex（它们有自己的设置页面）
        // Filter out gemini, custom, codex (they have their own settings pages)
        const filteredAgents = response.data.filter(
          (agent) => !['gemini', 'custom', 'codex'].includes(agent.backend)
        );
        setDetectedAgents(
          filteredAgents.map((agent) => ({
            backend: agent.backend,
            name: agent.name,
            cliPath: agent.cliPath,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load detected agents:', error);
    }
  }, []);

  /**
   * 保存单个 CLI 设置
   * Save single CLI settings
   */
  const saveSettings = useCallback(async (config: CliSettingsConfig) => {
    try {
      const response = await cliSettings.save.invoke(config);
      if (response.success) {
        setState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            [config.backend]: config,
          },
        }));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to save CLI settings:', error);
      return false;
    }
  }, []);

  /**
   * 更新单个 CLI 配置（只更新本地状态，不保存）
   * Update single CLI config (local state only, does not save)
   */
  const updateConfig = useCallback(
    (backend: string, updates: Partial<CliSettingsConfig>) => {
      const currentConfig = pendingSettings[backend];
      if (!currentConfig) return;

      const newConfig: CliSettingsConfig = {
        ...currentConfig,
        ...updates,
      };

      setPendingSettings((prev) => ({
        ...prev,
        [backend]: newConfig,
      }));
      setIsDirty(true);
    },
    [pendingSettings]
  );

  /**
   * 保存所有待保存的 CLI 设置
   * Save all pending CLI settings
   */
  const saveAllSettings = useCallback(async (): Promise<boolean> => {
    try {
      // 逐个保存每个 CLI 设置
      // Save each CLI setting one by one
      for (const config of Object.values(pendingSettings)) {
        const response = await cliSettings.save.invoke(config);
        if (!response.success) {
          console.error('Failed to save CLI settings for:', config.backend);
          return false;
        }
      }

      // 更新保存后的状态 / Update state after save
      setState((prev) => ({
        ...prev,
        settings: { ...pendingSettings },
      }));
      setIsDirty(false);
      return true;
    } catch (error) {
      console.error('Failed to save all CLI settings:', error);
      return false;
    }
  }, [pendingSettings]);

  /**
   * 重置所有待保存的更改
   * Reset all pending changes
   */
  const resetChanges = useCallback(() => {
    setPendingSettings(state.settings);
    setIsDirty(false);
  }, [state.settings]);

  // 初始加载
  // Initial load
  useEffect(() => {
    void loadSettings();
    void loadDetectedAgents();
  }, [loadSettings, loadDetectedAgents]);

  return {
    // 返回待保存的设置（而不是已保存的设置）以便 UI 显示最新状态
    // Return pending settings (not saved settings) so UI shows latest state
    settings: pendingSettings,
    loading: state.loading,
    error: state.error,
    detectedAgents,
    isDirty,
    loadSettings,
    saveSettings,
    saveAllSettings,
    updateConfig,
    resetChanges,
  };
}
