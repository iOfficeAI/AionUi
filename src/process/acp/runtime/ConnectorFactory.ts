// src/process/acp/runtime/ConnectorFactory.ts

import type { AgentConfig, ConnectorFactory } from '../types';
import type { AgentConnector } from '../infra/AgentConnector';
import { IPCConnector } from '../infra/IPCConnector';
import { WebSocketConnector } from '../infra/WebSocketConnector';

export class DefaultConnectorFactory implements ConnectorFactory {
  create(config: AgentConfig): AgentConnector {
    if (config.remoteUrl) {
      return new WebSocketConnector({ url: config.remoteUrl, headers: config.remoteHeaders });
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
