import { EventEmitter } from 'events';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';

/**
 * Main-process-local event bus for team agent communication.
 *
 * Problem: ipcBridge.emit() routes through webContents.send(), which only
 * delivers events to the renderer BrowserWindow. Same-process .on() listeners
 * (e.g. TeammateManager) never receive events emitted by AcpAgentManager.
 *
 * Solution: AcpAgentManager emits here in addition to ipcBridge, and
 * TeammateManager listens here instead of ipcBridge for responseStream events.
 *
 * Events:
 * - 'responseStream': Agent response messages (text, finish, error, etc.)
 * - 'agentCrash': Agent process exited unexpectedly (code !== 0).
 *     Payload: { conversationId: string, code: number | null, signal: string | null }
 */
export const teamEventBus = new EventEmitter();
teamEventBus.setMaxListeners(50);

export type TeamResponseStreamEvent = IResponseMessage;
export type TeamAgentCrashEvent = {
  conversationId: string;
  code: number | null;
  signal: NodeJS.Signals | null;
};
