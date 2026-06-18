/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { base64ToBlob, BINARY_MIME_MAP } from '@/renderer/utils/file/base64';

describe('base64 utils', () => {
  describe('base64ToBlob', () => {
    it('decodes base64 data URL to Blob', () => {
      const base64 = btoa('Hello, World!');
      const dataUrl = `data:text/plain;base64,${base64}`;
      const blob = base64ToBlob(dataUrl, 'text/plain');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toMatch(/^text\/plain/);
      expect(blob.size).toBe(13);
    });

    it('handles empty base64 string', () => {
      const dataUrl = 'data:text/plain;base64,';
      const blob = base64ToBlob(dataUrl, 'text/plain');

      expect(blob.size).toBe(0);
    });

    it('preserves MIME type from parameter', () => {
      const base64 = btoa('test');
      const dataUrl = `data:text/plain;base64,${base64}`;
      const blob = base64ToBlob(dataUrl, 'application/json');

      expect(blob.type).toMatch(/^application\/json/);
    });

    it('handles binary data', () => {
      const binaryData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
      const binaryStr = String.fromCharCode(...binaryData);
      const base64 = btoa(binaryStr);
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      const blob = base64ToBlob(dataUrl, 'image/jpeg');

      expect(blob.size).toBe(4);
      expect(blob.type).toBe('image/jpeg');
    });

    it('handles data URL without MIME type prefix', () => {
      const base64 = btoa('test');
      const dataUrl = base64;
      const blob = base64ToBlob(dataUrl, 'text/plain');

      expect(blob.size).toBe(0);
    });

    it('handles multiline base64', () => {
      const text = 'a'.repeat(100);
      const base64 = btoa(text);
      const dataUrl = `data:text/plain;base64,${base64}`;
      const blob = base64ToBlob(dataUrl, 'text/plain');

      expect(blob.size).toBe(100);
    });
  });

  describe('BINARY_MIME_MAP', () => {
    it('contains expected Office document MIME types', () => {
      expect(BINARY_MIME_MAP.xlsx).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(BINARY_MIME_MAP.docx).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(BINARY_MIME_MAP.pptx).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
    });

    it('contains legacy Office MIME types', () => {
      expect(BINARY_MIME_MAP.xls).toBe('application/vnd.ms-excel');
      expect(BINARY_MIME_MAP.doc).toBe('application/msword');
      expect(BINARY_MIME_MAP.ppt).toBe('application/vnd.ms-powerpoint');
    });

    it('contains OpenDocument MIME types', () => {
      expect(BINARY_MIME_MAP.ods).toBe('application/vnd.oasis.opendocument.spreadsheet');
      expect(BINARY_MIME_MAP.odt).toBe('application/vnd.oasis.opendocument.text');
      expect(BINARY_MIME_MAP.odp).toBe('application/vnd.oasis.opendocument.presentation');
    });

    it('contains common file format MIME types', () => {
      expect(BINARY_MIME_MAP.pdf).toBe('application/pdf');
      expect(BINARY_MIME_MAP.csv).toBe('text/csv');
    });

    it('contains archive MIME types', () => {
      expect(BINARY_MIME_MAP.zip).toBe('application/zip');
      expect(BINARY_MIME_MAP.tar).toBe('application/x-tar');
      expect(BINARY_MIME_MAP.gz).toBe('application/gzip');
      expect(BINARY_MIME_MAP.bz2).toBe('application/x-bzip2');
      expect(BINARY_MIME_MAP['7z']).toBe('application/x-7z-compressed');
      expect(BINARY_MIME_MAP.rar).toBe('application/vnd.rar');
    });

    it('has all expected file extensions', () => {
      const extensions = Object.keys(BINARY_MIME_MAP);
      expect(extensions).toContain('xlsx');
      expect(extensions).toContain('pdf');
      expect(extensions).toContain('zip');
      expect(extensions).toContain('docx');
      expect(extensions.length).toBeGreaterThanOrEqual(16);
    });
  });
});
