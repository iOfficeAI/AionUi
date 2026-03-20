/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { ExtensionLoader } from './ExtensionLoader';
export { ExtensionRegistry } from './ExtensionRegistry';
export { ExtensionWatcher } from './lifecycle/hotReload';

export { AION_ASSET_PROTOCOL, AION_ASSET_HOST, toAssetUrl } from './protocol/assetProtocol';

export { resolveThemes } from './resolvers/ThemeResolver';

export { resolveExtensionI18n, getExtI18nForLocale } from './resolvers/I18nResolver';
export type { ExtensionLocaleData, AggregatedExtI18n } from './resolvers/I18nResolver';

export {
  resolveEnvTemplates,
  resolveEnvInObject,
  isGlobalStrictMode,
  clearStrictModeCache,
  UndefinedEnvVariableError,
} from './resolvers/utils/envResolver';

export { resolveFileRefs } from './resolvers/utils/fileResolver';

export { validateDependencies, sortByDependencyOrder } from './resolvers/utils/dependencyResolver';

// --- Event Bus (NocoBase-inspired inter-extension communication) ---
export { extensionEventBus, ExtensionSystemEvents } from './lifecycle/ExtensionEventBus';
export type { ExtensionLifecyclePayload, ExtensionSystemEvent } from './lifecycle/ExtensionEventBus';

// --- Lifecycle Hooks (NocoBase-inspired plugin lifecycle) ---
export { activateExtension, deactivateExtension, uninstallExtension } from './lifecycle/lifecycle';
export type { LifecycleHooks, LifecycleContext } from './lifecycle/lifecycle';

// --- State Persistence (NocoBase-inspired state management) ---
export { loadPersistedStates, savePersistedStates, needsInstallHook } from './lifecycle/statePersistence';

// --- Permissions (Figma-inspired permission declarations) ---
export { analyzePermissions, getOverallRiskLevel, ExtPermissionsSchema } from './sandbox/permissions';
export type { ExtPermissions, PermissionSummary, PermissionLevel } from './sandbox/permissions';

// --- Engine Validation (Figma-inspired API version locking) ---
export {
  validateEngineCompatibility,
  filterByEngineCompatibility,
  AIONUI_VERSION,
  EXTENSION_API_VERSION,
} from './resolvers/utils/engineValidator';

// --- Sandbox (Figma-inspired worker thread isolation) ---
export { SandboxHost, createSandbox, destroySandbox, destroyAllSandboxes, getSandbox } from './sandbox/sandbox';
export type { SandboxHostOptions, SandboxMessage } from './sandbox/sandbox';

// --- UI Protocol (Figma-inspired dual-thread communication) ---
export {
  ExtensionUIBridge,
  getUIBridge,
  disposeUIBridge,
  disposeAllUIBridges,
  ExtUIMessageTypes,
} from './protocol/uiProtocol';
export type { ExtUIMessage, ExtUIResponse, ExtUIMessageHandler } from './protocol/uiProtocol';

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
