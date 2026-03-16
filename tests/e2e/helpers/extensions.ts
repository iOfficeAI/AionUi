import type { Page } from '@playwright/test';
import { invokeBridge } from './bridge';

export type ExtensionSnapshot = {
  loadedExtensions: Array<{ name: string; displayName: string; version: string }>;
  acpAdapters: Array<{ id: string; name: string; connectionType?: string }>;
  mcpServers: Array<{ id?: string; name: string }>;
  assistants: Array<{ id: string; name: string; _source?: string }>;
  agents: Array<{ id: string; name: string; _source?: string; _kind?: string }>;
  skills: Array<{ name: string; description?: string; location: string }>;
  themes: Array<{ id: string; name: string; cover?: string }>;
  settingsTabs: Array<{ id: string; name: string; entryUrl: string; _extensionName: string }>;
  webuiContributions: Array<{
    extensionName: string;
    apiRoutes: Array<{ path: string; auth: boolean }>;
    staticAssets: Array<{ urlPrefix: string; directory: string }>;
  }>;
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
  const unwrapArray = <T>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object' && 'success' in value && 'data' in value) {
      const payload = value as { success?: boolean; data?: unknown };
      if (!payload.success) return [];
      return Array.isArray(payload.data) ? (payload.data as T[]) : [];
    }
    return [];
  };

  const [
    loadedExtensions,
    acpAdapters,
    mcpServers,
    assistants,
    agents,
    skills,
    themes,
    settingsTabs,
    webuiContributions,
  ] = await Promise.all([
    invokeBridge(page, 'extensions.get-loaded-extensions'),
    invokeBridge(page, 'extensions.get-acp-adapters'),
    invokeBridge(page, 'extensions.get-mcp-servers'),
    invokeBridge(page, 'extensions.get-assistants'),
    invokeBridge(page, 'extensions.get-agents'),
    invokeBridge(page, 'extensions.get-skills'),
    invokeBridge(page, 'extensions.get-themes'),
    invokeBridge(page, 'extensions.get-settings-tabs'),
    invokeBridge(page, 'extensions.get-webui-contributions'),
  ]);

  return {
    loadedExtensions: unwrapArray(loadedExtensions),
    acpAdapters: unwrapArray(acpAdapters),
    mcpServers: unwrapArray(mcpServers),
    assistants: unwrapArray(assistants),
    agents: unwrapArray(agents),
    skills: unwrapArray(skills),
    themes: unwrapArray(themes),
    settingsTabs: unwrapArray(settingsTabs),
    webuiContributions: unwrapArray(webuiContributions),
  } as ExtensionSnapshot;
}

export async function getChannelPluginStatus(page: Page): Promise<ChannelPluginStatus[]> {
  const result = (await invokeBridge(page, 'channel.get-plugin-status')) as {
    success?: boolean;
    data?: ChannelPluginStatus[];
  };

  if (!result?.success || !Array.isArray(result.data)) {
    return [];
  }

  return result.data;
}
