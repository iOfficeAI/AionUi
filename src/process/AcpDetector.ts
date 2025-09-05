/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '@/common/acpTypes';
import { getEnabledAcpBackends } from '@/common/acpTypes';

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
   * 启动时执行检测 - 简化版：只用 which 命令检查
   */
  async initialize(): Promise<void> {
    if (this.isDetected) return;

    console.log('[ACP] Starting agent detection...');
    const startTime = Date.now();

    const { execSync } = await import('child_process');
    const isWindows = process.platform === 'win32';
    const whichCommand = isWindows ? 'where' : 'which';

    // 从配置中获取要检测的ACP后端（仅启用的）
    const enabledBackends = getEnabledAcpBackends();
    const acpCommands = enabledBackends.map((backend) => backend.id);
    const detected: DetectedAgent[] = [];

    // 并行检测所有命令
    const detectionPromises = acpCommands.map(async (command) => {
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
        name: 'Gemini',
        cliPath: undefined,
      });
    }

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
}

// 单例实例
export const acpDetector = new AcpDetector();
