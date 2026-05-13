import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { capturedConfig } = vi.hoisted(() => ({
  capturedConfig: { value: null as Record<string, unknown> | null },
}));

vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    paths: { isPackaged: () => false, getAppPath: () => null },
    worker: {
      fork: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        postMessage: vi.fn(),
        kill: vi.fn(),
      })),
    },
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { responseStream: { emit: vi.fn() } },
    conversation: {
      confirmation: {
        add: { emit: vi.fn() },
        update: { emit: vi.fn() },
        remove: { emit: vi.fn() },
      },
      responseStream: { emit: vi.fn() },
    },
  },
}));

vi.mock('@process/channels/agent/ChannelEventBus', () => ({
  channelEventBus: { emitAgentMessage: vi.fn() },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({ updateConversation: vi.fn() })),
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  },
  getAssistantsDir: () => '/assistants',
}));

vi.mock('@process/utils/message', () => ({
  addMessage: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  nextTickToLocalFinish: vi.fn(),
}));

vi.mock('@process/utils/previewUtils', () => ({
  handlePreviewOpenEvent: vi.fn(),
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: { setProcessing: vi.fn() },
}));

vi.mock('@process/utils/mainLogger', () => ({
  mainLog: vi.fn(),
  mainWarn: vi.fn(),
  mainError: vi.fn(),
}));

vi.mock('@process/extensions', () => ({
  ExtensionRegistry: { getInstance: () => ({ getAcpAdapters: () => [] }) },
}));

vi.mock('@/common/utils', () => ({
  parseError: vi.fn((e: unknown) => String(e)),
  uuid: vi.fn(() => 'mock-uuid'),
}));

vi.mock('@process/task/MessageMiddleware', () => ({
  extractTextFromMessage: vi.fn(),
  processCronInMessage: vi.fn(),
}));

vi.mock('@process/task/ThinkTagDetector', () => ({
  stripThinkTags: vi.fn((s: string) => s),
}));

vi.mock('@process/task/CronCommandDetector', () => ({
  hasCronCommands: vi.fn(() => false),
}));

vi.mock('@process/task/agentUtils', () => ({
  prepareFirstMessageWithSkillsIndex: vi.fn(async (content: string) => ({ content, loadedSkills: [] })),
}));

vi.mock('@process/acp/compat', () => {
  const MockAcpAgentV2 = vi.fn(function (this: Record<string, unknown>, config: Record<string, unknown>) {
    capturedConfig.value = config;
    this.start = vi.fn(async () => {});
    this.sendMessage = vi.fn(async () => ({ success: true }));
    this.getModelInfo = vi.fn(() => null);
    this.getSessionState = vi.fn(() => null);
    this.stop = vi.fn();
    this.kill = vi.fn();
    this.on = vi.fn().mockReturnThis();
  });
  return { AcpAgentV2: MockAcpAgentV2 };
});

import AcpAgentManager from '../../src/process/task/AcpAgentManager';
import {
  resolveOpencodeConfigPath,
  resolveOpencodeConfigRoot,
} from '../../src/process/services/mcpServices/agents/OpencodeMcpAgent';

const originalHome = process.env.HOME;
const originalPath = process.env.PATH;

function createExecutable(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '#!/bin/sh\nexit 0\n', 'utf8');
  fs.chmodSync(filePath, 0o755);
}

describe('AcpAgentManager Hermes launch resolution', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedConfig.value = null;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-hermes-launch-'));
    process.env.HOME = tempDir;
    process.env.PATH = path.join(tempDir, 'bin');
    fs.mkdirSync(process.env.PATH, { recursive: true });
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('prefers the bundled hermes ACP python module when no explicit cliPath is configured', async () => {
    const pythonPath = path.join(tempDir, '.hermes', 'hermes-agent', 'venv', 'bin', 'python3');
    createExecutable(pythonPath);

    const manager = new AcpAgentManager({
      conversation_id: 'conv-hermes',
      backend: 'hermes',
      workspace: '/tmp/workspace',
    });

    await manager.initAgent();

    expect(capturedConfig.value).toBeTruthy();
    expect(capturedConfig.value?.cliPath).toBe(pythonPath);
    expect(capturedConfig.value?.customArgs).toEqual(['-m', 'acp_adapter.entry']);
    expect(capturedConfig.value?.customEnv).toEqual({
      PYTHONPATH: path.join(tempDir, '.hermes', 'hermes-agent'),
    });
  });

  it('prefers the bundled Windows-style hermes ACP python path when present', async () => {
    const pythonPath = path.join(tempDir, '.hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe');
    createExecutable(pythonPath);

    const manager = new AcpAgentManager({
      conversation_id: 'conv-hermes-win',
      backend: 'hermes',
      workspace: '/tmp/workspace',
    });

    await manager.initAgent();

    expect(capturedConfig.value).toBeTruthy();
    expect(capturedConfig.value?.cliPath).toBe(pythonPath);
    expect(capturedConfig.value?.customArgs).toEqual(['-m', 'acp_adapter.entry']);
  });

  it('overrides a broken hermes shell wrapper path with the bundled ACP python entry', async () => {
    const pythonPath = path.join(tempDir, '.hermes', 'hermes-agent', 'venv', 'bin', 'python3');
    const brokenWrapperPath = path.join(tempDir, 'bin', 'hermes');
    createExecutable(pythonPath);
    fs.writeFileSync(
      brokenWrapperPath,
      [
        '#!/usr/bin/env bash',
        'unset PYTHONPATH',
        'unset PYTHONHOME',
        `exec "${path.join(tempDir, '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes')}" "$@"`,
        '',
      ].join('\n'),
      'utf8'
    );
    fs.chmodSync(brokenWrapperPath, 0o755);

    const manager = new AcpAgentManager({
      conversation_id: 'conv-hermes-wrapper',
      backend: 'hermes',
      workspace: '/tmp/workspace',
      cliPath: brokenWrapperPath,
    });

    await manager.initAgent();

    expect(capturedConfig.value).toBeTruthy();
    expect(capturedConfig.value?.cliPath).toBe(pythonPath);
    expect(capturedConfig.value?.customArgs).toEqual(['-m', 'acp_adapter.entry']);
  });

  it('injects OPENCODE_CONFIG for OpenCode sessions so runtime uses the managed config path', async () => {
    const manager = new AcpAgentManager({
      conversation_id: 'conv-opencode',
      backend: 'opencode',
      workspace: '/tmp/workspace',
    });

    await manager.initAgent();

    expect(capturedConfig.value).toBeTruthy();
    expect(capturedConfig.value?.cliPath).toBe('opencode');
    expect(capturedConfig.value?.customArgs).toEqual(['acp']);
    expect(capturedConfig.value?.customEnv).toMatchObject({
      OPENCODE_CONFIG: resolveOpencodeConfigPath(),
      XDG_CONFIG_HOME: resolveOpencodeConfigRoot(resolveOpencodeConfigPath()),
    });
  });
});
