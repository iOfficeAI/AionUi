/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge, logger } from '@office-ai/platform';

const win: any = window;

/**
 * 适配electron的API到浏览器中,建立renderer和main的通信桥梁, 与preload.ts中的注入对应
 * */
if (win.electronAPI) {
  // Electron 环境 - 使用 IPC 通信
  bridge.adapter({
    emit(name, data) {
      win.electronAPI.emit(name, data);
    },
    on(emitter) {
      win.electronAPI.on((event: any) => {
        try {
          const { value } = event;
          const { name, data } = JSON.parse(value);
          emitter.emit(name, data);
        } catch (e) {
          console.warn('JSON parsing error:', e);
        }
      });
    },
  });
} else {
  // Web 环境 - 使用 WebSocket 通信
  // Token will be sent automatically via Cookie header by browser
  const wsUrl = `ws://${window.location.hostname}:25808`;
  const ws = new WebSocket(wsUrl);

  bridge.adapter({
    emit(name, data) {
      // 在WebUI模式下，文件选择请求也通过WebSocket发送到服务器统一处理
      // 保持与其他消息一致的回调机制
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ name, data }));
      } else {
        ws.addEventListener(
          'open',
          () => {
            ws.send(JSON.stringify({ name, data }));
          },
          { once: true }
        );
      }
    },
    on(emitter) {
      // 存储emitter以便在文件选择完成时使用
      (window as any).__bridgeEmitter = emitter;

      // 在WebUI环境下，让bridge系统自己处理callback事件，不需要手动干预
      // 所有的callback事件都由bridge的Promise resolver自动处理
      ws.onmessage = (event) => {
        try {
          const { name, data } = JSON.parse(event.data);
          emitter.emit(name, data);
        } catch (e) {
          // Handle JSON parsing errors silently
        }
      };

      ws.onerror = () => {
        // Handle WebSocket errors silently
      };

      ws.onclose = () => {
        // Handle WebSocket close silently
      };
    },
  });
}

logger.provider({
  log(log) {
    console.log('process.log', log.type, ...log.logs);
  },
  path() {
    return Promise.resolve('');
  },
});
