import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('aionuiAuth', {
  postToken: (tokenPayload: unknown) => ipcRenderer.invoke('external-login:post-token', tokenPayload),
});