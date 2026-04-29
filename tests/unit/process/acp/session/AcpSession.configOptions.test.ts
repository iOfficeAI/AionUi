import type { InitializeResponse, NewSessionResponse, PromptResponse } from '@agentclientprotocol/sdk';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AcpSession, ACP_TEXT_FILE_READ_MAX_BYTES } from '@process/acp/session/AcpSession';
import type { AcpClient, ClientFactory, DisconnectInfo } from '@process/acp/infra/IAcpClient';
import type {
  AgentConfig,
  ConfigSnapshot,
  ProtocolHandlers,
  SessionCallbacks,
  SessionStatus,
} from '@process/acp/types';

const createClient = (sessionResponse: NewSessionResponse): AcpClient => ({
  start: vi.fn(async () => ({}) as InitializeResponse),
  createSession: vi.fn(async () => sessionResponse),
  loadSession: vi.fn(),
  forkSession: vi.fn(),
  prompt: vi.fn(async () => ({}) as PromptResponse),
  cancel: vi.fn(async () => {}),
  closeSession: vi.fn(async () => {}),
  setModel: vi.fn(async () => {}),
  setMode: vi.fn(async () => {}),
  setConfigOption: vi.fn(async () => {}),
  extMethod: vi.fn(),
  authenticate: vi.fn(),
  lifecycleSnapshot: {
    pid: null,
    running: true,
    lastExit: null,
  },
  onDisconnect: vi.fn((_handler: (info: DisconnectInfo) => void) => {}),
  close: vi.fn(async () => {}),
});

describe('AcpSession config options', () => {
  it('preserves select option metadata from the session creation response', async () => {
    const configUpdates: ConfigSnapshot[] = [];
    let resolveActive: () => void = () => {};
    const active = new Promise<void>((resolve) => {
      resolveActive = resolve;
    });
    const client = createClient({
      sessionId: 'session-1',
      configOptions: [
        {
          id: 'reasoning_effort',
          name: 'Reasoning Effort',
          description: 'Choose how much reasoning effort the model should use',
          category: 'thought_level',
          type: 'select',
          currentValue: 'xhigh',
          options: [
            { value: 'low', name: 'Low', description: 'Fast responses with lighter reasoning' },
            { value: 'xhigh', name: 'Xhigh', description: 'Extra high reasoning depth for complex problems' },
          ],
        },
      ],
    } as NewSessionResponse);
    const factory: ClientFactory = {
      create: () => client,
    };
    const agentConfig: AgentConfig = {
      agentBackend: 'codex',
      agentSource: 'extension',
      agentId: 'codex',
      cwd: '/workspace',
    };
    const callbacks: SessionCallbacks = {
      onMessage: vi.fn(),
      onSessionId: vi.fn(),
      onStatusChange: (status: SessionStatus) => {
        if (status === 'active') resolveActive();
      },
      onConfigUpdate: (config: ConfigSnapshot) => {
        configUpdates.push(config);
      },
      onModelUpdate: vi.fn(),
      onModeUpdate: vi.fn(),
      onContextUsage: vi.fn(),
      onPermissionRequest: vi.fn(),
      onSignal: vi.fn(),
    };

    const session = new AcpSession(agentConfig, factory, callbacks);
    session.start();
    await active;

    expect(configUpdates[0]?.configOptions).toEqual([
      {
        id: 'reasoning_effort',
        name: 'Reasoning Effort',
        description: 'Choose how much reasoning effort the model should use',
        category: 'thought_level',
        type: 'select',
        currentValue: 'xhigh',
        options: [
          { id: 'low', name: 'Low', description: 'Fast responses with lighter reasoning' },
          { id: 'xhigh', name: 'Xhigh', description: 'Extra high reasoning depth for complex problems' },
        ],
      },
    ]);
  });
});

