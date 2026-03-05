/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { ExtensionLoader } from './ExtensionLoader';
export { ExtensionRegistry } from './ExtensionRegistry';
export { ExtensionWatcher } from './hotReload';

export { resolveThemes } from './resolvers/ThemeResolver';

export { resolveEnvTemplates, resolveEnvInObject, isGlobalStrictMode, clearStrictModeCache, UndefinedEnvVariableError } from './envResolver';

export { resolveFileRefs } from './fileResolver';

export { validateDependencies, sortByDependencyOrder } from './dependencyResolver';

export { RESERVED_NAME_PREFIXES, PRESET_AGENT_TYPES } from './types';

export type { ExtensionManifest, ExtContributes, ExtAcpAdapter, ExtMcpServer, ExtAssistant, ExtSkill, ExtChannelPlugin, ExtTheme, ExtWebui, ExtensionSource, LoadedExtension, ExtensionState } from './types';
