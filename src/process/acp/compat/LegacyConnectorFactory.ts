// src/process/acp/compat/LegacyConnectorFactory.ts

/**
 * Bridges old backend-specific connector logic (acpConnectors.ts) into
 * the new ConnectorFactory / AgentConnector interface used by AcpSession.
 *
 * For npx-based backends (claude, codex, codebuddy) this reuses the
 * battle-tested connect*() functions which handle:
 *  - Full shell environment loading (API keys from .zshrc)
 *  - npx resolution and Node.js version checking
 *  - Phase 1 (prefer-offline) / Phase 2 (fresh) retry
 *  - Cached binary resolution (codex)
 *  - detached process spawning on Unix
 *
 * For all other backends this delegates to spawnGenericBackend().
 */

import type { AgentConnector, ConnectorFactory, ConnectorHandle } from '@process/acp/infra/IAgentConnector';
import type { AgentConfig } from '@process/acp/types';
import {
  connectClaude,
  connectCodebuddy,
  connectCodex,
  spawnGenericBackend,
  type NpxConnectHooks,
  type SpawnResult,
} from '@process/agent/acp/acpConnectors';
import { NdjsonTransport } from '@process/acp/infra/NdjsonTransport';
import { gracefulShutdown, isProcessAlive } from '@process/acp/infra/processUtils';
import { AcpError } from '@process/acp/errors/AcpError';
import type { ChildProcess } from 'node:child_process';

type BuiltinConnectFn = (cwd: string, hooks: NpxConnectHooks) => Promise<void>;

const NPX_BACKENDS: Record<string, BuiltinConnectFn> = {
  codex: connectCodex,
  claude: connectClaude,
  codebuddy: connectCodebuddy,
};

class LegacyConnector implements AgentConnector {
  private child: ChildProcess | null = null;

  constructor(private readonly config: AgentConfig) {}

  async connect(): Promise<ConnectorHandle> {
    const backend = this.config.agentBackend;
    const cwd = this.config.cwd;

    let spawnResult: SpawnResult;

    const npxConnect = NPX_BACKENDS[backend];
    if (npxConnect) {
      // Built-in npx-based backend
      spawnResult = await this.spawnViaNpxHooks(npxConnect, cwd);
    } else if (this.config.command) {
      // Generic or custom backend with CLI path
      spawnResult = await spawnGenericBackend(backend, this.config.command, cwd, this.config.args, this.config.env);
    } else {
      throw new AcpError('CONNECTION_FAILED', `No CLI path for backend "${backend}"`, {
        retryable: false,
      });
    }

    this.child = spawnResult.child;
    const stream = NdjsonTransport.fromChildProcess(this.child);

    return {
      stream,
      shutdown: async () => {
        if (this.child) {
          await gracefulShutdown(this.child, 100);
          this.child = null;
        }
      },
    };
  }

  isAlive(): boolean {
    if (!this.child?.pid) return false;
    return isProcessAlive(this.child.pid);
  }

  /**
   * Bridges the old hooks-based connect pattern into a simple Promise<SpawnResult>.
   *
   * The old connect*() functions take { setup, cleanup } hooks:
   *  - setup(result) is called once a child is successfully spawned
   *  - cleanup() is called between retry attempts to kill the previous child
   *
   * We resolve the outer promise on the first successful setup() call.
   * If all spawn strategies fail, the connect function throws and we reject.
   */
  private spawnViaNpxHooks(connectFn: BuiltinConnectFn, cwd: string): Promise<SpawnResult> {
    return new Promise<SpawnResult>((resolve, reject) => {
      let resolved = false;
      let lastChild: ChildProcess | null = null;

      const hooks: NpxConnectHooks = {
        setup: async (result: SpawnResult) => {
          if (!resolved) {
            resolved = true;
            lastChild = result.child;
            resolve(result);
          }
        },
        cleanup: async () => {
          if (lastChild) {
            try {
              lastChild.kill();
            } catch {
              /* already dead */
            }
            lastChild = null;
          }
        },
      };

      connectFn(cwd, hooks).catch((err) => {
        if (!resolved) {
          reject(
            new AcpError('CONNECTION_FAILED', `Failed to connect: ${(err as Error).message}`, {
              cause: err,
              retryable: true,
            })
          );
        }
      });
    });
  }
}

export class LegacyConnectorFactory implements ConnectorFactory {
  create(config: AgentConfig): AgentConnector {
    return new LegacyConnector(config);
  }
}
