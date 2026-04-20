/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standalone stdio MCP server for Team coordination tools.
 *
 * Spawned by Claude CLI as a stdio MCP server. Communicates with
 * the main process TCP server via TEAM_MCP_PORT environment variable.
 *
 * TCP protocol: 4-byte big-endian length header + UTF-8 JSON body.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { sendTcpRequest } from '../tcpHelpers';
import { TEAM_SPAWN_AGENT_DESCRIPTION } from '../../prompts/toolDescriptions';

const TEAM_AGENT_SLOT_ID = process.env.TEAM_AGENT_SLOT_ID || undefined;
const TEAM_MCP_TOKEN = process.env.TEAM_MCP_TOKEN || undefined;
process.stderr.write(
  `[team-mcp-stdio] Script started. PID=${process.pid}, TEAM_MCP_PORT=${process.env.TEAM_MCP_PORT || 'unset'}, SLOT=${TEAM_AGENT_SLOT_ID || 'unset'}\n`
);
const TEAM_MCP_PORT = parseInt(process.env.TEAM_MCP_PORT || '0', 10);

if (!TEAM_MCP_PORT) {
  process.stderr.write('TEAM_MCP_PORT environment variable is required\n');
  process.exit(1);
}

if (!TEAM_MCP_TOKEN) {
  process.stderr.write('TEAM_MCP_TOKEN environment variable is required\n');
  process.exit(1);
}

// ── Tool helper ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createTeamTool(
  server: McpServer,
  toolName: string,
  description: string,
  schema: any,
  tcpPort: number,
  agentSlotId: string | undefined,
  authToken: string | undefined
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.tool(toolName, description, schema, async (args: Record<string, unknown>) => {
    try {
      const payload: Record<string, unknown> = { tool: toolName, args, auth_token: authToken };
      if (agentSlotId) payload.from_slot_id = agentSlotId;
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

const server = new McpServer({ name: 'aionui-team', version: '1.0.0' }, { capabilities: { tools: {} } });

// ---- team_send_message ----
createTeamTool(
  server,
  'team_send_message',
  `Send a message to a teammate by name. The message is delivered to their mailbox and they will be woken up to process it.

Use this to:
- Assign work to a teammate
- Share findings or results
- Ask a teammate for help
- Coordinate next steps

The "to" field should be a teammate name (e.g., "researcher", "developer").
Use "*" to broadcast to all teammates.`,
  {
    to: z.string().describe('Recipient teammate name, or "*" for broadcast to all'),
    message: z.string().describe('The message content to send'),
    summary: z.string().optional().describe('A short 5-10 word summary for the UI'),
  },
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

// ---- team_spawn_agent ----
createTeamTool(
  server,
  'team_spawn_agent',
  TEAM_SPAWN_AGENT_DESCRIPTION,
  {
    name: z.string().describe('Name for the new teammate (e.g., "researcher", "developer", "tester")'),
    agent_type: z
      .string()
      .optional()
      .describe(
        'Agent type/backend to use for the new teammate. Must be one of the types listed in "Available Agent Types for Spawning". Defaults to the leader type when omitted.'
      ),
    model: z
      .string()
      .optional()
      .describe(
        'Model ID to use for this agent (e.g. "claude-sonnet-4", "gemini-2.5-pro"). ' +
          "Defaults to the backend's preferred model when omitted."
      ),
  },
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

// ---- team_task_create ----
createTeamTool(
  server,
  'team_task_create',
  `Create a new task on the team's shared task board.

Tasks are visible to all team members and help coordinate work.
Each task has a subject, optional description, and optional owner.

Best practices:
- Create tasks before assigning work
- Set the owner to the teammate who should work on it
- Break large tasks into smaller, actionable items`,
  {
    subject: z.string().describe('Short task title (what needs to be done)'),
    description: z.string().optional().describe('Detailed description of the task'),
    owner: z.string().optional().describe('Teammate name to assign this task to'),
  },
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

// ---- team_task_update ----
createTeamTool(
  server,
  'team_task_update',
  `Update the status or assignment of an existing task.

Use this to:
- Mark a task as completed or in_progress
- Reassign a task to a different teammate
- Update task status when work is done`,
  {
    task_id: z.string().describe('Task ID (first 8 chars are enough)'),
    status: z.enum(['pending', 'in_progress', 'completed', 'deleted']).optional().describe('New task status'),
    owner: z.string().optional().describe('New owner (teammate name)'),
  },
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

// ---- team_task_list ----
createTeamTool(
  server,
  'team_task_list',
  `List all tasks on the team's task board.

Shows task ID, subject, status, and owner for each task.
Use this to check what work is pending, in progress, or completed.`,
  {},
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

// ---- team_members ----
createTeamTool(
  server,
  'team_members',
  `List all current team members with their names, types, and status.
Use this to discover available teammates before sending messages or assigning tasks.`,
  {},
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

// ---- team_rename_agent ----
createTeamTool(
  server,
  'team_rename_agent',
  `Rename a teammate. Use this to give a teammate a more descriptive name.`,
  {
    agent: z.string().describe('Current agent name or slot ID'),
    new_name: z.string().describe('New name for the agent'),
  },
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

// ---- team_shutdown_agent ----
createTeamTool(
  server,
  'team_shutdown_agent',
  `Request a teammate to shut down gracefully. The teammate can accept or reject the request.

Use this when:
- The user explicitly asks to dismiss, fire, or shut down a teammate

The teammate will receive a shutdown request and respond with approval or rejection.
You will be notified of the result either way.`,
  {
    agent: z.string().describe('Teammate name to request shutdown'),
  },
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

// ---- team_list_models ----
createTeamTool(
  server,
  'team_list_models',
  `Query available models for team agent types. Returns the real-time model list that matches the frontend model selector.

Use this to:
- Check what models are available before spawning an agent with a specific model
- See all available agent types and their models at once
- Verify a model ID is valid for a given agent type

Pass agent_type to query a specific backend, or omit it to see all.`,
  {
    agent_type: z
      .string()
      .optional()
      .describe('Agent type/backend to query (e.g. "gemini", "claude", "codex"). Shows all when omitted.'),
  },
  TEAM_MCP_PORT,
  TEAM_AGENT_SLOT_ID,
  TEAM_MCP_TOKEN
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Notify main process that MCP server is ready to handle tool calls.
  // Fire-and-forget: if the notification fails, the main process falls back
  // to its timeout in waitForMcpReady().
  if (TEAM_MCP_PORT && TEAM_MCP_TOKEN) {
    sendTcpRequest(TEAM_MCP_PORT, {
      type: 'mcp_ready',
      slot_id: TEAM_AGENT_SLOT_ID,
      auth_token: TEAM_MCP_TOKEN,
    }).catch((err: unknown) => {
      process.stderr.write(`[team-mcp-stdio] Failed to send mcp_ready: ${err}\n`);
    });
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`[team-mcp-stdio] Fatal error: ${err}\n`);
  process.exit(1);
});
