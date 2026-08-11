/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { base64ToBlob, BINARY_MIME_MAP } from '../../src/renderer/utils/file/base64';

describe('base64ToBlob', () => {
  it('decodes a simple text data URL into a Blob with the given MIME type', () => {
    // "hello" in base64 is "aGVsbG8="
    const dataUrl = 'data:text/plain;base64,aGVsbG8=';
    const blob = base64ToBlob(dataUrl, 'text/plain');
    expect(blob.type).toBe('text/plain');
    expect(blob.size).toBe(5); // "hello" is 5 bytes
  });

  it('uses the provided mimeType, not the one embedded in the data URL', () => {
    const dataUrl = 'data:application/octet-stream;base64,aGVsbG8=';
    const blob = base64ToBlob(dataUrl, 'application/pdf');
    expect(blob.type).toBe('application/pdf');
  });

  it('handles an empty base64 payload gracefully', () => {
    const dataUrl = 'data:application/octet-stream;base64,';
    const blob = base64ToBlob(dataUrl, 'application/octet-stream');
    expect(blob.size).toBe(0);
  });

  it('returns a Blob with zero size when the data URL has no comma separator', () => {
    // split(',')[1] will be undefined → falls back to ''
    const dataUrl = 'no-comma-here';
    const blob = base64ToBlob(dataUrl, 'application/octet-stream');
    expect(blob.size).toBe(0);
  });
});

describe('BINARY_MIME_MAP', () => {
  it('maps common Office extensions to correct MIME types', () => {
    expect(BINARY_MIME_MAP['xlsx']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(BINARY_MIME_MAP['pdf']).toBe('application/pdf');
    expect(BINARY_MIME_MAP['docx']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(BINARY_MIME_MAP['pptx']).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
  });

  it('maps archive extensions to correct MIME types', () => {
    expect(BINARY_MIME_MAP['zip']).toBe('application/zip');
    expect(BINARY_MIME_MAP['tar']).toBe('application/x-tar');
    expect(BINARY_MIME_MAP['gz']).toBe('application/gzip');
    expect(BINARY_MIME_MAP['7z']).toBe('application/x-7z-compressed');
    expect(BINARY_MIME_MAP['rar']).toBe('application/vnd.rar');
  });

  it('does not contain an entry for unknown extensions', () => {
    expect(BINARY_MIME_MAP['xyz']).toBeUndefined();
  });
});
