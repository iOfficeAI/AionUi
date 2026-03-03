/**
 * Main Process → Renderer log bridge.
 *
 * Sends log entries to the Renderer F12 Console via `app.logStream` emitter,
 * so that logs from the invisible Main Process are visible in DevTools.
 *
 * Usage:
 *   import { mainLog, mainWarn, mainError } from '@process/utils/mainLogger';
 *   mainLog('[AcpAgentManager]', 'session started', { sessionId });
 */

import { ipcBridge } from '@/common';

function emit(level: 'log' | 'warn' | 'error', tag: string, message: string, data?: unknown): void {
  // Always print to Node.js stdout (visible in electron-forge terminal)
  const formatted = data !== undefined ? `${tag} ${message}` : `${tag} ${message}`;
  if (level === 'error') {
    console.error(formatted, ...(data !== undefined ? [data] : []));
  } else if (level === 'warn') {
    console.warn(formatted, ...(data !== undefined ? [data] : []));
  } else {
    console.log(formatted, ...(data !== undefined ? [data] : []));
  }

  // Bridge to Renderer F12 Console (best-effort, never throws)
  try {
    ipcBridge.application.logStream.emit({ level, tag, message, data });
  } catch {
    // Renderer may not be ready yet — silently ignore
  }
}

export function mainLog(tag: string, message: string, data?: unknown): void {
  emit('log', tag, message, data);
}

export function mainWarn(tag: string, message: string, data?: unknown): void {
  emit('warn', tag, message, data);
}

export function mainError(tag: string, message: string, data?: unknown): void {
  emit('error', tag, message, data);
}
