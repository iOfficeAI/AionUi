/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import type {
  AutoUpdateStatus,
  UpdateCheckRequest,
  UpdateDownloadProgressEvent,
  UpdateDownloadRequest,
} from '../update/updateTypes';
import type { ICdpConfig, IGpuOverride } from './ipcBridge';
import type {
  GitChangedEvent,
  GitCommitRequest,
  GitDiffRequest,
  GitFilePathRequest,
  GitWorkspaceRequest,
} from '../types/git/gitTypes';
import type {
  TerminalExitEvent,
  TerminalKillRequest,
  TerminalOutputEvent,
  TerminalResizeRequest,
  TerminalSpawnOptions,
  TerminalWriteRequest,
} from '../types/terminal/terminalTypes';

type BridgeResponse<Data = unknown> = {
  success: boolean;
  data?: Data;
  msg?: string;
};

export type AdapterEventMap = {
  'restart-app': void;
  'open-dev-tools': void;
  'is-dev-tools-opened': void;
  'app.get-path': { name: 'desktop' | 'home' | 'downloads' };
  'update-system-info': { cacheDir: string; workDir: string };
  'app.get-zoom-factor': void;
  'app.set-zoom-factor': { factor: number };
  'app.get-cdp-status': void;
  'app.update-cdp-config': Partial<ICdpConfig>;
  'app.get-start-on-boot-status': void;
  'app.set-start-on-boot': { enabled: boolean };
  'app.get-gpu-status': void;
  'app.set-gpu-override': { override: IGpuOverride | null };
  'terminal.spawn': TerminalSpawnOptions;
  'terminal.write': TerminalWriteRequest;
  'terminal.resize': TerminalResizeRequest;
  'terminal.kill': TerminalKillRequest;
  'git.repo-info': GitWorkspaceRequest;
  'git.status': GitWorkspaceRequest;
  'git.init': GitWorkspaceRequest;
  'git.diff': GitDiffRequest;
  'git.stage': GitFilePathRequest;
  'git.stage-all': GitWorkspaceRequest;
  'git.unstage': GitFilePathRequest;
  'git.unstage-all': GitWorkspaceRequest;
  'git.discard': GitFilePathRequest;
  'git.branches': GitWorkspaceRequest;
  'git.commit': GitCommitRequest;
  'git.unwatch': GitWorkspaceRequest;
  'update.check': UpdateCheckRequest;
  'update.download': UpdateDownloadRequest;
  'auto-update.check': { includePrerelease?: boolean };
  'auto-update.download': void;
  'auto-update.quit-and-install': void;
  'show-open':
    | { defaultPath?: string; properties?: OpenDialogOptions['properties']; filters?: OpenDialogOptions['filters'] }
    | undefined;
  'show-save': { defaultPath?: string; filters?: SaveDialogOptions['filters'] } | undefined;
  'window-controls:minimize': void;
  'window-controls:maximize': void;
  'window-controls:unmaximize': void;
  'window-controls:close': void;
  'window-controls:is-maximized': void;
  'system-settings:set-keep-awake': { enabled: boolean };
  'system-settings:change-language': { language: string };
  'system-settings:get-pet-enabled': void;
  'system-settings:set-pet-enabled': { enabled: boolean };
  'system-settings:get-pet-size': void;
  'system-settings:set-pet-size': { size: number };
  'system-settings:get-pet-dnd': void;
  'system-settings:set-pet-dnd': { dnd: boolean };
  'system-settings:get-pet-confirm-enabled': void;
  'system-settings:set-pet-confirm-enabled': { enabled: boolean };
  'notification.show': { title: string; body: string; icon?: string; conversation_id?: string };
  'webui.get-status': void;
  'webui.start': { port?: number; allowRemote?: boolean };
  'webui.stop': void;
};

export type AdapterEventName = keyof AdapterEventMap;

export type AdapterEventResponseMap = {
  'restart-app': void;
  'open-dev-tools': boolean;
  'is-dev-tools-opened': boolean;
  'app.get-path': string;
  'update-system-info': void;
  'app.get-zoom-factor': number;
  'app.set-zoom-factor': number;
  'app.get-cdp-status': BridgeResponse;
  'app.update-cdp-config': BridgeResponse;
  'app.get-start-on-boot-status': BridgeResponse;
  'app.set-start-on-boot': BridgeResponse;
  'app.get-gpu-status': BridgeResponse;
  'app.set-gpu-override': BridgeResponse;
  'terminal.spawn': BridgeResponse;
  'terminal.write': BridgeResponse;
  'terminal.resize': BridgeResponse;
  'terminal.kill': BridgeResponse;
  'git.repo-info': BridgeResponse;
  'git.status': BridgeResponse;
  'git.init': BridgeResponse;
  'git.diff': BridgeResponse;
  'git.stage': BridgeResponse;
  'git.stage-all': BridgeResponse;
  'git.unstage': BridgeResponse;
  'git.unstage-all': BridgeResponse;
  'git.discard': BridgeResponse;
  'git.branches': BridgeResponse;
  'git.commit': BridgeResponse;
  'git.unwatch': BridgeResponse;
  'update.check': BridgeResponse;
  'update.download': BridgeResponse;
  'auto-update.check': BridgeResponse;
  'auto-update.download': BridgeResponse;
  'auto-update.quit-and-install': void;
  'show-open': string[] | undefined;
  'show-save': string | undefined;
  'window-controls:minimize': void;
  'window-controls:maximize': void;
  'window-controls:unmaximize': void;
  'window-controls:close': void;
  'window-controls:is-maximized': boolean;
  'system-settings:set-keep-awake': void;
  'system-settings:change-language': void;
  'system-settings:get-pet-enabled': boolean;
  'system-settings:set-pet-enabled': void;
  'system-settings:get-pet-size': number;
  'system-settings:set-pet-size': void;
  'system-settings:get-pet-dnd': boolean;
  'system-settings:set-pet-dnd': void;
  'system-settings:get-pet-confirm-enabled': boolean;
  'system-settings:set-pet-confirm-enabled': void;
  'notification.show': void;
  'webui.get-status': unknown;
  'webui.start': unknown;
  'webui.stop': void;
};

