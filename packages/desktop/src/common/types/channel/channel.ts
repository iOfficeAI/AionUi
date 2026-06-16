export interface IChannelPluginStatus {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  status?: string;
  last_connected?: number;
  error?: string;
  activeUsers: number;
  botUsername?: string;
  hasToken?: boolean;
  isExtension?: boolean;
  extensionMeta?: {
    credentialFields?: Array<{
      key: string;
      label: string;
      type: 'text' | 'password' | 'select' | 'number' | 'boolean';
      required?: boolean;
      options?: string[];
      default?: string | number | boolean;
    }>;
    configFields?: Array<{
      key: string;
      label: string;
      type: 'text' | 'password' | 'select' | 'number' | 'boolean';
      required?: boolean;
      options?: string[];
      default?: string | number | boolean;
    }>;
    description?: string;
    extensionName?: string;
    icon?: string;
  };
}

export interface IChannelPairingRequest {
  code: string;
  platformUserId: string;
  platformType: string;
  display_name?: string;
  requestedAt: number;
  expiresAt: number;
}

export interface IChannelUser {
  id: string;
  platformUserId: string;
  platformType: string;
  display_name?: string;
  authorizedAt: number;
  lastActive?: number;
  session_id?: string;
}

export interface IChannelSession {
  id: string;
  user_id: string;
  agent_type: string;
  conversation_id?: string;
  workspace?: string;
  chatId?: string;
  created_at: number;
  lastActivity: number;
}

/**
 * Channel assistant binding shape returned by existing backend/config records.
 * Legacy rows may still carry `custom_agent_id`, `backend`, or `agent_type`;
 * new writes must use {@link IChannelAssistantBindingWrite} instead.
 */
export interface IChannelAssistantBindingRead {
  assistant_id?: string;
  /** @deprecated Legacy assistant identity written before assistant-first migration. */
  custom_agent_id?: string;
  /** @deprecated Legacy backend-only binding kept for read compatibility. */
  backend?: string;
  /** @deprecated Legacy conversation type / backend marker kept for read compatibility. */
  agent_type?: string;
  name?: string;
}

export interface IChannelAssistantBindingWrite {
  assistant_id: string;
}

export interface IChannelDefaultModelSetting {
  id: string;
  use_model: string;
}

export interface IChannelPlatformSettings {
  platform: string;
  assistant: IChannelAssistantBindingRead | null;
  default_model: IChannelDefaultModelSetting | null;
}
