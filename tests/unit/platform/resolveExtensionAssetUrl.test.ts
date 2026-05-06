import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveBackendAssetUrl, resolveExtensionAssetUrl } from '@/renderer/utils/platform';

type TestWindow = Window & { electronAPI?: object; __backendPort?: number };
type TestGlobal = typeof globalThis & { window?: TestWindow };

beforeEach(() => {
  delete (globalThis as TestGlobal).window;
});

afterEach(() => {
  delete (globalThis as TestGlobal).window;
});

describe('resolveExtensionAssetUrl', () => {
  it('passes through backend-served extension asset URLs unchanged on web', () => {
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

describe('resolveBackendAssetUrl', () => {
  it('resolves backend-relative URLs against the backend origin in Electron', () => {
    (globalThis as TestGlobal).window = {
      electronAPI: {},
      __backendPort: 19191,
    } as TestWindow;

    expect(resolveBackendAssetUrl('/api/assets/logos/ai-major/claude.svg')).toBe(
      'http://127.0.0.1:19191/api/assets/logos/ai-major/claude.svg'
    );
  });
});
