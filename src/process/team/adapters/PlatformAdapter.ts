// src/process/team/adapters/PlatformAdapter.ts

import type { MailboxMessage, ParsedAction, PlatformCapability, TeamAgent, TeamTask } from '../types';
import { createAcpAdapter } from './acpAdapter';
import { createXmlFallbackAdapter } from './xmlFallbackAdapter';

/** The message payload built by the adapter to send to an agent */
export type AgentPayload = {
  /** The message text to send via agent.send() */
  message: string;
  /** Tool definitions to inject (for platforms supporting tool use) */
  tools?: ToolDefinition[];
};

/** Tool definition for platforms that support tool use */
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** Accumulated agent response to be parsed */
export type AgentResponse = {
  /** Full accumulated text content */
  text: string;
  /** Tool call blocks from the response (ACP/Claude) */
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
  }>;
};

/** Build parameters for payload construction */
export type BuildPayloadParams = {
  agent: TeamAgent;
  mailboxMessages: MailboxMessage[];
  tasks: TeamTask[];
  teammates: TeamAgent[];
};

/** Unified adapter interface for cross-platform agent communication */
export type TeamPlatformAdapter = {
  getCapability(): PlatformCapability;
  buildPayload(params: BuildPayloadParams): AgentPayload;
  parseResponse(response: AgentResponse): ParsedAction[];
};

/**
 * Factory function that returns the appropriate adapter for a given conversation type.
 * Routes 'acp' to the ACP tool-use adapter; all others to the XML fallback adapter.
 */
export function createPlatformAdapter(conversationType: string): TeamPlatformAdapter {
  if (conversationType === 'acp') {
    return createAcpAdapter();
  }
  return createXmlFallbackAdapter();
}
