/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { acpDetector } from '@/agent/acp/AcpDetector';
import { ipcBridge } from '../../common';

export function initAcpConversationBridge(): void {
  // Debug provider to check environment variables
  ipcBridge.acpConversation.checkEnv.provider(() => {
    return Promise.resolve({
      env: {
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? '[SET]' : '[NOT SET]',
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT ? '[SET]' : '[NOT SET]',
        NODE_ENV: process.env.NODE_ENV || '[NOT SET]',
      },
    });
  });

  // 保留旧的detectCliPath接口用于向后兼容，但使用新检测器的结果
  ipcBridge.acpConversation.detectCliPath.provider(({ backend }) => {
    const agents = acpDetector.getDetectedAgents();
    const agent = agents.find((a) => a.backend === backend);

    if (agent?.cliPath) {
      return Promise.resolve({ success: true, data: { path: agent.cliPath } });
    }

    return Promise.resolve({ success: false, msg: `${backend} CLI not found. Please install it and ensure it's accessible.` });
  });

  // 新的ACP检测接口 - 基于全局标记位
  ipcBridge.acpConversation.getAvailableAgents.provider(() => {
    try {
      const agents = acpDetector.getDetectedAgents();
      return Promise.resolve({ success: true, data: agents });
    } catch (error) {
      return Promise.resolve({
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Refresh custom agents detection - called when custom agents config changes
  ipcBridge.acpConversation.refreshCustomAgents.provider(async () => {
    try {
      await acpDetector.refreshCustomAgents();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  // Check agent health (availability and latency)
  // Only performs reliable checks - verifies CLI exists and can run
  // Does NOT verify ACP support since that requires runtime testing
  ipcBridge.acpConversation.checkAgentHealth.provider(async ({ backend }) => {
    try {
      const startTime = Date.now();

      // Step 1: Check if CLI is installed
      const agents = acpDetector.getDetectedAgents();
      const agent = agents.find((a) => a.backend === backend);

      if (!agent?.cliPath) {
        return {
          success: false,
          msg: `${backend} CLI not found`,
          data: { available: false, error: 'CLI not installed' },
        };
      }

      const { execSync } = await import('child_process');

      // Step 2: Perform backend-specific health checks
      // Only check what we can reliably verify
      switch (backend) {
        case 'gemini': {
          // Gemini: Check auth status (tested and reliable)
          try {
            const loginStatus = execSync('gemini auth status', { encoding: 'utf-8', timeout: 5000 });
            if (!loginStatus.includes('Logged in') && !loginStatus.includes('logged in')) {
              return {
                success: false,
                msg: 'Gemini not logged in',
                data: { available: false, error: 'Not authenticated' },
              };
            }
          } catch (error) {
            return {
              success: false,
              msg: 'Failed to check Gemini auth status',
              data: { available: false, error: error instanceof Error ? error.message : 'Auth check failed' },
            };
          }
          break;
        }

        case 'claude':
        case 'codex': {
          // Claude/Codex: Check --version (standard and reliable)
          try {
            execSync(`"${agent.cliPath}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
          } catch (error) {
            return {
              success: false,
              msg: `${backend} CLI check failed`,
              data: { available: false, error: error instanceof Error ? error.message : 'CLI check failed' },
            };
          }
          break;
        }

        default: {
          // For all other CLIs: Just verify the CLI binary can execute
          // Don't try to verify ACP support - it's unreliable and not all CLIs
          // support --version. Use --help as fallback.
          try {
            try {
              execSync(`"${agent.cliPath}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
            } catch {
              // If --version fails, try --help (some CLIs don't support --version)
              execSync(`"${agent.cliPath}" --help`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
            }
          } catch (error) {
            return {
              success: false,
              msg: `${backend} CLI check failed`,
              data: { available: false, error: error instanceof Error ? error.message : 'CLI check failed' },
            };
          }
          break;
        }
      }

      // Step 3: Calculate latency (time to verify CLI works)
      const latency = Date.now() - startTime;

      return {
        success: true,
        data: { available: true, latency },
      };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : 'Unknown error',
        data: { available: false, error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  });
}
