/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standalone stdio MCP server for Aion team-guide tools.
 *
 * Spawned by Claude CLI as a stdio MCP server. Communicates with
 * the main process TCP server via AION_MCP_PORT environment variable.
 *
 * TCP protocol: 4-byte big-endian length header + UTF-8 JSON body.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { sendTcpRequest } from '../tcpHelpers';
import { getCreateTeamToolDescription } from '@process/team/prompts/teamGuidePrompt.ts';

const AION_MCP_TOKEN = process.env.AION_MCP_TOKEN || undefined;
/** Backend type of the agent that owns this stdio bridge (e.g. 'claude', 'codex', 'gemini'). */
const AION_MCP_BACKEND = process.env.AION_MCP_BACKEND || '';
/** Conversation ID of the calling agent, used to reuse the conversation as team leader. */
const AION_MCP_CONVERSATION_ID = process.env.AION_MCP_CONVERSATION_ID || '';
process.stderr.write(
  `[team-guide-mcp-stdio] Script started. PID=${process.pid}, AION_MCP_PORT=${process.env.AION_MCP_PORT || 'unset'}, BACKEND=${AION_MCP_BACKEND || 'unset'}\n`
);
const AION_MCP_PORT = parseInt(process.env.AION_MCP_PORT || '0', 10);

if (!AION_MCP_PORT) {
  process.stderr.write('AION_MCP_PORT environment variable is required\n');
  process.exit(1);
}

if (!AION_MCP_TOKEN) {
  process.stderr.write('AION_MCP_TOKEN environment variable is required\n');
  process.exit(1);
}

// ── Tool helper ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createAionTool(
  server: McpServer,
  toolName: string,
  description: string,
  schema: any,
  tcpPort: number,
  authToken: string | undefined
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.tool(toolName, description, schema, async (args: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = {
        tool: toolName,
        args,
        auth_token: authToken,
        backend: AION_MCP_BACKEND,
        conversation_id: AION_MCP_CONVERSATION_ID,
      };
      const response = await sendTcpRequest(tcpPort, payload);

      if (response.error) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${response.error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: response.result || '' }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
        isError: true,
      };
    }
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'aionui-team-guide', version: '1.0.0' }, { capabilities: { tools: {} } });

// ---- aion_create_team ----
createAionTool(
  server,
  'aion_create_team',
  getCreateTeamToolDescription(),
  {
    summary: z.string().min(1).describe('Task summary or initial instruction to send to the team leader agent.'),
    name: z.string().optional().describe('Optional team name. When omitted the first few words of summary are used.'),
    workspace: z
      .string()
      .optional()
      .describe(
        'Absolute path to the project workspace directory. Team agents will use this as their shared working directory. When omitted a temporary workspace is created.'
      ),
  },
  AION_MCP_PORT,
  AION_MCP_TOKEN
);

// ---- aion_list_models ----
createAionTool(
  server,
  'aion_list_models',
  `Query available models for team agent types. Returns the real-time model list that matches the frontend model selector.

Use this BEFORE proposing a team configuration to check what models are available for each agent type.
Pass agent_type to query a specific backend, or omit it to see all.`,
  {
    agent_type: z
      .string()
      .optional()
      .describe('Agent type/backend to query (e.g. "gemini", "claude", "codex"). Shows all when omitted.'),
  },
  AION_MCP_PORT,
  AION_MCP_TOKEN
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`[team-guide-mcp-stdio] Fatal error: ${err}\n`);
  process.exit(1);
});
