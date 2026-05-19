/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Desktop IPC bridge for WebUI lifecycle (start/stop/getStatus).
 *
 * WebUI credential operations (change-password / change-username / reset-password /
 * generate-qr-token) are NOT handled here — those are HTTP routes on aioncore's
 * local-only /api/webui/*, called directly by the renderer via ipcBridge HTTP.
 *
 * This bridge owns only the lifecycle + status snapshot, because spawning a
 * WebUI instance requires Electron's app.* / Node child_process — aioncore
 * has no way to start a WebUI wrapper around itself.
 */

import { ipcBridge } from '@/common';
import {
  startDesktopWebUI,
  stopDesktopWebUI,
  getDesktopWebUIStatus,
  setDesktopWebUIInitialPassword,
} from '@process/utils/webuiConfig';

type AdminUsernameResult = { username?: string };

function getBackendPort(): number | undefined {
  return (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
}

async function fetchAdminUsername(): Promise<string> {
  const port = getBackendPort();
  if (!port) return 'admin';
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/internal/users/system`);
    if (!res.ok) return 'admin';
    const json = (await res.json()) as { data?: AdminUsernameResult | null };
    return json.data?.username ?? 'admin';
  } catch {
    return 'admin';
  }
}

/**
 * On first Enable-WebUI click after a fresh install, the backend's users table
 * holds the seeded `system_default_user` row with an empty password_hash.
 * Probe /api/auth/status; if `needs_setup === true`, ask backend to generate
 * and persist a random password, then stash the plaintext for Settings to show
 * once. When the backend already has credentials (upgrade path handled by
 * ensureAdminUser, or a prior Enable-WebUI), this is a no-op.
 */
async function maybeSeedInitialPassword(): Promise<void> {
  const port = getBackendPort();
  if (!port) {
    throw new Error('[WebUI] Cannot start: aioncore is not running (globalThis.__backendPort unset)');
  }
  const statusRes = await fetch(`http://127.0.0.1:${port}/api/auth/status`);
  if (!statusRes.ok) {
    throw new Error(`[WebUI] /api/auth/status returned ${statusRes.status}`);
  }
  const statusJson = (await statusRes.json()) as { needs_setup?: boolean; data?: { needs_setup?: boolean } };
  const needsSetup = statusJson.needs_setup ?? statusJson.data?.needs_setup ?? false;
  if (!needsSetup) {
    setDesktopWebUIInitialPassword(undefined);
    return;
  }
  const resetRes = await fetch(`http://127.0.0.1:${port}/api/webui/reset-password`, { method: 'POST' });
  if (!resetRes.ok) {
    throw new Error(`[WebUI] /api/webui/reset-password returned ${resetRes.status}`);
  }
  const resetJson = (await resetRes.json()) as { data?: { new_password?: string }; new_password?: string };
  const newPassword = resetJson.data?.new_password ?? resetJson.new_password;
  if (!newPassword) {
    throw new Error('[WebUI] /api/webui/reset-password returned no new_password');
  }
  setDesktopWebUIInitialPassword(newPassword);
}

export function initWebuiBridge(): void {
  ipcBridge.webui.getStatus.provider(async () => {
    const snapshot = getDesktopWebUIStatus();
    const adminUsername = await fetchAdminUsername();
    return { ...snapshot, adminUsername };
  });

  ipcBridge.webui.start.provider(async (params) => {
    await maybeSeedInitialPassword();
    const handle = await startDesktopWebUI({
      port: params?.port,
      allowRemote: params?.allowRemote,
    });
    ipcBridge.webui.statusChanged.emit({
      running: true,
      port: handle.port,
      localUrl: handle.localUrl,
      networkUrl: handle.networkUrl,
      lanIP: handle.lanIP,
      initialPassword: handle.initialPassword,
    });
    return handle;
  });

  ipcBridge.webui.stop.provider(async () => {
    await stopDesktopWebUI();
    ipcBridge.webui.statusChanged.emit({ running: false });
  });
}
