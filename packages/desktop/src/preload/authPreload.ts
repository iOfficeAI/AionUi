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
  console.log('[authPreload] exposeInMainWorld OK');
} catch (err) {
  console.error('[authPreload] exposeInMainWorld FAILED:', err);
}
