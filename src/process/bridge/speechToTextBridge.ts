/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { SpeechToTextService } from './services/SpeechToTextService';

export function initSpeechToTextBridge(): void {
  ipcBridge.speechToText.transcribe.provider(async (request) => {
    return SpeechToTextService.transcribe(request);
  });
}
