import { ipcBridge } from '@/common';
import { isElectronDesktop } from './platform';

/**
 * Open external URL in browser
 * - Electron desktop mode: use IPC to call shell.openExternal
 * - WebUI browser mode: use window.open
 *
 * 在浏览器中打开外部链接
 * - Electron 桌面模式：通过 IPC 调用 shell.openExternal
 * - WebUI 浏览器模式：使用 window.open
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (isElectronDesktop()) {
    // Electron desktop mode: use IPC bridge
    await ipcBridge.shell.openExternal.invoke(url);
  } else {
    // WebUI browser mode: use window.open
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