describe('AcpSession file access handlers', () => {
  it('returns only the requested line range for ACP text reads', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-acp-read-'));
    const filePath = path.join(workspace, 'example.ts');
    fs.writeFileSync(filePath, ['line 1', 'line 2', 'line 3', 'line 4'].join('\n') + '\n', 'utf-8');

    let capturedHandlers: ProtocolHandlers | null = null;
    let resolveActive: () => void = () => {};
    const active = new Promise<void>((resolve) => {
      resolveActive = resolve;
    });
    const client = createClient({
      sessionId: 'session-1',
    } as NewSessionResponse);
    const factory: ClientFactory = {
      create: (_config, handlers) => {
        capturedHandlers = handlers;
        return client;
      },
    };
    const agentConfig: AgentConfig = {
      agentBackend: 'codex',
      agentSource: 'extension',
      agentId: 'codex',
      cwd: workspace,
    };
    const callbacks: SessionCallbacks = {
      onMessage: vi.fn(),
      onSessionId: vi.fn(),
      onStatusChange: (status: SessionStatus) => {
        if (status === 'active') resolveActive();
      },
      onConfigUpdate: vi.fn(),
      onModelUpdate: vi.fn(),
      onModeUpdate: vi.fn(),
      onContextUsage: vi.fn(),
      onPermissionRequest: vi.fn(),
      onSignal: vi.fn(),
    };

    const session = new AcpSession(agentConfig, factory, callbacks);
    try {
      session.start();
      await active;

      const response = await capturedHandlers?.onReadTextFile({
        path: filePath,
        sessionId: 'session-1',
        line: 2,
        limit: 2,
      });

      expect(response).toEqual({ content: 'line 2\nline 3\n' });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns visible guidance for oversized full ACP text reads', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-acp-read-'));
    const filePath = path.join(workspace, 'large.ts');
    const content = Array.from({ length: 700 }, (_, index) => `export const value${index} = '${'x'.repeat(40)}';`).join(
      '\n'
    );
    fs.writeFileSync(filePath, content, 'utf-8');

    let capturedHandlers: ProtocolHandlers | null = null;
    let resolveActive: () => void = () => {};
    const active = new Promise<void>((resolve) => {
      resolveActive = resolve;
    });
    const client = createClient({
      sessionId: 'session-1',
    } as NewSessionResponse);
    const factory: ClientFactory = {
      create: (_config, handlers) => {
        capturedHandlers = handlers;
        return client;
      },
    };
    const agentConfig: AgentConfig = {
      agentBackend: 'codex',
      agentSource: 'extension',
      agentId: 'codex',
      cwd: workspace,
    };
    const callbacks: SessionCallbacks = {
      onMessage: vi.fn(),
      onSessionId: vi.fn(),
      onStatusChange: (status: SessionStatus) => {
        if (status === 'active') resolveActive();
      },
      onConfigUpdate: vi.fn(),
      onModelUpdate: vi.fn(),
      onModeUpdate: vi.fn(),
      onContextUsage: vi.fn(),
      onPermissionRequest: vi.fn(),
      onSignal: vi.fn(),
    };

    const session = new AcpSession(agentConfig, factory, callbacks);
    try {
      session.start();
      await active;

      const response = await capturedHandlers!.onReadTextFile({
        path: filePath,
        sessionId: 'session-1',
      });

      expect(response.content).toContain('File is too large for a full ACP text read.');
      expect(response.content).toContain('Request a smaller line/limit range.');
      expect(response.content.length).toBeLessThan(content.length);
      expect(Buffer.byteLength(JSON.stringify(response.content), 'utf-8')).toBeLessThanOrEqual(
        ACP_TEXT_FILE_READ_MAX_BYTES
      );
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns visible guidance for oversized ranged ACP text reads', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-acp-read-'));
    const filePath = path.join(workspace, 'large-range.ts');
    const content = Array.from({ length: 700 }, (_, index) => `export const value${index} = '${'x'.repeat(40)}';`).join(
      '\n'
    );
    fs.writeFileSync(filePath, content, 'utf-8');

    let capturedHandlers: ProtocolHandlers | null = null;
    let resolveActive: () => void = () => {};
    const active = new Promise<void>((resolve) => {
      resolveActive = resolve;
    });
    const client = createClient({
      sessionId: 'session-1',
    } as NewSessionResponse);
    const factory: ClientFactory = {
      create: (_config, handlers) => {
        capturedHandlers = handlers;
        return client;
      },
    };
    const agentConfig: AgentConfig = {
      agentBackend: 'codex',
      agentSource: 'extension',
      agentId: 'codex',
      cwd: workspace,
    };
    const callbacks: SessionCallbacks = {
      onMessage: vi.fn(),
      onSessionId: vi.fn(),
      onStatusChange: (status: SessionStatus) => {
        if (status === 'active') resolveActive();
      },
      onConfigUpdate: vi.fn(),
      onModelUpdate: vi.fn(),
      onModeUpdate: vi.fn(),
      onContextUsage: vi.fn(),
      onPermissionRequest: vi.fn(),
      onSignal: vi.fn(),
    };

    const session = new AcpSession(agentConfig, factory, callbacks);
    try {
      session.start();
      await active;

      const response = await capturedHandlers!.onReadTextFile({
        path: filePath,
        sessionId: 'session-1',
        line: 10,
        limit: 500,
      });

      expect(response.content).toContain('Requested ACP text range is too large.');
      expect(response.content).toContain('Request a smaller limit.');
      expect(response.content).toContain('export const value9');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('returns visible denial for ACP text reads outside the allowed workspace', async () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-acp-read-'));
    const outsideWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-acp-outside-'));
    const outsidePath = path.join(outsideWorkspace, 'example.ts');
    fs.writeFileSync(outsidePath, 'outside\n', 'utf-8');

    let capturedHandlers: ProtocolHandlers | null = null;
    let resolveActive: () => void = () => {};
    const active = new Promise<void>((resolve) => {
      resolveActive = resolve;
    });
    const client = createClient({
      sessionId: 'session-1',
    } as NewSessionResponse);
    const factory: ClientFactory = {
      create: (_config, handlers) => {
        capturedHandlers = handlers;
        return client;
      },
    };
    const agentConfig: AgentConfig = {
      agentBackend: 'codex',
      agentSource: 'extension',
      agentId: 'codex',
      cwd: workspace,
    };
    const callbacks: SessionCallbacks = {
      onMessage: vi.fn(),
      onSessionId: vi.fn(),
      onStatusChange: (status: SessionStatus) => {
        if (status === 'active') resolveActive();
      },
      onConfigUpdate: vi.fn(),
      onModelUpdate: vi.fn(),
      onModeUpdate: vi.fn(),
      onContextUsage: vi.fn(),
      onPermissionRequest: vi.fn(),
      onSignal: vi.fn(),
    };

    const session = new AcpSession(agentConfig, factory, callbacks);
    try {
      session.start();
      await active;

      const response = await capturedHandlers!.onReadTextFile({
        path: outsidePath,
        sessionId: 'session-1',
      });

      expect(response.content).toContain('Unable to read file.');
      expect(response.content).toContain('outside permitted directories');
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
      fs.rmSync(outsideWorkspace, { recursive: true, force: true });
    }
  });
});
