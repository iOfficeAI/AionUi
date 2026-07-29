/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Side-effect module: wires the server-side picker into `dialog.showOpen` when
 * running as WebUI. Electron keeps its native dialog — the handler is only
 * registered when `window.electronAPI` is absent.
 */

import { registerWebShowOpenHandler } from '@/common/adapter/ipcBridge';
import { showWebFsPicker } from './webFsPicker';

if (typeof window !== 'undefined' && !(window as { electronAPI?: unknown }).electronAPI) {
  registerWebShowOpenHandler(showWebFsPicker);
}
