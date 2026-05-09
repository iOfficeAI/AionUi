/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeExecFile } from '@process/utils/safeExec';

export type OpenClawAuthProviderStatus = {
  provider?: string;
  effective?: {
    kind?: string;
    detail?: string;
  } | null;
};

export type OpenClawModelsStatus = {
  defaultModel?: string;
  resolvedDefault?: string;
  auth?: {
    providers?: OpenClawAuthProviderStatus[];
    missingProvidersInUse?: string[];
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseOpenClawModelsStatus(raw: string): OpenClawModelsStatus | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? (parsed as OpenClawModelsStatus) : null;
  } catch {
    return null;
  }
}

export async function readOpenClawModelsStatus(cliPath = 'openclaw'): Promise<OpenClawModelsStatus | null> {
  try {
    const { stdout } = await safeExecFile(cliPath, ['models', 'status', '--json'], { timeout: 5000 });
    return parseOpenClawModelsStatus(stdout);
  } catch {
    return null;
  }
}
