import { describe, expect, it } from 'vitest';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';

describe('resolveExtensionAssetUrl', () => {
  it('passes through backend-served extension asset URLs unchanged', () => {
    expect(resolveExtensionAssetUrl('/api/extensions/hello/assets/icon.svg')).toBe(
      '/api/extensions/hello/assets/icon.svg'
    );
  });

  it('passes through direct URLs unchanged', () => {
    expect(resolveExtensionAssetUrl('https://example.com/icon.svg')).toBe('https://example.com/icon.svg');
    expect(resolveExtensionAssetUrl('file:///tmp/icon.svg')).toBe('file:///tmp/icon.svg');
    expect(resolveExtensionAssetUrl('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
  });
});
