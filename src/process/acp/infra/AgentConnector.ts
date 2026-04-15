// src/process/acp/infra/AgentConnector.ts

import type { Stream } from '@agentclientprotocol/sdk';

export type ConnectorHandle = {
  stream: Stream;
  shutdown: () => Promise<void>;
};

export type AgentConnector = {
  connect(): Promise<ConnectorHandle>;
  isAlive(): boolean;
};

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
