/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';

type NestedRecord = Record<string, unknown>;

/**
 * Deeply resolve a dot-separated key path from a nested object.
 * e.g. resolve('settingsTabs.star-office.name', { settingsTabs: { 'star-office': { name: '星辰办公' } } })
 */
function deepGet(obj: unknown, keyPath: string): string | undefined {
  const parts = keyPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as NestedRecord)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Hook that provides a resolver function for extension settings tab names
 * with i18n support. Fetches extension i18n data for the current locale
 * and looks up `settingsTabs.{tabId}.name` in the extension's namespace.
 *
 * Falls back to `tab.name` when no translation is found.
 */
function getLocalSettingsTabId(tab: IExtensionSettingsTab): string {
  const globalPrefix = `ext-${tab._extensionName}-`;
  return tab.id.startsWith(globalPrefix) ? tab.id.slice(globalPrefix.length) : tab.id;
}

export function useExtI18n(): {
  resolveExtTabName: (tab: IExtensionSettingsTab) => string;
} {
  const { i18n } = useTranslation();
  const [extI18nData, setExtI18nData] = useState<Record<string, unknown>>({});
  const locale = i18n?.language || 'en-US';

  useEffect(() => {
    void extensionsIpc.getExtI18nForLocale
      .invoke({ locale })
      .then((data) => setExtI18nData(data ?? {}))
      .catch((err) => console.error('[useExtI18n] Failed to load ext i18n:', err));
  }, [locale]);

  const resolveExtTabName = useCallback(
    (tab: IExtensionSettingsTab): string => {
      const ns = `ext.${tab._extensionName}`;
      const nsData = extI18nData[ns] as NestedRecord | undefined;
      const localTabId = getLocalSettingsTabId(tab);
      if (nsData) {
        const translated =
          deepGet(nsData, `extension.settingsTabs.${localTabId}.name`) ?? deepGet(nsData, `settings.tab.${localTabId}`);
        if (translated) return translated;
      }
      return tab.name;
    },
    [extI18nData]
  );

  return { resolveExtTabName };
}
