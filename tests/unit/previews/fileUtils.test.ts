/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  getFileExtension,
  getContentTypeByExtension,
  isImageFile,
  isTextFile,
  isOfficeFile,
  FILE_EXTENSION_MAP,
} from '@/renderer/pages/conversation/Preview/fileUtils';
import { buildPdfSrc } from '@/renderer/pages/conversation/Preview/previewUrls';

describe('fileUtils', () => {
  describe('getFileExtension', () => {
    it('extracts extension in lowercase', () => {
      expect(getFileExtension('document.PDF')).toBe('pdf');
      expect(getFileExtension('script.TS')).toBe('ts');
    });

    it('returns empty string for no extension', () => {
      expect(getFileExtension('noextension')).toBe('');
      expect(getFileExtension('')).toBe('');
    });

    it('returns empty string for dot at end', () => {
      expect(getFileExtension('file.')).toBe('');
    });

    it('extracts last extension for multi-dot names', () => {
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
    });

    it('handles null-ish input gracefully', () => {
      expect(getFileExtension('')).toBe('');
    });
  });

  describe('getContentTypeByExtension', () => {
    it('returns markdown for .md', () => {
      expect(getContentTypeByExtension('README.md')).toBe('markdown');
    });

    it('returns html for .html', () => {
      expect(getContentTypeByExtension('index.html')).toBe('html');
    });

    it('returns pdf for .pdf', () => {
      expect(getContentTypeByExtension('report.pdf')).toBe('pdf');
    });

    it('returns word for .docx', () => {
      expect(getContentTypeByExtension('document.docx')).toBe('word');
    });

    it('returns ppt for .pptx', () => {
      expect(getContentTypeByExtension('slides.pptx')).toBe('ppt');
    });

    it('returns excel for .xlsx', () => {
      expect(getContentTypeByExtension('spreadsheet.xlsx')).toBe('excel');
    });

    it('returns image for .png', () => {
      expect(getContentTypeByExtension('photo.png')).toBe('image');
    });

    it('returns diff for .diff', () => {
      expect(getContentTypeByExtension('changes.diff')).toBe('diff');
    });

    it('returns code as default for unknown extension', () => {
      expect(getContentTypeByExtension('script.ts')).toBe('code');
      expect(getContentTypeByExtension('app.jsx')).toBe('code');
    });

    it('returns code for files without extension', () => {
      expect(getContentTypeByExtension('Makefile')).toBe('code');
    });
  });

  describe('isImageFile', () => {
    it('returns true for image extensions', () => {
      expect(isImageFile('photo.png')).toBe(true);
      expect(isImageFile('icon.svg')).toBe(true);
      expect(isImageFile('image.JPEG')).toBe(true);
    });

    it('returns false for non-image files', () => {
      expect(isImageFile('document.pdf')).toBe(false);
      expect(isImageFile('script.ts')).toBe(false);
    });
  });

  describe('isTextFile', () => {
    it('returns true for text types', () => {
      expect(isTextFile('README.md')).toBe(true);
      expect(isTextFile('index.html')).toBe(true);
      expect(isTextFile('script.ts')).toBe(true);
    });

    it('returns false for binary types', () => {
      expect(isTextFile('document.docx')).toBe(false);
      expect(isTextFile('photo.png')).toBe(false);
      expect(isTextFile('report.pdf')).toBe(false);
    });
  });

  describe('isOfficeFile', () => {
    it('returns true for Office types', () => {
      expect(isOfficeFile('document.docx')).toBe(true);
      expect(isOfficeFile('slides.pptx')).toBe(true);
      expect(isOfficeFile('data.xlsx')).toBe(true);
    });

    it('returns false for non-Office types', () => {
      expect(isOfficeFile('photo.png')).toBe(false);
      expect(isOfficeFile('script.ts')).toBe(false);
    });
  });

  describe('FILE_EXTENSION_MAP', () => {
    it('contains markdown extensions', () => {
      expect(FILE_EXTENSION_MAP.markdown).toContain('md');
      expect(FILE_EXTENSION_MAP.markdown).toContain('markdown');
    });

    it('contains image extensions', () => {
      expect(FILE_EXTENSION_MAP.image).toContain('png');
      expect(FILE_EXTENSION_MAP.image).toContain('svg');
    });
  });
});

describe('previewUrls', () => {
  describe('buildPdfSrc', () => {
    it('builds file:// URI from file_path', () => {
      const result = buildPdfSrc('/path/to/doc.pdf');
      expect(result).toBe('file:///path/to/doc.pdf');
    });

    it('returns content when file_path is absent', () => {
      const result = buildPdfSrc(undefined, 'base64data');
      expect(result).toBe('base64data');
    });

    it('returns empty string when both absent', () => {
      const result = buildPdfSrc(undefined, undefined);
      expect(result).toBe('');
    });

    it('encodes URI properly', () => {
      const result = buildPdfSrc('/path/with spaces/doc.pdf');
      expect(result).toContain('file:///path/with%20spaces/doc.pdf');
    });
  });
});
