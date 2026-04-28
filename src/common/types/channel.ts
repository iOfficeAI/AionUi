export interface IChannelPluginStatus {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  status?: string;
  last_connected?: number;
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
