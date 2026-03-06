import type { Page } from '@playwright/test';

export type ExtensionSnapshot = {
  loadedExtensions: Array<{ name: string; displayName: string; version: string }>;
  acpAdapters: Array<{ id: string; name: string; connectionType?: string }>;
  mcpServers: Array<{ id?: string; name: string }>;
  assistants: Array<{ id: string; name: string; _source?: string }>;
  agents: Array<{ id: string; name: string; _source?: string; _kind?: string }>;
  skills: Array<{ name: string; description?: string; location: string }>;
  themes: Array<{ id: string; name: string; cover?: string }>;
  settingsTabs: Array<{ id: string; name: string; entryUrl: string; _extensionName: string }>;
};

export type ChannelPluginStatus = {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  status: string;
  isExtension?: boolean;
  extensionMeta?: {
    extensionName?: string;
    description?: string;
    icon?: string;
    credentialFields?: Array<{ key: string; label: string; type: string; required?: boolean }>;
    configFields?: Array<{ key: string; label: string; type: string; required?: boolean; default?: unknown }>;
  };
};

export async function getExtensionSnapshot(page: Page): Promise<ExtensionSnapshot> {
  return page.evaluate(async () => {
    const api = (window as unknown as { electronAPI?: { emit?: (name: string, data: unknown) => Promise<unknown> } }).electronAPI;
    if (!api?.emit) {
      throw new Error('electronAPI.emit is unavailable in renderer context');
    }

    const [loadedExtensions, acpAdapters, mcpServers, assistants, agents, skills, themes, settingsTabs] = await Promise.all([
      api.emit('extensions.get-loaded-extensions', undefined),
      api.emit('extensions.get-acp-adapters', undefined),
      api.emit('extensions.get-mcp-servers', undefined),
      api.emit('extensions.get-assistants', undefined),
      api.emit('extensions.get-agents', undefined),
      api.emit('extensions.get-skills', undefined),
      api.emit('extensions.get-themes', undefined),
      api.emit('extensions.get-settings-tabs', undefined),
    ]);

    return {
      loadedExtensions,
      acpAdapters,
      mcpServers,
      assistants,
      agents,
      skills,
      themes,
      settingsTabs,
    } as ExtensionSnapshot;
  });
}

export async function getChannelPluginStatus(page: Page): Promise<ChannelPluginStatus[]> {
  return page.evaluate(async () => {
    const api = (window as unknown as { electronAPI?: { emit?: (name: string, data: unknown) => Promise<unknown> } }).electronAPI;
    if (!api?.emit) {
      throw new Error('electronAPI.emit is unavailable in renderer context');
    }

    const result = (await api.emit('channel.get-plugin-status', undefined)) as {
      success?: boolean;
      data?: ChannelPluginStatus[];
    };

    if (!result?.success || !Array.isArray(result.data)) {
      return [];
    }

    return result.data;
  });
}
