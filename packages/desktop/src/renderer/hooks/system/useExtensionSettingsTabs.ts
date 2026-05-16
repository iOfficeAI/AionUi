/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { extensions as extensionsIpc, type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';

// Module-scope cache: settings tabs rarely change during a session, and multiple
// components (SettingsSider, SettingsPageWrapper, ExtensionSettingsPage, SettingsModal)
// used to each issue their own /api/extensions/settings-tabs request on mount,
// flooding the backend. We share a single in-flight request and a single cached
// result, refreshed only when extensions.state-changed fires.
let cachedTabs: IExtensionSettingsTab[] | null = null;
let inflight: Promise<IExtensionSettingsTab[]> | null = null;
const subscribers = new Set<(tabs: IExtensionSettingsTab[]) => void>();
let stateChangedUnsubscribe: (() => void) | null = null;

function notifySubscribers(tabs: IExtensionSettingsTab[]): void {
  cachedTabs = tabs;
  for (const listener of subscribers) {
    listener(tabs);
  }
}

function fetchTabs(): Promise<IExtensionSettingsTab[]> {
  if (inflight) return inflight;
  inflight = extensionsIpc.getSettingsTabs
    .invoke()
    .then((tabs) => {
      const result = tabs ?? [];
      notifySubscribers(result);
      return result;
    })
    .catch((err) => {
      console.error('[useExtensionSettingsTabs] Failed to load tabs:', err);
      const result: IExtensionSettingsTab[] = cachedTabs ?? [];
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function ensureStateListener(): void {
  if (stateChangedUnsubscribe) return;
  stateChangedUnsubscribe = extensionsIpc.stateChanged.on(() => {
    void fetchTabs();
  });
}

/**
 * Shared hook for extension-contributed settings tabs.
 * One request per session, cached across all consumers, refreshed on
 * extensions.state-changed events.
 */
export function useExtensionSettingsTabs(): IExtensionSettingsTab[] {
  const [tabs, setTabs] = useState<IExtensionSettingsTab[]>(() => cachedTabs ?? []);

  useEffect(() => {
    subscribers.add(setTabs);
    ensureStateListener();

    if (cachedTabs === null) {
      void fetchTabs();
    } else {
      // Sync late subscribers with current cache if it updated before mount
      setTabs(cachedTabs);
    }

    return () => {
      subscribers.delete(setTabs);
    };
  }, []);

  return tabs;
}
