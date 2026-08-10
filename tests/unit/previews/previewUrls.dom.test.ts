/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Coverage for the PDF stream URL builder: the flattened ChatFileRef query must
// match the backend GET /api/fs/stream contract (kind + pe_id/relative_path |
// path) and percent-encode values so they round-trip through serde_urlencoded.

import { describe, expect, it } from 'vitest';

import { buildPdfSrc, buildStreamUrl } from '@/renderer/pages/conversation/Preview/previewUrls';

describe('buildStreamUrl', () => {
  it('project ref → kind + pe_id + relative_path (no path)', () => {
    const url = new URL(
      buildStreamUrl({ kind: 'project', pe_id: 'peA', relative_path: 'docs/a b/日本.pdf' }),
      'http://host'
    );
    expect(url.pathname).toBe('/api/fs/stream');
    expect(url.searchParams.get('kind')).toBe('project');
    expect(url.searchParams.get('pe_id')).toBe('peA');
    // Decoded value round-trips (spaces / slashes / CJK).
    expect(url.searchParams.get('relative_path')).toBe('docs/a b/日本.pdf');
    expect(url.searchParams.get('path')).toBeNull();
  });

  it('local ref → kind + path (no pe fields)', () => {
    const url = new URL(buildStreamUrl({ kind: 'local', path: '/ws/x y.pdf' }), 'http://host');
    expect(url.searchParams.get('kind')).toBe('local');
    expect(url.searchParams.get('path')).toBe('/ws/x y.pdf');
    expect(url.searchParams.get('pe_id')).toBeNull();
    expect(url.searchParams.get('relative_path')).toBeNull();
  });

  it('upload ref → kind + path', () => {
    const url = new URL(buildStreamUrl({ kind: 'upload', path: '/up/z.pdf' }), 'http://host');
    expect(url.searchParams.get('kind')).toBe('upload');
    expect(url.searchParams.get('path')).toBe('/up/z.pdf');
  });

  it('percent-encodes special chars in the raw query', () => {
    const raw = buildStreamUrl({ kind: 'project', pe_id: 'p', relative_path: 'a b/c.pdf' });
    // URLSearchParams form-encoding: space → '+', '/' → '%2F'.
    expect(raw).toContain('relative_path=a+b%2Fc.pdf');
  });
});

describe('buildPdfSrc', () => {
  it('builds a stream URL when a fileRef is present', () => {
    expect(buildPdfSrc({ kind: 'local', path: '/x.pdf' })).toContain('/api/fs/stream?kind=local');
  });

  it('falls back to inline content when no fileRef', () => {
    expect(buildPdfSrc(undefined, 'blob:abc')).toBe('blob:abc');
    expect(buildPdfSrc(undefined, undefined)).toBe('');
  });
});
