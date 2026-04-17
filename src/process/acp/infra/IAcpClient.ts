// src/process/acp/infra/IAcpClient.ts

/**
 * AcpClient — Single-owner interface for agent process + protocol lifecycle.
 *
 * Merges the responsibilities of the old ConnectorHandle + AcpProtocol:
 *   - Process management (spawn, stderr, exit detection, shutdown)
 *   - Protocol communication (initialize, prompt, cancel, etc.)
 *   - Lifecycle observation (disconnect callback with full context)
 *
 * Inspired by acpx's AcpClient and Zed's AcpConnection.
 * See docs/feature/acp-rewrite/02-reference-implementation.md §8.
 */

import type {
  ForkSessionResponse,
  InitializeResponse,
  LoadSessionResponse,
  NewSessionResponse,
  PromptResponse,
} from '@agentclientprotocol/sdk';
import type { AgentConfig, PromptContent, ProtocolHandlers } from '@process/acp/types';
import type { CreateSessionParams, ForkSessionParams, LoadSessionParams } from '@process/acp/infra/AcpProtocol';

// ─── AcpClient Interface ────────────────────────────────────────

export interface AcpClient {
  /**
   * Spawn agent process (or connect to remote), set up streams, and perform
   * ACP initialize handshake. Internally uses a startup failure watcher
   * (Promise.race) to detect process crash before init completes.
   *
   * Throws AgentSpawnError if spawn fails.
   * Throws AgentStartupError if process exits before init completes (includes stderr).
   */
  start(): Promise<InitializeResponse>;

  // ─── Protocol Methods ───────────────────────────────────────

  createSession(params: CreateSessionParams): Promise<NewSessionResponse>;
  loadSession(params: LoadSessionParams): Promise<LoadSessionResponse>;
  forkSession(params: ForkSessionParams): Promise<ForkSessionResponse>;
  prompt(sessionId: string, content: PromptContent): Promise<PromptResponse>;
  cancel(sessionId: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  setModel(sessionId: string, modelId: string): Promise<void>;
  setMode(sessionId: string, modeId: string): Promise<void>;
  setConfigOption(sessionId: string, id: string, value: string | boolean): Promise<void>;
  extMethod(method: string, params: Record<string, unknown>): Promise<unknown>;

  /** Authenticate with the agent (pass-through to SDK). */
  authenticate(methodId: string): Promise<unknown>;

  // ─── Lifecycle ──────────────────────────────────────────────

  /** Always-available snapshot of agent process lifecycle state. */
  readonly lifecycleSnapshot: AgentLifecycleSnapshot;

  /**
   * Register a callback for agent disconnection. The callback receives
   * full diagnostic info (exit code, signal, stderr, reason) — not the
   * SDK's opaque "ACP connection closed" error.
   *
   * Only one handler is supported (last-write-wins).
   */
  onDisconnect(handler: (info: DisconnectInfo) => void): void;

  /**
   * Graceful shutdown: stdin.end() → SIGTERM → SIGKILL (for process clients)
   * or ws.close() (for WebSocket clients).
   */
  close(): Promise<void>;
}

// ─── Lifecycle Types ────────────────────────────────────────────

export type AgentDisconnectReason = 'process_exit' | 'process_close' | 'pipe_close' | 'connection_close';

export type AgentExitInfo = {
  exitCode: number | null;
  signal: string | null;
  reason: AgentDisconnectReason;
  stderr: string;
  /** True if the process crashed while a prompt was in flight. */
  unexpectedDuringPrompt: boolean;
};

export type AgentLifecycleSnapshot = {
  pid: number | null;
  running: boolean;
  lastExit: AgentExitInfo | null;
};

export type DisconnectInfo = {
  reason: AgentDisconnectReason;
  exitCode: number | null;
  signal: string | null;
  stderr: string;
};

// ─── Client Factory ─────────────────────────────────────────────

export type ClientFactory = {
  create(config: AgentConfig, handlers: ProtocolHandlers): AcpClient;
};
