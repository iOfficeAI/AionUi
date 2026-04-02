// src/process/team/adapters/PlatformAdapter.ts

import type { MailboxMessage, ParsedAction, PlatformCapability, TeamAgent, TeamTask } from '../types';
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
  availableAgentTypes?: Array<{ type: string; name: string }>;
  renamedAgents?: Map<string, string>;
};

/** Unified adapter interface for cross-platform agent communication */
export type TeamPlatformAdapter = {
  getCapability(): PlatformCapability;
  buildPayload(params: BuildPayloadParams): AgentPayload;
  parseResponse(response: AgentResponse): ParsedAction[];
};

/**
 * Factory function that returns the appropriate adapter for a given conversation type.
 *
 * All conversation types currently use the XML fallback adapter because team-specific
 * tools (SpawnAgent, SendMessage, etc.) cannot be injected into an existing agent
 * session — the agent only sees tools registered when the session was created.
 * XML instructions embedded in the message text work universally across all backends.
 */
export function createPlatformAdapter(_conversationType: string, hasMcpTools?: boolean): TeamPlatformAdapter {
  return createXmlFallbackAdapter({ hasMcpTools });
}
