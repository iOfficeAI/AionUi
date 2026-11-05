/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export type QuotaBucket = {
  id: string;
  name: string;
  description?: string;
  window?: string; // '5h' | 'weekly' | string
  remainingFraction: number; // 0.0 to 1.0 (e.g. 0.4775 = 47.75% remaining)
  resetTime?: string; // ISO date string
};

export type QuotaGroup = {
  name: string;
  description?: string;
  agentId?: string;
  agentName?: string;
  buckets: QuotaBucket[];
};

export type ModelQuotaData = {
  groups: QuotaGroup[];
  description?: string;
  updatedAt: number;
};

export type ModelQuotaResult = {
  success: boolean;
  data?: ModelQuotaData;
  error?: string;
};

export function resolveAgyBinaryPath(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', 'agy'),
    path.join(home, '.cargo', 'bin', 'agy'),
    '/usr/local/bin/agy',
    '/opt/homebrew/bin/agy',
    // Windows standard locations
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'agy', 'agy.exe'),
    path.join(home, 'AppData', 'Local', 'bin', 'agy.exe'),
    path.join(home, '.local', 'bin', 'agy.exe'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'agy';
}

let cachedQuota: { data: ModelQuotaData; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

export function clearAgyQuotaCache(): void {
  cachedQuota = null;
}

export async function fetchAgyQuota(options?: { cliPath?: string; forceRefresh?: boolean }): Promise<ModelQuotaResult> {
  const now = Date.now();
  if (!options?.forceRefresh && cachedQuota && now - cachedQuota.timestamp < CACHE_TTL_MS) {
    return { success: true, data: cachedQuota.data };
  }

  const binary = resolveAgyBinaryPath(options?.cliPath);

  // Extend PATH to ensure sub-tools or login shell tools can be found
  const home = os.homedir();
  const extraPaths = [
    path.join(home, '.local', 'bin'),
    '/usr/local/bin',
    '/opt/homebrew/bin',
    path.join(home, '.cargo', 'bin'),
  ];
  const envPath = [...extraPaths, process.env.PATH || ''].filter(Boolean).join(path.delimiter);
  const env = { ...process.env, PATH: envPath };

  return new Promise((resolve) => {
    execFile(binary, ['-p', '/usage', '--output-format', 'json'], { env, timeout: 10_000 }, (error, stdout, stderr) => {
      if (error) {
        // If we have an expired cache, prefer returning it rather than a complete failure
        if (cachedQuota) {
          return resolve({ success: true, data: cachedQuota.data });
        }
        return resolve({
          success: false,
          error: error.message || stderr || 'Failed to fetch agy quota',
        });
      }

      try {
        const parsed = JSON.parse(stdout);
        const cmdData = parsed.command?.data;
        if (!cmdData || !Array.isArray(cmdData.groups)) {
          return resolve({ success: false, error: 'Unexpected quota response format' });
        }

        const rawGroups = cmdData.groups as Array<{
          name?: string;
          description?: string;
          buckets?: Array<{
            id?: string;
            name?: string;
            description?: string;
            window?: string;
            remaining_fraction?: number;
            reset_time?: string;
          }>;
        }>;

        const groups: QuotaGroup[] = rawGroups.map((g) => ({
          name: String(g.name || ''),
          description: g.description ? String(g.description) : undefined,
          agentId: 'antigravity',
          agentName: 'Antigravity',
          buckets: Array.isArray(g.buckets)
            ? g.buckets.map((b) => ({
                id: String(b.id || ''),
                name: String(b.name || ''),
                description: b.description ? String(b.description) : undefined,
                window: b.window ? String(b.window) : undefined,
                remainingFraction: typeof b.remaining_fraction === 'number' ? b.remaining_fraction : 1,
                resetTime: b.reset_time ? String(b.reset_time) : undefined,
              }))
            : [],
        }));

        const data: ModelQuotaData = {
          groups,
          description: cmdData.description ? String(cmdData.description) : undefined,
          updatedAt: Date.now(),
        };

        cachedQuota = { data, timestamp: Date.now() };
        resolve({ success: true, data });
      } catch (parseError) {
        resolve({
          success: false,
          error: parseError instanceof Error ? parseError.message : 'JSON parse error',
        });
      }
    });
  });
}
