/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readImageFileAsDataUrl } from '@/renderer/pages/settings/AppearanceSettings/coverImageUtils';

describe('readImageFileAsDataUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a Blob into a base64 data URL', async () => {
    const blob = new Blob(['hello'], { type: 'image/png' });
    const dataUrl = await readImageFileAsDataUrl(blob);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    // "hello" base64-encoded
    expect(dataUrl.endsWith('aGVsbG8=')).toBe(true);
  });

  it('rejects when readAsDataURL throws synchronously', async () => {
    const badBlob = { type: 'image/png' } as unknown as Blob;
    await expect(readImageFileAsDataUrl(badBlob)).rejects.toBeInstanceOf(Error);
  });

  // The following cases drive the FileReader callbacks that a real jsdom
  // FileReader will not exercise (non-string result, error event, and a
  // non-Error synchronous throw), so every branch is covered.

  it('rejects when the reader yields a non-string result', async () => {
    class FakeReader {
      result: unknown = null;
      error: DOMException | null = null;
      private handlers: Record<string, Array<() => void>> = {};
      addEventListener(type: string, cb: () => void) {
        (this.handlers[type] ??= []).push(cb);
      }
      readAsDataURL() {
        this.result = new ArrayBuffer(4);
        this.handlers.load?.forEach((cb) => cb());
      }
    }
    vi.stubGlobal('FileReader', FakeReader);
    await expect(readImageFileAsDataUrl(new Blob(['x']))).rejects.toThrow('Unexpected FileReader result');
  });

  it('rejects with reader.error when the error event fires', async () => {
    const readerError = new Error('boom');
    class FakeReader {
      result: unknown = null;
      error: Error | null = readerError;
      private handlers: Record<string, Array<() => void>> = {};
      addEventListener(type: string, cb: () => void) {
        (this.handlers[type] ??= []).push(cb);
      }
      readAsDataURL() {
        this.handlers.error?.forEach((cb) => cb());
      }
    }
    vi.stubGlobal('FileReader', FakeReader);
    await expect(readImageFileAsDataUrl(new Blob(['x']))).rejects.toBe(readerError);
  });

  it('falls back to a generic Error when the error event fires without reader.error', async () => {
    class FakeReader {
      result: unknown = null;
      error: Error | null = null;
      private handlers: Record<string, Array<() => void>> = {};
      addEventListener(type: string, cb: () => void) {
        (this.handlers[type] ??= []).push(cb);
      }
      readAsDataURL() {
        this.handlers.error?.forEach((cb) => cb());
      }
    }
    vi.stubGlobal('FileReader', FakeReader);
    await expect(readImageFileAsDataUrl(new Blob(['x']))).rejects.toThrow('Failed to read image file');
  });

  it('wraps a non-Error synchronous throw into an Error', async () => {
    class FakeReader {
      result: unknown = null;
      error: Error | null = null;
      addEventListener() {}
      readAsDataURL(): never {
        throw 'string failure';
      }
    }
    vi.stubGlobal('FileReader', FakeReader);
    await expect(readImageFileAsDataUrl(new Blob(['x']))).rejects.toThrow('Failed to read image file');
  });
});
