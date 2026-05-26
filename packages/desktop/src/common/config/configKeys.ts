import type { AcpInitializeResult, AcpSessionConfigOption, AcpSessionModes } from '@/common/types/platform/acpTypes';
import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import type { ICssTheme, IMcpServer, TProviderWithModel } from '@/common/config/storage';

export type ConfigKeyMap = {
  'google.config': {
    proxy?: string;
  };
  'codex.config':
    | { cli_path?: string; yoloMode?: boolean; sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access' }
    | undefined;
  'acp.config': {
    [backend: string]: {
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
  'acp.cachedInitializeResult': Record<string, AcpInitializeResult> | undefined;
  'acp.cached_config_options': Record<string, AcpSessionConfigOption[]> | undefined;
  'acp.cachedModes': Record<string, AcpSessionModes> | undefined;
  'mcp.config': IMcpServer[];
  'mcp.agentInstallStatus': Record<string, string[]>;
  language: string;
  theme: string;
  colorScheme: string;
  'ui.zoomFactor': number | undefined;
  'window.bounds': { x?: number; y?: number; width: number; height: number } | undefined;
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
  'system.closeToTray': boolean | undefined;
  'system.notificationEnabled': boolean | undefined;
  'system.cronNotificationEnabled': boolean | undefined;
  'system.keepAwake': boolean | undefined;
  'system.autoPreviewOfficeFiles': boolean | undefined;
  'assistant.telegram.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.telegram.agent':
    | { agent_type: string; backend?: string; id?: string; custom_agent_id?: string; name?: string }
    | undefined;
  'assistant.lark.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.lark.agent':
    | { agent_type: string; backend?: string; id?: string; custom_agent_id?: string; name?: string }
    | undefined;
  'assistant.dingtalk.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.dingtalk.agent':
    | { agent_type: string; backend?: string; id?: string; custom_agent_id?: string; name?: string }
    | undefined;
  'assistant.weixin.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.weixin.agent':
    | { agent_type: string; backend?: string; id?: string; custom_agent_id?: string; name?: string }
    | undefined;
  'assistant.wecom.defaultModel': { id: string; use_model: string } | undefined;
  'assistant.wecom.agent':
    | { agent_type: string; backend?: string; id?: string; custom_agent_id?: string; name?: string }
    | undefined;
  'skillsMarket.enabled': boolean | undefined;
  'pet.enabled': boolean | undefined;
  'pet.size': number | undefined;
  'pet.dnd': boolean | undefined;
  'pet.confirmEnabled': boolean | undefined;
  'terminal.panel.open': boolean | undefined;
  'terminal.panel.heightPct': number | undefined;
};

export type ConfigKey = keyof ConfigKeyMap;
