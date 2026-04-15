// src/process/acp/infra/AgentConnector.ts

import type { Stream } from '@agentclientprotocol/sdk';
import { AgentConfig } from '@process/acp/types';

export interface AgentConnector {
  connect(): Promise<ConnectorHandle>;
  isAlive(): boolean;
}

export type ConnectorHandle = {
  stream: Stream;
  shutdown: () => Promise<void>;
};

export type ConnectorFactory = {
  create(config: AgentConfig): AgentConnector;
};
