/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import type {
  BrowserActionRequest,
  LocatorTarget,
  SnapshotOptions,
  ScreenshotOptions,
  DownloadOptions,
} from '@/common/browser/types';
import { getBrowserAutomationEngine } from './BrowserAutomationEngine';
import { getBrowserDownloadManager } from './BrowserDownloadManager';
import { getBrowserProfileService } from './BrowserProfileService';

export type BrowserToolName =
  | 'browser_open'
  | 'browser_click'
  | 'browser_type'
  | 'browser_press_key'
  | 'browser_select'
  | 'browser_wait'
  | 'browser_snapshot'
  | 'browser_screenshot'
  | 'browser_download'
  | 'browser_upload'
  | 'browser_list_tabs'
  | 'browser_close'
  | 'browser_set_profile';

export type BrowserToolDefinition = {
  name: BrowserToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const BROWSER_TOOL_DEFINITIONS: BrowserToolDefinition[] = [
  {
    name: 'browser_open',
    description: 'Open a URL in the persistent browser session.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The web address to navigate to.' },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
        timeoutMs: { type: 'number', description: 'Navigation timeout in ms.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'browser_click',
    description: 'Click on a web element using resilient locators (text, role, label, or selector).',
    parameters: {
      type: 'object',
      properties: {
        locator: {
          oneOf: [{ type: 'string' }, { type: 'object' }],
          description: 'Element locator string or resilient locator object.',
        },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
        clickCount: { type: 'number', description: 'Click count (1 for single, 2 for double).' },
      },
      required: ['locator'],
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field using resilient locators.',
    parameters: {
      type: 'object',
      properties: {
        locator: {
          oneOf: [{ type: 'string' }, { type: 'object' }],
          description: 'Target input element locator.',
        },
        text: { type: 'string', description: 'Text string to type.' },
        clearFirst: { type: 'boolean', description: 'Whether to clear existing text first.' },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
      required: ['locator', 'text'],
    },
  },
  {
    name: 'browser_press_key',
    description: 'Press a keyboard key (e.g. Enter, Escape, ArrowDown, Backspace).',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name to press.' },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
      required: ['key'],
    },
  },
  {
    name: 'browser_select',
    description: 'Select an option from a dropdown or select element.',
    parameters: {
      type: 'object',
      properties: {
        locator: {
          oneOf: [{ type: 'string' }, { type: 'object' }],
          description: 'Target select element locator.',
        },
        values: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
          description: 'Value(s) or option label(s) to select.',
        },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
      required: ['locator', 'values'],
    },
  },
  {
    name: 'browser_wait',
    description:
      'Wait for an element, text, or network state. Supports long-running waits (e.g. up to 10 minutes for video generation).',
    parameters: {
      type: 'object',
      properties: {
        locator: {
          oneOf: [{ type: 'string' }, { type: 'object' }],
          description: 'Optional element to wait for.',
        },
        state: {
          type: 'string',
          enum: ['attached', 'visible', 'hidden', 'networkidle'],
          description: 'Target state to wait for.',
        },
        text: { type: 'string', description: 'Visible text to wait for.' },
        timeoutMs: {
          type: 'number',
          description: 'Timeout in ms (default 30000, max 600000 for generation).',
        },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
    },
  },
  {
    name: 'browser_snapshot',
    description: 'Capture the accessibility tree and structural snapshot of the current page for LLM reasoning.',
    parameters: {
      type: 'object',
      properties: {
        includeAccessibility: { type: 'boolean', description: 'Include accessibility nodes.' },
        maxDepth: { type: 'number', description: 'Maximum tree depth (default 10).' },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Capture a visual screenshot of the current page as base64.',
    parameters: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', description: 'Whether to capture the entire scrollable page.' },
        format: { type: 'string', enum: ['png', 'jpeg'], description: 'Image format.' },
        quality: { type: 'number', description: 'Image quality (0-100).' },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
    },
  },
  {
    name: 'browser_download',
    description:
      'Intercept or initiate a download and save it to the workspace download folder. Verifies file completion and returns the final path.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Optional URL or blob: URL to trigger download for.' },
        expectedFilename: { type: 'string', description: 'Expected filename substring to match.' },
        workspace: { type: 'string', description: 'Workspace folder for routing downloaded files.' },
        timeoutMs: {
          type: 'number',
          description: 'Max wait time in ms (default up to 10 minutes for media).',
        },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
    },
  },
  {
    name: 'browser_upload',
    description: 'Upload local files into a file input element.',
    parameters: {
      type: 'object',
      properties: {
        locator: {
          oneOf: [{ type: 'string' }, { type: 'object' }],
          description: 'Target file input locator.',
        },
        filePaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Absolute file paths to upload.',
        },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
      required: ['locator', 'filePaths'],
    },
  },
  {
    name: 'browser_list_tabs',
    description: 'List open tabs and their titles and URLs in the current browser session.',
    parameters: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
    },
  },
  {
    name: 'browser_close',
    description: 'Close the browser or a specific tab.',
    parameters: {
      type: 'object',
      properties: {
        tabId: { type: 'string', description: 'Optional tab ID to close.' },
        profileId: { type: 'string', description: 'Optional named profile ID.' },
      },
    },
  },
  {
    name: 'browser_set_profile',
    description: 'Switch the active browser profile for subsequent automation steps.',
    parameters: {
      type: 'object',
      properties: {
        profileId: { type: 'string', description: 'Profile ID to activate.' },
      },
      required: ['profileId'],
    },
  },
];

export type BrowserToolProgressEvent = {
  taskId: string;
  tool: BrowserToolName;
  phase: 'started' | 'progress' | 'completed' | 'failed' | 'cancelled';
  message: string;
  progressPercent?: number;
};

export type BrowserToolExecutionResult<T = unknown> = {
  success: boolean;
  tool: BrowserToolName;
  data?: T;
  error?: string;
  failureScreenshot?: string;
  durationMs: number;
};

export class BrowserToolService extends EventEmitter {
  private activeTasks: Map<string, { abortController: AbortController; tool: BrowserToolName }> = new Map();

  public getToolDefinitions(): BrowserToolDefinition[] {
    return BROWSER_TOOL_DEFINITIONS;
  }

  public cancelTask(taskId: string): boolean {
    const task = this.activeTasks.get(taskId);
    if (!task) return false;
    task.abortController.abort();
    this.activeTasks.delete(taskId);
    this.emit('progress', {
      taskId,
      tool: task.tool,
      phase: 'cancelled',
      message: 'Tool execution cancelled by user.',
    } satisfies BrowserToolProgressEvent);
    return true;
  }

  public async executeTool(
    tool: BrowserToolName,
    args: Record<string, unknown> = {},
    options?: { taskId?: string; signal?: AbortSignal }
  ): Promise<BrowserToolExecutionResult> {
    const startTime = Date.now();
    const taskId = options?.taskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const abortController = new AbortController();

    if (options?.signal) {
      options.signal.addEventListener('abort', () => abortController.abort());
    }

    this.activeTasks.set(taskId, { abortController, tool });

    this.emit('progress', {
      taskId,
      tool,
      phase: 'started',
      message: `Executing ${tool}...`,
    } satisfies BrowserToolProgressEvent);

    try {
      if (abortController.signal.aborted) {
        throw new Error('Operation aborted');
      }

      const engine = getBrowserAutomationEngine();
      const profileService = getBrowserProfileService();
      const profileId = (args.profileId as string) || profileService.getActiveProfile().id;

      let resultData: unknown;

      switch (tool) {
        case 'browser_open': {
          const res = await engine.execute({
            action: 'navigate',
            profileId,
            params: {
              navigate: {
                url: String(args.url || ''),
                timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : 30000,
              },
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to navigate');
          resultData = res.data;
          break;
        }

        case 'browser_click': {
          const res = await engine.execute({
            action: 'click',
            profileId,
            params: {
              click: {
                locator: args.locator as LocatorTarget,
                clickCount: args.clickCount ? Number(args.clickCount) : 1,
              },
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to click');
          resultData = res.data;
          break;
        }

        case 'browser_type': {
          const res = await engine.execute({
            action: 'type',
            profileId,
            params: {
              type: {
                locator: args.locator as LocatorTarget,
                text: String(args.text || ''),
                clearFirst: Boolean(args.clearFirst),
              },
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to type');
          resultData = res.data;
          break;
        }

        case 'browser_press_key': {
          const res = await engine.execute({
            action: 'pressKey',
            profileId,
            params: {
              pressKey: { key: String(args.key || '') },
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to press key');
          resultData = res.data;
          break;
        }

        case 'browser_select': {
          const res = await engine.execute({
            action: 'select',
            profileId,
            params: {
              select: {
                locator: args.locator as LocatorTarget,
                values: args.values as string | string[],
              },
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to select');
          resultData = res.data;
          break;
        }

        case 'browser_wait': {
          const timeoutMs = args.timeoutMs ? Number(args.timeoutMs) : 30000;
          const res = await engine.execute({
            action: 'waitFor',
            profileId,
            params: {
              waitFor: {
                target: args.locator as LocatorTarget,
                state: args.state as 'attached' | 'visible' | 'hidden' | 'networkidle',
                text: args.text as string,
                timeoutMs,
              },
            },
          });
          if (!res.success) throw new Error(res.error || 'Wait condition not met');
          resultData = res.data;
          break;
        }

        case 'browser_snapshot': {
          const res = await engine.execute({
            action: 'getSnapshot',
            profileId,
            params: {
              getSnapshot: args as SnapshotOptions,
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to get snapshot');
          resultData = res.data;
          break;
        }

        case 'browser_screenshot': {
          const res = await engine.execute({
            action: 'screenshot',
            profileId,
            params: {
              screenshot: args as ScreenshotOptions,
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to capture screenshot');
          resultData = res.data;
          break;
        }

        case 'browser_download': {
          const downloadManager = getBrowserDownloadManager();
          const downloadOptions: DownloadOptions = {
            url: args.url as string,
            expectedFilename: args.expectedFilename as string,
            workspace: args.workspace as string,
            timeoutMs: args.timeoutMs ? Number(args.timeoutMs) : 600000,
            profileId,
          };

          const res = await engine.execute({
            action: 'download',
            profileId,
            params: { download: downloadOptions },
          });

          if (!res.success) throw new Error(res.error || 'Download failed');
          resultData = res.data;
          break;
        }

        case 'browser_upload': {
          const res = await engine.execute({
            action: 'uploadFile',
            profileId,
            params: {
              uploadFile: {
                locator: args.locator as LocatorTarget,
                filePaths: (args.filePaths as string[]) || [],
              },
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to upload files');
          resultData = res.data;
          break;
        }

        case 'browser_list_tabs': {
          const res = await engine.execute({
            action: 'manageTabs',
            profileId,
            params: { manageTabs: { action: 'list' } },
          });
          if (!res.success) throw new Error(res.error || 'Failed to list tabs');
          resultData = res.data;
          break;
        }

        case 'browser_close': {
          const res = await engine.execute({
            action: 'manageTabs',
            profileId,
            params: {
              manageTabs: {
                action: 'close',
                tabId: args.tabId as string,
              },
            },
          });
          if (!res.success) throw new Error(res.error || 'Failed to close tab');
          resultData = res.data;
          break;
        }

        case 'browser_set_profile': {
          const targetId = String(args.profileId || '');
          const profile = profileService.setActiveProfile(targetId);
          resultData = { activeProfile: profile };
          break;
        }

        default:
          throw new Error(`Unknown tool: ${tool}`);
      }

      if (abortController.signal.aborted) {
        throw new Error('Tool execution cancelled by user');
      }

      this.activeTasks.delete(taskId);
      this.emit('progress', {
        taskId,
        tool,
        phase: 'completed',
        message: `${tool} completed successfully.`,
        progressPercent: 100,
      } satisfies BrowserToolProgressEvent);

      return {
        success: true,
        tool,
        data: resultData,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      this.activeTasks.delete(taskId);
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.emit('progress', {
        taskId,
        tool,
        phase: 'failed',
        message: errorMsg,
      } satisfies BrowserToolProgressEvent);

      return {
        success: false,
        tool,
        error: errorMsg,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

let toolServiceInstance: BrowserToolService | null = null;

export function getBrowserToolService(): BrowserToolService {
  if (!toolServiceInstance) {
    toolServiceInstance = new BrowserToolService();
  }
  return toolServiceInstance;
}
