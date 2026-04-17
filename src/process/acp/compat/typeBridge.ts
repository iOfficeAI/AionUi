// src/process/acp/compat/typeBridge.ts

import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';
import {
  ACP_BACKENDS_ALL,
  AcpErrorType,
  type AcpModelInfo,
  type AcpSessionConfigOption,
  type AgentBackend,
} from '@/common/types/acpTypes';
import type { McpServer } from '@agentclientprotocol/sdk';
import type { AgentConfig, AgentSource, ConfigOption, InitialDesiredConfig, ModelSnapshot } from '@process/acp/types';
import { getEnhancedEnv, loadFullShellEnvironment } from '@process/utils/shellEnv';
/**
 * Old ACP agent config type from AcpAgent/AcpAgentManager
 * Exported for use by AcpAgentV2 compatibility layer
 */
export type OldAcpAgentConfig = {
  id: string;
  backend: AgentBackend;
  cliPath?: string;
  workingDir: string;
  customArgs?: string[];
  customEnv?: Record<string, string>;
  extra?: {
    workspace?: string;
    backend: AgentBackend;
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
  // const extra = old.extra;

  // Determine agentSource from backend identity
  // backend may be a non-ACP AgentBackend (gemini, aionrs, etc.) passed through the compat layer
  const backend: AgentBackend = old.extra?.backend ?? old.backend;
  let agentSource: AgentSource = 'custom';

  if (backend === 'gemini' || backend === 'aionrs') {
    agentSource = 'builtin';
  } else if (backend in ACP_BACKENDS_ALL) {
    agentSource = 'extension'; // NOTE: 未来这些都要迁移到 extension 里, 这里提前修改, 入库为 extension.
  }

  // Convert teamMcpStdioConfig to McpServerConfig (SDK McpServerStdio)
  let teamMcpConfig: McpServer | undefined;
  if (old.extra?.teamMcpStdioConfig) {
    teamMcpConfig = {
      name: old.extra.teamMcpStdioConfig.name,
      command: old.extra.teamMcpStdioConfig.command,
      args: old.extra.teamMcpStdioConfig.args,
      env: old.extra.teamMcpStdioConfig.env,
    };
  }

  // Build initialDesired from Guid page selections
  const initialDesired: InitialDesiredConfig = {};
  if (old.extra?.currentModelId) initialDesired.model = old.extra.currentModelId;
  if (old.extra?.sessionMode) initialDesired.mode = old.extra.sessionMode;
  if (old.extra?.pendingConfigOptions && Object.keys(old.extra.pendingConfigOptions).length > 0) {
    initialDesired.configOptions = old.extra.pendingConfigOptions;
  }
  const hasInitialDesired = Object.keys(initialDesired).length > 0;

  return {
    agentBackend: old.backend,
    agentSource: agentSource,
    // TODO(ACP Discovery): old.id is conversation_id, not a real agent identifier.
    // Should be old.extra?.customAgentId ?? old.backend (or an agent registry ID).
    // See docs/feature/acp-rewrite/TODO.md.
    agentId: old.id,

    command: old.extra?.cliPath ?? old.cliPath,
    args: old.extra?.customArgs ?? old.customArgs,
    env: old.extra?.customEnv ?? old.customEnv,
    cwd: old.workingDir,

    teamMcpConfig: teamMcpConfig,

    resumeSessionId: old.extra?.acpSessionId,
    initialDesired: hasInitialDesired ? initialDesired : undefined,

    yoloMode: old.extra?.yoloMode,
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

// ─── Auth helpers ──────────────────────────────────────────────────

/** Well-known API key env vars per backend. */
const BACKEND_AUTH_KEYS: Record<string, string[]> = {
  codex: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
  claude: ['ANTHROPIC_API_KEY'],
  codebuddy: ['CODEBUDDY_API_KEY'],
  qwen: ['DASHSCOPE_API_KEY'],
  gemini: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
};

/**
 * Async: load the full user shell environment (survives Gemini's
 * `delete process.env.OPENAI_API_KEY`) and collect auth credentials.
 *
 * 1. loadFullShellEnvironment() re-reads .zshrc / .bash_profile etc.
 * 2. Overlay getEnhancedEnv() for PATH merging.
 * 3. Overlay customEnv (user-configured).
 * 4. Pick well-known API key vars for the specific backend.
 * 5. Pick any *_KEY / *_TOKEN / *_SECRET vars from customEnv.
 */
export async function loadAuthCredentials(
  backend: string,
  customEnv?: Record<string, string>
): Promise<Record<string, string> | undefined> {
  const shellEnv = await loadFullShellEnvironment();
  const enhanced = getEnhancedEnv();
  const merged: Record<string, string | undefined> = { ...shellEnv, ...enhanced };

  const creds: Record<string, string> = {};

  // Backend-specific well-known keys
  const keys = BACKEND_AUTH_KEYS[backend];
  if (keys) {
    for (const key of keys) {
      const val = merged[key];
      if (val) creds[key] = val;
    }
  }

  // Forward auth-like vars from customEnv
  if (customEnv) {
    for (const [key, val] of Object.entries(customEnv)) {
      if (val && /(_KEY|_TOKEN|_SECRET)$/i.test(key)) {
        creds[key] = val;
      }
    }
  }

  return Object.keys(creds).length > 0 ? creds : undefined;
}

// ─── Error code mapping ─────────────────────────────────────────

import type { AcpErrorCode } from '@process/acp/errors/AcpError';

const ERROR_CODE_TO_TYPE: Record<AcpErrorCode, AcpErrorType> = {
  CONNECTION_FAILED: AcpErrorType.NETWORK_ERROR,
  AUTH_FAILED: AcpErrorType.AUTHENTICATION_FAILED,
  AUTH_REQUIRED: AcpErrorType.AUTHENTICATION_FAILED,
  SESSION_EXPIRED: AcpErrorType.SESSION_EXPIRED,
  PROMPT_TIMEOUT: AcpErrorType.TIMEOUT,
  PROCESS_CRASHED: AcpErrorType.NETWORK_ERROR,
  INVALID_STATE: AcpErrorType.CONNECTION_NOT_READY,
  INTERNAL_ERROR: AcpErrorType.INTERNAL_ERROR,
  // Granular ACP protocol errors — pass through directly
  ACP_PARSE_ERROR: AcpErrorType.ACP_PARSE_ERROR,
  INVALID_ACP_REQUEST: AcpErrorType.INVALID_ACP_REQUEST,
  ACP_METHOD_NOT_FOUND: AcpErrorType.ACP_METHOD_NOT_FOUND,
  ACP_INVALID_PARAMS: AcpErrorType.ACP_INVALID_PARAMS,
  AGENT_INTERNAL_ERROR: AcpErrorType.AGENT_INTERNAL_ERROR,
  ACP_SESSION_NOT_FOUND: AcpErrorType.ACP_SESSION_NOT_FOUND,
  AGENT_SESSION_NOT_FOUND: AcpErrorType.AGENT_SESSION_NOT_FOUND,
  ACP_ELICITATION_REQUIRED: AcpErrorType.ACP_ELICITATION_REQUIRED,
  ACP_REQ_CANCELLED: AcpErrorType.ACP_REQ_CANCELLED,
  AGENT_ERROR: AcpErrorType.AGENT_ERROR,
};

export function mapAcpErrorCodeToType(code: AcpErrorCode): AcpErrorType {
  return ERROR_CODE_TO_TYPE[code] ?? AcpErrorType.UNKNOWN;
}
