/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type {
  BrowserWorkflowDefinition,
  BrowserWorkflowExecutionResult,
  WorkflowStepResult,
  WorkflowStep,
} from '@/common/browser/workflowTypes';
import { GOOGLE_FLOW_SITE_CONFIG, INSTAGRAM_SITE_CONFIG, FACEBOOK_SITE_CONFIG } from '@/common/browser/sites';
import { getBrowserAutomationEngine } from './BrowserAutomationEngine';
import { getBrowserProfileService } from './BrowserProfileService';

export const STARTER_WORKFLOW_GOOGLE_FLOW: BrowserWorkflowDefinition = {
  id: 'google-flow-generate-and-download',
  name: 'Google Flow Generate & Download',
  description: 'Generate an AI video or image on Google Flow and download the completed asset to a workspace folder.',
  version: '1.0.0',
  site: 'google-flow',
  parameters: [
    {
      name: 'prompt',
      type: 'string',
      description: 'The creative prompt for image or video generation.',
      required: true,
    },
    {
      name: 'type',
      type: 'enum',
      description: 'Asset generation type.',
      defaultValue: 'video',
      options: ['video', 'image'],
    },
    {
      name: 'outputDir',
      type: 'string',
      description: 'Target workspace directory for saving the output.',
      defaultValue: '',
    },
  ],
  steps: [
    {
      id: 'step_open_flow',
      name: 'Open Google Flow Studio',
      action: 'open',
      value: GOOGLE_FLOW_SITE_CONFIG.baseUrl,
      description: 'Navigate to Google Flow main application',
    },
    {
      id: 'step_enter_prompt',
      name: 'Enter Prompt',
      action: 'type',
      locator: GOOGLE_FLOW_SITE_CONFIG.selectors.promptInput,
      value: '{{prompt}}',
      description: 'Fill in creative prompt',
    },
    {
      id: 'step_click_generate',
      name: 'Click Generate',
      action: 'click',
      locator: GOOGLE_FLOW_SITE_CONFIG.selectors.generateButton,
      description: 'Trigger asset generation',
    },
    {
      id: 'step_wait_result',
      name: 'Wait for Generation to Complete',
      action: 'wait',
      locator: GOOGLE_FLOW_SITE_CONFIG.selectors.resultAsset,
      timeoutMs: 600000, // 10 minutes
      description: 'Poll until generation finishes and media asset appears',
    },
    {
      id: 'step_click_download',
      name: 'Click Download Asset',
      action: 'click',
      locator: GOOGLE_FLOW_SITE_CONFIG.selectors.downloadButton,
      description: 'Trigger download button on completed asset',
    },
    {
      id: 'step_wait_download_finish',
      name: 'Wait for Download to Finish',
      action: 'download',
      value: '{{outputDir}}',
      timeoutMs: 600000,
      description: 'Verify downloaded file integrity and record final path',
    },
  ],
};

export const STARTER_WORKFLOW_SOCIAL_POST: BrowserWorkflowDefinition = {
  id: 'social-post',
  name: 'Social Media Post',
  description: 'Post media and caption to Instagram or Facebook using authenticated browser session.',
  version: '1.0.0',
  site: 'social',
  parameters: [
    {
      name: 'platform',
      type: 'enum',
      description: 'Target social media platform.',
      required: true,
      options: ['instagram', 'facebook'],
    },
    {
      name: 'mediaPath',
      type: 'string',
      description: 'Local absolute path to image or video file.',
      required: true,
    },
    {
      name: 'caption',
      type: 'string',
      description: 'Post caption text.',
      required: true,
    },
  ],
  steps: [
    // Dynamically resolved based on platform parameter in engine
  ],
};

export function interpolateTemplate(template: string, params: Record<string, unknown>): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, key) => {
    const val = params[key];
    return val !== undefined && val !== null ? String(val) : '';
  });
}

export class BrowserWorkflowEngine extends EventEmitter {
  private workflows: Map<string, BrowserWorkflowDefinition> = new Map();

  constructor() {
    super();
    this.registerWorkflow(STARTER_WORKFLOW_GOOGLE_FLOW);
    this.registerWorkflow(STARTER_WORKFLOW_SOCIAL_POST);
  }

  public registerWorkflow(workflow: BrowserWorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
  }

