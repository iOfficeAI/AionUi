/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Native app-server adapter. New Codex conversations use this path.
export { default as CodexNativeAgentManager } from './appserver/CodexNativeAgentManager';
export { CodexAppServerClient } from './appserver/CodexAppServerClient';
export { CodexJsonlTransport } from './appserver/CodexJsonlTransport';
export { CodexThreadSession } from './appserver/CodexThreadSession';
export { CodexEventTranslator } from './appserver/CodexEventTranslator';
export { CodexPermissionResolver } from './appserver/CodexPermissionResolver';
export { CodexModelService } from './appserver/CodexModelService';
export { CodexNativeDetector, codexNativeDetector } from './CodexNativeDetector';

// Legacy MCP management layer kept for compatibility with historical sessions.
export { default as CodexAgentManager } from '@process/task/CodexAgentManager';
export { CodexAgent, type CodexAgentConfig } from './core/CodexAgent';
// Export the app configuration function for use in main process
export { setAppConfig as setCodexAgentAppConfig } from '@/common/utils/appConfig';

// Connection Layer
export { CodexConnection, type CodexEventEnvelope, type NetworkError } from './connection/CodexConnection';

// Handlers Layer
export { CodexEventHandler } from './handlers/CodexEventHandler';
export { CodexSessionManager, type CodexSessionConfig } from './handlers/CodexSessionManager';
export { CodexFileOperationHandler, type FileOperation } from './handlers/CodexFileOperationHandler';

// Messaging Layer
export { CodexMessageProcessor } from './messaging/CodexMessageProcessor';
export { type ICodexMessageEmitter } from './messaging/CodexMessageEmitter';

// Tools Layer
export { CodexToolHandlers } from './handlers/CodexToolHandlers';
export {
  ToolRegistry,
  ToolCategory,
  OutputFormat,
  RendererType,
  type ToolDefinition,
  type ToolCapabilities,
  type ToolRenderer,
  type ToolAvailability,
  type McpToolInfo,
} from '@/common/types/codex/utils';
