import {
  DEFAULT_VOICE_INPUT_CONFIG,
  type VoiceInputConfig,
  type VoiceInputDashScopeConfig,
  type VoiceInputPermissionState,
  type VoiceInputPermissions,
  type VoiceInputState,
  type VoiceInputTriggerMode,
} from '@/common/types/voiceInput';

export type VoiceHookEvent = {
  keyCode?: number;
  flags?: number;
  modifiers: {
    command: boolean;
    option: boolean;
    fn: boolean;
  };
};

const FN_KEY_CODE = 63;
const RIGHT_COMMAND_KEY_CODE = 54;
const LEFT_COMMAND_KEY_CODE = 55;
const NX_SECONDARYFNMASK = 0x00800000;
const NX_DEVICERCMDKEYMASK = 0x00000010;
const normalizeString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const normalizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeString(item))
    .filter((item, index, list) => item.length > 0 && list.indexOf(item) === index);
};

const normalizeDashScopeConfig = (value: unknown): VoiceInputDashScopeConfig => {
  const raw = value && typeof value === 'object' ? (value as Partial<VoiceInputDashScopeConfig>) : {};

  return {
    apiKey: normalizeString(raw.apiKey),
    region: raw.region === 'singapore' ? 'singapore' : 'beijing',
    model: normalizeString(raw.model) || DEFAULT_VOICE_INPUT_CONFIG.providers.dashscope.model,
    languageHints: normalizeList(raw.languageHints).length
      ? normalizeList(raw.languageHints)
      : DEFAULT_VOICE_INPUT_CONFIG.providers.dashscope.languageHints,
    vocabularyId: normalizeString(raw.vocabularyId),
    hotwords: normalizeList(raw.hotwords),
  };
};

export const normalizeVoiceInputConfig = (value: unknown): VoiceInputConfig => {
  const raw = value && typeof value === 'object' ? (value as Partial<VoiceInputConfig>) : {};

  return {
    enabled: raw.enabled === true,
    providerId: raw.providerId === 'dashscope' ? 'dashscope' : DEFAULT_VOICE_INPUT_CONFIG.providerId,
    triggerMode: isVoiceInputTriggerMode(raw.triggerMode) ? raw.triggerMode : DEFAULT_VOICE_INPUT_CONFIG.triggerMode,
    autoInsert: raw.autoInsert !== false,
    providers: {
      dashscope: normalizeDashScopeConfig(raw.providers?.dashscope),
    },
  };
};

export const isVoiceInputTriggerMode = (value: unknown): value is VoiceInputTriggerMode => {
  return value === 'fn_hold' || value === 'right_command_hold';
};

export const isVoiceInputConfigured = (config: VoiceInputConfig): boolean => {
  if (config.providerId !== 'dashscope') {
    return false;
  }

  return config.providers.dashscope.apiKey.length > 0;
};

export const getDashScopeWebSocketUrl = (region: VoiceInputDashScopeConfig['region']): string => {
  return region === 'singapore'
    ? 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference'
    : 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
};

export const getTriggerPressedState = (mode: VoiceInputTriggerMode, event: VoiceHookEvent): boolean | null => {
  switch (mode) {
    case 'fn_hold':
      if (typeof event.flags === 'number' && typeof event.keyCode !== 'number') {
        return (event.flags & NX_SECONDARYFNMASK) === NX_SECONDARYFNMASK;
      }
      if (event.keyCode !== FN_KEY_CODE && typeof event.keyCode === 'number') {
        return null;
      }
      return event.modifiers.fn;
    case 'right_command_hold':
      if (typeof event.flags === 'number' && typeof event.keyCode !== 'number') {
        return (event.flags & NX_DEVICERCMDKEYMASK) === NX_DEVICERCMDKEYMASK;
      }
      if (event.keyCode !== RIGHT_COMMAND_KEY_CODE) {
        if (event.keyCode === LEFT_COMMAND_KEY_CODE) {
          return false;
        }
        return null;
      }
      if (typeof event.flags === 'number') {
        return (event.flags & NX_DEVICERCMDKEYMASK) === NX_DEVICERCMDKEYMASK;
      }
      return event.modifiers.command;
  }
};

export const toPermissionState = (value: string | null | undefined): VoiceInputPermissionState => {
  switch (value) {
    case 'granted':
    case 'denied':
    case 'restricted':
    case 'not-determined':
    case 'unsupported':
      return value;
    default:
      return 'not-determined';
  }
};

export const createVoiceInputPermissions = (
  microphone: VoiceInputPermissionState,
  accessibility: VoiceInputPermissionState
): VoiceInputPermissions => ({
  microphone,
  accessibility,
});

export const createVoiceInputState = (
  partial: Partial<VoiceInputState>,
  config: VoiceInputConfig = DEFAULT_VOICE_INPUT_CONFIG
): VoiceInputState => ({
  supported: partial.supported ?? process.platform === 'darwin',
  enabled: partial.enabled ?? config.enabled,
  providerId: partial.providerId ?? config.providerId,
  triggerMode: partial.triggerMode ?? config.triggerMode,
  status: partial.status ?? 'idle',
  permissions:
    partial.permissions ??
    createVoiceInputPermissions(
      process.platform === 'darwin' ? 'not-determined' : 'unsupported',
      process.platform === 'darwin' ? 'not-determined' : 'unsupported'
    ),
  lastTranscript: partial.lastTranscript,
  lastError: partial.lastError,
  sourceAppName: partial.sourceAppName,
  updatedAt: partial.updatedAt ?? Date.now(),
});
