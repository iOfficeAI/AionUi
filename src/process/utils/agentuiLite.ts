/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

type StartupFeature =
  | 'AGENTUI_AUTO_UPDATE'
  | 'AGENTUI_DEBUG'
  | 'AGENTUI_LOAD_SHELL_ENV'
  | 'AGENTUI_RESTORE_WEBUI'
  | 'AGENTUI_STARTUP_AGENT_DETECTION'
  | 'AGENTUI_STARTUP_CHANNELS'
  | 'AGENTUI_STARTUP_EXTENSIONS';

function parseBooleanEnv(value: string | undefined): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

function envEnabled(name: StartupFeature): boolean | null {
  return parseBooleanEnv(process.env[name]);
}

export function isAgentUiLiteEnabled(): boolean {
  return parseBooleanEnv(process.env.AGENTUI_LITE) ?? true;
}

function shouldRunStartupFeature(name: StartupFeature): boolean {
  const explicit = envEnabled(name);
  if (explicit !== null) return explicit;
  return !isAgentUiLiteEnabled();
}

export function shouldRunStartupDiagnostics(): boolean {
  return shouldRunStartupFeature('AGENTUI_DEBUG');
}

export function shouldRunStartupAgentDetection(): boolean {
  return shouldRunStartupFeature('AGENTUI_STARTUP_AGENT_DETECTION');
}

export function shouldRestoreDesktopWebUI(): boolean {
  return shouldRunStartupFeature('AGENTUI_RESTORE_WEBUI');
}

export function shouldRunStartupAutoUpdate(): boolean {
  return shouldRunStartupFeature('AGENTUI_AUTO_UPDATE');
}

export function shouldInitializeStartupExtensions(): boolean {
  return shouldRunStartupFeature('AGENTUI_STARTUP_EXTENSIONS');
}

export function shouldInitializeStartupChannels(): boolean {
  return shouldRunStartupFeature('AGENTUI_STARTUP_CHANNELS');
}

export function shouldLoadShellEnvironmentOnStartup(): boolean {
  return shouldRunStartupFeature('AGENTUI_LOAD_SHELL_ENV');
}
