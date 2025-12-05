/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import type { AcpBackendAll } from '@/types/acpTypes';
import { POTENTIAL_ACP_CLIS } from '@/types/acpTypes';
import { ProcessConfig } from '@/process/initStorage';

interface DetectedAgent {
  backend: AcpBackendAll;
  name: string;
  cliPath?: string;
  acpArgs?: string[];
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
        backend: 'custom',
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
   * 启动时执行检测 - 使用 POTENTIAL_ACP_CLIS 列表检测已安装的 CLI
   */
  async initialize(): Promise<void> {
    if (this.isDetected) return;

    console.log('[ACP] Starting agent detection...');
    const startTime = Date.now();

    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where' : 'which';

    const detected: DetectedAgent[] = [];

    // 并行检测所有潜在的 ACP CLI
    const detectionPromises = POTENTIAL_ACP_CLIS.map((cli) => {
      return Promise.resolve().then(() => {
        try {
          execSync(`${whichCommand} ${cli.cmd}`, {
            encoding: 'utf-8',
            stdio: 'pipe',
            timeout: 1000,
          });

          return {
            backend: cli.backendId,
            name: cli.name,
            cliPath: cli.cmd,
            acpArgs: cli.args,
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
        backend: 'gemini',
        name: 'Gemini CLI',
        cliPath: undefined,
        acpArgs: undefined,
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
