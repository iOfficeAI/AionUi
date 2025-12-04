/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import type { AcpBackend } from '@/types/acpTypes';
import { getEnabledAcpBackends } from '@/types/acpTypes';
import { ProcessConfig } from '@/process/initStorage';

interface DetectedAgent {
  backend: AcpBackend;
  name: string;
  cliPath?: string;
}

/**
 * 全局ACP检测器 - 启动时检测一次，全局共享结果
 */
class AcpDetector {
  private detectedAgents: DetectedAgent[] = [];
  private isDetected = false;

  /**
   * Add custom agent to detected list if configured and enabled.
   * Inserts after Claude if present, otherwise appends.
   */
  private async addCustomAgentToList(detected: DetectedAgent[]): Promise<void> {
    try {
      const customAgentConfig = await ProcessConfig.get('acp.customAgent');
      if (!customAgentConfig?.enabled || !customAgentConfig.defaultCliPath) return;

      const customAgent: DetectedAgent = {
        backend: 'custom' as AcpBackend,
        name: customAgentConfig.name || 'Custom Agent',
        cliPath: customAgentConfig.defaultCliPath,
      };

      // Insert after Claude if present, otherwise append
      const claudeIndex = detected.findIndex((a) => a.backend === 'claude');
      if (claudeIndex !== -1) {
        detected.splice(claudeIndex + 1, 0, customAgent);
      } else {
        detected.push(customAgent);
      }
    } catch {
      // No custom agent configured - this is normal
    }
  }

  /**
   * 启动时执行检测 - 简化版：只用 which 命令检查
   */
  async initialize(): Promise<void> {
    if (this.isDetected) return;

    console.log('[ACP] Starting agent detection...');
    const startTime = Date.now();

    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where' : 'which';

    // 从配置中获取要检测的ACP后端（仅启用的）
    const enabledBackends = getEnabledAcpBackends();
    const acpCommands = enabledBackends.map((backend) => backend.id);
    const detected: DetectedAgent[] = [];

    // 并行检测所有命令
    const detectionPromises = acpCommands.map((command) => {
      return Promise.resolve().then(() => {
        try {
          execSync(`${whichCommand} ${command}`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 1000,
          });

          // 从配置中获取对应的名称
          const backendConfig = enabledBackends.find((backend) => backend.id === command);

          return {
            backend: command as AcpBackend,
            name: backendConfig?.name || command,
            cliPath: command,
          };
        } catch {
          return null;
        }
      });
    });

    const results = await Promise.allSettled(detectionPromises);

    // 收集检测结果
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        detected.push(result.value);
      }
    }

    // 如果检测到ACP工具，添加内置Gemini
    if (detected.length > 0) {
      detected.unshift({
        backend: 'gemini' as AcpBackend,
        name: 'Gemini CLI',
        cliPath: undefined,
      });
    }

    // Check for custom agent configuration - insert after claude if found
    await this.addCustomAgentToList(detected);

    this.detectedAgents = detected;
    this.isDetected = true;

    const elapsed = Date.now() - startTime;
    console.log(`[ACP] Detection completed in ${elapsed}ms, found ${detected.length} agents`);
  }

  /**
   * 获取检测结果
   */
  getDetectedAgents(): DetectedAgent[] {
    return this.detectedAgents;
  }

  /**
   * 是否有可用的ACP工具
   */
  hasAgents(): boolean {
    return this.detectedAgents.length > 0;
  }

  /**
   * Refresh custom agent detection only (called when config changes)
   */
  async refreshCustomAgent(): Promise<void> {
    // Remove existing custom agent if present
    this.detectedAgents = this.detectedAgents.filter((agent) => agent.backend !== 'custom');

    // Re-add custom agent with current config
    await this.addCustomAgentToList(this.detectedAgents);
  }
}

// 单例实例
export const acpDetector = new AcpDetector();
