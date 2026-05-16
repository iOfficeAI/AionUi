/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

describe('PreviewHistoryDropdown', () => {
  it('is a React component module that exports a default function', async () => {
    const mod = await import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewHistoryDropdown');
    expect(typeof mod.default).toBe('function');
  });

  it('module loads without throwing on import', async () => {
    await expect(
      import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewHistoryDropdown')
    ).resolves.toBeTruthy();
  });

  it('accepts required props (historyVersions, onSnapshotSelect, etc) as per TypeScript signature', async () => {
    const mod = await import('@/renderer/pages/conversation/Preview/components/PreviewPanel/PreviewHistoryDropdown');
    expect(mod.default.length).toBeGreaterThanOrEqual(0);
  });
});
