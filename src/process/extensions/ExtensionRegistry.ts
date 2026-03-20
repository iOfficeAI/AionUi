/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/config/storage';
import type { LoadedExtension, ExtensionState } from './types';
import { ExtensionLoader } from './ExtensionLoader';
import { resolveAcpAdapters } from './resolvers/AcpAdapterResolver';
import { resolveMcpServers } from './resolvers/McpServerResolver';
import { resolveAssistants, resolveAgents } from './resolvers/AssistantResolver';
import { resolveSkills } from './resolvers/SkillResolver';
import { resolveThemes } from './resolvers/ThemeResolver';
import { resolveChannelPlugins } from './resolvers/ChannelPluginResolver';
import { resolveWebuiContributions, type WebuiContribution } from './resolvers/WebuiResolver';
import { resolveSettingsTabs, type ResolvedSettingsTab } from './resolvers/SettingsTabResolver';
import { resolveExtensionI18n, getExtI18nForLocale, type AggregatedExtI18n } from './resolvers/I18nResolver';
import { resolveModelProviders, type ResolvedModelProvider } from './resolvers/ModelProviderResolver';
import { loadPersistedStates, savePersistedStates, needsInstallHook } from './lifecycle/statePersistence';
import { filterByEngineCompatibility } from './resolvers/utils/engineValidator';
import { validateDependencies, sortByDependencyOrder } from './resolvers/utils/dependencyResolver';
import { activateExtension, deactivateExtension } from './lifecycle/lifecycle';
import { extensionEventBus, ExtensionSystemEvents } from './lifecycle/ExtensionEventBus';
import { analyzePermissions, getOverallRiskLevel } from './sandbox/permissions';
import type { PermissionSummary, PermissionLevel } from './sandbox/permissions';

export class ExtensionRegistry {
  private static instance: ExtensionRegistry | undefined;
  /** Guard against concurrent initialization during hot-reload */
  private static initializingPromise: Promise<ExtensionRegistry> | undefined;

  private extensions: LoadedExtension[] = [];
  private initialized = false;

  /** Track enabled/disabled state for each extension (persisted to disk) */
  private extensionStates = new Map<string, ExtensionState>();

