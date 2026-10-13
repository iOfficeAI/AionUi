/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  BrowserProfile,
  CreateProfileInput,
  ExternalChromeConfig,
  ExternalChromeStatus,
} from '@/common/browser/types';
import { DEFAULT_BROWSER_PROFILE } from '@/common/browser/constants';

export type UseBrowserProfilesReturn = {
  activeProfile: BrowserProfile;
  clearProfileData: (id: string) => Promise<boolean>;
  createProfile: (input: CreateProfileInput) => Promise<BrowserProfile | null>;
  launchExternalChrome: (config: ExternalChromeConfig) => Promise<ExternalChromeStatus>;
  loading: boolean;
  probeExternalChrome: (port?: number) => Promise<ExternalChromeStatus>;
  profiles: BrowserProfile[];
  refreshProfiles: () => Promise<void>;
  switchProfile: (id: string) => Promise<void>;
};

export function useBrowserProfiles(): UseBrowserProfilesReturn {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([DEFAULT_BROWSER_PROFILE]);
  const [activeProfile, setActiveProfile] = useState<BrowserProfile>(DEFAULT_BROWSER_PROFILE);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshProfiles = useCallback(async () => {
    if (!window.electronAPI?.browserGetProfiles) {
      setLoading(false);
      return;
    }
    try {
      const res = await window.electronAPI.browserGetProfiles();
      if (res?.success && Array.isArray(res.data)) {
        setProfiles(res.data);
      }
      const activeRes = await window.electronAPI.browserGetActiveProfile?.();
      if (activeRes?.success && activeRes.data) {
        setActiveProfile(activeRes.data);
      }
    } catch (err) {
      console.warn('[useBrowserProfiles] Failed to fetch profiles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
  }, [refreshProfiles]);

  const switchProfile = useCallback(
    async (id: string) => {
      if (!window.electronAPI?.browserSetActiveProfile) {
        const found = profiles.find((p) => p.id === id);
        if (found) setActiveProfile(found);
        return;
      }
      try {
        const res = await window.electronAPI.browserSetActiveProfile(id);
        if (res?.success && res.data) {
          setActiveProfile(res.data);
        }
      } catch (err) {
        console.error('[useBrowserProfiles] switchProfile error:', err);
      }
    },
    [profiles]
  );

  const createProfile = useCallback(
    async (input: CreateProfileInput): Promise<BrowserProfile | null> => {
      if (!window.electronAPI?.browserCreateProfile) return null;
      try {
        const res = await window.electronAPI.browserCreateProfile(input);
        if (res?.success && res.data) {
          await refreshProfiles();
          return res.data;
        }
      } catch (err) {
        console.error('[useBrowserProfiles] createProfile error:', err);
      }
      return null;
    },
    [refreshProfiles]
  );

  const clearProfileData = useCallback(async (id: string): Promise<boolean> => {
    if (!window.electronAPI?.browserClearProfileData) return false;
    try {
      const res = await window.electronAPI.browserClearProfileData(id);
      return Boolean(res?.success);
    } catch (err) {
      console.error('[useBrowserProfiles] clearProfileData error:', err);
      return false;
    }
  }, []);

  const launchExternalChrome = useCallback(async (config: ExternalChromeConfig): Promise<ExternalChromeStatus> => {
    if (!window.electronAPI?.browserLaunchExternalChrome) {
      return { running: false, port: config.port, error: 'IPC API not available' };
    }
    try {
      const res = await window.electronAPI.browserLaunchExternalChrome(config);
      return res?.data || { running: false, port: config.port, error: res?.error };
    } catch (err) {
      return {
        running: false,
        port: config.port,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, []);

  const probeExternalChrome = useCallback(async (port?: number): Promise<ExternalChromeStatus> => {
    const targetPort = port || 9222;
    if (!window.electronAPI?.browserProbeExternalChrome) {
      return { running: false, port: targetPort, error: 'IPC API not available' };
    }
    try {
      const res = await window.electronAPI.browserProbeExternalChrome(port);
      return res?.data || { running: false, port: targetPort, error: res?.error };
    } catch (err) {
      return {
        running: false,
        port: targetPort,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, []);

  return {
    activeProfile,
    clearProfileData,
    createProfile,
    launchExternalChrome,
    loading,
    probeExternalChrome,
    profiles,
    refreshProfiles,
    switchProfile,
  };
}
