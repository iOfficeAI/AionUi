/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BrowserWorkflowEngine,
  interpolateTemplate,
  STARTER_WORKFLOW_GOOGLE_FLOW,
  STARTER_WORKFLOW_SOCIAL_POST,
} from '@/process/services/browser/BrowserWorkflowEngine';

// Mock BrowserAutomationEngine
vi.mock('@/process/services/browser/BrowserAutomationEngine', () => {
  return {
    getBrowserAutomationEngine: () => ({
      execute: vi.fn().mockImplementation((req) => {
        if (req.action === 'navigate' && req.params.navigate?.url === 'https://invalid-error.test') {
          return Promise.resolve({
            success: false,
            action: req.action,
            error: 'Failed to navigate',
            durationMs: 10,
          });
        }
        if (req.action === 'download') {
          return Promise.resolve({
            success: true,
            action: 'download',
            data: {
              id: 'dl_999',
              filename: 'generated_flow_video.mp4',
              savePath: '/workspace/browser-downloads/generated_flow_video.mp4',
              totalBytes: 5242880,
            },
            durationMs: 25,
          });
        }
        return Promise.resolve({
          success: true,
          action: req.action,
          data: { handled: true },
          durationMs: 15,
        });
      }),
      screenshot: vi.fn().mockResolvedValue({
        data: 'data:image/png;base64,failure_shot_mock',
      }),
    }),
  };
});

vi.mock('@/process/services/browser/BrowserProfileService', () => {
  return {
    getBrowserProfileService: () => ({
      getActiveProfile: () => ({ id: 'default', name: 'Default' }),
    }),
  };
});

describe('BrowserWorkflowEngine', () => {
  let engine: BrowserWorkflowEngine;

  beforeEach(() => {
    engine = new BrowserWorkflowEngine();
  });

  describe('interpolateTemplate', () => {
    it('substitutes single and multiple template variables', () => {
      const template = 'Hello {{name}}, welcome to {{service}}!';
      const res = interpolateTemplate(template, { name: 'Alice', service: 'AionUi' });
      expect(res).toBe('Hello Alice, welcome to AionUi!');
    });

    it('gracefully handles missing parameters with empty string', () => {
      const template = 'Path: {{dir}}/{{filename}}';
      const res = interpolateTemplate(template, { filename: 'output.mp4' });
      expect(res).toBe('Path: /output.mp4');
    });
  });

  describe('Starter Workflows Registration', () => {
    it('ships starter workflows for Google Flow and Social Post', () => {
      const list = engine.getWorkflows();
      expect(list.length).toBeGreaterThanOrEqual(2);

      const flow = engine.getWorkflow(STARTER_WORKFLOW_GOOGLE_FLOW.id);
      expect(flow).toBeDefined();
      expect(flow?.parameters.some((p) => p.name === 'prompt')).toBe(true);
      expect(flow?.steps.length).toBeGreaterThan(0);

      const social = engine.getWorkflow(STARTER_WORKFLOW_SOCIAL_POST.id);
      expect(social).toBeDefined();
      expect(social?.parameters.some((p) => p.name === 'platform')).toBe(true);
    });
  });

  describe('Workflow Execution', () => {
    it('rejects execution when required parameters are missing', async () => {
      const res = await engine.executeWorkflow('google-flow-generate-and-download', {});
      expect(res.success).toBe(false);
      expect(res.error).toContain('Missing required parameter: prompt');
    });

    it('rejects execution of nonexistent workflow', async () => {
      const res = await engine.executeWorkflow('non-existent-wf');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Workflow not found');
    });

    it('executes Google Flow workflow and captures downloaded file path', async () => {
      const stepEvents: string[] = [];
      engine.on('stepStarted', (evt) => stepEvents.push(evt.stepName));

      const res = await engine.executeWorkflow('google-flow-generate-and-download', {
        prompt: 'A futuristic city skyline with flying cars',
        type: 'video',
        outputDir: '/workspace/output',
      });

      expect(res.success).toBe(true);
      expect(res.workflowId).toBe('google-flow-generate-and-download');
      expect(res.stepResults.length).toBe(6);
      expect(stepEvents).toContain('Open Google Flow Studio');
      expect(stepEvents).toContain('Enter Prompt');
      expect(stepEvents).toContain('Click Generate');
      expect(stepEvents).toContain('Wait for Download to Finish');

      expect(res.outputs.downloadedFilePath).toBe('/workspace/browser-downloads/generated_flow_video.mp4');
    });

    it('executes Social Post workflow for Instagram', async () => {
      const res = await engine.executeWorkflow('social-post', {
        platform: 'instagram',
        mediaPath: '/media/post.jpg',
        caption: 'Exciting announcement! #ai #agents',
      });

      expect(res.success).toBe(true);
      expect(res.stepResults.length).toBeGreaterThan(3);
    });

    it('executes Social Post workflow for Facebook', async () => {
      const res = await engine.executeWorkflow('social-post', {
        platform: 'facebook',
        mediaPath: '/media/video.mp4',
        caption: 'Check out our new release!',
      });

      expect(res.success).toBe(true);
      expect(res.stepResults.some((s) => s.stepName === 'Open Facebook')).toBe(true);
    });

    it('handles cancellation via AbortSignal', async () => {
      const controller = new AbortController();
      controller.abort();

      const res = await engine.executeWorkflow(
        'google-flow-generate-and-download',
        { prompt: 'Test' },
        { signal: controller.signal }
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('cancelled by user');
    });
  });
});
