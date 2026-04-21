/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { TProviderWithModel } from '@/common/config/storage';
import { resolveAionrsBinary } from './binaryResolver';
import { buildSpawnConfig } from './envBuilder';
import type { AionrsEvent, AionrsCommand, AionrsCapabilities } from './protocol';

const AIONRS_PROJECT_CONFIG = '.aionrs.toml';

type StreamEventHandler = (event: { type: string; data: unknown; msg_id: string }) => void;

/**
 * A stdio-transport MCP server to inject into the aionrs session. Each entry
 * is forwarded verbatim as an `add_mcp_server` command. `awaitReady` flags
 * that the server performs a ready handshake (e.g. team coordination MCP
 * waits for TEAM_AGENT_SLOT_ID registration); leave it false for fire-and-
 * forget servers like the team-guide bridge.
 */
export type StdioMcpOption = {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
  awaitReady?: boolean;
};

export type AionrsAgentOptions = {
  workspace: string;
  model: TProviderWithModel;
  proxy?: string;
  yoloMode?: boolean;
  presetRules?: string;
  maxTokens?: number;
  maxTurns?: number;
  sessionId?: string;
  resume?: string;
  /**
   * Stdio MCP servers to register with the aionrs session after start.
   * Caller decides which MCPs belong here (team coordination, team-guide,
   * future project MCPs, etc.) — AionrsAgent just forwards them.
   */
  stdioMcpServers?: StdioMcpOption[];
  onStreamEvent: StreamEventHandler;
};

export class AionrsAgent {
  private childProcess: ChildProcess | null = null;
  private ready = false;
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (err: Error) => void;
  private onStreamEvent: StreamEventHandler;
  private options: AionrsAgentOptions;
  private activeMsgId: string | null = null;
  private configBackup: { path: string; content: string | null } | null = null;
  private mcpReadyPromise: Promise<void>;
  private mcpReadyResolve!: () => void;
  public sessionId?: string;
  public capabilities?: AionrsCapabilities;

  constructor(options: AionrsAgentOptions) {
    this.options = options;
    this.onStreamEvent = options.onStreamEvent;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.mcpReadyPromise = new Promise((resolve) => {
      this.mcpReadyResolve = resolve;
    });
  }

  get bootstrap(): Promise<void> {
    return this.readyPromise;
  }

  async start(): Promise<void> {
    const binaryPath = resolveAionrsBinary();
    if (!binaryPath) {
      throw new Error('aionrs binary not found');
    }

    const { args, env, projectConfig } = buildSpawnConfig(this.options.model, {
      workspace: this.options.workspace,
      maxTokens: this.options.maxTokens,
      maxTurns: this.options.maxTurns,
      autoApprove: this.options.yoloMode,
      sessionId: this.options.sessionId,
      resume: this.options.resume,
    });

    // Write temporary .aionrs.toml for provider compat overrides
    if (projectConfig) {
      this.writeProjectConfig(projectConfig);
    }

    this.childProcess = spawn(binaryPath, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: this.options.workspace,
    });

    // Parse stdout JSON Lines
    const rl = createInterface({ input: this.childProcess.stdout! });
    rl.on('line', (line) => {
      try {
        const event = JSON.parse(line) as AionrsEvent;
        this.handleEvent(event);
      } catch {
        console.error('[AionrsAgent] Failed to parse event:', line);
      }
    });

    // Log stderr as diagnostics
    this.childProcess.stderr?.on('data', (chunk: Buffer) => {
      console.error('[aionrs]', chunk.toString());
    });

    // Handle process exit
    this.childProcess.on('exit', (code) => {
      this.restoreProjectConfig();
      if (!this.ready) {
        this.readyReject(new Error(`aionrs exited with code ${code} during init`));
      }
      this.childProcess = null;
    });

