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

// Daily log file: e.g. 2026-03-12.log
const today = new Date().toISOString().slice(0, 10);
log.transports.file.fileName = `${today}.log`;

// Persist info-level and above to file; keep all levels in terminal stdout.
log.transports.file.level = 'info';
log.transports.console.level = 'silly';

// Cap each daily log file at 10 MB.
log.transports.file.maxSize = 10 * 1024 * 1024;

// Patch global console so every console.log/warn/error from any module
// goes through electron-log (and thus to the file transport).
log.initialize();

// log.initialize() only patches the renderer via preload.
// Explicitly redirect main-process console to electron-log.
Object.assign(console, log.functions);
