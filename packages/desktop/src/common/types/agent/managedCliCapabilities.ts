import type { ManagedRuntimeCliTarget } from '@/common/types/newApiAccount';

export type ManagedCliProtocol = 'acp' | 'websocket';
export type SecretMode = 'env_injected' | 'env_referenced' | 'config_file_plain' | 'dotenv_file';
export type HotSwitchCapability = 'supported' | 'requires_new_conversation';
export type ResumeCapability = 'supported' | 'new_session_each_time' | 'not_applicable';

export type ConfigSource =
  | { kind: 'file_plus_env'; envKeys: string[] }
  | { kind: 'static_config_plus_env'; envRefKey: string }
  | { kind: 'managed_json_via_env'; envOverrideKey: string }
  | { kind: 'static_json' };

export type ManagedCliCapability = {
  target: ManagedRuntimeCliTarget;
  label: string;
  protocol: ManagedCliProtocol;
  secretMode: SecretMode;
  hotSwitch: HotSwitchCapability;
  resume: ResumeCapability;
  configSource: ConfigSource;
};

export const MANAGED_CLI_CAPABILITIES: Record<ManagedRuntimeCliTarget, ManagedCliCapability> = {
  claude: {
    target: 'claude',
    label: 'Claude',
    protocol: 'acp',
    secretMode: 'env_injected',
    hotSwitch: 'supported',
    resume: 'supported',
    configSource: { kind: 'file_plus_env', envKeys: ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY'] },
  },
  hermes: {
    target: 'hermes',
    label: 'Hermes',
    protocol: 'acp',
    secretMode: 'env_referenced',
    hotSwitch: 'supported',
    resume: 'supported',
    configSource: { kind: 'static_config_plus_env', envRefKey: 'AIONUI_HERMES_API_KEY' },
  },
  opencode: {
    target: 'opencode',
    label: 'OpenCode',
    protocol: 'acp',
    secretMode: 'config_file_plain',
    hotSwitch: 'supported',
    resume: 'new_session_each_time',
    configSource: { kind: 'managed_json_via_env', envOverrideKey: 'OPENCODE_CONFIG' },
  },
  openclaw: {
    target: 'openclaw',
    label: 'OpenClaw',
    protocol: 'websocket',
    secretMode: 'config_file_plain',
    hotSwitch: 'requires_new_conversation',
    resume: 'not_applicable',
    configSource: { kind: 'static_json' },
  },
};

export function getManagedCliCapability(target: ManagedRuntimeCliTarget): ManagedCliCapability {
  return MANAGED_CLI_CAPABILITIES[target];
}

export function supportsHotSwitch(target: ManagedRuntimeCliTarget): boolean {
  return MANAGED_CLI_CAPABILITIES[target].hotSwitch === 'supported';
}

export function requiresNewConversationForModelChange(target: ManagedRuntimeCliTarget): boolean {
  return MANAGED_CLI_CAPABILITIES[target].hotSwitch === 'requires_new_conversation';
}

export function supportsResume(target: ManagedRuntimeCliTarget): boolean {
  return MANAGED_CLI_CAPABILITIES[target].resume === 'supported';
}

export function isAcpTarget(target: ManagedRuntimeCliTarget): boolean {
  return MANAGED_CLI_CAPABILITIES[target].protocol === 'acp';
}

export function configSourceIs<T extends ConfigSource['kind']>(
  configSource: ConfigSource,
  kind: T
): configSource is Extract<ConfigSource, { kind: T }> {
  return configSource.kind === kind;
}
