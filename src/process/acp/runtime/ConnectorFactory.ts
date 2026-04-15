// src/process/acp/runtime/ConnectorFactory.ts

import type { AgentConfig } from '../types';
import type { AgentConnector } from '../infra/AgentConnector';
import type { ConnectorFactory } from '../session/types';
import { IPCConnector } from '../infra/IPCConnector';

export class DefaultConnectorFactory implements ConnectorFactory {
  create(config: AgentConfig): AgentConnector {
    if (config.remoteUrl) {
      // WebSocketConnector added in Task 16
      throw new Error(`WebSocket connector not yet implemented for ${config.remoteUrl}`);
    }
    return new IPCConnector({
      command: config.command!,
      args: config.args ?? [],
      cwd: config.cwd,
      env: config.env,
      gracePeriodMs: config.processOptions?.gracePeriodMs,
    });
  }
}
