/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GatewayAccount, GatewayCombo, GatewayTelemetryLog } from '@/common/types/gateway/gatewayTypes';

const MAX_SAVED_LOGS = 2000;

export class GatewayStore {
  private baseDir: string;
  private configFile: string;
  private logsFile: string;

  private accounts: Map<string, GatewayAccount> = new Map();
  private combos: Map<string, GatewayCombo> = new Map();
  private logs: GatewayTelemetryLog[] = [];

  constructor() {
    if (typeof app !== 'undefined' && app.getPath) {
      this.baseDir = path.join(app.getPath('userData'), 'gateway');
    } else {
      this.baseDir = path.join(process.cwd(), 'temp', 'gateway');
    }

    this.configFile = path.join(this.baseDir, 'gateway-config.json');
    this.logsFile = path.join(this.baseDir, 'gateway-logs.json');

    this.ensureDir();
    this.load();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.accounts)) {
          this.accounts.clear();
          for (const acc of data.accounts) {
            this.accounts.set(acc.id, acc);
          }
        }
        if (Array.isArray(data.combos)) {
          this.combos.clear();
          for (const c of data.combos) {
            this.combos.set(c.id, c);
          }
        }
      }
    } catch (err) {
      console.error('[GatewayStore] Error loading config:', err);
    }

    try {
      if (fs.existsSync(this.logsFile)) {
        const rawLogs = fs.readFileSync(this.logsFile, 'utf-8');
        const logsData = JSON.parse(rawLogs);
        if (Array.isArray(logsData)) {
          this.logs = logsData.slice(0, MAX_SAVED_LOGS);
        }
      }
    } catch (err) {
      console.error('[GatewayStore] Error loading logs:', err);
    }
  }

  private saveConfig(): void {
    try {
      this.ensureDir();
      const data = {
        accounts: Array.from(this.accounts.values()),
        combos: Array.from(this.combos.values()),
      };
      fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[GatewayStore] Failed to save config:', err);
    }
  }

  private saveLogs(): void {
    try {
      this.ensureDir();
      fs.writeFileSync(this.logsFile, JSON.stringify(this.logs, null, 2), 'utf-8');
    } catch (err) {
      console.error('[GatewayStore] Failed to save logs:', err);
    }
  }

  // --- Accounts ---

  getAccounts(): GatewayAccount[] {
    return Array.from(this.accounts.values());
  }

  getAccount(id: string): GatewayAccount | undefined {
    return this.accounts.get(id);
  }

  saveAccount(account: GatewayAccount): void {
    this.accounts.set(account.id, account);
    this.saveConfig();
  }

  deleteAccount(id: string): void {
    this.accounts.delete(id);
    this.saveConfig();
  }

  updateAccountQuota(
    id: string,
    quota: GatewayAccount['quotaRemaining'],
    status?: GatewayAccount['status'],
    cooldownUntil?: number
  ): void {
    const acc = this.accounts.get(id);
    if (!acc) return;
    if (quota) {
      acc.quotaRemaining = { ...acc.quotaRemaining, ...quota };
    }
    if (status) {
      acc.status = status;
    }
    if (cooldownUntil !== undefined) {
      acc.cooldownUntil = cooldownUntil;
    }
    this.accounts.set(id, acc);
    this.saveConfig();
  }

  // --- Combos ---

  getCombos(): GatewayCombo[] {
    return Array.from(this.combos.values());
  }

  getCombo(id: string): GatewayCombo | undefined {
    return this.combos.get(id);
  }

  saveCombo(combo: GatewayCombo): void {
    this.combos.set(combo.id, combo);
    this.saveConfig();
  }

  deleteCombo(id: string): void {
    this.combos.delete(id);
    this.saveConfig();
  }

  // --- Telemetry Logs ---

  getLogs(limit = 100, offset = 0): { logs: GatewayTelemetryLog[]; total: number } {
    return {
      logs: this.logs.slice(offset, offset + limit),
      total: this.logs.length,
    };
  }

  addLog(log: GatewayTelemetryLog): void {
    this.logs.unshift(log);
    if (this.logs.length > MAX_SAVED_LOGS) {
      this.logs = this.logs.slice(0, MAX_SAVED_LOGS);
    }
    this.saveLogs();
  }

  clearLogs(): void {
    this.logs = [];
    this.saveLogs();
  }
}
