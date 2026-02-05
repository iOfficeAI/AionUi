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

        case 'claude': {
          // Claude: Check if authenticated by running 'claude doctor'
          // This verifies both CLI installation and authentication status
          try {
            const doctorOutput = execSync(`"${agent.cliPath}" doctor`, {
              encoding: 'utf-8',
              timeout: 10000,
              stdio: 'pipe',
            });
            // Check for authentication issues in doctor output
            const lowerOutput = doctorOutput.toLowerCase();
            if (lowerOutput.includes('not authenticated') || lowerOutput.includes('not logged in') || lowerOutput.includes('authentication required') || lowerOutput.includes('please login') || lowerOutput.includes('no api key')) {
              return {
                success: false,
                msg: 'Claude not authenticated',
                data: { available: false, error: 'Not authenticated' },
              };
            }
          } catch (error) {
            // doctor command failed, might not be authenticated or CLI issue
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.toLowerCase().includes('auth') || errorMsg.toLowerCase().includes('login') || errorMsg.toLowerCase().includes('api key')) {
              return {
                success: false,
                msg: 'Claude not authenticated',
                data: { available: false, error: 'Not authenticated' },
              };
            }
            // Fallback to version check if doctor command doesn't exist
            try {
              execSync(`"${agent.cliPath}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
            } catch {
              return {
                success: false,
                msg: 'Claude CLI check failed',
                data: { available: false, error: errorMsg },
              };
            }
          }
          break;
        }

        case 'codex': {
          // Codex (OpenAI): Check if OPENAI_API_KEY is set
          try {
            execSync(`"${agent.cliPath}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
            // Also check if OPENAI_API_KEY environment variable is set
            if (!process.env.OPENAI_API_KEY) {
              return {
                success: false,
                msg: 'Codex not configured (OPENAI_API_KEY not set)',
                data: { available: false, error: 'API key not configured' },
              };
            }
          } catch (error) {
            return {
              success: false,
              msg: 'Codex CLI check failed',
              data: { available: false, error: error instanceof Error ? error.message : 'CLI check failed' },
            };
          }
          break;
        }

        case 'kimi': {
          // Kimi: Check auth status using 'kimi auth status' or similar
          try {
            // First check if CLI works
            execSync(`"${agent.cliPath}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
            // Try to check auth status
            try {
              const authOutput = execSync(`"${agent.cliPath}" auth status`, {
                encoding: 'utf-8',
                timeout: 5000,
                stdio: 'pipe',
              });
              const lowerOutput = authOutput.toLowerCase();
              if (lowerOutput.includes('not logged') || lowerOutput.includes('not authenticated') || lowerOutput.includes('please login')) {
                return {
                  success: false,
                  msg: 'Kimi not authenticated',
                  data: { available: false, error: 'Not authenticated' },
                };
              }
            } catch {
              // auth status command might not exist, check config file instead
              const os = await import('os');
              const path = await import('path');
              const fs = await import('fs');
              const kimiConfigPath = path.join(os.homedir(), '.kimi', 'config.json');
              if (!fs.existsSync(kimiConfigPath)) {
                return {
                  success: false,
                  msg: 'Kimi not configured',
                  data: { available: false, error: 'Configuration not found' },
                };
              }
            }
          } catch (error) {
            return {
              success: false,
              msg: 'Kimi CLI check failed',
              data: { available: false, error: error instanceof Error ? error.message : 'CLI check failed' },
            };
          }
          break;
        }

        case 'qwen': {
          // Qwen: Check if authenticated
          try {
            execSync(`"${agent.cliPath}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
            // Check for Qwen config/auth
            const os = await import('os');
            const path = await import('path');
            const fs = await import('fs');
            const qwenConfigPath = path.join(os.homedir(), '.qwen', 'config.json');
            const qwenAltConfigPath = path.join(os.homedir(), '.config', 'qwen', 'config.json');
            if (!fs.existsSync(qwenConfigPath) && !fs.existsSync(qwenAltConfigPath)) {
              // Also check environment variable
              if (!process.env.DASHSCOPE_API_KEY && !process.env.QWEN_API_KEY) {
                return {
                  success: false,
                  msg: 'Qwen not configured',
                  data: { available: false, error: 'Configuration not found' },
                };
              }
            }
          } catch (error) {
            return {
              success: false,
              msg: 'Qwen CLI check failed',
              data: { available: false, error: error instanceof Error ? error.message : 'CLI check failed' },
            };
          }
          break;
        }

        default: {
          // For all other CLIs: Check version and try auth status if available
          try {
            try {
              execSync(`"${agent.cliPath}" --version`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
            } catch {
              // If --version fails, try --help (some CLIs don't support --version)
              execSync(`"${agent.cliPath}" --help`, { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
            }
            // Try auth status command as a bonus check (won't fail if command doesn't exist)
            try {
              const authOutput = execSync(`"${agent.cliPath}" auth status`, {
                encoding: 'utf-8',
                timeout: 3000,
                stdio: 'pipe',
              });
              const lowerOutput = authOutput.toLowerCase();
              if (lowerOutput.includes('not logged') || lowerOutput.includes('not authenticated')) {
                return {
                  success: false,
                  msg: `${backend} not authenticated`,
                  data: { available: false, error: 'Not authenticated' },
                };
              }
            } catch {
              // auth status command doesn't exist, that's OK
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
