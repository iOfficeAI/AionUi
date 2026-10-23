/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { GatewayAccount, GatewayCombo } from '@/common/types/gateway/gatewayTypes';
import type { GatewayStore } from './gatewayStore';

export type OmniRouteConnectionRecord = {
  id: string;
  provider: string;
  name: string | null;
  email: string | null;
  auth_type: string | null;
  is_active: number;
};

export type OmniRouteSyncResult = {
  success: boolean;
  importedAccounts: number;
  importedCombos: number;
  serverRunning: boolean;
  serverPort: number;
  message?: string;
};

const DEFAULT_PORT = 20128;
const DEFAULT_BASE_URL = `http://localhost:${DEFAULT_PORT}/v1`;

const ANTIGRAVITY_DEFAULT_MODELS = [
  'antigravity/claude-sonnet-4-6',
  'antigravity/claude-opus-4-6-thinking',
  'antigravity/gemini-3.8-flash-tiered',
  'antigravity/gemini-3-flash',
  'antigravity/gemini-3.5-flash-lite',
  'antigravity/gpt-oss-120b-medium',
];

const CLAUDE_DEFAULT_MODELS = [
  'claude-web/claude-sonnet-4-6',
  'claude-web/claude-opus-4-6',
  'claude-web/claude-opus-5',
  'claude-web/claude-sonnet-5',
];

const CURSOR_DEFAULT_MODELS = ['cursor/claude-3-7-sonnet', 'cursor/claude-3-5-sonnet', 'cursor/gpt-4o'];

export async function checkOmniRouteRunning(port = DEFAULT_PORT): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res: Response | null = await fetch(`http://localhost:${port}/v1/models`, {
      method: 'GET',
      signal: controller.signal,
    }).catch((): null => null);
    clearTimeout(timeout);
    return res !== null && (res.status === 200 || res.status === 401 || res.status === 403);
  } catch {
    return false;
  }
}

export function readLocalOmniRouteData(): {
  accounts: OmniRouteConnectionRecord[];
  apiKey: string;
} | null {
  const dbPath = path.join(os.homedir(), '.omniroute', 'storage.sqlite');
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  // Look for better-sqlite3 from global npm omniroute installation or local
  const possibleModulePaths = [
    path.join(os.homedir(), 'AppData/Roaming/npm/node_modules/omniroute/node_modules/better-sqlite3'),
    path.join(
      os.homedir(),
      '.nvm/versions/node',
      process.version,
      'lib/node_modules/omniroute/node_modules/better-sqlite3'
    ),
    'better-sqlite3',
  ];

  let DatabaseClass: any = null;
  for (const modPath of possibleModulePaths) {
    try {
      DatabaseClass = require(modPath);
      if (DatabaseClass) break;
    } catch {
      // try next
    }
  }

  if (!DatabaseClass) {
    return null;
  }

  try {
    const db = new DatabaseClass(dbPath, { readonly: true });
    const accounts = db
      .prepare('SELECT id, provider, name, email, auth_type, is_active FROM provider_connections WHERE is_active = 1')
      .all() as OmniRouteConnectionRecord[];

    const keys = db.prepare('SELECT key, name FROM api_keys LIMIT 1').all() as Array<{ key: string }>;
    db.close();

    const apiKey = keys[0]?.key || 'sk-9465108bb15ed26b-1477ab-600eaeb5';
    return { accounts, apiKey };
  } catch (err) {
    console.warn('[OmniRouteSync] Error reading SQLite database:', err);
    return null;
  }
}

