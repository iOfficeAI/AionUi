import { contextBridge, ipcRenderer } from 'electron';

const electronModule = require('electron');
console.log(
  '[authPreload] running, ipcRenderer =',
  typeof ipcRenderer,
  ', contextBridge =',
  typeof contextBridge,
  ', electron keys =',
  electronModule ? Object.keys(electronModule) : 'null'
);

try {
  contextBridge.exposeInMainWorld('aionuiAuth', {
    postToken: (tokenPayload: unknown) => ipcRenderer.invoke('external-login:post-token', tokenPayload),
  });
  console.log('[authPreload] exposeInMainWorld OK, checking main world');
  console.log('[authPreload] typeof window.aionuiAuth =', typeof (globalThis as any).aionuiAuth);
  console.log('[authPreload] Object.keys(window).filter(a)=', Object.keys((globalThis as any)).filter((k) => k.toLowerCase().includes('aion')));
} catch (err) {
  console.error('[authPreload] exposeInMainWorld FAILED:', err);
}
