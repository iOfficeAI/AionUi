/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  cancelModelDownload,
  downloadModel,
  getModelStatus,
  isModelReady,
  transcribeLocalAudio,
} from '../services/speech';

export function initSpeechBridge(): void {
  ipcBridge.speech.checkModel.provider(async ({ modelId }) => {
    const isReady = await isModelReady(modelId);
    const status = getModelStatus(modelId);
    return { isReady, status };
  });

  ipcBridge.speech.downloadModel.provider(async ({ modelId }) => {
    return downloadModel(modelId, (progress) => {
      ipcBridge.speech.onDownloadProgress.emit(progress);
    });
  });

  ipcBridge.speech.cancelDownload.provider(({ modelId }) => {
    return cancelModelDownload(modelId);
  });

  ipcBridge.speech.transcribe.provider(async ({ audioBuffer, modelId }) => {
    const bytes = audioBuffer instanceof Uint8Array ? audioBuffer : new Uint8Array(audioBuffer);
    return transcribeLocalAudio(bytes, modelId);
  });
}
