import { describe, expect, it } from 'vitest';

import { isPreviewSupportedExt } from '@/renderer/pages/conversation/Workspace/utils/filePreview';

describe('isPreviewSupportedExt', () => {
  it('allows plain text files to open in the preview panel', () => {
    expect(isPreviewSupportedExt('notes.txt')).toBe(true);
    expect(isPreviewSupportedExt('server.log')).toBe(true);
  });

  it('continues to reject unsupported binary file extensions', () => {
    expect(isPreviewSupportedExt('archive.zip')).toBe(false);
    expect(isPreviewSupportedExt('image.raw')).toBe(false);
  });
});
