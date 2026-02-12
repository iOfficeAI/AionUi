/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenClaw Conflict Detector
 *
 * Detects if OpenClaw has Lark/Telegram channels enabled with the same credentials
 * as AionUi Channels, and warns the user about the conflict.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface OpenClawChannelAccount {
  enabled: boolean;
  appId?: string;
  appSecret?: string;
  botToken?: string;
}

interface OpenClawChannelsConfig {
  telegram?: {
    enabled: boolean;
    botToken?: string;
  };
  feishu?: {
    enabled: boolean;
    accounts?: {
      [key: string]: OpenClawChannelAccount;
    };
  };
}

interface OpenClawConfig {
  channels?: OpenClawChannelsConfig;
}

interface ConflictInfo {
  platform: 'lark' | 'telegram';
  openclawEnabled: boolean;
  credentialMatch: boolean;
  openclawCredential: string; // appId or botToken
}

/**
 * Find OpenClaw config path
 */
function findOpenClawConfigPath(): string | null {
  // Check environment variable
  const envPath = process.env.OPENCLAW_CONFIG_PATH || process.env.CLAWDBOT_CONFIG_PATH;
  if (envPath) {
    const resolved = path.resolve(envPath.replace(/^~/, os.homedir()));
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  // Check state directory
  const stateDir = process.env.OPENCLAW_STATE_DIR?.replace(/^~/, os.homedir()) || path.join(os.homedir(), '.openclaw');

  const candidates = [path.join(stateDir, 'openclaw.json'), path.join(stateDir, 'clawdbot.json'), path.join(os.homedir(), '.clawdbot', 'clawdbot.json')];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Read OpenClaw config
 */
function readOpenClawConfig(): OpenClawConfig | null {
  const configPath = findOpenClawConfigPath();
  if (!configPath) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content) as OpenClawConfig;
  } catch (error) {
    console.warn('[OpenClawConflictDetector] Failed to read OpenClaw config:', error);
    return null;
  }
}

/**
 * Check if OpenClaw Lark channel conflicts with AionUi credentials
 */
export function detectLarkConflict(aionuiAppId: string): ConflictInfo | null {
  const config = readOpenClawConfig();
  if (!config?.channels?.feishu) {
    return null;
  }

  const feishu = config.channels.feishu;
  if (!feishu.enabled || !feishu.accounts) {
    return null;
  }

  // Check all accounts
  for (const [accountName, account] of Object.entries(feishu.accounts)) {
    if (account.enabled && account.appId === aionuiAppId) {
      console.warn(`[OpenClawConflictDetector] Lark conflict detected: OpenClaw account "${accountName}" uses same appId: ${aionuiAppId}`);
      return {
        platform: 'lark',
        openclawEnabled: true,
        credentialMatch: true,
        openclawCredential: aionuiAppId,
      };
    }
  }

  return null;
}

/**
 * Check if OpenClaw Telegram channel conflicts with AionUi credentials
 */
export function detectTelegramConflict(aionuiBotToken: string): ConflictInfo | null {
  const config = readOpenClawConfig();
  if (!config?.channels?.telegram) {
    return null;
  }

  const telegram = config.channels.telegram;
  if (!telegram.enabled || !telegram.botToken) {
    return null;
  }

  if (telegram.botToken === aionuiBotToken) {
    console.warn(`[OpenClawConflictDetector] Telegram conflict detected: OpenClaw uses same bot token`);
    return {
      platform: 'telegram',
      openclawEnabled: true,
      credentialMatch: true,
      openclawCredential: aionuiBotToken.substring(0, 20) + '...',
    };
  }

  return null;
}

/**
 * Check if OpenClaw has any channel enabled (regardless of credentials)
 */
export function hasOpenClawChannelsEnabled(): { lark: boolean; telegram: boolean } {
  const config = readOpenClawConfig();
  if (!config?.channels) {
    return { lark: false, telegram: false };
  }

  const larkEnabled = config.channels.feishu?.enabled === true;
  const telegramEnabled = config.channels.telegram?.enabled === true;

  return { lark: larkEnabled, telegram: telegramEnabled };
}

/**
 * Get OpenClaw config path for display
 */
export function getOpenClawConfigPath(): string | null {
  return findOpenClawConfigPath();
}

/**
 * Suggest resolution steps
 */
export function getConflictResolutionSteps(platform: 'lark' | 'telegram'): string[] {
  const configPath = findOpenClawConfigPath();
  const platformName = platform === 'lark' ? 'Feishu' : 'Telegram';

  return [
    `Detected conflict: OpenClaw ${platformName} channel is using the same credentials as AionUi.`,
    ``,
    `This means messages are being handled by OpenClaw, not AionUi Channels.`,
    `Switching agents in AionUi will have no effect.`,
    ``,
    `To fix this, choose one:`,
    ``,
    `Option 1: Disable OpenClaw ${platformName} channel`,
    `  - Edit: ${configPath}`,
    `  - Set channels.${platform === 'lark' ? 'feishu' : 'telegram'}.enabled = false`,
    `  - Restart OpenClaw`,
    ``,
    `Option 2: Use different credentials`,
    `  - Create a new ${platformName} bot`,
    `  - Configure it in AionUi Channels`,
    `  - Keep OpenClaw ${platformName} channel for other use`,
    ``,
    `Option 3: Use OpenClaw for ${platformName}`,
    `  - Disable ${platformName} in AionUi Channels`,
    `  - Use OpenClaw's native ${platformName} integration`,
  ];
}
