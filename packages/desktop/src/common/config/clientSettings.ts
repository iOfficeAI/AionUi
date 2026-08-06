import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';

export type GoogleClientSetting = {
  proxy?: string;
};

export type ImageGenerationModelSetting = TProviderWithModel & {
  switch?: boolean;
};

export type ClientBusinessSettingMap = {
  'google.config': GoogleClientSetting;
  'mcp.config': IMcpServer[] | undefined;
  'tools.imageGenerationModel': ImageGenerationModelSetting | undefined;
  'tools.speechToText': SpeechToTextConfig | undefined;
  'acp.promptTimeout': number | undefined;
  'acp.agentIdleTimeout': number | undefined;
  /**
   * Preview size ceiling for text-like files, **in whole megabytes**.
   *
   * Stored in MB rather than bytes because that is the unit the settings field
   * presents; the byte conversion belongs to the one place that compares against a
   * file size (`resolvePreviewPayload`). Keeping the stored unit and the displayed
   * unit identical means a value read back from storage never has to be
   * reinterpreted.
   *
   * `undefined` means "never configured" and falls back to the built-in default —
   * distinct from any number the user could enter.
   */
  'preview.textSizeLimitMb': number | undefined;
};

export type ClientBusinessSettingKey = keyof ClientBusinessSettingMap;
