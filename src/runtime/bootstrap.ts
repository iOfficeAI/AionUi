/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtensionRegistry } from '@/extensions';
import initStorage from '@/process/initStorage';

export async function bootstrapRuntimeCore(): Promise<void> {
  await initStorage();

  try {
    await ExtensionRegistry.getInstance().initialize();
  } catch (error) {
    console.error('[Runtime] Failed to initialize ExtensionRegistry:', error);
  }
}
