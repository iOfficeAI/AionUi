import type {
  AcpBackend,
  AcpBackendConfig,
  AcpInitializeResult,
  AcpModelInfo,
  AcpSessionConfigOption,
  AcpSessionModes,
} from '@/common/types/acpTypes';
import type { SpeechToTextConfig } from '@/common/types/speech';
import type { ICssTheme, IMcpServer, TProviderWithModel } from '@/common/config/storage';

export type ConfigKeyMap = {
  'google.config': {
    proxy?: string;
  };
  'codex.config':
    | { cli_path?: string; yoloMode?: boolean; sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access' }
    | undefined;
  'acp.config': {
    [backend in AcpBackend]?: {
      auth_methodId?: string;
      authToken?: string;
      lastAuthTime?: number;
      cli_path?: string;
      yoloMode?: boolean;
      preferredMode?: string;
      preferredModelId?: string;
      promptTimeout?: number;
    };
  };
  'acp.promptTimeout': number | undefined;
  'acp.agentIdleTimeout': number | undefined;
  'acp.customAgents': AcpBackendConfig[] | undefined;
  assistants: AcpBackendConfig[] | undefined;
  'acp.cachedInitializeResult': Record<string, AcpInitializeResult> | undefined;
  'acp.cachedModels': Record<string, AcpModelInfo> | undefined;
  'acp.cached_config_options': Record<string, AcpSessionConfigOption[]> | undefined;
  'acp.cachedModes': Record<string, AcpSessionModes> | undefined;
  'mcp.config': IMcpServer[];
  'mcp.agentInstallStatus': Record<string, string[]>;
  language: string;
  theme: string;
  colorScheme: string;
  'ui.zoomFactor': number | undefined;
  'webui.desktop.enabled': boolean | undefined;
  'webui.desktop.allowRemote': boolean | undefined;
  'webui.desktop.port': number | undefined;
  customCss: string;
  'css.themes': ICssTheme[];
  'css.activeThemeId': string;
  'aionrs.config': { preferredMode?: string } | undefined;
  'aionrs.defaultModel': { id: string; use_model: string } | undefined;
  'tools.imageGenerationModel': TProviderWithModel & { switch?: boolean };
  'tools.speechToText': SpeechToTextConfig | undefined;
  'workspace.pasteConfirm': boolean | undefined;
  'upload.saveToWorkspace': boolean | undefined;
  'guid.lastSelectedAgent': string | undefined;
  'migration.assistantEnabledFixed': boolean | undefined;
  'migration.coworkDefaultSkillsAdded': boolean | undefined;
  'migration.builtinDefaultSkillsAdded_v2': boolean | undefined;
  'migration.promptsI18nAdded': boolean | undefined;
  'migration.assistantsSplitCustom': boolean | undefined;
  'migration.electronConfigImported': boolean | undefined;
  'system.closeToTray': boolean | undefined;
  'system.notificationEnabled': boolean | undefined;
  'system.cronNotificationEnabled': boolean | undefined;
  'system.keepAwake': boolean | undefined;
  'system.autoPreviewOfficeFiles': boolean | undefined;
  'assistant.telegram.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.telegram.agent': { backend: string; custom_agent_id?: string; name?: string } | undefined;
  'assistant.lark.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.lark.agent': { backend: string; custom_agent_id?: string; name?: string } | undefined;
  'assistant.dingtalk.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.dingtalk.agent': { backend: string; custom_agent_id?: string; name?: string } | undefined;
  'assistant.weixin.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.weixin.agent': { backend: string; custom_agent_id?: string; name?: string } | undefined;
  'assistant.wecom.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.wecom.agent': { backend: string; custom_agent_id?: string; name?: string } | undefined;
  'skillsMarket.enabled': boolean | undefined;
  'pet.enabled': boolean | undefined;
  'pet.size': number | undefined;
  'pet.dnd': boolean | undefined;
  'pet.confirmEnabled': boolean | undefined;
  'migration.configStorageImported': boolean;
  'migration.providersImported': boolean | undefined;
};

export type ConfigKey = keyof ConfigKeyMap;
