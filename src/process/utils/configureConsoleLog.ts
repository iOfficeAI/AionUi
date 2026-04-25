/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Redirect main-process console output to electron-log so that all
 * console.log / console.warn / console.error calls are persisted to
 * daily log files on disk.
 *
 * Log file location (managed by electron-log):
 *   - macOS:   ~/Library/Logs/AionUi/YYYY-MM-DD.log
 *   - Windows: %USERPROFILE%\AppData\Roaming\AionUi\logs\YYYY-MM-DD.log
 *   - Linux:   ~/.config/AionUi/logs/YYYY-MM-DD.log
 *
 * Users can share the relevant date's file for debugging (#1157).
 *
 * Must be imported as early as possible in the main process entry point,
 * BEFORE any other module emits console output.
 */

import log from 'electron-log/main';

const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB
const FILE_LOG_LEVEL = 'info';
const CONSOLE_LOG_LEVEL = 'silly';

// Daily log file: e.g. 2026-03-12.log
const today = new Date().toISOString().slice(0, 10);
log.transports.file.fileName = `${today}.log`;

// --- Main-process logger (frontend) ---
log.transports.file.level = FILE_LOG_LEVEL;
log.transports.file.maxSize = FILE_SIZE_LIMIT;
log.transports.console.level = CONSOLE_LOG_LEVEL;

// --- Backend subprocess logger (writes to a separate file) ---
const backendLog = log.create({ logId: 'backend' });
backendLog.transports.file.fileName = `${today}.backend.log`;
backendLog.transports.file.level = FILE_LOG_LEVEL;
backendLog.transports.file.maxSize = FILE_SIZE_LIMIT;
backendLog.transports.console.level = false;

const BACKEND_PREFIX = '[aionui-backend]';

// Strip ANSI escape sequences from a string.
const ANSI_RE = /\x1b\[[0-9;]*m/g;

const TRACING_LEVEL_MAP: Record<string, string> = {
  TRACE: 'verbose', DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error',
};

// Parse tracing output: "2026-04-25T11:17:43.184875Z  INFO target: message"
// Returns { level, body } where body is "target: message" (timestamp and level stripped).
const TRACING_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+(TRACE|DEBUG|INFO|WARN|ERROR)\s+([\s\S]*)$/;

function parseTracingLine(raw: string): { level: string; body: string } {
  const clean = raw.replace(ANSI_RE, '');
  const m = TRACING_RE.exec(clean);
  if (m) return { level: TRACING_LEVEL_MAP[m[1]] ?? 'info', body: m[2] };
  return { level: 'info', body: clean };
}

// Route backend subprocess logs to the dedicated backend log file.
// Messages with the [aionui-backend] prefix are forwarded to backendLog
// (with tracing metadata stripped) and excluded from the main file transport.
log.hooks.push((message, _transport, transportName) => {
  const first = message.data[0];
  if (typeof first !== 'string' || !first.startsWith(BACKEND_PREFIX)) return message;

  const raw = first.slice(BACKEND_PREFIX.length + 1);
  const { level, body } = parseTracingLine(raw);
  const resolved = level as typeof message.level;

  if (transportName === 'file') {
    const logFn = backendLog[resolved as keyof typeof backendLog] as (...args: unknown[]) => void;
    (logFn ?? backendLog.info)(body, ...message.data.slice(1));
    return false;
  }

  if (transportName === 'console') {
    return { ...message, level: resolved, data: [`${BACKEND_PREFIX} ${body}`, ...message.data.slice(1)] };
  }

  return message;
});

// Patch global console so every console.log/warn/error from any module
// goes through electron-log (and thus to the file transport).
log.initialize();

// log.initialize() only patches the renderer via preload.
// Explicitly redirect main-process console to electron-log.
Object.assign(console, log.functions);
