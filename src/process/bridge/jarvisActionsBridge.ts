/**
 * @license
 * Copyright 2025 NovaMaster
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as http from 'http';

const execAsync = promisify(exec);

const JARVIS_BACKEND_URL = 'http://localhost:8765';

/**
 * Jarvis Actions Bridge
 *
 * Exposes real Jarvis tools from Mark-XXX/actions/ as AionUi IPC commands.
 * Each action calls the Jarvis backend API or executes Python scripts directly.
 *
 * Source: /home/faramix/Mark-XXX/actions/
 */

interface JarvisActionArgs {
  action: string;
  params?: Record<string, unknown>;
}

interface JarvisActionResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Health check on Jarvis backend
 */
async function checkJarvisHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`${JARVIS_BACKEND_URL}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Execute browser control action
 * Maps to: actions/browser_control.py
 */
async function execBrowserControl(params: {
  url?: string;
  action?: 'open' | 'close' | 'screenshot' | 'extract';
}): Promise<JarvisActionResponse> {
  try {
    const { url = 'https://google.com', action = 'open' } = params;

    // Call Jarvis backend API
    const response = await fetch(`${JARVIS_BACKEND_URL}/api/browser`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, action }),
    });

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Browser control failed',
    };
  }
}

/**
 * Execute code helper action
 * Maps to: actions/code_helper.py
 */
async function execCodeHelper(params: {
  code?: string;
  action?: 'review' | 'explain' | 'generate' | 'refactor';
  language?: string;
}): Promise<JarvisActionResponse> {
  try {
    const { code = '', action = 'review', language = 'typescript' } = params;

    const response = await fetch(`${JARVIS_BACKEND_URL}/api/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, action, language }),
    });

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Code helper failed',
    };
  }
}

/**
 * Execute dev agent action
 * Maps to: actions/dev_agent.py
 */
async function execDevAgent(params: {
  task?: string;
  project_path?: string;
  action?: 'scaffold' | 'test' | 'debug' | 'deploy';
}): Promise<JarvisActionResponse> {
  try {
    const { task = '', project_path = process.cwd(), action = 'scaffold' } = params;

    const response = await fetch(`${JARVIS_BACKEND_URL}/api/dev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, project_path, action }),
    });

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Dev agent failed',
    };
  }
}

/**
 * Execute image generation action
 * Maps to: actions/media_generate.py
 */
async function execGenerateImage(params: {
  prompt: string;
  n?: number;
  provider?: 'xai' | 'comfyui';
}): Promise<JarvisActionResponse> {
  try {
    const { prompt, n = 1, provider = 'xai' } = params;

    const response = await fetch(`${JARVIS_BACKEND_URL}/api/media/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, n, provider }),
    });

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Image generation failed',
    };
  }
}

/**
 * Execute video generation action
 * Maps to: actions/media_generate.py
 */
async function execGenerateVideo(params: {
  prompt: string;
  duration?: number;
  mode?: 'preview' | 'speed' | 'production';
}): Promise<JarvisActionResponse> {
  try {
    const { prompt, duration = 4, mode = 'preview' } = params;

    const response = await fetch(`${JARVIS_BACKEND_URL}/api/media/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, duration, mode }),
    });

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Video generation failed',
    };
  }
}

/**
 * Execute file controller action
 * Maps to: actions/file_controller.py
 */
async function execFileController(params: {
  action: 'read' | 'write' | 'delete' | 'move' | 'search';
  path?: string;
  content?: string;
  pattern?: string;
}): Promise<JarvisActionResponse> {
  try {
    const { action, path = '', content = '', pattern = '' } = params;

    const response = await fetch(`${JARVIS_BACKEND_URL}/api/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, path, content, pattern }),
    });

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'File operation failed',
    };
  }
}

/**
 * List all available Jarvis actions
 */
function listActions(): string[] {
  return [
    'browser_control',
    'code_helper',
    'dev_agent',
    'generate_image',
    'generate_video',
    'file_controller',
  ];
}

/**
 * Main action router
 */
async function executeJarvisAction(args: JarvisActionArgs): Promise<JarvisActionResponse> {
  const { action, params = {} } = args;

  switch (action) {
    case 'browser_control':
      return execBrowserControl(params as any);
    case 'code_helper':
      return execCodeHelper(params as any);
    case 'dev_agent':
      return execDevAgent(params as any);
    case 'generate_image':
      return execGenerateImage(params as any);
    case 'generate_video':
      return execGenerateVideo(params as any);
    case 'file_controller':
      return execFileController(params as any);
    default:
      return {
        success: false,
        error: `Unknown Jarvis action: ${action}`,
      };
  }
}

/**
 * Initialize IPC bridge
 */
export function initJarvisActionsBridge(): void {
  console.log('[JarvisActions] Initializing bridge...');

  // Health check endpoint
  ipcBridge.register('jarvis:status', async () => {
    const healthy = await checkJarvisHealth();
    return {
      healthy,
      backend: JARVIS_BACKEND_URL,
      actions: listActions(),
    };
  });

  // List available actions
  ipcBridge.register('jarvis:action:list', () => {
    return listActions();
  });

  // Execute any action
  ipcBridge.register('jarvis:action:invoke', async (args: JarvisActionArgs) => {
    return executeJarvisAction(args);
  });

  // Direct action endpoints (for convenience)
  ipcBridge.register('jarvis:browser', async (params: any) => execBrowserControl(params));
  ipcBridge.register('jarvis:code', async (params: any) => execCodeHelper(params));
  ipcBridge.register('jarvis:dev', async (params: any) => execDevAgent(params));
  ipcBridge.register('jarvis:image', async (params: any) => execGenerateImage(params));
  ipcBridge.register('jarvis:video', async (params: any) => execGenerateVideo(params));
  ipcBridge.register('jarvis:file', async (params: any) => execFileController(params));

  console.log('[JarvisActions] Bridge initialized with 6 actions');
}
