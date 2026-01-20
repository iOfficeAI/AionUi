/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cliSettings } from '@/common/ipcBridge';
import type { CliSettingsConfig } from '@/common/storage';
import { acpDetector } from '@/agent/acp/AcpDetector';
import { ProcessConfig } from '@/process/initStorage';

/**
 * 初始化 CLI 设置 IPC 桥接
 * Initialize CLI Settings IPC Bridge
 */
export function initCliSettingsBridge(): void {
  /**
   * 获取所有 CLI 设置
   * 合并检测到的 agents 与已保存的设置
   * Get all CLI settings - merge detected agents with saved settings
   */
  cliSettings.getAll.provider(async () => {
    try {
      // 获取已保存的设置 / Get saved settings
      const savedSettings = (await ProcessConfig.get('cli.settings')) || {};

      // 获取检测到的 agents / Get detected agents
      const detectedAgents = acpDetector.getDetectedAgents();

      // 合并结果：为每个检测到的 agent 创建或使用已保存的设置
      // Merge results: create or use saved settings for each detected agent
      const mergedSettings: Record<string, CliSettingsConfig> = {};

      for (const agent of detectedAgents) {
        // 跳过 custom agents（智能助手）- 它们有自己的配置
        // Skip custom agents (smart assistants) - they have their own config
        if (agent.backend === 'custom') continue;

        const key = agent.backend;
        const saved = savedSettings[key];

        if (saved) {
          // 使用已保存的设置，但确保 cliPath 是最新的
          // Use saved settings but ensure cliPath is up to date
          mergedSettings[key] = {
            ...saved,
            cliPath: agent.cliPath || saved.cliPath,
          };
        } else {
          // 为新检测到的 agent 创建默认设置
          // Create default settings for newly detected agent
          mergedSettings[key] = {
            cliPath: agent.cliPath || '',
            backend: key,
            enabled: true,
            customArgs: agent.acpArgs || [],
            yoloMode: false,
            env: {},
          };
        }
      }

      return {
        success: true,
        data: mergedSettings,
      };
    } catch (error) {
      console.error('[CliSettingsBridge] Failed to get all settings:', error);
      return {
        success: false,
        data: {},
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * 保存单个 CLI 设置
   * Save single CLI settings
   */
  cliSettings.save.provider(async (config: CliSettingsConfig) => {
    try {
      const savedSettings = (await ProcessConfig.get('cli.settings')) || {};
      savedSettings[config.backend] = config;
      await ProcessConfig.set('cli.settings', savedSettings);

      return {
        success: true,
      };
    } catch (error) {
      console.error('[CliSettingsBridge] Failed to save setting:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  /**
   * 保存所有 CLI 设置
   * Save all CLI settings
   */
  cliSettings.saveAll.provider(async (configs: Record<string, CliSettingsConfig>) => {
    try {
      await ProcessConfig.set('cli.settings', configs);

      return {
        success: true,
      };
    } catch (error) {
      console.error('[CliSettingsBridge] Failed to save all settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}
