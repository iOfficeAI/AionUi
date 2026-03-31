// src/process/team/TeamMcpServer.ts
//
// Lightweight MCP server that exposes team coordination tools to ACP agents.
// Runs as an HTTP server in the Electron main process so it has direct access
// to the team's Mailbox, TaskManager, and TeammateManager.
//
// Each TeamSession owns one TeamMcpServer instance. The server URL is injected
// into every agent's ACP session via `session/new { mcpServers }`.

import http from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Mailbox } from './Mailbox';
import type { TaskManager } from './TaskManager';
import type { TeamAgent } from './types';

type SpawnAgentFn = (agentName: string, agentType?: string) => Promise<TeamAgent>;

type TeamMcpServerParams = {
  teamId: string;
  getAgents: () => TeamAgent[];
  mailbox: Mailbox;
  taskManager: TaskManager;
  spawnAgent?: SpawnAgentFn;
  wakeAgent: (slotId: string) => Promise<void>;
};

/**
 * MCP server that provides team coordination tools to ACP agents.
 * Uses Streamable HTTP transport (supported by all ACP backends by default).
 */
export class TeamMcpServer {
  private readonly params: TeamMcpServerParams;
  private httpServer: http.Server | null = null;
  private mcpServer: McpServer | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
  private port = 0;

  constructor(params: TeamMcpServerParams) {
    this.params = params;
  }

  /** Start the HTTP server and return the URL for injection into ACP sessions */
  async start(): Promise<string> {
    const mcp = new McpServer({
      name: `aionui-team-${this.params.teamId}`,
      version: '1.0.0',
    });
    this.mcpServer = mcp;

    this.registerTools(mcp);

    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    await mcp.connect(this.transport);

    // Create HTTP server that delegates to the transport
    const transport = this.transport;
    this.httpServer = http.createServer(async (req, res) => {
      // Handle CORS for local connections
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('[TeamMcpServer] Error handling request:', error);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      }
    });

