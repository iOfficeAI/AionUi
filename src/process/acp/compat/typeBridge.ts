// src/process/acp/compat/typeBridge.ts

import type { AgentConfig, ModelSnapshot, ConfigOption, McpServerConfig } from '@process/acp/types';
import type { AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import type { AcpBackend } from '@/common/types/acpTypes';

/**
 * Old ACP agent config type from AcpAgent/AcpAgentManager
 * Exported for use by AcpAgentV2 compatibility layer
 */
export type OldAcpAgentConfig = {
  id: string;
  backend: AcpBackend;
  cliPath?: string;
  workingDir: string;
  customArgs?: string[];
  customEnv?: Record<string, string>;
  extra?: {
    workspace?: string;
    backend: AcpBackend;
    cliPath?: string;
    customWorkspace?: boolean;
    customArgs?: string[];
    customEnv?: Record<string, string>;
    yoloMode?: boolean;
    agentName?: string;
    acpSessionId?: string;
    acpSessionConversationId?: string;
    acpSessionUpdatedAt?: number;
    currentModelId?: string;
    sessionMode?: string;
    teamMcpStdioConfig?: {
      name: string;
      command: string;
      args: string[];
      env: Array<{ name: string; value: string }>;
    };
    pendingConfigOptions?: Record<string, string>;
  };
  onStreamEvent: (data: unknown) => void;
  onSignalEvent?: (data: unknown) => void;
  onSessionIdUpdate?: (sessionId: string) => void;
  onAvailableCommandsUpdate?: (commands: Array<{ name: string; description?: string; hint?: string }>) => void;
};

/**
 * Convert old-style ACP agent config to new-style AgentConfig
 */
export function toAgentConfig(old: OldAcpAgentConfig): AgentConfig {
  const extra = old.extra;

  // Determine agentSource: 'custom' if extra.cliPath is set, else 'builtin'
  const agentSource: 'builtin' | 'custom' = extra?.cliPath ? 'custom' : 'builtin';

  // Convert teamMcpStdioConfig env array to Record
  let teamMcpConfig: McpServerConfig | undefined;
  if (extra?.teamMcpStdioConfig) {
    const envRecord: Record<string, string> = {};
    for (const item of extra.teamMcpStdioConfig.env) {
      envRecord[item.name] = item.value;
    }
    teamMcpConfig = {
      name: extra.teamMcpStdioConfig.name,
      command: extra.teamMcpStdioConfig.command,
      args: extra.teamMcpStdioConfig.args,
      env: envRecord,
    };
  }

  // Build resumeConfig from pendingConfigOptions
  let resumeConfig: Record<string, unknown> | undefined;
  if (extra?.pendingConfigOptions && Object.keys(extra.pendingConfigOptions).length > 0) {
    resumeConfig = { pendingConfigOptions: extra.pendingConfigOptions };
  }

  return {
    agentBackend: old.backend,
    agentSource,
    agentId: old.id,
    command: extra?.cliPath ?? old.cliPath,
    args: extra?.customArgs ?? old.customArgs,
    env: extra?.customEnv ?? old.customEnv,
    cwd: old.workingDir,
    teamMcpConfig,
    autoApproveAll: extra?.yoloMode,
    resumeSessionId: extra?.acpSessionId,
    resumeConfig,
  };
}

/**
 * Convert new-style ModelSnapshot to old-style AcpModelInfo
 */
export function toAcpModelInfo(snapshot: ModelSnapshot): AcpModelInfo {
  const availableModels = snapshot.availableModels.map((model) => ({
    id: model.modelId,
    label: model.name,
  }));

  let currentModelLabel: string | null = null;
  if (snapshot.currentModelId) {
    const currentModel = snapshot.availableModels.find((m) => m.modelId === snapshot.currentModelId);
    currentModelLabel = currentModel?.name ?? snapshot.currentModelId;
  }

  return {
    currentModelId: snapshot.currentModelId,
    currentModelLabel,
    availableModels,
    canSwitch: availableModels.length > 0,
    source: 'models',
  };
}

/**
 * Convert new-style ConfigOption array to old-style AcpSessionConfigOption array
 */
export function toAcpConfigOptions(options: ConfigOption[]): AcpSessionConfigOption[] {
  return options.map((opt) => {
    const currentValue = typeof opt.currentValue === 'boolean' ? String(opt.currentValue) : String(opt.currentValue);

    const result: AcpSessionConfigOption = {
      id: opt.id,
      name: opt.name,
      label: opt.name, // Duplicate for compatibility
      type: opt.type === 'boolean' ? 'boolean' : 'select',
      category: opt.category,
      description: opt.description,
      currentValue,
      selectedValue: currentValue, // Duplicate for compatibility
    };

    // Convert suboptions if present
    if (opt.options && opt.options.length > 0) {
      result.options = opt.options.map((subopt) => ({
        value: subopt.id,
        name: subopt.name,
        label: subopt.name, // Duplicate for compatibility
      }));
    }

    return result;
  });
}

/**
 * Convert new-style TMessage to old-style IResponseMessage
 * This is the inverse of transformMessage() in chatLib.ts
 */
export function toResponseMessage(msg: TMessage, conversationId: string): IResponseMessage {
  const base: IResponseMessage = {
    type: '',
    data: null,
    msg_id: msg.msg_id || msg.id,
    conversation_id: conversationId,
    hidden: msg.hidden,
  };

  switch (msg.type) {
    case 'text':
      base.type = 'content';
      base.data = msg.content.content;
      break;

    case 'thinking': {
      // Extract first line as subject
      const lines = msg.content.content.split('\n');
      const firstLine = lines[0].trim();
      base.type = 'thought';
      base.data = {
        subject: msg.content.subject || firstLine,
        description: msg.content.content,
      };
      break;
    }

    case 'acp_tool_call':
      base.type = 'acp_tool_call';
      base.data = msg.content;
      break;

    case 'plan':
      base.type = 'plan';
      base.data = msg.content;
      break;

    case 'tips':
      if (msg.content.type === 'warning') {
        // Convert warning tips to thought
        base.type = 'thought';
        base.data = {
          subject: msg.content.content.split('\n')[0].trim(),
          description: msg.content.content,
        };
      } else {
        // Convert error/success tips to error
        base.type = 'error';
        base.data = msg.content.content;
      }
      break;

    case 'agent_status':
      base.type = 'agent_status';
      base.data = msg.content;
      break;

    case 'available_commands':
      // Skip available_commands messages (they are filtered in chatLib.ts)
      base.type = '';
      base.data = null;
      break;

    default:
      // Fallback: stringify content
      base.type = 'content';
      base.data = JSON.stringify(msg.content);
      break;
  }

  return base;
}
