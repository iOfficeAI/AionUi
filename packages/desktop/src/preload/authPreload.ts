import { contextBridge, ipcRenderer } from 'electron';

console.log('[authPreload] running, electron =', typeof electron);

contextBridge.exposeInMainWorld('aionuiAuth', {
  postToken: (tokenPayload: unknown) => ipcRenderer.invoke('external-login:post-token', tokenPayload),
});
