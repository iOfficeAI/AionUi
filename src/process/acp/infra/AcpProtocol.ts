// src/process/acp/infra/AcpProtocol.ts

import { ClientSideConnection, type Stream } from '@agentclientprotocol/sdk';
import type { McpServerConfig, PromptContent, ProtocolHandlers, RequestPermissionRequest, SessionNotification } from '@process/acp/types';

// ─── Protocol-layer Types ──────────────────────────────────────

export type CreateSessionParams = {
  cwd: string;
  mcpServers?: McpServerConfig[];
  additionalDirectories?: string[];
};

export type LoadSessionParams = {
  sessionId: string;
  cwd: string;
  mcpServers?: McpServerConfig[];
  additionalDirectories?: string[];
};

export type PromptResponse = {
  stopReason: 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};

export type InitializeResponse = {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  authMethods?: RawAuthMethod[];
};

export type RawAuthMethod = {
  id: string;
  type: 'env_var' | 'terminal' | 'agent';
  name: string;
  description?: string;
  fields?: Array<{ key: string; label: string; secret: boolean }>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

export type ProtocolFactory = (stream: Stream, handlers: ProtocolHandlers) => AcpProtocol;

// ─── AcpProtocol Class ─────────────────────────────────────────

export class AcpProtocol {
  private readonly sdk: ClientSideConnection;

  constructor(stream: Stream, handlers: ProtocolHandlers) {
    this.sdk = new ClientSideConnection(
      (_agent) => ({
        sessionUpdate: async (params: any) => {
          handlers.onSessionUpdate(params as SessionNotification);
        },
        requestPermission: async (params: any) =>
          handlers.onRequestPermission(params as RequestPermissionRequest) as any,
        readTextFile: async (params: any) => handlers.onReadTextFile(params) as any,
        writeTextFile: async (params: any) => handlers.onWriteTextFile(params) as any,
      }),
      stream
    );
  }

  async initialize(): Promise<InitializeResponse> {
    const result = await this.sdk.initialize({
      clientInfo: { name: 'AionUi', version: '2.0.0' },
      protocolVersion: 0.1,
      clientCapabilities: {
        fs: {
          readTextFile: true,
          writeTextFile: true,
        },
      },
    });
    return result as unknown as InitializeResponse;
  }

  async authenticate(credentials?: Record<string, string>): Promise<unknown> {
    return this.sdk.authenticate({
      method: 'credentials',
      ...(credentials ? { credentials } : {}),
    } as any);
  }

  async createSession(params: CreateSessionParams): Promise<unknown> {
    return this.sdk.newSession({
      cwd: params.cwd,
      mcpServers: params.mcpServers?.map((s) => ({
        name: s.name,
        transportType: 'stdio',
        command: s.command,
        args: s.args,
        env: s.env,
      })) as any,
      additionalDirectories: params.additionalDirectories,
    } as any);
  }

  async loadSession(params: LoadSessionParams): Promise<unknown> {
    return this.sdk.loadSession({
      sessionId: params.sessionId,
      cwd: params.cwd,
      mcpServers: params.mcpServers?.map((s) => ({
        name: s.name,
        transportType: 'stdio',
        command: s.command,
        args: s.args,
        env: s.env,
      })) as any,
      additionalDirectories: params.additionalDirectories,
    } as any);
  }

  async prompt(sessionId: string, content: PromptContent): Promise<PromptResponse> {
    const result = await this.sdk.prompt({
      sessionId,
      content: content as any,
    } as any);
    return result as unknown as PromptResponse;
  }

  async cancel(sessionId: string): Promise<void> {
    await this.sdk.cancel({ sessionId } as any);
  }

  async setModel(sessionId: string, modelId: string): Promise<void> {
    await this.sdk.unstable_setSessionModel({ sessionId, modelId } as any);
  }

  async setMode(sessionId: string, modeId: string): Promise<void> {
    await this.sdk.setSessionMode({ sessionId, modeId } as any);
  }

  async setConfigOption(sessionId: string, id: string, value: string | boolean): Promise<void> {
    await this.sdk.setSessionConfigOption({ sessionId, id, value } as any);
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.sdk.unstable_closeSession({ sessionId } as any);
  }

  async extMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
    return this.sdk.extMethod(method, params);
  }

  get closed(): Promise<void> {
    return this.sdk.closed;
  }

  get signal(): AbortSignal {
    return this.sdk.signal;
  }
}

/** Default factory for production use. */
export const defaultProtocolFactory: ProtocolFactory = (stream, handlers) => new AcpProtocol(stream, handlers);
