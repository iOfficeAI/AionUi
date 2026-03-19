/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { ExtensionLoader } from './ExtensionLoader';
export { ExtensionRegistry } from './ExtensionRegistry';
export { ExtensionWatcher } from './hotReload';

export { AION_ASSET_PROTOCOL, AION_ASSET_HOST, toAssetUrl } from './assetProtocol';

export { resolveThemes } from './resolvers/ThemeResolver';

export { resolveExtensionI18n, getExtI18nForLocale } from './resolvers/I18nResolver';
export type { ExtensionLocaleData, AggregatedExtI18n } from './resolvers/I18nResolver';

export {
  resolveEnvTemplates,
  resolveEnvInObject,
  isGlobalStrictMode,
  clearStrictModeCache,
  UndefinedEnvVariableError,
} from './envResolver';

export { resolveFileRefs } from './fileResolver';

export { validateDependencies, sortByDependencyOrder } from './dependencyResolver';

// --- Event Bus (NocoBase-inspired inter-extension communication) ---
export { extensionEventBus, ExtensionSystemEvents } from './ExtensionEventBus';
export type { ExtensionLifecyclePayload, ExtensionSystemEvent } from './ExtensionEventBus';

// --- Lifecycle Hooks (NocoBase-inspired plugin lifecycle) ---
export { activateExtension, deactivateExtension, uninstallExtension } from './lifecycle';
export type { LifecycleHooks, LifecycleContext } from './lifecycle';

// --- State Persistence (NocoBase-inspired state management) ---
export { loadPersistedStates, savePersistedStates, needsInstallHook } from './statePersistence';

// --- Permissions (Figma-inspired permission declarations) ---
export { analyzePermissions, getOverallRiskLevel, ExtPermissionsSchema } from './permissions';
export type { ExtPermissions, PermissionSummary, PermissionLevel } from './permissions';

// --- Engine Validation (Figma-inspired API version locking) ---
export {
  validateEngineCompatibility,
  filterByEngineCompatibility,
  AIONUI_VERSION,
  EXTENSION_API_VERSION,
} from './engineValidator';

// --- Sandbox (Figma-inspired worker thread isolation) ---
export { SandboxHost, createSandbox, destroySandbox, destroyAllSandboxes, getSandbox } from './sandbox';
export type { SandboxHostOptions, SandboxMessage } from './sandbox';

// --- UI Protocol (Figma-inspired dual-thread communication) ---
export { ExtensionUIBridge, getUIBridge, disposeUIBridge, disposeAllUIBridges, ExtUIMessageTypes } from './uiProtocol';
export type { ExtUIMessage, ExtUIResponse, ExtUIMessageHandler } from './uiProtocol';

export { RESERVED_NAME_PREFIXES, PRESET_AGENT_TYPES } from './types';

export type {
  ExtensionManifest,
  ExtContributes,
  ExtAcpAdapter,
  ExtMcpServer,
  ExtAssistant,
  ExtAgent,
  ExtSkill,
  ExtChannelPlugin,
  ExtTheme,
  ExtModelProvider,
  ExtWebui,
  ExtensionSource,
  LoadedExtension,
  ExtensionState,
} from './types';
