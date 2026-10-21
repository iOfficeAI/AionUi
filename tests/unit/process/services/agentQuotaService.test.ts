/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as childProcess from 'child_process';
import fs from 'fs';
import { clearAgyQuotaCache, fetchAgyQuota, resolveAgyBinaryPath } from '@/process/services/agentQuotaService';

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
  existsSync: vi.fn(),
}));

describe('agentQuotaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAgyQuotaCache();
  });

  afterEach(() => {
    clearAgyQuotaCache();
  });

  describe('resolveAgyBinaryPath', () => {
    it('returns customPath if it exists', () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(true);
      expect(resolveAgyBinaryPath('/custom/bin/agy')).toBe('/custom/bin/agy');
    });

    it('finds candidate path when custom path is not provided', () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => String(p).includes('.local/bin/agy'));
      const resolved = resolveAgyBinaryPath();
      expect(resolved).toContain('.local/bin/agy');
    });

    it('falls back to "agy" if no candidates exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(resolveAgyBinaryPath()).toBe('agy');
    });
  });

  describe('fetchAgyQuota', () => {
    it('fetches and parses agy quota JSON successfully', async () => {
      const mockStdout = JSON.stringify({
        command: {
          name: 'usage',
          data: {
            description: 'Quota limits description',
            groups: [
              {
                name: 'Gemini Models',
                description: 'Gemini group',
                buckets: [
                  {
                    id: 'gemini-5h',
                    name: 'Five Hour Limit Remaining',
                    window: '5h',
                    remaining_fraction: 0.45,
                    reset_time: '2026-09-13T19:07:49Z',
                  },
                  {
                    id: 'gemini-weekly',
                    name: 'Weekly Limit Remaining',
                    window: 'weekly',
                    remaining_fraction: 0.9,
                    reset_time: '2026-09-20T14:07:49Z',
                  },
                ],
              },
            ],
          },
        },
      });

      vi.mocked(childProcess.execFile).mockImplementation((_cmd, _args, _opts, callback?: any) => {
        if (callback) callback(null, mockStdout, '');
        return {} as any;
      });

      const res = await fetchAgyQuota();
      expect(res.success).toBe(true);
      expect(res.data?.groups).toHaveLength(1);
      expect(res.data?.groups[0].name).toBe('Gemini Models');
      expect(res.data?.groups[0].buckets[0].remainingFraction).toBe(0.45);
      expect(res.data?.groups[0].buckets[0].window).toBe('5h');
    });

    it('returns cached data within TTL', async () => {
      const mockStdout = JSON.stringify({
        command: {
          name: 'usage',
          data: {
            groups: [{ name: 'Group 1', buckets: [] }],
          },
        },
      });

      vi.mocked(childProcess.execFile).mockImplementation((_cmd, _args, _opts, callback?: any) => {
        if (callback) callback(null, mockStdout, '');
        return {} as any;
      });

      const first = await fetchAgyQuota();
      expect(first.success).toBe(true);
      expect(childProcess.execFile).toHaveBeenCalledTimes(1);

      // Second call should return cached without executing execFile again
      const second = await fetchAgyQuota();
      expect(second.success).toBe(true);
      expect(childProcess.execFile).toHaveBeenCalledTimes(1);
    });

    it('handles process error gracefully', async () => {
      vi.mocked(childProcess.execFile).mockImplementation((_cmd, _args, _opts, callback?: any) => {
        if (callback) callback(new Error('CLI failed'), '', 'Error stderr');
        return {} as any;
      });

      const res = await fetchAgyQuota({ forceRefresh: true });
      expect(res.success).toBe(false);
      expect(res.error).toContain('CLI failed');
    });

    it('handles JSON parse error gracefully', async () => {
      vi.mocked(childProcess.execFile).mockImplementation((_cmd, _args, _opts, callback?: any) => {
        if (callback) callback(null, 'not json', '');
        return {} as any;
      });

      const res = await fetchAgyQuota({ forceRefresh: true });
      expect(res.success).toBe(false);
    });
  });
});
