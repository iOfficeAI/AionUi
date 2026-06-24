/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  autoDetectBasePathFromLocation,
  getPublicBasePath,
  joinPublicPath,
  normalizeBasePath,
} from '@/common/publicPath';

describe('publicPath', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('normalizeBasePath', () => {
    it('returns empty for root-ish values', () => {
      expect(normalizeBasePath('')).toBe('');
      expect(normalizeBasePath('/')).toBe('');
      expect(normalizeBasePath('   ')).toBe('');
    });

    it('adds leading slash and strips trailing slash', () => {
      expect(normalizeBasePath('foo/bar/')).toBe('/foo/bar');
      expect(normalizeBasePath('/prefix/')).toBe('/prefix');
    });
  });

  describe('joinPublicPath', () => {
    it('joins base path with root-absolute paths', () => {
      expect(joinPublicPath('/api/foo', '/prefix')).toBe('/prefix/api/foo');
      expect(joinPublicPath('/api/foo', '')).toBe('/api/foo');
    });
  });

  describe('getPublicBasePath', () => {
    it('uses explicit window.__basePath when provided', () => {
      vi.stubGlobal('window', { __basePath: '/configured' });
      expect(getPublicBasePath()).toBe('/configured');
    });

    it('auto-detects from pathname when __basePath is unset', () => {
      vi.stubGlobal('window', {
        location: { pathname: '/sandbox/proxy/25808/' },
      });
      expect(getPublicBasePath()).toBe('/sandbox/proxy/25808');
    });

    it('does not auto-detect static file pathnames', () => {
      vi.stubGlobal('window', {
        location: { pathname: '/assets/main.js' },
      });
      expect(autoDetectBasePathFromLocation()).toBe('');
    });
  });
});
