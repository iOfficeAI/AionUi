/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICssTheme } from '@/common/storage';
import type { LoadedExtension, ExtensionState } from './types';
import { ExtensionLoader } from './ExtensionLoader';
import { resolveAcpAdapters } from './resolvers/AcpAdapterResolver';
import { resolveMcpServers } from './resolvers/McpServerResolver';
import { resolveAssistants } from './resolvers/AssistantResolver';
import { resolveSkills } from './resolvers/SkillResolver';
import { resolveThemes } from './resolvers/ThemeResolver';
import { resolveChannelPlugins } from './resolvers/ChannelPluginResolver';
import { resolveWebuiContributions, type WebuiContribution } from './resolvers/WebuiResolver';

export class ExtensionRegistry {
  private static instance: ExtensionRegistry | undefined;

  private extensions: LoadedExtension[] = [];
  private initialized = false;

  /** P2: Track enabled/disabled state for each extension */
  private extensionStates = new Map<string, ExtensionState>();

  // Resolved caches
  private _acpAdapters: Record<string, unknown>[] = [];
  private _mcpServers: Record<string, unknown>[] = [];
  private _assistants: Record<string, unknown>[] = [];
  private _skills: Array<{ name: string; description: string; location: string }> = [];
  private _themes: ICssTheme[] = [];
  private _channelPlugins = new Map<string, { constructor: unknown; meta: unknown }>();
  private _webuiContributions: WebuiContribution[] = [];

  static getInstance(): ExtensionRegistry {
    if (!ExtensionRegistry.instance) {
      ExtensionRegistry.instance = new ExtensionRegistry();
    }
    return ExtensionRegistry.instance;
  }

  /**
   * Initialize: scan all extension sources, load manifests, resolve contributions.
   * Safe to call multiple times (no-op after first initialization).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    console.log('[Extensions] Initializing extension registry...');
    const startTime = Date.now();
    try {
      const loader = new ExtensionLoader();
      this.extensions = await loader.loadAll();
      for (const ext of this.extensions) {
        this.extensionStates.set(ext.manifest.name, { enabled: true });
      }
      await this.resolveContributions();
      this.initialized = true;
      const elapsed = Date.now() - startTime;
      console.log(`[Extensions] Registry initialized in ${elapsed}ms: ` + `${this.extensions.length} extension(s), ` + `${this._acpAdapters.length} adapter(s), ` + `${this._mcpServers.length} MCP server(s), ` + `${this._assistants.length} assistant(s), ` + `${this._skills.length} skill(s), ` + `${this._themes.length} theme(s), ` + `${this._channelPlugins.size} channel plugin(s), ` + `${this._webuiContributions.length} webui contribution(s)`);
    } catch (error) {
      console.error('[Extensions] Failed to initialize registry:', error);
      this.initialized = true;
    }
  }

  /**
   * P2: Disable an extension by name.
   * @returns true if the extension was disabled, false if not found or already disabled
   */
  disableExtension(name: string, reason?: string): boolean {
    const state = this.extensionStates.get(name);
    if (!state) {
      console.warn(`[Extensions] Cannot disable: extension "${name}" not found`);
      return false;
    }
    if (!state.enabled) {
      console.warn(`[Extensions] Extension "${name}" is already disabled`);
      return false;
    }
    state.enabled = false;
    state.disabledAt = new Date();
    state.disabledReason = reason;
    console.log(`[Extensions] Disabled extension "${name}"${reason ? `: ${reason}` : ''}`);
    void this.resolveContributions();
    return true;
  }

  /**
   * P2: Enable a previously disabled extension.
   * @returns true if the extension was enabled, false if not found or already enabled
   */
  enableExtension(name: string): boolean {
    const state = this.extensionStates.get(name);
    if (!state) {
      console.warn(`[Extensions] Cannot enable: extension "${name}" not found`);
      return false;
    }
    if (state.enabled) {
      console.warn(`[Extensions] Extension "${name}" is already enabled`);
      return false;
    }
    state.enabled = true;
    state.disabledAt = undefined;
    state.disabledReason = undefined;
    console.log(`[Extensions] Enabled extension "${name}"`);
    void this.resolveContributions();
    return true;
  }

  /** P2: Check if an extension is enabled. */
  isExtensionEnabled(name: string): boolean {
    const state = this.extensionStates.get(name);
    return state?.enabled ?? false;
  }

  /** P2: Get the state of an extension. */
  getExtensionState(name: string): ExtensionState | undefined {
    return this.extensionStates.get(name);
  }

  /** P2: Get list of disabled extensions with their states. */
  getDisabledExtensions(): Array<{ name: string; state: ExtensionState }> {
    const result: Array<{ name: string; state: ExtensionState }> = [];
    for (const [name, state] of this.extensionStates) {
      if (!state.enabled) {
        result.push({ name, state });
      }
    }
    return result;
  }

  /** Internal: Resolve all contributions from enabled extensions. */
  private async resolveContributions(): Promise<void> {
    const enabledExtensions = this.extensions.filter((ext) => this.isExtensionEnabled(ext.manifest.name));
    this._acpAdapters = resolveAcpAdapters(enabledExtensions);
    this._mcpServers = resolveMcpServers(enabledExtensions);
    this._assistants = await resolveAssistants(enabledExtensions);
    this._skills = resolveSkills(enabledExtensions);
    this._themes = resolveThemes(enabledExtensions);
    this._channelPlugins = resolveChannelPlugins(enabledExtensions) as Map<string, { constructor: unknown; meta: unknown }>;
    this._webuiContributions = resolveWebuiContributions(enabledExtensions);
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

  /** Reset the singleton instance (for testing or hot-reload scenarios). */
  static resetInstance(): void {
    ExtensionRegistry.instance = undefined;
  }
}
