/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseDevPort, pickDevPortFromPackageJson } from '@/renderer/pages/conversation/DevBrowser/devUrl';

describe('parseDevPort', () => {
  it('parses --port followed by space and number', () => {
    expect(parseDevPort('vite --port 5174')).toBe(5174);
  });

  it('parses --port with equals', () => {
    expect(parseDevPort('next dev --port=4000')).toBe(4000);
  });

  it('parses short -p flag', () => {
    expect(parseDevPort('webpack serve -p 8081')).toBe(8081);
  });

  it('parses PORT env-style prefix', () => {
    expect(parseDevPort('PORT=4321 react-scripts start')).toBe(4321);
  });

  it('returns null for scripts without a port', () => {
    expect(parseDevPort('vite')).toBeNull();
    expect(parseDevPort('next dev')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseDevPort('')).toBeNull();
    expect(parseDevPort(undefined as unknown as string)).toBeNull();
  });

  it('rejects out-of-range ports', () => {
    expect(parseDevPort('node serve --port 99999')).toBeNull();
  });
});

describe('pickDevPortFromPackageJson', () => {
  it('finds a port in scripts.dev', () => {
    const pkg = JSON.stringify({ scripts: { dev: 'vite --port 5173' } });
    expect(pickDevPortFromPackageJson(pkg)).toBe(5173);
  });

  it('prefers dev over start when both define a port', () => {
    const pkg = JSON.stringify({
      scripts: { dev: 'vite --port 5173', start: 'react-scripts start --port 3001' },
    });
    expect(pickDevPortFromPackageJson(pkg)).toBe(5173);
  });

  it('falls through to start when dev has no port', () => {
    const pkg = JSON.stringify({
      scripts: { dev: 'vite', start: 'react-scripts start --port 3001' },
    });
    expect(pickDevPortFromPackageJson(pkg)).toBe(3001);
  });

  it('returns null when no scripts contain a port', () => {
    const pkg = JSON.stringify({ scripts: { dev: 'vite', start: 'next dev' } });
    expect(pickDevPortFromPackageJson(pkg)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(pickDevPortFromPackageJson('{ this is not json')).toBeNull();
  });

  it('returns null when scripts is missing or wrong shape', () => {
    expect(pickDevPortFromPackageJson(JSON.stringify({}))).toBeNull();
    expect(pickDevPortFromPackageJson(JSON.stringify({ scripts: 'oops' }))).toBeNull();
  });
});