export type AdapterBridgeEvent<Name extends AdapterEventName = AdapterEventName> = {
  name: Name;
  data: AdapterEventMap[Name];
};

export const ADAPTER_EVENT_NAMES = [
  'restart-app',
  'open-dev-tools',
  'is-dev-tools-opened',
  'app.get-path',
  'update-system-info',
  'app.get-zoom-factor',
  'app.set-zoom-factor',
  'app.get-cdp-status',
  'app.update-cdp-config',
  'app.get-start-on-boot-status',
  'app.set-start-on-boot',
  'app.get-gpu-status',
  'app.set-gpu-override',
  'terminal.spawn',
  'terminal.write',
  'terminal.resize',
  'terminal.kill',
  'git.repo-info',
  'git.status',
  'git.init',
  'git.diff',
  'git.stage',
  'git.stage-all',
  'git.unstage',
  'git.unstage-all',
  'git.discard',
  'git.branches',
  'git.commit',
  'git.unwatch',
  'update.check',
  'update.download',
  'auto-update.check',
  'auto-update.download',
  'auto-update.quit-and-install',
  'show-open',
  'show-save',
  'window-controls:minimize',
  'window-controls:maximize',
  'window-controls:unmaximize',
  'window-controls:close',
  'window-controls:is-maximized',
  'system-settings:set-keep-awake',
  'system-settings:change-language',
  'system-settings:get-pet-enabled',
  'system-settings:set-pet-enabled',
  'system-settings:get-pet-size',
  'system-settings:set-pet-size',
  'system-settings:get-pet-dnd',
  'system-settings:set-pet-dnd',
  'system-settings:get-pet-confirm-enabled',
  'system-settings:set-pet-confirm-enabled',
  'notification.show',
  'webui.get-status',
  'webui.start',
  'webui.stop',
] as const satisfies readonly AdapterEventName[];

export const ADAPTER_EVENT_NAME_SET = new Set<AdapterEventName>(ADAPTER_EVENT_NAMES);

export const isAdapterEventName = (name: string): name is AdapterEventName => {
  return ADAPTER_EVENT_NAME_SET.has(name as AdapterEventName);
};

const PROVIDER_REQUEST_PREFIX = 'subscribe-';
const PROVIDER_RESPONSE_PREFIX = 'subscribe.callback-';

const getProviderBridgeBaseName = (name: string): AdapterEventName | null => {
  if (isAdapterEventName(name)) return name;

  if (name.startsWith(PROVIDER_REQUEST_PREFIX)) {
    const baseName = name.slice(PROVIDER_REQUEST_PREFIX.length);
    return isAdapterEventName(baseName) ? baseName : null;
  }

  if (name.startsWith(PROVIDER_RESPONSE_PREFIX)) {
    const callbackName = name.slice(PROVIDER_RESPONSE_PREFIX.length);
    return ADAPTER_EVENT_NAMES.find((eventName) => callbackName.startsWith(eventName)) ?? null;
  }

  return null;
};

/**
 * Runtime bridge messages include provider envelopes generated by
 * `@office-ai/platform` (`subscribe-${eventName}` / callback variants).
 * Validate those envelopes against the same base-event allowlist so provider
 * calls like `terminal.spawn.invoke()` are not dropped by the IPC guard.
 */
export const isAllowedAdapterBridgeEventName = (name: string): boolean => {
  return getProviderBridgeBaseName(name) !== null;
};

export type AdapterMessageCallback = (event: { value: string }) => void;

export type AdapterOutboundEvent =
  | { name: 'app.log-stream'; data: { level: 'log' | 'warn' | 'error'; tag: string; message: string; data?: unknown } }
  | { name: 'app.devtools-state-changed'; data: { isOpen: boolean } }
  | { name: 'terminal.output'; data: TerminalOutputEvent }
  | { name: 'terminal.exit'; data: TerminalExitEvent }
  | { name: 'git.changed'; data: GitChangedEvent }
  | { name: 'update.open'; data: { source?: 'menu' | 'about' } }
  | { name: 'update.download.progress'; data: UpdateDownloadProgressEvent }
  | { name: 'auto-update.status'; data: AutoUpdateStatus }
  | { name: 'window-controls:maximized-changed'; data: { is_maximized: boolean } }
  | { name: 'system-settings:language-changed'; data: { language: string } }
  | { name: 'notification.clicked'; data: { conversation_id?: string } }
  | { name: 'webui.status-changed'; data: unknown };