    // Wait for ready event with timeout
    const timeout = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('aionrs ready timeout (30s)')), 30000);
    });

    try {
      await Promise.race([this.readyPromise, timeout]);
    } catch (err) {
      // If resume failed (session not found), fallback to a new session
      if (this.options.resume) {
        console.error('[AionrsAgent] Resume failed, falling back to new session:', err);
        this.options = { ...this.options, resume: undefined, sessionId: this.options.resume };
        this.ready = false;
        this.readyPromise = new Promise((resolve, reject) => {
          this.readyResolve = resolve;
          this.readyReject = reject;
        });
        return this.start();
      }
      throw err;
    }

    // Inject stdio MCP servers (must happen before first message). Each entry
    // is forwarded as `add_mcp_server`; if any entry has `awaitReady: true`,
    // wait on the handshake before continuing.
    const stdioMcpServers = this.options.stdioMcpServers ?? [];
    let awaitAnyReady = false;
    for (const server of stdioMcpServers) {
      const envRecord: Record<string, string> = {};
      for (const { name: k, value: v } of server.env) {
        envRecord[k] = v;
      }
      this.sendCommand({
        type: 'add_mcp_server',
        name: server.name,
        transport: 'stdio',
        command: server.command,
        args: server.args,
        env: envRecord,
      });
      if (server.awaitReady) awaitAnyReady = true;
    }

    if (awaitAnyReady) {
      await Promise.race([
        this.mcpReadyPromise,
        new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('MCP ready timeout (30s)')), 30000)),
      ]).catch((err) => {
        console.warn('[AionrsAgent] MCP setup warning:', err);
      });
    }

    // Inject preset rules as history context (skip on resume — rules were already injected)
    if (this.options.presetRules && !this.options.resume) {
      this.sendCommand({
        type: 'init_history',
        text: `[Assistant System Rules]\n${this.options.presetRules}`,
      });
    }
  }

  private handleEvent(event: AionrsEvent): void {
    switch (event.type) {
      case 'ready':
        this.ready = true;
        this.sessionId = event.session_id;
        this.capabilities = event.capabilities;
        this.readyResolve();
        break;

      case 'stream_start':
        this.activeMsgId = event.msg_id;
        this.onStreamEvent({ type: 'start', data: '', msg_id: event.msg_id });
        break;

      case 'text_delta':
        this.onStreamEvent({ type: 'content', data: event.text, msg_id: event.msg_id });
        break;

      case 'thinking':
        this.onStreamEvent({ type: 'thought', data: event.text, msg_id: event.msg_id });
        break;

      case 'tool_request':
        this.onStreamEvent({
          type: 'tool_group',
          data: [
            {
              callId: event.call_id,
              name: event.tool.name,
              description: event.tool.description,
              status: 'Confirming',
              renderOutputAsMarkdown: false,
              confirmationDetails: this.mapConfirmationDetails(event),
            },
          ],
          msg_id: event.msg_id,
        });
        break;

      case 'tool_running':
        this.onStreamEvent({
          type: 'tool_group',
          data: [
            {
              callId: event.call_id,
              name: event.tool_name,
              description: '',
              status: 'Executing',
              renderOutputAsMarkdown: false,
            },
          ],
          msg_id: event.msg_id,
        });
        break;

      case 'tool_result':
        this.onStreamEvent({
          type: 'tool_group',
          data: [
            {
              callId: event.call_id,
              name: event.tool_name,
              description: '',
              status: event.status === 'success' ? 'Success' : 'Error',
              resultDisplay:
                event.output_type === 'diff'
                  ? { fileDiff: event.output, fileName: (event.metadata as Record<string, string>)?.file_path ?? '' }
                  : event.output,
              renderOutputAsMarkdown: event.output_type === 'text',
            },
          ],
          msg_id: event.msg_id,
        });
        break;

      case 'tool_cancelled':
        this.onStreamEvent({
          type: 'tool_group',
          data: [
            {
              callId: event.call_id,
              name: '',
              description: event.reason,
              status: 'Canceled',
              renderOutputAsMarkdown: false,
            },
          ],
          msg_id: event.msg_id,
        });
        break;

      case 'stream_end':
        this.onStreamEvent({ type: 'finish', data: event.usage ?? '', msg_id: event.msg_id });
        this.activeMsgId = null;
        break;

      case 'error':
        this.onStreamEvent({
          type: 'error',
          data: event.error.message,
          msg_id: event.msg_id ?? this.activeMsgId ?? '',
        });
        break;

      case 'info':
        this.onStreamEvent({
          type: 'info',
          data: event.message,
          msg_id: event.msg_id,
        });
        break;

      case 'config_changed':
        this.capabilities = event.capabilities;
        this.onStreamEvent({
          type: 'config_changed',
          data: event.capabilities,
          msg_id: '',
        });
        break;

      case 'mcp_ready':
        this.mcpReadyResolve();
        break;
    }
  }

  /**
   * Map aionrs tool_request to AionUi confirmation details format.
   */
  private mapConfirmationDetails(event: AionrsEvent & { type: 'tool_request' }) {
    const { tool } = event;

    switch (tool.category) {
      case 'edit':
        return {
          type: 'edit' as const,
          title: tool.description,
          fileName: (tool.args as Record<string, string>).file_path ?? '',
          fileDiff: '',
        };
      case 'exec':
        return {
          type: 'exec' as const,
          title: tool.description,
          rootCommand: (tool.args as Record<string, string>).command?.split(' ')[0] ?? tool.name,
          command: (tool.args as Record<string, string>).command ?? JSON.stringify(tool.args),
        };
      case 'mcp':
        return {
          type: 'mcp' as const,
          title: tool.description,
          toolName: tool.name,
          toolDisplayName: tool.name,
          serverName: '',
        };
      case 'info':
      default:
        return {
          type: 'info' as const,
          title: tool.description,
          prompt: JSON.stringify(tool.args, null, 2),
        };
    }
  }

  sendCommand(cmd: AionrsCommand): void {
    if (!this.childProcess?.stdin?.writable) return;
    this.childProcess.stdin.write(JSON.stringify(cmd) + '\n');
  }

  async send(content: string, msgId: string, files?: string[]): Promise<void> {
    await this.readyPromise;
    this.sendCommand({
      type: 'message',
      msg_id: msgId,
      content,
      files,
    });
  }

  injectConversationHistory(text: string): Promise<void> {
    this.sendCommand({ type: 'init_history', text });
    return Promise.resolve();
  }

  stop(): void {
    this.sendCommand({ type: 'stop' });
  }

  approveTool(callId: string, scope: 'once' | 'always' = 'once'): void {
    this.sendCommand({ type: 'tool_approve', call_id: callId, scope });
  }

  denyTool(callId: string, reason = ''): void {
    this.sendCommand({ type: 'tool_deny', call_id: callId, reason });
  }

  setConfig(config: { model?: string; thinking?: string; thinking_budget?: number; effort?: string }): void {
    this.sendCommand({ type: 'set_config', ...config });
  }

  setMode(mode: 'default' | 'auto_edit' | 'yolo'): void {
    this.sendCommand({ type: 'set_mode', mode });
  }

  kill(): void {
    this.restoreProjectConfig();
    if (this.childProcess) {
      this.childProcess.kill('SIGTERM');
      this.childProcess = null;
    }
  }

  /**
   * Write a temporary .aionrs.toml in the workspace for provider compat overrides.
   * Backs up existing file content so it can be restored on exit.
   */
  private writeProjectConfig(content: string): void {
    const configPath = join(this.options.workspace, AIONRS_PROJECT_CONFIG);
    const existing = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : null;
    this.configBackup = { path: configPath, content: existing };

    // If a project config already exists, only append lines that are not yet present.
    // This prevents duplicate TOML sections when restore failed on a previous run.
    if (existing) {
      const missingLines = content.split('\n').filter((line) => line.trim() && !existing.includes(line.trim()));
      if (missingLines.length > 0) {
        writeFileSync(configPath, `${existing}\n${missingLines.join('\n')}\n`, 'utf-8');
      }
    } else {
      writeFileSync(configPath, content, 'utf-8');
    }
  }

  /**
   * Restore or remove the .aionrs.toml written by writeProjectConfig.
   */
  private restoreProjectConfig(): void {
    if (!this.configBackup) return;
    const { path, content } = this.configBackup;
    this.configBackup = null;

    try {
      if (content === null) {
        unlinkSync(path);
      } else {
        writeFileSync(path, content, 'utf-8');
      }
    } catch {
      // Best-effort cleanup; file may already be removed
    }
  }
}
