/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

// ============ Reserved Prefixes ============

export const RESERVED_NAME_PREFIXES = ['aion-', 'internal-', 'builtin-', 'system-'];

function validateExtensionName(name: string): boolean {
  return !RESERVED_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// ============ Extension Meta Schema ============

export const ExtensionMetaSchema = z
  .object({
    name: z
      .string()
      .regex(/^[a-z0-9-]+$/, 'Extension name must be kebab-case')
      .min(2, 'Extension name must be at least 2 characters')
      .max(64, 'Extension name must be at most 64 characters')
      .refine(validateExtensionName, {
        message: `Extension name cannot start with reserved prefixes: ${RESERVED_NAME_PREFIXES.join(', ')}`,
      }),
    displayName: z.string().min(1, 'Display name is required'),
    displayNameI18n: z.record(z.string()).optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, 'Version must be semver format (e.g., 1.0.0)'),
    description: z.string().optional(),
    descriptionI18n: z.record(z.string()).optional(),
    author: z.string().optional(),
    icon: z.string().optional(),
    homepage: z.string().url().optional(),
    /** P2: Extension dependencies */
    dependencies: z
      .record(z.string(), z.string().regex(/^\^?\d+\.\d+\.\d+(-[\w.]+)?$/, 'Dependency version must be semver format'))
      .optional()
      .describe('Extension dependencies: { extensionName: versionRange }'),
    /** P2: AIONUI core version compatibility */
    engine: z
      .object({
        aionui: z
          .string()
          .regex(/^\^?\d+\.\d+\.\d+(-[\w.]+)?$/, 'Engine version must be semver format')
          .optional()
          .describe('Compatible AionUI core version range'),
      })
      .optional(),
  })
  .strict();

// ============ ACP Adapter Schema ============

export const PRESET_AGENT_TYPES = ['gemini', 'claude', 'codex', 'codebuddy', 'opencode'] as const;

export const ExtAcpAdapterSchema = z
  .object({
    id: z.string().min(1, 'ACP adapter id is required'),
    name: z.string().min(1, 'ACP adapter name is required'),
    nameI18n: z.record(z.string()).optional(),
    description: z.string().optional(),
    descriptionI18n: z.record(z.string()).optional(),
    cliCommand: z.string().optional(),
    defaultCliPath: z.string().optional(),
    acpArgs: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    icon: z.string().optional(),
    authRequired: z.boolean().optional(),
    supportsStreaming: z.boolean().optional(),
    connectionType: z.enum(['cli', 'websocket', 'http']).default('cli'),
    endpoint: z.string().optional(),
    models: z.array(z.string()).optional(),
    yoloMode: z
      .object({
        type: z.enum(['session', 'global']),
        sessionMode: z.string().optional(),
      })
      .optional(),
    healthCheck: z
      .object({
        versionCommand: z.string(),
        timeout: z.number().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.connectionType === 'cli') {
        return !!data.cliCommand || !!data.defaultCliPath;
      }
      if (data.connectionType === 'websocket' || data.connectionType === 'http') {
        return !!data.endpoint;
      }
      return true;
    },
    {
      message: 'CLI adapters require cliCommand or defaultCliPath; websocket/http adapters require endpoint',
    }
  );

// ============ MCP Server Schema ============

export const ExtMcpTransportSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('sse'),
    url: z.string(),
    headers: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('http'),
    url: z.string(),
    headers: z.record(z.string()).optional(),
  }),
  z.object({
    type: z.literal('streamable_http'),
    url: z.string(),
    headers: z.record(z.string()).optional(),
  }),
]);

export const ExtMcpServerSchema = z.object({
  name: z.string().min(1, 'MCP server name is required'),
  description: z.string().optional(),
  transport: ExtMcpTransportSchema,
  enabled: z.boolean().default(true),
});

// ============ Assistant Schema ============

export const ExtAssistantSchema = z.object({
  id: z.string().min(1, 'Assistant id is required'),
  name: z.string().min(1, 'Assistant name is required'),
  nameI18n: z.record(z.string()).optional(),
  description: z.string().optional(),
  descriptionI18n: z.record(z.string()).optional(),
  avatar: z.string().optional(),
  presetAgentType: z.enum(PRESET_AGENT_TYPES, {
    errorMap: () => ({
      message: `presetAgentType must be one of: ${PRESET_AGENT_TYPES.join(', ')}`,
    }),
  }),
  contextFile: z.string().min(1, 'contextFile is required'),
  contextFileI18n: z.record(z.string()).optional(),
  models: z.array(z.string()).optional(),
  enabledSkills: z.array(z.string()).optional(),
  prompts: z.array(z.string()).optional(),
  promptsI18n: z.record(z.array(z.string())).optional(),
});

// ============ Skill Schema ============

export const ExtSkillSchema = z.object({
  name: z.string().min(1, 'Skill name is required'),
  description: z.string().optional(),
  file: z.string().min(1, 'Skill file path is required'),
});

// ============ Channel Plugin Schema ============

