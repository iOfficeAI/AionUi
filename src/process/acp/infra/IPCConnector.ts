// src/process/acp/infra/IPCConnector.ts
import type { ConnectorHandle } from '@process/acp/infra/IAgentConnector';
import type { Stream } from '@agentclientprotocol/sdk';
import { AcpError } from '@process/acp/errors/AcpError';
import { NdjsonTransport } from '@process/acp/infra/NdjsonTransport';
import { gracefulShutdown, isProcessAlive, prepareCleanEnv, waitForSpawn } from '@process/acp/infra/processUtils';
import { spawn, type ChildProcess } from 'node:child_process';

export type IPCConnectorConfig = {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  gracePeriodMs?: number;
};

export class IPCConnector {
  private child: ChildProcess | null = null;

  constructor(private readonly config: IPCConnectorConfig) {}

  async connect(): Promise<ConnectorHandle> {
    try {
      const child = spawn(this.config.command, this.config.args, {
        cwd: this.config.cwd,
        env: prepareCleanEnv(this.config.env),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      await waitForSpawn(child);
      this.child = child;

      const stream: Stream = NdjsonTransport.fromChildProcess(child);
      const gracePeriodMs = this.config.gracePeriodMs ?? 100;

      return {
        stream,
        shutdown: async () => {
          await gracefulShutdown(child, gracePeriodMs);
          this.child = null;
        },
      };
    } catch (err) {
      this.child = null;
      throw new AcpError('CONNECTION_FAILED', `Failed to spawn agent: ${(err as Error).message}`, {
        cause: err,
        retryable: true,
      });
    }
  }

  isAlive(): boolean {
    if (!this.child?.pid) return false;
    return isProcessAlive(this.child.pid);
  }
}
