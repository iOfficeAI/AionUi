/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBaseUrl } from '@/common/adapter/httpBridge';
import type { SpeechToTextResult } from '@/common/types/provider/speech';

/** Dispatched on window whenever the speech-to-text config is saved. */
export const SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT = 'aionui:speech-to-text-config-changed';

const MAX_AUDIO_FILE_SIZE_MB = 30;
const MAX_AUDIO_FILE_SIZE_BYTES = MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024;

const getAudioExtension = (mimeType: string) => {
  switch (mimeType) {
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/ogg':
    case 'audio/ogg;codecs=opus':
      return 'ogg';
    case 'audio/wav':
    case 'audio/wave':
      return 'wav';
    default:
      return 'webm';
  }
};

const createAudioFileName = (mimeType: string) => {
  return `speech-input.${getAudioExtension(mimeType)}`;
};

const ensureAudioSize = (blob: Blob) => {
  if (blob.size > MAX_AUDIO_FILE_SIZE_BYTES) {
    throw new Error('STT_FILE_TOO_LARGE');
  }
};

const parseSuccessResponse = (response: XMLHttpRequest): SpeechToTextResult => {
  const payload = JSON.parse(response.responseText) as {
    data?: SpeechToTextResult;
    msg?: string;
    success: boolean;
  };

  if (!payload.success || !payload.data) {
    throw new Error(payload.msg || 'STT_REQUEST_FAILED');
  }

  return payload.data;
};

// Surface the backend error code (STT_DISABLED, STT_OPENAI_NOT_CONFIGURED, ...)
// so useSpeechInput can map it to a localized error state.
const parseErrorResponse = (response: XMLHttpRequest): Error => {
  if (response.status === 413) {
    return new Error('STT_FILE_TOO_LARGE');
  }

  try {
    const payload = JSON.parse(response.responseText) as { code?: string; error?: string; msg?: string };
    const code = payload.code;
    const detail = payload.error || payload.msg;
    if (code || detail) {
      return new Error([code, detail].filter(Boolean).join(': '));
    }
  } catch {
    // Non-JSON error body — fall back to the status line below.
  }

  return new Error(`STT_REQUEST_FAILED:${response.status} ${response.statusText}`);
};

export async function transcribeAudioBlob(blob: Blob, languageHint?: string): Promise<SpeechToTextResult> {
  ensureAudioSize(blob);

  const mimeType = blob.type || 'audio/webm';
  const file_name = createAudioFileName(mimeType);

  // Backend /api/stt only accepts multipart with these exact field names.
  const formData = new FormData();
  formData.append('file', blob, file_name);
  formData.append('fileName', file_name);
  formData.append('mimeType', mimeType);
  if (languageHint) {
    formData.append('languageHint', languageHint);
  }

  return new Promise<SpeechToTextResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getBaseUrl()}/api/stt`);
    // No withCredentials: the desktop backend allows origin `*`, which the
    // browser rejects for credentialed requests; WebUI is same-origin anyway.

    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(parseErrorResponse(xhr));
        return;
      }

      try {
        resolve(parseSuccessResponse(xhr));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('STT_NETWORK_ERROR'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('STT_ABORTED'));
    });

    xhr.send(formData);
  });
}
