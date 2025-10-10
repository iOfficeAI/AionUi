/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// Core Management Layer
export { default as CodexAgentManager } from '@process/task/CodexAgentManager';
export { CodexAgent, type CodexAgentConfig } from './core/CodexAgent';
// Export the app configuration function for use in main process
export { setAppConfig as setCodexAgentAppConfig } from '../../common/utils/appConfig';

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
export { ToolRegistry, ToolCategory, OutputFormat, RendererType, type ToolDefinition, type ToolCapabilities, type ToolRenderer, type ToolAvailability, type McpToolInfo } from '@/common/codex/utils';