  // Resolved caches
  private _acpAdapters: Record<string, unknown>[] = [];
  private _mcpServers: Record<string, unknown>[] = [];
  private _assistants: Record<string, unknown>[] = [];
  private _agents: Record<string, unknown>[] = [];
  private _skills: Array<{ name: string; description: string; location: string }> = [];
  private _themes: ICssTheme[] = [];
  private _channelPlugins = new Map<string, { constructor: unknown; meta: unknown }>();
  private _webuiContributions: WebuiContribution[] = [];
  private _settingsTabs: ResolvedSettingsTab[] = [];
  private _modelProviders: ResolvedModelProvider[] = [];
  private _extI18n: AggregatedExtI18n = {};

  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry.instance) {
      ExtensionRegistry.instance = new ExtensionRegistry();
    }
    return ExtensionRegistry.instance;
  }

  /**
   * Initialize: scan all extension sources, load manifests, validate engine/deps,
   * run lifecycle hooks, resolve contributions.
   * Safe to call multiple times (no-op after first initialization).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    console.log('[Extensions] Initializing extension registry...');
    const startTime = Date.now();
    try {
      const loader = new ExtensionLoader();
      let loaded = await loader.loadAll();

      // --- Engine compatibility check (Figma-inspired API version locking) ---
      const { compatible, incompatible } = filterByEngineCompatibility(loaded);
      if (incompatible.length > 0) {
        console.warn(`[Extensions] ${incompatible.length} extension(s) skipped due to engine incompatibility`);
      }
      loaded = compatible;

      // --- Dependency validation & topological sort (activating existing code) ---
      const depResult = validateDependencies(
        loaded.map((ext) => ({
          name: ext.manifest.name,
          version: ext.manifest.version,
          dependencies: ext.manifest.dependencies,
        }))
      );
      if (!depResult.valid) {
        for (const issue of depResult.issues) {
          console.warn(`[Extensions] Dependency issue: ${issue.message}`);
        }
      }
      // Sort extensions by dependency order
      const sorted = sortByDependencyOrder(
        loaded.map((ext) => ({
          name: ext.manifest.name,
          version: ext.manifest.version,
          dependencies: ext.manifest.dependencies,
        })),
        depResult.loadOrder
      );
      // Re-order loaded extensions to match dependency sort
      const extByName = new Map(loaded.map((e) => [e.manifest.name, e]));
      loaded = sorted.map((m) => extByName.get(m.name)!).filter(Boolean);

      this.extensions = loaded;

      // --- Restore persisted states & determine lifecycle actions ---
      const persistedStates = loadPersistedStates();

      for (const ext of this.extensions) {
        const persisted = persistedStates.get(ext.manifest.name);
        if (persisted) {
          // Restore enabled/disabled from disk
          this.extensionStates.set(ext.manifest.name, {
            enabled: persisted.enabled,
            disabledAt: persisted.disabledAt,
            disabledReason: persisted.disabledReason,
            installed: persisted.installed,
            lastVersion: persisted.lastVersion,
          });
        } else {
          // New extension — default to enabled
          this.extensionStates.set(ext.manifest.name, {
            enabled: true,
            installed: false,
            lastVersion: ext.manifest.version,
          });
        }
      }

      // --- Run lifecycle hooks for enabled extensions ---
      for (const ext of this.extensions) {
        const state = this.extensionStates.get(ext.manifest.name)!;
        if (!state.enabled) continue;

        const { isFirstInstall, isUpgrade } = needsInstallHook(
          ext.manifest.name,
          ext.manifest.version,
          persistedStates
        );
        const isFirstTime = isFirstInstall || isUpgrade;

        try {
          await activateExtension(ext, isFirstTime);
          // Mark as installed with current version
          this.extensionStates.set(ext.manifest.name, {
            ...state,
            installed: true,
            lastVersion: ext.manifest.version,
          });
        } catch (error) {
          console.error(`[Extensions] Lifecycle activation failed for "${ext.manifest.name}":`, error);
        }
      }

      // --- Persist updated states ---
      savePersistedStates(this.extensionStates);

      await this.resolveContributions();
      this.initialized = true;
      const elapsed = Date.now() - startTime;
      console.log(
        `[Extensions] Registry initialized in ${elapsed}ms: ` +
          `${this.extensions.length} extension(s), ` +
          `${this._acpAdapters.length} adapter(s), ` +
          `${this._mcpServers.length} MCP server(s), ` +
          `${this._assistants.length} assistant(s), ` +
          `${this._agents.length} agent(s), ` +
          `${this._skills.length} skill(s), ` +
          `${this._themes.length} theme(s), ` +
          `${this._channelPlugins.size} channel plugin(s), ` +
          `${this._webuiContributions.length} webui contribution(s), ` +
          `${this._settingsTabs.length} settings tab(s), ` +
          `${this._modelProviders.length} model provider(s), ` +
          `${Object.keys(this._extI18n).length} i18n locale(s)`
      );
    } catch (error) {
      console.error('[Extensions] Failed to initialize registry:', error);
      // Do NOT mark as initialized on error — allow retry on next call
    }
  }

  /**
   * Disable an extension by name.
   * Runs the onDeactivate lifecycle hook and persists state.
   * @returns true if the extension was disabled, false if not found or already disabled
   */
  async disableExtension(name: string, reason?: string): Promise<boolean> {
    const state = this.extensionStates.get(name);
    if (!state) {
      console.warn(`[Extensions] Cannot disable: extension "${name}" not found`);
      return false;
    }
    if (!state.enabled) {
      console.warn(`[Extensions] Extension "${name}" is already disabled`);
      return false;
    }

    // Run deactivation lifecycle hook
    const ext = this.extensions.find((e) => e.manifest.name === name);
    if (ext) {
      try {
        await deactivateExtension(ext);
      } catch (error) {
        console.error(`[Extensions] Deactivation hook failed for "${name}":`, error);
      }
    }

    this.extensionStates.set(name, {
      ...state,
      enabled: false,
      disabledAt: new Date(),
      disabledReason: reason,
    });
    console.log(`[Extensions] Disabled extension "${name}"${reason ? `: ${reason}` : ''}`);

    // Persist state to disk
    savePersistedStates(this.extensionStates);

    await this.resolveContributions();
    return true;
  }

  /**
   * Enable a previously disabled extension.
   * Runs the onActivate lifecycle hook and persists state.
   * @returns true if the extension was enabled, false if not found or already enabled
   */
  async enableExtension(name: string): Promise<boolean> {
    const state = this.extensionStates.get(name);
    if (!state) {
      console.warn(`[Extensions] Cannot enable: extension "${name}" not found`);
      return false;
    }
    if (state.enabled) {
      console.warn(`[Extensions] Extension "${name}" is already enabled`);
      return false;
    }

    this.extensionStates.set(name, {
      ...state,
      enabled: true,
      disabledAt: undefined,
      disabledReason: undefined,
    });

    // Run activation lifecycle hook
    const ext = this.extensions.find((e) => e.manifest.name === name);
    if (ext) {
      try {
        await activateExtension(ext, false);
      } catch (error) {
        console.error(`[Extensions] Activation hook failed for "${name}":`, error);
      }
    }

    console.log(`[Extensions] Enabled extension "${name}"`);

    // Persist state to disk
    savePersistedStates(this.extensionStates);

    await this.resolveContributions();
    return true;
  }

  /** Check if an extension is enabled. */
  isExtensionEnabled(name: string): boolean {
    const state = this.extensionStates.get(name);
    return state?.enabled ?? false;
  }

  /** Get the state of an extension. */
  getExtensionState(name: string): ExtensionState | undefined {
    return this.extensionStates.get(name);
  }

  /** Get list of disabled extensions with their states. */
  getDisabledExtensions(): Array<{ name: string; state: ExtensionState }> {
    const result: Array<{ name: string; state: ExtensionState }> = [];
    for (const [name, state] of this.extensionStates) {
      if (!state.enabled) {
        result.push({ name, state });
      }
    }
    return result;
  }

  /**
   * Get permission summary for an extension.
   * Used by the extension management UI to display permission badges.
   */
  getExtensionPermissions(name: string): PermissionSummary[] {
    const ext = this.extensions.find((e) => e.manifest.name === name);
    if (!ext) return [];
    return analyzePermissions((ext.manifest as any).permissions);
  }

  /**
   * Get overall risk level for an extension.
   */
  getExtensionRiskLevel(name: string): PermissionLevel {
    const ext = this.extensions.find((e) => e.manifest.name === name);
    if (!ext) return 'safe';
    return getOverallRiskLevel((ext.manifest as any).permissions);
  }

  /** Get the extension event bus for inter-extension communication. */
  getEventBus() {
    return extensionEventBus;
  }

  /** Internal: Resolve all contributions from enabled extensions. */
  private async resolveContributions(): Promise<void> {
    const enabledExtensions = this.extensions.filter((ext) => this.isExtensionEnabled(ext.manifest.name));

    // Synchronous resolvers
    this._acpAdapters = resolveAcpAdapters(enabledExtensions);
    this._mcpServers = resolveMcpServers(enabledExtensions);
    this._skills = resolveSkills(enabledExtensions);
    this._themes = resolveThemes(enabledExtensions);
    this._channelPlugins = resolveChannelPlugins(enabledExtensions) as Map<
      string,
      { constructor: unknown; meta: unknown }
    >;
    this._webuiContributions = resolveWebuiContributions(enabledExtensions);
    this._settingsTabs = resolveSettingsTabs(enabledExtensions);
    this._modelProviders = resolveModelProviders(enabledExtensions);

    // Async resolvers run in parallel to reduce extension init latency
    const [assistants, agents, extI18n] = await Promise.all([
      resolveAssistants(enabledExtensions),
      resolveAgents(enabledExtensions),
      resolveExtensionI18n(enabledExtensions),
    ]);

    this._assistants = assistants;
    this._agents = agents;
    this._extI18n = extI18n;
  }

  /** Get all loaded extensions */
  getLoadedExtensions(): LoadedExtension[] {
    return this.extensions;
  }

  /** Get all extension-contributed ACP adapters */
  getAcpAdapters(): Record<string, unknown>[] {
    return this._acpAdapters;
  }

  /** Get all extension-contributed MCP servers */
  getMcpServers(): Record<string, unknown>[] {
    return this._mcpServers;
  }

  /** Get all extension-contributed assistants */
  getAssistants(): Record<string, unknown>[] {
    return this._assistants;
  }

  /** Get all extension-contributed agents (leis, openfang, opencode style presets) */
  getAgents(): Record<string, unknown>[] {
    return this._agents;
  }

  /** Get all extension-contributed skills */
  getSkills(): Array<{ name: string; description: string; location: string }> {
    return this._skills;
  }

  /** Get all extension-contributed themes (converted to ICssTheme) */
  getThemes(): ICssTheme[] {
    return this._themes;
  }

  /** Get all extension-contributed channel plugins (type → { constructor, meta }) */
  getChannelPlugins(): Map<string, { constructor: unknown; meta: unknown }> {
    return this._channelPlugins;
  }

  /** Get metadata for a specific channel plugin type */
  getChannelPluginMeta(type: string): unknown {
    return this._channelPlugins.get(type)?.meta;
  }

  /** Get all extension-contributed WebUI configurations */
  getWebuiContributions(): WebuiContribution[] {
    return this._webuiContributions;
  }

  /** Get all extension-contributed settings tabs (sorted by order) */
  getSettingsTabs(): ResolvedSettingsTab[] {
    return this._settingsTabs;
  }

  /** Get all extension-contributed model providers */
  getModelProviders(): ResolvedModelProvider[] {
    return this._modelProviders;
  }

  /** Get aggregated i18n data from all extensions */
  getExtI18n(): AggregatedExtI18n {
    return this._extI18n;
  }

  /**
   * Get merged extension i18n translations for a specific locale.
   * Falls back to 'en-US' for missing keys.
   */
  getExtI18nForLocale(locale: string): Record<string, unknown> {
    return getExtI18nForLocale(this._extI18n, locale);
  }

  /**
   * Reset the singleton instance (for testing or hot-reload scenarios).
   * Uses atomic swap: the old instance remains available via getInstance()
   * until the new one is fully initialized.
   */
  static resetInstance(): void {
    ExtensionRegistry.instance = undefined;
    ExtensionRegistry.initializingPromise = undefined;
  }

  /**
   * Atomic hot-reload: build a new registry in the background, then swap it
   * in as the singleton only after it has been fully initialized.
   * Callers of getInstance() keep using the old registry until the swap.
   * Emits REGISTRY_RELOADED event on the extension event bus.
   */
  static async hotReload(): Promise<void> {
    // If a reload is already in flight, wait for it instead of starting another
    if (ExtensionRegistry.initializingPromise) {
      await ExtensionRegistry.initializingPromise;
      return;
    }

    const initPromise = (async () => {
      const newRegistry = new ExtensionRegistry();
      await newRegistry.initialize();
      if (newRegistry.initialized) {
        // Atomic swap — getInstance() now returns the new registry
        ExtensionRegistry.instance = newRegistry;
        extensionEventBus.emitLifecycle(ExtensionSystemEvents.REGISTRY_RELOADED, {
          extensionName: '*',
          version: '0.0.0',
          timestamp: Date.now(),
        });
      }
      return newRegistry;
    })();

    ExtensionRegistry.initializingPromise = initPromise;
    try {
      await initPromise;
    } finally {
      ExtensionRegistry.initializingPromise = undefined;
    }
  }
}
