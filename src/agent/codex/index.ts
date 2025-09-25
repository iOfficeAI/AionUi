/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Core Management Layer
export { default as CodexAgentManager } from './core/CodexAgentManager';
export { CodexMcpAgent, type CodexAgentConfig } from './core/CodexMcpAgent';
// Export the app configuration function for use in main process
export { setAppConfig as setCodexAgentAppConfig } from './core/appConfig';

// Connection Layer
export { CodexMcpConnection, type CodexEventEnvelope, type NetworkError } from './connection/CodexMcpConnection';

// Handlers Layer
export { CodexEventHandler } from './handlers/CodexEventHandler';
export { CodexSessionManager, type CodexSessionConfig } from './handlers/CodexSessionManager';
export { CodexFileOperationHandler, type FileOperation } from './handlers/CodexFileOperationHandler';

// Messaging Layer
export { CodexMessageProcessor } from './messaging/CodexMessageProcessor';
export { CodexMessageTransformer } from './messaging/CodexMessageTransformer';
export { type ICodexMessageEmitter } from './messaging/CodexMessageEmitter';

// Tools Layer
export { CodexToolHandlers } from './tools/CodexToolHandlers';
export { ToolRegistry, ToolCategory, OutputFormat, RendererType, type ToolDefinition, type ToolCapabilities, type ToolRenderer, type ToolAvailability, type McpToolInfo } from '@/common/codex/utils';
