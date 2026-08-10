/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import { ProcessConfig } from '@process/utils/initStorage';

const LANGUAGE_CONFIG_KEY = 'language';

/**
 * Read the language selected by the user from the backend preference store.
 * The local config remains a fallback for installations that have not migrated yet.
 */
export async function readStoredLanguage(): Promise<string | undefined> {
  try {
    const settings = await httpRequest<Record<string, unknown>>(
      'GET',
      `/api/settings/client?keys=${encodeURIComponent(LANGUAGE_CONFIG_KEY)}`
    );
    const backendLanguage = settings?.[LANGUAGE_CONFIG_KEY];
    if (typeof backendLanguage === 'string' && backendLanguage.trim() !== '') {
      return backendLanguage;
    }
  } catch {
    // Fall back to the legacy local config when the backend is unavailable.
  }

  const localLanguage = await ProcessConfig.get(LANGUAGE_CONFIG_KEY);
  return typeof localLanguage === 'string' && localLanguage.trim() !== '' ? localLanguage : undefined;
}
