import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';

export type GoogleClientSetting = {
  proxy?: string;
};

export type ImageGenerationModelSetting = TProviderWithModel & {
  switch?: boolean;
};

/**
 * Global voice-input hotkey (MVP: press to start, press again to stop).
 * Stored as a feature switch so the app behaves identically to the original
 * build when absent/disabled. `accelerator` follows Electron globalShortcut
 * syntax (e.g. 'CommandOrControl+Shift+Space').
 */
export type VoiceInputHotkeySetting = {
  enabled: boolean;
  accelerator: string;
};

// [voiceCall] Additive call-mode setting. Provider credentials remain in the
// existing provider store; this value contains only an optional model reference.
export type VoiceCallSetting = {
  enabled: boolean;
  providerId?: string;
  model?: string;
};

export type ClientBusinessSettingMap = {
  'google.config': GoogleClientSetting;
  'mcp.config': IMcpServer[] | undefined;
  'tools.imageGenerationModel': ImageGenerationModelSetting | undefined;
  'tools.speechToText': SpeechToTextConfig | undefined;
  'tools.voiceCall': VoiceCallSetting | undefined;
  'feature.voiceInputHotkey': VoiceInputHotkeySetting | undefined;
  'acp.promptTimeout': number | undefined;
  'acp.agentIdleTimeout': number | undefined;
};

export type ClientBusinessSettingKey = keyof ClientBusinessSettingMap;