  public getWorkflows(): BrowserWorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  public getWorkflow(id: string): BrowserWorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  public resolveSocialSteps(platform: string): WorkflowStep[] {
    if (platform === 'facebook') {
      return [
        {
          id: 'step_fb_open',
          name: 'Open Facebook',
          action: 'open',
          value: FACEBOOK_SITE_CONFIG.baseUrl,
        },
        {
          id: 'step_fb_trigger',
          name: 'Open Create Post Dialog',
          action: 'click',
          locator: FACEBOOK_SITE_CONFIG.selectors.createPostTrigger,
        },
        {
          id: 'step_fb_upload',
          name: 'Upload Media',
          action: 'upload',
          locator: FACEBOOK_SITE_CONFIG.selectors.fileInput,
          value: '{{mediaPath}}',
        },
        {
          id: 'step_fb_caption',
          name: 'Type Caption',
          action: 'type',
          locator: FACEBOOK_SITE_CONFIG.selectors.postTextInput,
          value: '{{caption}}',
        },
        {
          id: 'step_fb_post',
          name: 'Submit Post',
          action: 'click',
          locator: FACEBOOK_SITE_CONFIG.selectors.postSubmitButton,
        },
      ];
    }

    // Default Instagram
    return [
      {
        id: 'step_ig_open',
        name: 'Open Instagram',
        action: 'open',
        value: INSTAGRAM_SITE_CONFIG.baseUrl,
      },
      {
        id: 'step_ig_new_post',
        name: 'Click New Post',
        action: 'click',
        locator: INSTAGRAM_SITE_CONFIG.selectors.newPostButton,
      },
      {
        id: 'step_ig_upload',
        name: 'Upload Media',
        action: 'upload',
        locator: INSTAGRAM_SITE_CONFIG.selectors.fileInput,
        value: '{{mediaPath}}',
      },
      {
        id: 'step_ig_next_crop',
        name: 'Next on Crop',
        action: 'click',
        locator: INSTAGRAM_SITE_CONFIG.selectors.nextButton,
        optional: true,
      },
      {
        id: 'step_ig_next_filter',
        name: 'Next on Filter',
        action: 'click',
        locator: INSTAGRAM_SITE_CONFIG.selectors.nextButton,
        optional: true,
      },
      {
        id: 'step_ig_caption',
        name: 'Write Caption',
        action: 'type',
        locator: INSTAGRAM_SITE_CONFIG.selectors.captionInput,
        value: '{{caption}}',
      },
      {
        id: 'step_ig_share',
        name: 'Click Share',
        action: 'click',
        locator: INSTAGRAM_SITE_CONFIG.selectors.shareSubmitButton,
      },
      {
        id: 'step_ig_verify',
        name: 'Wait for Confirmation',
        action: 'wait',
        locator: INSTAGRAM_SITE_CONFIG.selectors.postConfirmation,
        timeoutMs: 60000,
        optional: true,
      },
    ];
  }

