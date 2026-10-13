/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserSafetyGateService } from '@/process/services/browser/social/BrowserSafetyGateService';
import { SocialRateLimiter } from '@/process/services/browser/social/SocialRateLimiter';
import { SocialApiService } from '@/process/services/browser/social/SocialApiService';

// Mock BrowserWorkflowEngine
vi.mock('@/process/services/browser/BrowserWorkflowEngine', () => {
  return {
    getBrowserWorkflowEngine: () => ({
      executeWorkflow: vi.fn().mockImplementation((id) => {
        if (id === 'social-post') {
          return Promise.resolve({
            success: true,
            workflowId: id,
            stepResults: [],
            outputs: {},
            durationMs: 50,
          });
        }
        return Promise.resolve({ success: false, error: 'Workflow failed', durationMs: 0 });
      }),
    }),
  };
});

describe('Milestone 6: Social Posting & Safety Gates', () => {
  describe('BrowserSafetyGateService', () => {
    let gateService: BrowserSafetyGateService;

    beforeEach(() => {
      gateService = new BrowserSafetyGateService();
    });

    it('requires explicit approval and emits event by default', async () => {
      let emittedRequest: any = null;
      gateService.on('safetyApprovalRequest', (req) => {
        emittedRequest = req;
      });

      const promise = gateService.requestApproval('publish', 'Publish to Instagram', {
        platform: 'instagram',
        caption: 'Hello World',
      });

      expect(emittedRequest).not.toBeNull();
      expect(emittedRequest.actionType).toBe('publish');

      // User approves
      gateService.respondApproval(emittedRequest.id, true);
      const approved = await promise;
      expect(approved).toBe(true);
    });

    it('rejects action when user denies approval', async () => {
      let emittedRequest: any = null;
      gateService.on('safetyApprovalRequest', (req) => {
        emittedRequest = req;
      });

      const promise = gateService.requestApproval('delete', 'Delete account data', {});
      gateService.respondApproval(emittedRequest.id, false);
      const approved = await promise;
      expect(approved).toBe(false);
    });

    it('bypasses gate when autoApprove option or setting is enabled', async () => {
      const approved = await gateService.requestApproval('publish', 'Auto approved action', {}, { autoApprove: true });
      expect(approved).toBe(true);

      gateService.setAutoApprove('spend', true);
      const spendApproved = await gateService.requestApproval('spend', 'Spend credits', {});
      expect(spendApproved).toBe(true);
    });

    it('remembers approval choice when rememberChoice is true', async () => {
      let emittedRequest: any = null;
      gateService.on('safetyApprovalRequest', (req) => {
        emittedRequest = req;
      });

      const promise = gateService.requestApproval('send', 'Send direct message', {});
      gateService.respondApproval(emittedRequest.id, true, true);
      await promise;

      // Next request of same type auto-approves
      expect(gateService.isAutoApproveEnabled('send')).toBe(true);
      const secondApproved = await gateService.requestApproval('send', 'Send another message', {});
      expect(secondApproved).toBe(true);
    });
  });

  describe('SocialRateLimiter', () => {
    let rateLimiter: SocialRateLimiter;

    beforeEach(() => {
      rateLimiter = new SocialRateLimiter({ maxDailyPosts: 2 });
    });

    it('enforces configurable daily post cap per platform', () => {
      expect(rateLimiter.checkDailyCap('instagram').allowed).toBe(true);

      rateLimiter.recordPost('instagram');
      expect(rateLimiter.getDailyCount('instagram')).toBe(1);
      expect(rateLimiter.checkDailyCap('instagram').allowed).toBe(true);

      rateLimiter.recordPost('instagram');
      expect(rateLimiter.getDailyCount('instagram')).toBe(2);
      expect(rateLimiter.checkDailyCap('instagram').allowed).toBe(false);

      // Other platform has separate count
      expect(rateLimiter.checkDailyCap('facebook').allowed).toBe(true);
    });

    it('executes tasks sequentially through acquireLock mutex', async () => {
      const order: number[] = [];

      const p1 = rateLimiter.acquireLock(async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push(1);
      });

      const p2 = rateLimiter.acquireLock(async () => {
        order.push(2);
      });

      await Promise.all([p1, p2]);
      expect(order).toEqual([1, 2]);
    });

    it('applies human pacing jitter within specified range', async () => {
      const delay = await rateLimiter.applyHumanPacing(5, 15);
      expect(delay).toBeGreaterThanOrEqual(5);
      expect(delay).toBeLessThanOrEqual(15);
    });
  });

  describe('SocialApiService', () => {
    let apiService: SocialApiService;

    beforeEach(() => {
      apiService = new SocialApiService();
    });

    it('falls back to browser automation when no official credentials exist', async () => {
      const res = await apiService.post({
        platform: 'instagram',
        caption: 'Test post',
        mediaPath: '/media/test.jpg',
        autoApprove: true,
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe('browser_automation');
      expect(res.platform).toBe('instagram');
    });

    it('aborts when user rejects safety gate approval', async () => {
      const gate = (
        await import('@/process/services/browser/social/BrowserSafetyGateService')
      ).getBrowserSafetyGateService();
      gate.once('safetyApprovalRequest', (req) => {
        gate.respondApproval(req.id, false);
      });

      const res = await apiService.post({
        platform: 'facebook',
        caption: 'Rejected post',
        mediaPath: '/media/test.jpg',
        autoApprove: false,
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('rejected');
    });
  });
});
