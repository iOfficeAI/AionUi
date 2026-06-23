/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { systemSettings } from '@/common/adapter/ipcBridge';

describe('ipcBridge systemSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('save uploads to workspace', () => {
    it('reads save_upload_to_workspace from the system settings endpoint', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { save_upload_to_workspace: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      vi.stubGlobal('fetch', fetchSpy);

      const result = await systemSettings.getSaveUploadToWorkspace.invoke();

      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('/api/settings');
      expect(fetchSpy.mock.calls[0]?.[0]).not.toContain('/api/settings/client');
      expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe('GET');
    });

    it('defaults to false when the backend omits save_upload_to_workspace', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      vi.stubGlobal('fetch', fetchSpy);

      const result = await systemSettings.getSaveUploadToWorkspace.invoke();

      expect(result).toBe(false);
    });

    it('writes save_upload_to_workspace to the system settings endpoint', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal('fetch', fetchSpy);

      await systemSettings.setSaveUploadToWorkspace.invoke({ enabled: true });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[0]).toContain('/api/settings');
      expect(fetchSpy.mock.calls[0]?.[0]).not.toContain('/api/settings/client');
      expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe('PATCH');
      expect(fetchSpy.mock.calls[0]?.[1]?.body).toBe('{"save_upload_to_workspace":true}');
    });
  });
});
