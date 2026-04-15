// src/process/acp/index.ts

export type {
  AgentConfig,
  AuthMethod,
  AuthRequiredData,
  ConfigSnapshot,
  ContextUsage,
  McpServerConfig,
  ModelSnapshot,
  ModeSnapshot,
  PermissionUIData,
  PromptContent,
  QueueSnapshot,
  RuntimeOptions,
  SessionCallbacks,
  SessionSignal,
  SessionStatus,
  SignalEvent,
} from './types';

export type { AcpSessionRow, IAcpSessionRepository } from '../services/database/IAcpSessionRepository';
export { AcpError, type AcpErrorCode } from './errors/AcpError';
export { normalizeError } from './errors/errorNormalize';
export type { ProtocolFactory, RawAuthMethod } from './infra/AcpProtocol';
export { noopMetrics, type AcpMetrics } from './metrics/AcpMetrics';
export { AcpRuntime } from './runtime/AcpRuntime';
export { DefaultConnectorFactory } from './runtime/ConnectorFactory';
export { AcpSession, type SessionOptions } from './session/AcpSession';

// Compatibility adapter (Phase 1 migration)
export { AcpAgentV2, isAcpV2Enabled } from './compat';
