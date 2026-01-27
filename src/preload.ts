/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ADAPTER_BRIDGE_EVENT_KEY } from './adapter/constant';

/**
 * @description 注入到renderer进程中, 用于与main进程通信
 * */
contextBridge.exposeInMainWorld('electronAPI', {
  emit: (name: string, data: any) => {
    return ipcRenderer
      .invoke(
        ADAPTER_BRIDGE_EVENT_KEY,
        JSON.stringify({
          name: name,
          data: data,
        })
      )
      .catch((error) => {
        console.error('IPC invoke error:', error);
        throw error;
      });
  },
  on: (callback: any) => {
    const handler = (event: any, value: any) => {
      callback({ event, value });
    };
    ipcRenderer.on(ADAPTER_BRIDGE_EVENT_KEY, handler);
    return () => {
      ipcRenderer.off(ADAPTER_BRIDGE_EVENT_KEY, handler);
    };
  },
  // 获取拖拽文件/目录的绝对路径 / Get absolute path for dragged file/directory
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // 直接 IPC 调用（绕过 bridge 库）/ Direct IPC calls (bypass bridge library)
  webuiResetPassword: () => ipcRenderer.invoke('webui-direct-reset-password'),
  webuiGetStatus: () => ipcRenderer.invoke('webui-direct-get-status'),
  // 修改密码不需要当前密码 / Change password without current password
  webuiChangePassword: (newPassword: string) => ipcRenderer.invoke('webui-direct-change-password', { newPassword }),
  // 生成二维码 token / Generate QR token
  webuiGenerateQRToken: () => ipcRenderer.invoke('webui-direct-generate-qr-token'),
});
