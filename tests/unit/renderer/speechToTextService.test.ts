/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/services/SpeechToTextService.ts.
 * Regression tests for voice input failing with 400: the backend /api/stt
 * endpoint only accepts multipart with fields `file`, `fileName`, `mimeType`,
 * `languageHint` — the previous code sent JSON (Electron) or a wrong
 * `audio` multipart field (WebUI).
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  headers: Record<string, string> = {};

  private listeners: Record<string, XhrListener> = {};

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  addEventListener(name: string, listener: XhrListener) {
    this.listeners[name] = listener;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
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
    delete (globalThis as typeof globalThis & { __backendClientSecret?: string }).__backendClientSecret;
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { __backendClientSecret?: string }).__backendClientSecret;
    vi.unstubAllGlobals();
  });

  it('authenticates a local desktop XHR with the per-launch secret', async () => {
    const secret = 'f'.repeat(43);
    (globalThis as typeof globalThis & { __backendClientSecret?: string }).__backendClientSecret = secret;
    const pending = transcribeAudioBlob(new Blob(['fake-audio'], { type: 'audio/webm' }));

    const xhr = await waitForRequest();
    expect(xhr.headers['x-aionui-local-secret']).toBe(secret);
    xhr.respond(200, JSON.stringify({ success: true, data: { text: 'hello' } }));
    await expect(pending).resolves.toMatchObject({ text: 'hello' });
  });

  it('sends multipart fields matching the backend contract (file/fileName/mimeType/languageHint)', async () => {
    const blob = new Blob(['fake-audio'], { type: 'audio/webm' });
    const pending = transcribeAudioBlob(blob, 'zh-CN');

    const xhr = await waitForRequest();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toContain('/api/stt');
    // Credentialed cross-origin requests are rejected by the browser because
    // the desktop backend responds with Access-Control-Allow-Origin: *
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
