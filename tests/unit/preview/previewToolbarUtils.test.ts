import { describe, expect, it } from 'vitest';
import { shouldShowDownload } from '@renderer/pages/conversation/Preview/components/PreviewPanel/previewToolbarUtils';

describe('shouldShowDownload', () => {
  it('hides download for on-disk code files', () => {
    expect(shouldShowDownload('code', true)).toBe(false);
  });
  it('hides download for on-disk markdown files', () => {
    expect(shouldShowDownload('markdown', true)).toBe(false);
  });
  it('shows download for synthetic (no file_path) markdown', () => {
    expect(shouldShowDownload('markdown', false)).toBe(true);
  });
  it('shows download for code without a backing file', () => {
    expect(shouldShowDownload('code', false)).toBe(true);
  });
  it('shows download for other content types', () => {
    expect(shouldShowDownload('html', true)).toBe(true);
    expect(shouldShowDownload('diff', true)).toBe(true);
  });
});
