/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserToolService, BROWSER_TOOL_DEFINITIONS } from '@/process/services/browser/BrowserToolService';
import { ROLE_DEFINITIONS } from '@/process/services/teamwork/roleDefinitions';
import { DefaultTeamworkRunner } from '@/process/services/teamwork/orchestrator';

// Mock dependencies
vi.mock('@/process/services/browser/BrowserAutomationEngine', () => {
  return {
    getBrowserAutomationEngine: () => ({
      execute: vi.fn().mockImplementation(async (req) => {
        if (req.action === 'waitFor') {
          await new Promise((r) => setTimeout(r, 20));
        }
        if (req.action === 'navigate' && req.params.navigate?.url === 'https://invalid-error.test') {
          return {
            success: false,
            action: req.action,
            error: 'Failed to load URL',
            durationMs: 10,
          };
        }
        return {
          success: true,
          action: req.action,
          data: { handled: true, action: req.action },
          durationMs: 10,
        };
      }),
    }),
  };
});

vi.mock('@/process/services/browser/BrowserProfileService', () => {
  return {
    getBrowserProfileService: () => ({
      getActiveProfile: () => ({ id: 'default', name: 'Default' }),
      setActiveProfile: (id: string) => ({ id, name: id }),
    }),
  };
});

vi.mock('@/process/services/browser/BrowserDownloadManager', () => {
  return {
    getBrowserDownloadManager: () => ({
      waitForDownload: vi.fn().mockResolvedValue({
        id: 'dl_123',
        filename: 'video.mp4',
        savePath: '/downloads/video.mp4',
        state: 'completed',
        totalBytes: 2048,
      }),
    }),
  };
});

describe('BrowserToolService', () => {
  let service: BrowserToolService;

  beforeEach(() => {
    service = new BrowserToolService();
  });

  describe('Tool Definitions', () => {
    it('defines all required browser tools with schemas', () => {
      const defs = service.getToolDefinitions();
      expect(defs).toHaveLength(13);

      const toolNames = defs.map((d) => d.name);
      expect(toolNames).toContain('browser_open');
      expect(toolNames).toContain('browser_click');
      expect(toolNames).toContain('browser_type');
      expect(toolNames).toContain('browser_press_key');
      expect(toolNames).toContain('browser_select');
      expect(toolNames).toContain('browser_wait');
      expect(toolNames).toContain('browser_snapshot');
      expect(toolNames).toContain('browser_screenshot');
      expect(toolNames).toContain('browser_download');
      expect(toolNames).toContain('browser_upload');
      expect(toolNames).toContain('browser_list_tabs');
      expect(toolNames).toContain('browser_close');
      expect(toolNames).toContain('browser_set_profile');
    });
  });

  describe('Tool Execution', () => {
    it('executes browser_open and emits progress events', async () => {
      const progressEvents: unknown[] = [];
      service.on('progress', (e) => progressEvents.push(e));

      const res = await service.executeTool('browser_open', { url: 'https://example.com' });
      expect(res.success).toBe(true);
      expect(res.tool).toBe('browser_open');

      expect(progressEvents.length).toBeGreaterThanOrEqual(2);
      expect(progressEvents[0]).toMatchObject({ phase: 'started', tool: 'browser_open' });
      expect(progressEvents[progressEvents.length - 1]).toMatchObject({
        phase: 'completed',
        tool: 'browser_open',
      });
    });

    it('executes browser_click with resilient locator', async () => {
      const res = await service.executeTool('browser_click', {
        locator: { role: 'button', name: 'Generate' },
      });
      expect(res.success).toBe(true);
    });

    it('executes browser_type with text and clearFirst', async () => {
      const res = await service.executeTool('browser_type', {
        locator: { label: 'Prompt' },
        text: 'A futuristic city timelapse at night',
        clearFirst: true,
      });
      expect(res.success).toBe(true);
    });

    it('executes browser_set_profile and updates active profile', async () => {
      const res = await service.executeTool('browser_set_profile', {
        profileId: 'social-profile',
      });
      expect(res.success).toBe(true);
      expect((res.data as any).activeProfile.id).toBe('social-profile');
    });

    it('returns error result when engine action fails', async () => {
      const res = await service.executeTool('browser_open', { url: 'https://invalid-error.test' });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Failed to load URL');
    });

    it('handles cancellation via cancelTask', async () => {
      const taskId = 'test_cancel_task';
      // Simulate task started
      const promise = service.executeTool('browser_wait', { text: 'Loading...', timeoutMs: 10000 }, { taskId });
      service.cancelTask(taskId);
      const res = await promise;
      // It should either return error or operation aborted
      expect(res.success).toBe(false);
    });
  });

  describe('Teamwork Role & Runner Integration', () => {
    it('grants browser actions to Worker and Explorer roles', () => {
      const workerActions = ROLE_DEFINITIONS.worker.allowedActions;
      const explorerActions = ROLE_DEFINITIONS.explorer.allowedActions;

      expect(workerActions).toContain('browser_open');
      expect(workerActions).toContain('browser_click');
      expect(workerActions).toContain('browser_download');

      expect(explorerActions).toContain('browser_open');
      expect(explorerActions).toContain('browser_snapshot');
      expect(explorerActions).toContain('browser_screenshot');
    });

    it('DefaultTeamworkRunner dispatches browser tool calls for browser milestones', async () => {
      const runner = new DefaultTeamworkRunner();

      const workerRes = await runner.runSubagent({
        role: 'worker',
        milestone: {
          id: 'm1',
          title: 'Google Flow video generation and download',
          description: 'Automate browser navigation, prompt entry, and download',
          acceptanceCriteria: ['Video downloaded'],
          targetFiles: [],
          status: 'in_progress',
        },
        workspace: '/test/workspace',
      });

      expect(workerRes.success).toBe(true);
      expect(workerRes.toolCalls).toContain('browser_open');
      expect(workerRes.toolCalls).toContain('browser_download');
      expect(workerRes.output).toContain('workspace/browser-downloads/');

      const explorerRes = await runner.runSubagent({
        role: 'explorer',
        milestone: {
          id: 'm1',
          title: 'Explore Google Flow page selectors',
          description: 'Map web page elements and capture snapshot',
          acceptanceCriteria: ['Snapshot captured'],
          targetFiles: [],
          status: 'in_progress',
        },
        workspace: '/test/workspace',
      });

      expect(explorerRes.success).toBe(true);
      expect(explorerRes.toolCalls).toContain('browser_snapshot');
    });
  });
});