export async function syncOmniRouteIntoStore(store: GatewayStore): Promise<OmniRouteSyncResult> {
  const isRunning = await checkOmniRouteRunning(DEFAULT_PORT);
  const data = readLocalOmniRouteData();

  if (!data || data.accounts.length === 0) {
    // If SQLite is unreadable, create a clean default OmniRoute connection using running server
    const fallbackId = 'acc-omniroute-default';
    const existing = store.getAccount(fallbackId);
    if (!existing) {
      const defaultAccount: GatewayAccount = {
        id: fallbackId,
        name: 'OmniRoute Local Gateway (Antigravity & Claude)',
        platform: 'omniroute',
        baseUrl: DEFAULT_BASE_URL,
        apiKey: 'sk-9465108bb15ed26b-1477ab-600eaeb5',
        models: ANTIGRAVITY_DEFAULT_MODELS,
        enabled: true,
        status: 'active',
      };
      store.saveAccount(defaultAccount);
      return {
        success: true,
        importedAccounts: 1,
        importedCombos: 0,
        serverRunning: isRunning,
        serverPort: DEFAULT_PORT,
        message: 'Imported default OmniRoute gateway account',
      };
    }
    return {
      success: true,
      importedAccounts: 0,
      importedCombos: 0,
      serverRunning: isRunning,
      serverPort: DEFAULT_PORT,
      message: 'OmniRoute account already connected',
    };
  }

  let importedAccounts = 0;
  const newAccountIds: string[] = [];
  const antigravityAccountIds: string[] = [];

  for (const record of data.accounts) {
    const isAntigravity = record.provider === 'antigravity';
    const isClaude = record.provider === 'claude-web' || record.provider === 'claude';
    const isCursor = record.provider === 'cursor';
    const isOpenRouter = record.provider === 'openrouter';

    let platform: GatewayAccount['platform'] = 'omniroute';
    let models = ANTIGRAVITY_DEFAULT_MODELS;
    let label = record.name || record.email || record.provider;

    if (isAntigravity) {
      platform = 'omniroute';
      models = ANTIGRAVITY_DEFAULT_MODELS;
      label = `Google Antigravity (${record.email || record.name || 'Account'})`;
    } else if (isClaude) {
      platform = 'omniroute';
      models = CLAUDE_DEFAULT_MODELS;
      label = `Claude Web (${record.name || record.email || 'Session'})`;
    } else if (isCursor) {
      platform = 'omniroute';
      models = CURSOR_DEFAULT_MODELS;
      label = `Cursor AI (${record.name || record.email || 'Account'})`;
    } else if (isOpenRouter) {
      platform = 'openrouter';
      models = ['anthropic/claude-3.7-sonnet', 'deepseek/deepseek-r1', 'google/gemini-2.5-pro'];
      label = `OpenRouter (${record.name || 'Account'})`;
    } else {
      continue; // Skip secondary or non-chat providers
    }

    const accountId = `omni-${record.id}`;
    const account: GatewayAccount = {
      id: accountId,
      name: label,
      platform,
      baseUrl: DEFAULT_BASE_URL,
      apiKey: data.apiKey,
      models,
      enabled: record.is_active === 1,
      status: 'active',
    };

    store.saveAccount(account);
    importedAccounts++;
    newAccountIds.push(accountId);

    if (isAntigravity) {
      antigravityAccountIds.push(accountId);
    }
  }

  // Create or update smart routing combos
  let importedCombos = 0;
  if (antigravityAccountIds.length > 0) {
    const comboId = 'combo-antigravity-pool';
    const antigravityCombo: GatewayCombo = {
      id: comboId,
      name: `Google Antigravity Pool (${antigravityAccountIds.length} Accounts)`,
      description: 'Automatic failover and round-robin load distribution across all connected Google accounts',
      strategy: 'priority',
      enabled: true,
      targets: antigravityAccountIds.map((accId) => ({
        accountId: accId,
        model: 'antigravity/claude-sonnet-4-6',
      })),
    };
    store.saveCombo(antigravityCombo);
    importedCombos++;

    // Add Thinking Combo
    const thinkingComboId = 'combo-antigravity-thinking-pool';
    const thinkingCombo: GatewayCombo = {
      id: thinkingComboId,
      name: 'Claude Opus Thinking Pool (Google Accounts)',
      description: 'Auto-rotating deep reasoning pool with Claude Opus 4.6 Thinking',
      strategy: 'round-robin',
      enabled: true,
      targets: antigravityAccountIds.map((accId) => ({
        accountId: accId,
        model: 'antigravity/claude-opus-4-6-thinking',
      })),
    };
    store.saveCombo(thinkingCombo);
    importedCombos++;
  }

  return {
    success: true,
    importedAccounts,
    importedCombos,
    serverRunning: isRunning,
    serverPort: DEFAULT_PORT,
    message: `Successfully synced ${importedAccounts} provider accounts and ${importedCombos} smart failover combos!`,
  };
}
