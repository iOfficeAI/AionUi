import type { Page } from '@playwright/test';
import { httpGet } from './httpBridge';

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

// httpGet auto-unwraps {success, data}; helper guards against non-array payloads.
const arrayOrEmpty = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export async function getExtensionSnapshot(page: Page): Promise<ExtensionSnapshot> {
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
    httpGet<unknown>(page, '/api/extensions'),
    httpGet<unknown>(page, '/api/extensions/acp-adapters'),
    httpGet<unknown>(page, '/api/extensions/mcp-servers'),
    httpGet<unknown>(page, '/api/extensions/assistants'),
    httpGet<unknown>(page, '/api/extensions/agents'),
    httpGet<unknown>(page, '/api/extensions/skills'),
    httpGet<unknown>(page, '/api/extensions/themes'),
    httpGet<unknown>(page, '/api/extensions/settings-tabs'),
    httpGet<unknown>(page, '/api/extensions/webui'),
  ]);

  return {
    loadedExtensions: arrayOrEmpty(loadedExtensions),
    acpAdapters: arrayOrEmpty(acpAdapters),
    mcpServers: arrayOrEmpty(mcpServers),
    assistants: arrayOrEmpty(assistants),
    agents: arrayOrEmpty(agents),
    skills: arrayOrEmpty(skills),
    themes: arrayOrEmpty(themes),
    settingsTabs: arrayOrEmpty(settingsTabs),
    webuiContributions: arrayOrEmpty(webuiContributions),
  } as ExtensionSnapshot;
}

export async function getChannelPluginStatus(page: Page): Promise<ChannelPluginStatus[]> {
  const result = await httpGet<unknown>(page, '/api/channel/plugins');
  return Array.isArray(result) ? (result as ChannelPluginStatus[]) : [];
}
