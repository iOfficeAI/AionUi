/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/ipcBridge';
import { NavigationInterceptor, NAVIGATION_TOOLS, type PreviewOpenData, type NavigationToolData, type NavigationToolName } from '@/common/navigation';

// Re-export from NavigationInterceptor for backward compatibility
export { NAVIGATION_TOOLS, type NavigationToolName, type PreviewOpenData, type NavigationToolData };

/**
 * Handles preview_open events by emitting to the IPC bridge
 * 处理 preview_open 事件，通过 IPC 桥接发送到前端
 *
 * @param message - The response message containing preview_open data
 * @returns true if the event was handled, false otherwise
 */
export function handlePreviewOpenEvent(message: IResponseMessage | { type: string; data?: unknown }): boolean {
  if (message.type !== 'preview_open') {
    return false;
  }

  const data = message.data as PreviewOpenData | undefined;
  if (!data || !data.content) {
    return false;
  }

  ipcBridge.preview.open.emit(data);
  return true;
}

/**
 * Creates a preview_open response message
 * 创建 preview_open 响应消息
 *
 * Delegates to NavigationInterceptor.createPreviewMessage
 */
export function createPreviewOpenMessage(url: string, conversationId: string, msgId: string, title?: string): IResponseMessage {
  const message = NavigationInterceptor.createPreviewMessage(url, conversationId, title);
  message.msg_id = msgId; // Override with provided msgId
  return message;
}

/**
 * Checks if a tool name is a navigation tool from chrome-devtools
 * 检查工具名是否是来自 chrome-devtools 的导航工具
 *
 * Delegates to NavigationInterceptor.isNavigationTool
 */
export function isNavigationTool(toolName: string, serverName?: string): boolean {
  return NavigationInterceptor.isNavigationTool({
    toolName,
    server: serverName,
  });
}

/**
 * Extracts URL from navigation tool arguments
 * 从导航工具参数中提取 URL
 *
 * Delegates to NavigationInterceptor.extractUrl
 */
export function extractNavigationUrl(args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  return NavigationInterceptor.extractUrl({ arguments: args });
}
