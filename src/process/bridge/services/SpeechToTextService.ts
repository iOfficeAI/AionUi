/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SpeechToTextAudioBuffer,
  SpeechToTextConfig,
  SpeechToTextProvider,
  SpeechToTextRequest,
  SpeechToTextResult,
} from '@/common/types/speech';
import { mainError, mainLog, mainWarn } from '@process/utils/mainLogger';
import { ProcessConfig } from '@process/utils/initStorage';

type OpenAITranscriptionResponse = {
  language?: string;
  text?: string;
};

type DeepgramTranscriptionResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
      detected_language?: string;
    }>;
  };
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'whisper-1';
const DEFAULT_DEEPGRAM_BASE_URL = 'https://api.deepgram.com/v1/listen';
const DEFAULT_DEEPGRAM_MODEL = 'nova-2';
const STT_LOG_TAG = '[SpeechToText]';

const createRequestId = () => `stt-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error);
};

const getErrorCode = (error: unknown) => {
  const message = getErrorMessage(error);
  const [code] = message.split(':');
  return code || 'STT_UNKNOWN';
};

const normalizeAudioBuffer = (audioBuffer: SpeechToTextAudioBuffer): Uint8Array => {
  if (audioBuffer instanceof Uint8Array) {
    return audioBuffer;
  }

  if (Array.isArray(audioBuffer)) {
    return Uint8Array.from(audioBuffer);
  }

  const orderedKeys = Object.keys(audioBuffer)
    .filter((key) => /^\d+$/.test(key))
    .toSorted((a, b) => Number(a) - Number(b));

  return Uint8Array.from(orderedKeys.map((key) => audioBuffer[key] ?? 0));
};

const getRequestLogMeta = (request: SpeechToTextRequest) => {
  const normalizedAudioBuffer = normalizeAudioBuffer(request.audioBuffer);
  return {
    audioBytes: normalizedAudioBuffer.byteLength,
    hasLanguageHint: Boolean(request.languageHint),
    languageHint: request.languageHint || undefined,
    mimeType: request.mimeType || 'application/octet-stream',
  };
};

const normalizeBaseUrl = (baseUrl: string | undefined, fallback: string) => {
  const trimmed = baseUrl?.trim();
  return trimmed && trimmed.length > 0 ? trimmed.replace(/\/+$/, '') : fallback;
};

const toErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
      };
      err_msg?: string;
    };
    return payload.error?.message || payload.err_msg || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const buildOpenAIUrl = (baseUrl?: string) => {
  const normalized = normalizeBaseUrl(baseUrl, DEFAULT_OPENAI_BASE_URL);
  return normalized.endsWith('/audio/transcriptions') ? normalized : `${normalized}/audio/transcriptions`;
};

const buildDeepgramUrl = (config: SpeechToTextConfig['deepgram'], languageHint?: string) => {
  const normalized = normalizeBaseUrl(config?.baseUrl, DEFAULT_DEEPGRAM_BASE_URL);
  const url = new URL(normalized);
  url.searchParams.set('model', config?.model || DEFAULT_DEEPGRAM_MODEL);
  url.searchParams.set('punctuate', String(config?.punctuate !== false));
  url.searchParams.set('smart_format', String(config?.smartFormat !== false));

  const effectiveLanguage = languageHint || config?.language;
  if (effectiveLanguage) {
    url.searchParams.set('language', effectiveLanguage);
  } else if (config?.detectLanguage !== false) {
    url.searchParams.set('detect_language', 'true');
  }

  return url.toString();
};

const resolveSpeechToTextConfig = async (): Promise<SpeechToTextConfig> => {
  const config = await ProcessConfig.get('tools.speechToText');
  if (!config?.enabled) {
    mainWarn(STT_LOG_TAG, 'Speech-to-text request rejected because feature is disabled');
    throw new Error('STT_DISABLED');
  }
  return config;
};

const resolveProviderApiKey = (provider: SpeechToTextProvider, config: SpeechToTextConfig): string => {
  if (provider === 'openai') {
    const apiKey = config.openai?.apiKey?.trim();
    if (!apiKey) {
      throw new Error('STT_OPENAI_NOT_CONFIGURED');
    }
    return apiKey;
  }

  const apiKey = config.deepgram?.apiKey?.trim();
  if (!apiKey) {
    throw new Error('STT_DEEPGRAM_NOT_CONFIGURED');
  }
  return apiKey;
};

export class SpeechToTextService {
  static async transcribe(request: SpeechToTextRequest): Promise<SpeechToTextResult> {
    const requestId = createRequestId();
    const startedAt = Date.now();
    mainLog(STT_LOG_TAG, 'Transcription requested', {
      requestId,
      ...getRequestLogMeta(request),
    });

    try {
      const config = await resolveSpeechToTextConfig();
      mainLog(STT_LOG_TAG, 'Resolved speech-to-text provider', {
        requestId,
        provider: config.provider,
        model: config.provider === 'openai' ? config.openai?.model || DEFAULT_OPENAI_MODEL : config.deepgram?.model,
      });

      const result =
        config.provider === 'openai'
          ? await this.transcribeWithOpenAI(config, request)
          : await this.transcribeWithDeepgram(config, request);

      mainLog(STT_LOG_TAG, 'Transcription completed', {
        requestId,
        durationMs: Date.now() - startedAt,
        language: result.language,
        model: result.model,
        provider: result.provider,
        textLength: result.text.length,
      });

      return result;
    } catch (error) {
      mainError(STT_LOG_TAG, 'Transcription failed', {
        requestId,
        durationMs: Date.now() - startedAt,
        errorCode: getErrorCode(error),
        message: getErrorMessage(error),
      });
      throw error;
    }
  }

  private static async transcribeWithOpenAI(
    config: SpeechToTextConfig,
    request: SpeechToTextRequest
  ): Promise<SpeechToTextResult> {
    const apiKey = resolveProviderApiKey('openai', config);
    const audioBuffer = Buffer.from(normalizeAudioBuffer(request.audioBuffer));
    const blob = new Blob([audioBuffer], {
      type: request.mimeType || 'application/octet-stream',
    });
    const formData = new FormData();
    formData.append('file', blob, request.fileName);
    formData.append('model', config.openai?.model || DEFAULT_OPENAI_MODEL);

    const language = request.languageHint || config.openai?.language;
    if (language) {
      // OpenAI Whisper requires ISO 639-1 codes (e.g. "en"), not BCP 47 (e.g. "en-us")
      formData.append('language', language.split('-')[0].toLowerCase());
    }
    if (config.openai?.prompt) {
      formData.append('prompt', config.openai.prompt);
    }
    if (typeof config.openai?.temperature === 'number') {
      formData.append('temperature', String(config.openai.temperature));
    }

    const response = await fetch(buildOpenAIUrl(config.openai?.baseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`STT_REQUEST_FAILED:${await toErrorMessage(response)}`);
    }

    const payload = (await response.json()) as OpenAITranscriptionResponse;
    return {
      language: payload.language || language,
      model: config.openai?.model || DEFAULT_OPENAI_MODEL,
      provider: 'openai',
      text: payload.text?.trim() || '',
    };
  }

  private static async transcribeWithDeepgram(
    config: SpeechToTextConfig,
    request: SpeechToTextRequest
  ): Promise<SpeechToTextResult> {
    const apiKey = resolveProviderApiKey('deepgram', config);
    const response = await fetch(buildDeepgramUrl(config.deepgram, request.languageHint), {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': request.mimeType || 'application/octet-stream',
      },
      body: Buffer.from(normalizeAudioBuffer(request.audioBuffer)),
    });

    if (!response.ok) {
      throw new Error(`STT_REQUEST_FAILED:${await toErrorMessage(response)}`);
    }

    const payload = (await response.json()) as DeepgramTranscriptionResponse;
    const channel = payload.results?.channels?.[0];
    const transcript = channel?.alternatives?.[0]?.transcript?.trim() || '';
    return {
      language: request.languageHint || config.deepgram?.language || channel?.detected_language,
      model: config.deepgram?.model || DEFAULT_DEEPGRAM_MODEL,
      provider: 'deepgram',
      text: transcript,
    };
  }
}
