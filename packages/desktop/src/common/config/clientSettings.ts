import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import type { IMcpServer, TProviderWithModel } from '@/common/config/storage';

export type GoogleClientSetting = {
  proxy?: string;
};

export type ImageGenerationModelSetting = TProviderWithModel & {
  switch?: boolean;
};

export type ClientBusinessSettingMap = {
  'skills.organization': {
    groups: Array<{ id: string; name: string; skillNames: string[] }>;
  };
  'google.config': GoogleClientSetting;
  'mcp.config': IMcpServer[] | undefined;
  'tools.imageGenerationModel': ImageGenerationModelSetting | undefined;
  'tools.speechToText': SpeechToTextConfig | undefined;
  'acp.promptTimeout': number | undefined;
  'acp.agentIdleTimeout': number | undefined;
};

export type ClientBusinessSettingKey = keyof ClientBusinessSettingMap;
