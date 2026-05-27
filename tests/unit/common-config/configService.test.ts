/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configService } from '@/common/config/configService';

describe('configService', () => {
  beforeEach(() => {
    configService.reset();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    configService.reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('save upload preference migration', () => {
    it('copies legacy upload.saveToWorkspace into system settings once', async () => {
      const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (method === 'GET') {
          return new Response(JSON.stringify({ data: { 'upload.saveToWorkspace': true } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal('fetch', fetchSpy);

      await configService.initialize();

      expect(configService.get('upload.saveToWorkspace')).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(fetchSpy.mock.calls[1]?.[0]).toContain('/api/settings');
      expect(fetchSpy.mock.calls[1]?.[1]?.method).toBe('PATCH');
      expect(fetchSpy.mock.calls[1]?.[1]?.body).toBe('{"save_upload_to_workspace":true}');
      expect(fetchSpy.mock.calls[2]?.[0]).toContain('/api/settings/client');
      expect(fetchSpy.mock.calls[2]?.[1]?.method).toBe('PUT');
      expect(fetchSpy.mock.calls[2]?.[1]?.body).toBe('{"migration.saveUploadToWorkspaceSystem_v1":true}');
    });

    it('does not migrate again after the migration flag is present', async () => {
      const fetchSpy = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            data: {
              'upload.saveToWorkspace': true,
              'migration.saveUploadToWorkspaceSystem_v1': true,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      });
      vi.stubGlobal('fetch', fetchSpy);

      await configService.initialize();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]?.[1]?.method).toBe('GET');
    });

    it('keeps initialization usable when the system settings migration fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (method === 'GET') {
          return new Response(JSON.stringify({ data: { 'upload.saveToWorkspace': false } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (method === 'PATCH') {
          return new Response('failed', { status: 500 });
        }
        return new Response(null, { status: 204 });
      });
      vi.stubGlobal('fetch', fetchSpy);

      await configService.initialize();

      expect(configService.get('upload.saveToWorkspace')).toBe(false);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        '[ConfigService] Failed to migrate upload.saveToWorkspace to system settings:',
        expect.any(Error)
      );
    });
  });
});
