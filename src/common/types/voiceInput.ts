export const VOICE_INPUT_PROVIDER_IDS = ['dashscope'] as const;

export type VoiceInputProviderId = (typeof VOICE_INPUT_PROVIDER_IDS)[number];

export const VOICE_INPUT_TRIGGER_MODES = ['fn_hold', 'right_command_hold'] as const;

export type VoiceInputTriggerMode = (typeof VOICE_INPUT_TRIGGER_MODES)[number];

export const VOICE_INPUT_REGIONS = ['beijing', 'singapore'] as const;

export type VoiceInputRegion = (typeof VOICE_INPUT_REGIONS)[number];

export type VoiceInputDashScopeConfig = {
  apiKey: string;
  region: VoiceInputRegion;
  model: string;
  languageHints: string[];
  vocabularyId?: string;
  hotwords: string[];
};

export type VoiceInputConfig = {
  enabled: boolean;
  providerId: VoiceInputProviderId;
  triggerMode: VoiceInputTriggerMode;
  autoInsert: boolean;
  providers: {
    dashscope: VoiceInputDashScopeConfig;
  };
};

export type VoiceInputRuntimeStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'inserted'
  | 'copied'
  | 'error'
  | 'unsupported';

export type VoiceInputPermissionState = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unsupported';

export type VoiceInputPermissions = {
  microphone: VoiceInputPermissionState;
  accessibility: VoiceInputPermissionState;
};

export type VoiceInputState = {
  supported: boolean;
  enabled: boolean;
  providerId: VoiceInputProviderId;
  triggerMode: VoiceInputTriggerMode;
  status: VoiceInputRuntimeStatus;
  permissions: VoiceInputPermissions;
  lastTranscript?: string;
  lastError?: string;
  sourceAppName?: string;
  updatedAt: number;
};

export type VoiceInputRecordStatus = 'inserted' | 'copied' | 'recorded' | 'failed';

export type VoiceInputRecord = {
  id: string;
  providerId: VoiceInputProviderId;
  triggerMode: VoiceInputTriggerMode;
  status: VoiceInputRecordStatus;
  transcript: string;
  transcriptLength: number;
  sourceAppName?: string;
  sourceBundleId?: string;
  model?: string;
  languageHints: string[];
  vocabularyId?: string;
  hotwords: string[];
  durationMs?: number;
  errorMessage?: string;
  createdAt: number;
};

export type VoiceInputStats = {
  totalTranscriptionCount: number;
  totalRecordingDurationMs: number;
  totalTranscribedCharacterCount: number;
};

export const EMPTY_VOICE_INPUT_STATS: VoiceInputStats = {
  totalTranscriptionCount: 0,
  totalRecordingDurationMs: 0,
  totalTranscribedCharacterCount: 0,
};

export const DEFAULT_VOICE_INPUT_CONFIG: VoiceInputConfig = {
  enabled: false,
  providerId: 'dashscope',
  triggerMode: 'right_command_hold',
  autoInsert: true,
  providers: {
    dashscope: {
      apiKey: '',
      region: 'beijing',
      model: 'fun-asr-realtime',
      languageHints: ['zh'],
      vocabularyId: '',
      hotwords: [],
    },
  },
};