  public async executeWorkflow(
    workflowId: string,
    params: Record<string, unknown> = {},
    options?: { profileId?: string; signal?: AbortSignal }
  ): Promise<BrowserWorkflowExecutionResult> {
    const startTime = Date.now();
    const workflow = this.getWorkflow(workflowId);

    if (!workflow) {
      return {
        success: false,
        workflowId,
        stepResults: [],
        outputs: {},
        error: `Workflow not found: ${workflowId}`,
        durationMs: 0,
      };
    }

    // Validate required parameters
    for (const paramDef of workflow.parameters) {
      if (paramDef.required && (params[paramDef.name] === undefined || params[paramDef.name] === '')) {
        return {
          success: false,
          workflowId,
          stepResults: [],
          outputs: {},
          error: `Missing required parameter: ${paramDef.name}`,
          durationMs: 0,
        };
      }
    }

    const steps =
      workflow.id === 'social-post'
        ? this.resolveSocialSteps(String(params.platform || 'instagram').toLowerCase())
        : workflow.steps;

    const engine = getBrowserAutomationEngine();
    const profileId = options?.profileId || getBrowserProfileService().getActiveProfile().id;
    const stepResults: WorkflowStepResult[] = [];
    const outputs: Record<string, unknown> = { ...params };

    for (const step of steps) {
      if (options?.signal?.aborted) {
        return {
          success: false,
          workflowId,
          stepResults,
          outputs,
          error: 'Workflow execution cancelled by user',
          durationMs: Date.now() - startTime,
        };
      }

      const stepStart = Date.now();
      const stepValue = interpolateTemplate(step.value || '', outputs);

      this.emit('stepStarted', {
        workflowId,
        stepId: step.id,
        stepName: step.name,
      });

      try {
        let stepData: unknown;

        switch (step.action) {
          case 'open': {
            const res = await engine.execute({
              action: 'navigate',
              profileId,
              params: { navigate: { url: stepValue, timeoutMs: step.timeoutMs || 30000 } },
            });
            if (!res.success) throw new Error(res.error || 'Failed to open page');
            stepData = res.data;
            break;
          }

          case 'click': {
            if (!step.locator) throw new Error('Click step missing locator');
            const res = await engine.execute({
              action: 'click',
              profileId,
              params: { click: { locator: step.locator, timeoutMs: step.timeoutMs || 10000 } },
            });
            if (!res.success) {
              if (step.optional) {
                // Ignore failure for optional step
                break;
              }
              throw new Error(res.error || 'Failed to click element');
            }
            stepData = res.data;
            break;
          }

          case 'type': {
            if (!step.locator) throw new Error('Type step missing locator');
            const res = await engine.execute({
              action: 'type',
              profileId,
              params: {
                type: {
                  locator: step.locator,
                  text: stepValue,
                  clearFirst: true,
                  timeoutMs: step.timeoutMs || 10000,
                },
              },
            });
            if (!res.success) throw new Error(res.error || 'Failed to type into element');
            stepData = res.data;
            break;
          }

          case 'wait': {
            const res = await engine.execute({
              action: 'waitFor',
              profileId,
              params: {
                waitFor: {
                  target: step.locator,
                  state: 'visible',
                  timeoutMs: step.timeoutMs || 30000,
                },
              },
            });
            if (!res.success && !step.optional) {
              throw new Error(res.error || 'Timed out waiting for element');
            }
            stepData = res.data;
            break;
          }

          case 'upload': {
            if (!step.locator) throw new Error('Upload step missing locator');
            const filePaths = stepValue ? [stepValue] : [];
            const res = await engine.execute({
              action: 'uploadFile',
              profileId,
              params: {
                uploadFile: {
                  locator: step.locator,
                  filePaths,
                  timeoutMs: step.timeoutMs || 20000,
                },
              },
            });
            if (!res.success) throw new Error(res.error || 'Failed to upload file');
            stepData = res.data;
            break;
          }

          case 'download': {
            const res = await engine.execute({
              action: 'download',
              profileId,
              params: {
                download: {
                  workspace: stepValue || undefined,
                  timeoutMs: step.timeoutMs || 600000,
                },
              },
            });
            if (!res.success) throw new Error(res.error || 'Download failed or timed out');
            stepData = res.data;
            if (res.data && typeof res.data === 'object' && 'savePath' in res.data) {
              outputs.downloadedFilePath = (res.data as { savePath: string }).savePath;
            }
            break;
          }

          case 'screenshot': {
            const res = await engine.execute({
              action: 'screenshot',
              profileId,
              params: { screenshot: {} },
            });
            stepData = res.data;
            break;
          }

          case 'snapshot': {
            const res = await engine.execute({
              action: 'getSnapshot',
              profileId,
              params: { getSnapshot: {} },
            });
            stepData = res.data;
            break;
          }

          default:
            throw new Error(`Unsupported workflow action: ${step.action}`);
        }

        const stepResult: WorkflowStepResult = {
          stepId: step.id,
          stepName: step.name,
          action: step.action,
          success: true,
          durationMs: Date.now() - stepStart,
          data: stepData,
        };
        stepResults.push(stepResult);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        let failureScreenshot: string | undefined;

        try {
          const shot = await engine.screenshot();
          failureScreenshot = shot.data;
        } catch {
          // Ignore
        }

        const stepResult: WorkflowStepResult = {
          stepId: step.id,
          stepName: step.name,
          action: step.action,
          success: false,
          durationMs: Date.now() - stepStart,
          error: errorMsg,
          screenshotOnFailure: failureScreenshot,
        };
        stepResults.push(stepResult);

        return {
          success: false,
          workflowId,
          stepResults,
          outputs,
          error: `Step "${step.name}" failed: ${errorMsg}`,
          durationMs: Date.now() - startTime,
        };
      }
    }

    return {
      success: true,
      workflowId,
      stepResults,
      outputs,
      durationMs: Date.now() - startTime,
    };
  }
}

let workflowEngineInstance: BrowserWorkflowEngine | null = null;

export function getBrowserWorkflowEngine(): BrowserWorkflowEngine {
  if (!workflowEngineInstance) {
    workflowEngineInstance = new BrowserWorkflowEngine();
  }
  return workflowEngineInstance;
}