export const ExtFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'password', 'select', 'number', 'boolean']),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const ExtChannelPluginSchema = z.object({
  type: z.string().min(1, 'Channel plugin type is required'),
  name: z.string().min(1, 'Channel plugin name is required'),
  nameI18n: z.record(z.string()).optional(),
  description: z.string().optional(),
  entryPoint: z.string().min(1, 'entryPoint is required'),
  credentialFields: z.array(ExtFieldSchema).optional(),
  configFields: z.array(ExtFieldSchema).optional(),
});

// ============ WebUI Schema ============

export const ExtApiRouteSchema = z.object({
  path: z.string(),
  entryPoint: z.string(),
  description: z.string().optional(),
  auth: z.boolean().default(true),
});

export const ExtWsHandlerSchema = z.object({
  namespace: z.string(),
  entryPoint: z.string(),
  description: z.string().optional(),
});

export const ExtMiddlewareSchema = z.object({
  entryPoint: z.string(),
  description: z.string().optional(),
  applyTo: z.string().default('/**'),
  order: z.enum(['before', 'after']).default('before'),
});

export const ExtStaticAssetSchema = z.object({
  urlPrefix: z.string(),
  directory: z.string(),
  description: z.string().optional(),
});

export const ExtWebuiSchema = z.object({
  apiRoutes: z.array(ExtApiRouteSchema).optional(),
  wsHandlers: z.array(ExtWsHandlerSchema).optional(),
  middleware: z.array(ExtMiddlewareSchema).optional(),
  staticAssets: z.array(ExtStaticAssetSchema).optional(),
});

// ============ Theme Schema ============

export const ExtThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameI18n: z.record(z.string()).optional(),
  file: z.string(),
  cover: z.string().optional(),
});

// ============ Contributes Schema ============

function validateContributeIds(contributes: z.infer<typeof ExtContributesSchemaBase>): string | true {
  if (contributes.acpAdapters) {
    const ids = contributes.acpAdapters.map((a) => a.id);
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate ACP adapter IDs: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  if (contributes.assistants) {
    const ids = contributes.assistants.map((a) => a.id);
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate assistant IDs: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  if (contributes.mcpServers) {
    const names = contributes.mcpServers.map((s) => s.name);
    const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate MCP server names: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  if (contributes.skills) {
    const names = contributes.skills.map((s) => s.name);
    const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate skill names: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  if (contributes.channelPlugins) {
    const types = contributes.channelPlugins.map((p) => p.type);
    const duplicates = types.filter((type, idx) => types.indexOf(type) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate channel plugin types: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  if (contributes.themes) {
    const ids = contributes.themes.map((t) => t.id);
    const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate theme IDs: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  if (contributes.webui?.apiRoutes) {
    const paths = contributes.webui.apiRoutes.map((r) => r.path);
    const duplicates = paths.filter((p, idx) => paths.indexOf(p) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate WebUI API route paths: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  if (contributes.webui?.wsHandlers) {
    const namespaces = contributes.webui.wsHandlers.map((h) => h.namespace);
    const duplicates = namespaces.filter((ns, idx) => namespaces.indexOf(ns) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate WebUI WS namespaces: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  if (contributes.webui?.staticAssets) {
    const prefixes = contributes.webui.staticAssets.map((a) => a.urlPrefix);
    const duplicates = prefixes.filter((p, idx) => prefixes.indexOf(p) !== idx);
    if (duplicates.length > 0) {
      return `Duplicate WebUI static asset prefixes: ${[...new Set(duplicates)].join(', ')}`;
    }
  }
  return true;
}

const ExtContributesSchemaBase = z.object({
  acpAdapters: z.array(ExtAcpAdapterSchema).optional(),
  mcpServers: z.array(ExtMcpServerSchema).optional(),
  assistants: z.array(ExtAssistantSchema).optional(),
  skills: z.array(ExtSkillSchema).optional(),
  channelPlugins: z.array(ExtChannelPluginSchema).optional(),
  webui: ExtWebuiSchema.optional(),
  themes: z.array(ExtThemeSchema).optional(),
});

export const ExtContributesSchema = ExtContributesSchemaBase.refine(validateContributeIds, {
  message: 'Duplicate IDs found in contributions',
});

// ============ Full Manifest Schema ============

export const ExtensionManifestSchema = ExtensionMetaSchema.extend({
  $schema: z.string().optional(),
  contributes: ExtContributesSchema,
});

// ============ TypeScript Types ============

export type ExtensionManifest = z.infer<typeof ExtensionManifestSchema>;
export type ExtContributes = z.infer<typeof ExtContributesSchema>;
export type ExtAcpAdapter = z.infer<typeof ExtAcpAdapterSchema>;
export type ExtMcpServer = z.infer<typeof ExtMcpServerSchema>;
export type ExtAssistant = z.infer<typeof ExtAssistantSchema>;
export type ExtSkill = z.infer<typeof ExtSkillSchema>;
export type ExtChannelPlugin = z.infer<typeof ExtChannelPluginSchema>;
export type ExtTheme = z.infer<typeof ExtThemeSchema>;
export type ExtWebui = z.infer<typeof ExtWebuiSchema>;

export type ExtensionSource = 'local' | 'appdata' | 'env';

export type LoadedExtension = {
  manifest: ExtensionManifest;
  directory: string;
  source: ExtensionSource;
};

export type ExtensionState = {
  enabled: boolean;
  disabledAt?: Date;
  disabledReason?: string;
};