    // Listen on random available port
    return new Promise<string>((resolve, reject) => {
      this.httpServer!.listen(0, '127.0.0.1', () => {
        const addr = this.httpServer!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          const url = `http://127.0.0.1:${this.port}/mcp`;
          console.log(`[TeamMcpServer] Team ${this.params.teamId} MCP server started on port ${this.port}`);
          resolve(url);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      this.httpServer!.on('error', reject);
    });
  }

  /** Stop the HTTP server */
  async stop(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    if (this.httpServer) {
      return new Promise<void>((resolve) => {
        this.httpServer!.close(() => {
          console.log(`[TeamMcpServer] Team ${this.params.teamId} MCP server stopped`);
          this.httpServer = null;
          resolve();
        });
      });
    }
  }

  /** Get the port the server is listening on */
  getPort(): number {
    return this.port;
  }

  private resolveSlotId(nameOrSlotId: string): string | undefined {
    const agents = this.params.getAgents();
    const bySlot = agents.find((a) => a.slotId === nameOrSlotId);
    if (bySlot) return bySlot.slotId;
    const byName = agents.find((a) => a.agentName.toLowerCase() === nameOrSlotId.toLowerCase());
    return byName?.slotId;
  }

  private registerTools(mcp: McpServer): void {
    const { teamId, getAgents, mailbox, taskManager, spawnAgent, wakeAgent } = this.params;

    // ---- team_send_message ----
    mcp.tool(
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
      async ({ to, message, summary }) => {
        const agents = getAgents();
        const fromAgent = agents.find((a) => a.role === 'lead') ?? agents[0];
        const fromSlotId = fromAgent?.slotId ?? 'unknown';

        if (to === '*') {
          // Broadcast
          const recipients: string[] = [];
          for (const agent of agents) {
            if (agent.slotId === fromSlotId) continue;
            await mailbox.write({
              teamId,
              toAgentId: agent.slotId,
              fromAgentId: fromSlotId,
              content: message,
              summary,
            });
            recipients.push(agent.agentName);
            void wakeAgent(agent.slotId);
          }
          return {
            content: [{ type: 'text' as const, text: `Message broadcast to ${recipients.length} teammate(s): ${recipients.join(', ')}` }],
          };
        }

        const targetSlotId = this.resolveSlotId(to);
        if (!targetSlotId) {
          return {
            content: [{ type: 'text' as const, text: `Teammate "${to}" not found. Available: ${agents.map((a) => a.agentName).join(', ')}` }],
            isError: true,
          };
        }

        await mailbox.write({
          teamId,
          toAgentId: targetSlotId,
          fromAgentId: fromSlotId,
          content: message,
          summary,
        });
        void wakeAgent(targetSlotId);

        return {
          content: [{ type: 'text' as const, text: `Message sent to ${to}'s inbox. They will process it shortly.` }],
        };
      }
    );

    // ---- team_spawn_agent ----
    mcp.tool(
      'team_spawn_agent',
      `Create a new teammate agent to join the team.

Use this when:
- You need specialized expertise (e.g., a researcher, tester, developer)
- The task requires parallel work by multiple agents
- You need to delegate a sub-task to a dedicated agent

The new agent will be created and added to the team. You can then assign tasks and send messages to it.`,
      {
        name: z.string().describe('Name for the new teammate (e.g., "researcher", "developer", "tester")'),
        agent_type: z.string().optional().describe('Agent type/backend (default: "acp"). Options: acp, gemini, codex'),
      },
      async ({ name, agent_type }) => {
        if (!spawnAgent) {
          return {
            content: [{ type: 'text' as const, text: 'Agent spawning is not available for this team.' }],
            isError: true,
          };
        }

        try {
          const newAgent = await spawnAgent(name, agent_type);
          // Write an initial message so the new agent has context when woken
          const agents = getAgents();
          const fromAgent = agents.find((a) => a.role === 'lead') ?? agents[0];
          const fromSlotId = fromAgent?.slotId ?? 'unknown';
          await mailbox.write({
            teamId,
            toAgentId: newAgent.slotId,
            fromAgentId: fromSlotId,
            content: `You have been spawned as "${name}" and added to the team. Check the task board and await instructions.`,
          });
          // Wake the new agent so it starts processing immediately
          void wakeAgent(newAgent.slotId);
          return {
            content: [{
              type: 'text' as const,
              text: `Teammate "${name}" (${newAgent.slotId}) has been created and joined the team. You can now assign tasks and send messages to them.`,
            }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Failed to spawn agent "${name}": ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    );

    // ---- team_task_create ----
    mcp.tool(
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
      async ({ subject, description, owner }) => {
        try {
          const task = await taskManager.create({
            teamId,
            subject,
            description,
            owner,
          });
          return {
            content: [{
              type: 'text' as const,
              text: `Task created: [${task.id.slice(0, 8)}] "${subject}"${owner ? ` (assigned to ${owner})` : ''}`,
            }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Failed to create task: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    );

    // ---- team_task_update ----
    mcp.tool(
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
      async ({ task_id, status, owner }) => {
        try {
          await taskManager.update(task_id, {
            status: status as 'pending' | 'in_progress' | 'completed' | 'deleted' | undefined,
            owner,
          });
          if (status === 'completed') {
            await taskManager.checkUnblocks(task_id);
          }
          return {
            content: [{
              type: 'text' as const,
              text: `Task ${task_id.slice(0, 8)} updated.${status ? ` Status: ${status}.` : ''}${owner ? ` Owner: ${owner}.` : ''}`,
            }],
          };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Failed to update task: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    );

    // ---- team_task_list ----
    mcp.tool(
      'team_task_list',
      `List all tasks on the team's task board.

Shows task ID, subject, status, and owner for each task.
Use this to check what work is pending, in progress, or completed.`,
      {},
      async () => {
        try {
          const tasks = await taskManager.list(teamId);
          if (tasks.length === 0) {
            return { content: [{ type: 'text' as const, text: 'No tasks on the board yet.' }] };
          }
          const lines = tasks.map(
            (t) => `- [${t.id.slice(0, 8)}] ${t.subject} (${t.status}${t.owner ? `, owner: ${t.owner}` : ', unassigned'})`
          );
          return { content: [{ type: 'text' as const, text: `## Team Tasks\n${lines.join('\n')}` }] };
        } catch (error) {
          return {
            content: [{ type: 'text' as const, text: `Failed to list tasks: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          };
        }
      }
    );

    // ---- team_members ----
    mcp.tool(
      'team_members',
      `List all current team members with their names, types, and status.
Use this to discover available teammates before sending messages or assigning tasks.`,
      {},
      async () => {
        const agents = getAgents();
        if (agents.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No team members yet.' }] };
        }
        const lines = agents.map(
          (a) => `- ${a.agentName} (type: ${a.agentType}, role: ${a.role}, status: ${a.status})`
        );
        return { content: [{ type: 'text' as const, text: `## Team Members\n${lines.join('\n')}` }] };
      }
    );
  }
}
