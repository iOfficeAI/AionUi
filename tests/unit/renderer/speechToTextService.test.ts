/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/services/SpeechToTextService.ts.
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const settingsMocks = vi.hoisted(() => ({
  getClientBusinessSetting: vi.fn(),
}));

const ipcMocks = vi.hoisted(() => ({
  transcribeInvoke: vi.fn(),
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: settingsMocks.getClientBusinessSetting,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    speech: {
      transcribe: {
        invoke: ipcMocks.transcribeInvoke,
      },
    },
  },
}));

import { transcribeAudioBlob } from '@/renderer/services/SpeechToTextService';

type XhrListener = () => void;

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  method = '';
  url = '';
  withCredentials = false;
  status = 0;
  statusText = '';
  responseText = '';
  sentBody: unknown;

  private listeners: Record<string, XhrListener> = {};

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  addEventListener(name: string, listener: XhrListener) {
    this.listeners[name] = listener;
  }

  send(body: unknown) {
    this.sentBody = body;
    FakeXMLHttpRequest.instances.push(this);
  }

  respond(status: number, responseText: string, statusText = '') {
    this.status = status;
    this.statusText = statusText;
    this.responseText = responseText;
    this.listeners.load?.();
  }

  triggerError() {
    this.listeners.error?.();
  }

  triggerAbort() {
    this.listeners.abort?.();
  }
}

const waitForRequest = async (): Promise<FakeXMLHttpRequest> => {
  for (let i = 0; i < 20 && FakeXMLHttpRequest.instances.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const xhr = FakeXMLHttpRequest.instances[0];
  expect(xhr, 'expected an XHR request to /api/stt').toBeDefined();
  return xhr;
};

describe('SpeechToTextService.transcribeAudioBlob', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
    settingsMocks.getClientBusinessSetting.mockResolvedValue(undefined);
    ipcMocks.transcribeInvoke.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('rejects with STT_FILE_TOO_LARGE when audio blob exceeds 30MB', async () => {
    const hugeBlob = {
      size: 31 * 1024 * 1024,
      type: 'audio/webm',
    } as unknown as Blob;

    await expect(transcribeAudioBlob(hugeBlob)).rejects.toThrow('STT_FILE_TOO_LARGE');
  });

  it('transcribes via local IPC bridge when provider is local', async () => {
    settingsMocks.getClientBusinessSetting.mockResolvedValue({
      provider: 'local',
      local: {
        model: 'parakeet-tdt-0.6b-v3-int8',
      },
    });

    ipcMocks.transcribeInvoke.mockResolvedValueOnce({
      model: 'parakeet-tdt-0.6b-v3-int8',
      provider: 'local',
      text: 'Local dictation result',
    });

    const blob = new Blob(['pcm-audio-data'], { type: 'audio/wav' });
    const result = await transcribeAudioBlob(blob);

    expect(result.text).toBe('Local dictation result');
    expect(ipcMocks.transcribeInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'parakeet-tdt-0.6b-v3-int8',
      })
    );
  });

  it('re-throws STT_LOCAL_MODEL_NOT_DOWNLOADED when local model is missing', async () => {
    settingsMocks.getClientBusinessSetting.mockResolvedValue({
      provider: 'local',
      local: {
        model: 'parakeet-tdt-0.6b-v3-int8',
      },
    });

    ipcMocks.transcribeInvoke.mockRejectedValueOnce(new Error('STT_LOCAL_MODEL_NOT_DOWNLOADED'));

    const blob = new Blob(['pcm-audio-data'], { type: 'audio/wav' });
    await expect(transcribeAudioBlob(blob)).rejects.toThrow('STT_LOCAL_MODEL_NOT_DOWNLOADED');
  });

  it('sends multipart fields matching the backend contract (file/fileName/mimeType/languageHint)', async () => {
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const pending = transcribeAudioBlob(blob, 'zh-CN');

    const xhr = await waitForRequest();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toContain('/api/stt');
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.sentBody).toBeInstanceOf(FormData);

    const formData = xhr.sentBody as FormData;
    const file = formData.get('file');
    expect(file, "backend requires the audio under field 'file'").toBeInstanceOf(Blob);
    expect((file as File).name).toBe('speech-input.webm');
    expect(formData.get('fileName')).toBe('speech-input.webm');
    expect(formData.get('mimeType')).toBe('audio/webm');
    expect(formData.get('languageHint')).toBe('zh-CN');

    xhr.respond(
      200,
      JSON.stringify({ success: true, data: { model: 'whisper-1', provider: 'openai', text: 'hello' } })
    );
    await expect(pending).resolves.toEqual({ model: 'whisper-1', provider: 'openai', text: 'hello' });
  });

  it('correctly maps audio extensions for different mime types', async () => {
    const typesAndExtensions = [
      { mime: 'audio/mp4', ext: 'm4a' },
      { mime: 'audio/mpeg', ext: 'mp3' },
      { mime: 'audio/ogg', ext: 'ogg' },
      { mime: 'audio/wav', ext: 'wav' },
    ];

    for (const item of typesAndExtensions) {
      FakeXMLHttpRequest.instances = [];
      const blob = new Blob(['audio'], { type: item.mime });
      const pending = transcribeAudioBlob(blob);
      const xhr = await waitForRequest();
      const formData = xhr.sentBody as FormData;
      expect(formData.get('fileName')).toBe(`speech-input.${item.ext}`);
      xhr.respond(200, JSON.stringify({ success: true, data: { text: 'ok' } }));
      await pending;
    }
  });

  it('handles network error', async () => {
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const pending = transcribeAudioBlob(blob);

    const xhr = await waitForRequest();
    xhr.triggerError();

    await expect(pending).rejects.toThrow('STT_NETWORK_ERROR');
  });

  it('handles abort error', async () => {
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const pending = transcribeAudioBlob(blob);

    const xhr = await waitForRequest();
    xhr.triggerAbort();

    await expect(pending).rejects.toThrow('STT_ABORTED');
  });

  it('rejects with the backend error code so STT errors map correctly', async () => {
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const pending = transcribeAudioBlob(blob);

    const xhr = await waitForRequest();
    xhr.respond(400, JSON.stringify({ success: false, error: 'STT is not enabled', code: 'STT_DISABLED' }));

    await expect(pending).rejects.toThrow(/STT_DISABLED/);
  });

  it('rejects with STT_FILE_TOO_LARGE on 413', async () => {
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const pending = transcribeAudioBlob(blob);

    const xhr = await waitForRequest();
    xhr.respond(413, '');

    await expect(pending).rejects.toThrow('STT_FILE_TOO_LARGE');
  });

  it('falls back to STT_REQUEST_FAILED with status for non-JSON error bodies', async () => {
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const pending = transcribeAudioBlob(blob);

    const xhr = await waitForRequest();
    xhr.respond(500, 'Internal Server Error', 'Internal Server Error');

    await expect(pending).rejects.toThrow(/STT_REQUEST_FAILED:500/);
  });
});
