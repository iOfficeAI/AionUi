/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function createSandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-analytics-test-'));
}

function removeSandbox(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

async function loadModule(userDataDir: string) {
  vi.resetModules();
  vi.doMock('electron', () => ({
    app: {
      getPath: (name: string) => (name === 'userData' ? userDataDir : userDataDir),
    },
  }));
  const mod = await import('@process/utils/analyticsId');
  return mod;
}

describe('getOrCreateAnalyticsId', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = createSandbox();
  });

  afterEach(() => {
    vi.doUnmock('electron');
    vi.resetModules();
    removeSandbox(sandbox);
  });

  it('generates a valid UUID on first call', async () => {
    const { getOrCreateAnalyticsId } = await loadModule(sandbox);
    const id = getOrCreateAnalyticsId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('persists the id to analytics.json', async () => {
    const { getOrCreateAnalyticsId } = await loadModule(sandbox);
    const id = getOrCreateAnalyticsId();

    const filePath = path.join(sandbox, 'analytics.json');
    expect(fs.existsSync(filePath)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(stored.id).toBe(id);
  });

  it('returns the same id on subsequent calls', async () => {
    const { getOrCreateAnalyticsId } = await loadModule(sandbox);
    const id1 = getOrCreateAnalyticsId();
    const id2 = getOrCreateAnalyticsId();
    expect(id1).toBe(id2);
  });

  it('reuses existing id from analytics.json', async () => {
    const existingId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    fs.writeFileSync(path.join(sandbox, 'analytics.json'), JSON.stringify({ id: existingId }));

    const { getOrCreateAnalyticsId } = await loadModule(sandbox);
    expect(getOrCreateAnalyticsId()).toBe(existingId);
  });

  it('regenerates id when analytics.json is corrupted', async () => {
    fs.writeFileSync(path.join(sandbox, 'analytics.json'), 'not-valid-json');

    const { getOrCreateAnalyticsId } = await loadModule(sandbox);
    const id = getOrCreateAnalyticsId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('regenerates id when stored id is empty string', async () => {
    fs.writeFileSync(path.join(sandbox, 'analytics.json'), JSON.stringify({ id: '' }));

    const { getOrCreateAnalyticsId } = await loadModule(sandbox);
    const id = getOrCreateAnalyticsId();
    expect(id.length).toBeGreaterThan(0);
  });
});
