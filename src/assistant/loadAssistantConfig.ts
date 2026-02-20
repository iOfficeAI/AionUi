/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getAssistantsDir } from '../process/migrations/assistantMigration';
import type { AssistantMetadata } from './types';

/**
 * Load and parse assistant.json for a given assistant ID.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export async function loadAssistantConfig(assistantId: string): Promise<AssistantMetadata | null> {
  try {
    const assistantDir = path.join(getAssistantsDir(), assistantId);
    const configPath = path.join(assistantDir, 'assistant.json');
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content) as AssistantMetadata;
  } catch (error) {
    console.warn(`[AssistantConfig] Failed to load assistant.json for ${assistantId}:`, error);
    return null;
  }
}

/**
 * Get the full path to an assistant's directory.
 */
export function getAssistantDir(assistantId: string): string {
  return path.join(getAssistantsDir(), assistantId);
}
