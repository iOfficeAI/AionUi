// src/process/acp/runtime/ConnectorFactory.ts
import type { AgentConnector, ConnectorFactory } from '@process/acp/infra/IAgentConnector';
import { IPCConnector } from '@process/acp/infra/IPCConnector';
import { WebSocketConnector } from '@process/acp/infra/WebSocketConnector';
import type { AgentConfig } from '@process/acp/types';

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
