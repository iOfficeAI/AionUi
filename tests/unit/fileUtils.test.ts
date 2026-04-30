import { describe, expect, it } from 'vitest';
import { getContentTypeByExtension } from '../../src/renderer/pages/conversation/Preview/fileUtils';

describe('fileUtils', () => {
  it('resolves extended office and image formats', () => {
    expect(getContentTypeByExtension('report.odt')).toBe('word');
    expect(getContentTypeByExtension('slides.odp')).toBe('ppt');
    expect(getContentTypeByExtension('sheet.ods')).toBe('excel');
    expect(getContentTypeByExtension('sheet.csv')).toBe('excel');
    expect(getContentTypeByExtension('photo.tiff')).toBe('image');
    expect(getContentTypeByExtension('photo.avif')).toBe('image');
  });

  it('resolves markdown aliases case-insensitively', () => {
    expect(getContentTypeByExtension('README.MD')).toBe('markdown');
    expect(getContentTypeByExtension('README.mdown')).toBe('markdown');
    expect(getContentTypeByExtension('README.mkd')).toBe('markdown');
  });

  it('resolves diff extensions from the shared map', () => {
    expect(getContentTypeByExtension('changes.diff')).toBe('diff');
    expect(getContentTypeByExtension('changes.patch')).toBe('diff');
  });
});
