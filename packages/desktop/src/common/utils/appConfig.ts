/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Configuration for app info - to be set by the caller in main process
let appConfig: { name: string; version: string; protocolVersion: string } | null = null;

/**
 * Function to set app info using Electron API in main process
 * This allows direct use of app.getName() and app.getVersion() in main process
 */
export function setAppConfig(config: { name: string; version: string; protocolVersion?: string }) {
  appConfig = {
    name: config.name,
    version: config.version,
    protocolVersion: config.protocolVersion || '1.0.0',
  };
}

/**
 * Gets the application client name from the app config if available
 */
export const getConfiguredAppClientName = (): string => {
  return appConfig?.name || 'AionUi';
};

/**
 * Gets the application client version from the app config if available
 */
export const getConfiguredAppClientVersion = (): string => {
  return appConfig?.version || 'unknown';
};

/**
 * Gets the Codex MCP protocol version from the app config if available
 */
export const getConfiguredCodexMcpProtocolVersion = (): string => {
  return appConfig?.protocolVersion || '1.0.0';
};
