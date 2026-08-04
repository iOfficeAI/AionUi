/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Desktop IPC bridge for WebUI lifecycle (start/stop/getStatus).
 *
 * This bridge owns only the lifecycle + status snapshot, because spawning a
 * WebUI instance requires Electron's app.* / Node child_process — aioncore
 * has no way to start a WebUI wrapper around itself.
 */

import { ipcBridge } from '@/common';
import { startDesktopWebUI, stopDesktopWebUI, getDesktopWebUIStatus } from '@process/utils/webuiConfig';

export function initWebuiBridge(): void {
  ipcBridge.webui.getStatus.provider(async () => {
    const snapshot = getDesktopWebUIStatus();
    return { ...snapshot, adminUsername: '' };
  });

  ipcBridge.webui.start.provider(async (params) => {
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
