// src/process/acp/infra/AgentConnector.ts

import type { Stream } from '@agentclientprotocol/sdk';
import { AgentConfig } from '@process/acp/types';

export type ConnectorHandle = {
  stream: Stream;
  shutdown: () => Promise<void>;
};

export interface AgentConnector {
  connect(): Promise<ConnectorHandle>;
  isAlive(): boolean;
}

export type LocalProcessConfig = {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  gracePeriodMs?: number;
};

export type RemoteConfig = {
  url: string;
  headers?: Record<string, string>;
};

export type ConnectorFactory = {
  create(config: AgentConfig): AgentConnector;
};
