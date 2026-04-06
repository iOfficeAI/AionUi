export type HubExtensionStatus =
  | 'not_installed'
  | 'installing'
  | 'installed'
  | 'install_failed'
  | 'update_available'
  | 'uninstalling';

/**
 * Declarative contributes in hub index.
 * Each key mirrors ExtContributesSchemaBase but values are string ID arrays
 * indicating what capabilities the extension provides.
 */
export type HubContributes = {
  acpAdapters?: string[];
  mcpServers?: string[];
  assistants?: string[];
  agents?: string[];
  skills?: string[];
  channelPlugins?: string[];
  webui?: string[];
  themes?: string[];
  settingsTabs?: string[];
  modelProviders?: string[];
};

export interface IHubExtension {
  name: string; // Extension unique ID
  displayName: string; // UI display name
  version?: string;
  description: string;
  author: string;
  icon?: string; // Path relative to extension root
  dist: {
    tarball: string; // Relative path e.g. extensions/ext-claude-code.tgz
    integrity: string; // SHA-512 SRI Hash
    unpackedSize: number;
  };
  engines: {
    aionui: string; // Minimum APP version requirement
  };
  hubs: string[]; // Hub categories e.g. ["acpAdapters"]
  contributes?: HubContributes;
  tags?: string[];
  bundled?: boolean; // Set at runtime by HubIndexManager for local bundled extensions
}

export interface IHubIndex {
  schemaVersion: number;
  generatedAt: string;
  extensions: Record<string, IHubExtension>;
}

export interface IHubAgentItem extends IHubExtension {
  status: HubExtensionStatus;
  installError?: string; // Error message if install failed
}
