import type { ConfigKey } from './configKeys';
import { configService } from './configService';
import { ConfigStorage, type IConfigStorageRefer } from './storage';

const MIGRATION_FLAG: ConfigKey = 'migration.configStorageImported';

const ALL_LEGACY_KEYS: ConfigKey[] = [
  'gemini.config',
  'codex.config',
  'acp.config',
  'acp.promptTimeout',
  'acp.agentIdleTimeout',
  'acp.customAgents',
  'assistants',
  'acp.cachedInitializeResult',
  'acp.cachedModels',
  'acp.cached_config_options',
  'acp.cachedModes',
  'mcp.config',
  'mcp.agentInstallStatus',
  'language',
  'theme',
  'colorScheme',
  'ui.zoomFactor',
  'webui.desktop.enabled',
  'webui.desktop.allowRemote',
  'webui.desktop.port',
  'customCss',
  'css.themes',
  'css.activeThemeId',
  'gemini.defaultModel',
  'aionrs.config',
  'aionrs.defaultModel',
  'tools.imageGenerationModel',
  'tools.speechToText',
  'workspace.pasteConfirm',
  'upload.saveToWorkspace',
  'guid.lastSelectedAgent',
  'skillsMarket.enabled',
  'pet.enabled',
  'pet.size',
  'pet.dnd',
  'pet.confirmEnabled',
  'system.closeToTray',
  'system.notificationEnabled',
  'system.cronNotificationEnabled',
  'system.keepAwake',
  'system.autoPreviewOfficeFiles',
  'assistant.telegram.defaultModel',
  'assistant.telegram.agent',
  'assistant.lark.defaultModel',
  'assistant.lark.agent',
  'assistant.dingtalk.defaultModel',
  'assistant.dingtalk.agent',
  'assistant.weixin.defaultModel',
  'assistant.weixin.agent',
  'assistant.wecom.defaultModel',
  'assistant.wecom.agent',
  'migration.assistantEnabledFixed',
  'migration.coworkDefaultSkillsAdded',
  'migration.builtinDefaultSkillsAdded_v2',
  'migration.promptsI18nAdded',
  'migration.assistantsSplitCustom',
  'migration.electronConfigImported',
];

export async function migrateConfigStorage(): Promise<void> {
  if (configService.get(MIGRATION_FLAG)) {
    return;
  }

  const entries: Record<string, unknown> = {};

  for (const key of ALL_LEGACY_KEYS) {
    try {
      const value = await ConfigStorage.get(key as keyof IConfigStorageRefer);
      if (value !== undefined && value !== null) {
        entries[key] = value;
      }
    } catch {
      // key may not exist in old storage, skip
    }
  }

  entries[MIGRATION_FLAG] = true;
  await configService.setBatch(entries as Parameters<typeof configService.setBatch>[0]);
}
