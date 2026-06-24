import { describe, it, expect } from 'vitest';
import {
  injectBasePathScript,
  normalizeBasePath,
  stripBasePathFromRequestLine,
  stripPublicBasePath,
} from '../src/public-path.js';

describe('public-path (web-host)', () => {
  it('normalizes configured prefixes', () => {
    expect(normalizeBasePath('/foo/')).toBe('/foo');
    expect(normalizeBasePath('foo')).toBe('/foo');
  });

  it('strips public prefixes from request paths', () => {
    expect(stripPublicBasePath('/prefix/api/foo', '/prefix')).toBe('/api/foo');
    expect(stripPublicBasePath('/other', '/prefix')).toBeNull();
  });

  it('injects base path script into html', () => {
    const html = injectBasePathScript('<html><head></head><body></body></html>', '/prefix');
    expect(html).toContain('window.__basePath="/prefix"');
  });

  it('rewrites ws upgrade request lines for backend splice', () => {
    const buf = Buffer.from('GET /prefix/ws HTTP/1.1\r\nHost: localhost\r\n\r\n', 'ascii');
    const rewritten = stripBasePathFromRequestLine(buf, '/prefix').toString('ascii');
    expect(rewritten.startsWith('GET /ws HTTP/1.1')).toBe(true);
  });
});
