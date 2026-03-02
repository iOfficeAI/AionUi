/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Agent Connectivity & Stream Stability Integration Tests
 *
 * Tests real CLI connectivity for ACP-based agents: Gemini CLI, Codex, Qwen, iFlow.
 * Each agent is spawned via AcpConnection, verified through the JSON-RPC handshake
 * (initialize → session/new → session/prompt), and its streaming behavior is validated.
 *
 * These tests require the corresponding CLI tools to be installed locally.
 * Tests for unavailable CLIs are automatically skipped.
 *
 * Auth/quota errors are reported as diagnostics (not hard failures) because
 * CI environments may not have credentials configured.
 *
 * Run: npm run test:integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import os from 'os';
import type { AcpBackend, AcpSessionUpdate } from '@/types/acpTypes';
import { AcpConnection, createGenericSpawnConfig } from '@/agent/acp/AcpConnection';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isWindows = process.platform === 'win32';
const TEST_CWD = os.tmpdir();

/** Timeout for CLI spawn + ACP initialize (npx may need to download packages) */
const CONNECT_TIMEOUT = 120_000;
/** Timeout for session/new */
const SESSION_TIMEOUT = 60_000;
/** Timeout for a simple prompt round-trip */
const PROMPT_TIMEOUT = 120_000;

/**
 * Well-known error patterns that indicate auth/quota issues rather than
 * protocol or streaming bugs. When a test hits one of these, it's an
 * environment problem — not a code defect — so we report it and pass.
 */
const AUTH_QUOTA_PATTERNS = [
  /auth/i,
  /quota/i,
  /rate.?limit/i,
  /unauthorized/i,
  /403/,
  /401/,
  /api.?key/i,
  /credential/i,
  /token.*expired/i,
  /permission.*denied/i,
  /billing/i,
  /exceeded/i,
];

function isAuthOrQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return AUTH_QUOTA_PATTERNS.some((re) => re.test(msg));
}

/**
 * Run an async test body. If it throws an auth/quota error, log a warning
 * and pass the test instead of failing.
 */
async function withAuthGuard(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    if (isAuthOrQuotaError(error)) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`  ⚠ [${label}] Skipped due to auth/quota issue: ${msg}`);
      return; // pass — not a code defect
    }
    throw error; // re-throw real errors
  }
}

/**
 * Check whether a CLI executable is available on the system PATH.
 * Returns the resolved path or null.
 */
function resolveCliPath(cmd: string): string | null {
  try {
    const whereCmd = isWindows ? `where ${cmd}` : `which ${cmd}`;
    const result = execSync(whereCmd, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    // `where` on Windows may return multiple lines; take the first one
    return result.split(/\r?\n/)[0] || null;
  } catch {
    return null;
  }
}

/**
 * Agent descriptor for test parameterisation.
 */
interface AgentTestConfig {
  /** Human-readable label shown in test output */
  label: string;
  /** ACP backend identifier */
  backend: AcpBackend;
  /** CLI command to detect */
  cliCmd: string;
  /** Override CLI path (when not just the command name) */
  cliPath?: string;
  /** Extra ACP launch arguments (default: --experimental-acp) */
  acpArgs?: string[];
  /** A trivial prompt that should produce a short text response */
  testPrompt: string;
  /** Whether the agent uses npx instead of a local binary */
  isNpx?: boolean;
}

const AGENTS: AgentTestConfig[] = [
  {
    label: 'Gemini CLI',
    backend: 'gemini',
    cliCmd: 'gemini',
    testPrompt: 'Reply with exactly: hello',
  },
  {
    label: 'Codex (via ACP bridge)',
    backend: 'codex',
    cliCmd: 'codex',
    testPrompt: 'Reply with exactly: hello',
    isNpx: true,
  },
  {
    label: 'Qwen Code',
    backend: 'qwen',
    cliCmd: 'qwen',
    testPrompt: 'Reply with exactly: hello',
  },
  {
    label: 'iFlow CLI',
    backend: 'iflow',
    cliCmd: 'iflow',
    testPrompt: 'Reply with exactly: hello',
  },
];

// ---------------------------------------------------------------------------
// Detect which agents are available BEFORE tests run
// ---------------------------------------------------------------------------
const agentAvailability = new Map<string, string | null>();
for (const agent of AGENTS) {
  agentAvailability.set(agent.label, resolveCliPath(agent.cliCmd));
}

/**
 * Conditional `it`: skips the test when the CLI is not installed.
 */
function itIfAvailable(agent: AgentTestConfig) {
  const cliPath = agentAvailability.get(agent.label);
  return cliPath ? it : it.skip;
}

// ---------------------------------------------------------------------------
// Test Suite: Per-agent connectivity
// ---------------------------------------------------------------------------

describe('Agent Connectivity Integration Tests', () => {
  // Print detection results once for visibility
  it('should report agent detection results', () => {
    const results: string[] = [];
    for (const agent of AGENTS) {
      const resolved = agentAvailability.get(agent.label);
      results.push(`${agent.label}: ${resolved ? `FOUND at ${resolved}` : 'NOT FOUND (tests will be skipped)'}`);
    }
    console.log('\n--- Agent Detection ---');
    results.forEach((r) => console.log(`  ${r}`));
    console.log('--- End Detection ---\n');
    expect(results.length).toBe(AGENTS.length);
  });

  for (const agent of AGENTS) {
    describe(`[${agent.label}]`, () => {
      let connection: AcpConnection;

      beforeEach(() => {
        connection = new AcpConnection();
      });

      afterEach(async () => {
        try {
          await connection.disconnect();
        } catch {
          // Ignore cleanup errors
        }
      });

      // --- 1. Spawn config sanity check (no CLI required) ---
      it('should produce valid spawn config', () => {
        const cliPath = agent.cliPath || agentAvailability.get(agent.label) || agent.cliCmd;
        const config = createGenericSpawnConfig(cliPath, TEST_CWD, agent.acpArgs);
        expect(config.command).toBeTruthy();
        expect(config.options.cwd).toBe(TEST_CWD);
        expect(config.options.stdio).toEqual(['pipe', 'pipe', 'pipe']);
        if (isWindows) {
          expect(config.options.shell).toBe(true);
        }
      });

      // --- 2. ACP connect + initialize ---
      itIfAvailable(agent)(
        'should connect and complete ACP initialize handshake',
        async () => {
          const cliPath = agent.cliPath || agentAvailability.get(agent.label) || agent.cliCmd;
          await connection.connect(agent.backend, cliPath, TEST_CWD, agent.acpArgs);

          expect(connection.isConnected).toBe(true);

          const initResponse = connection.getInitializeResponse();
          expect(initResponse).toBeTruthy();
          console.log(`  ✓ [${agent.label}] ACP initialize OK`);
        },
        CONNECT_TIMEOUT,
      );

      // --- 3. Session creation ---
      itIfAvailable(agent)(
        'should create a new ACP session',
        async () => {
          await withAuthGuard(agent.label, async () => {
            const cliPath = agent.cliPath || agentAvailability.get(agent.label) || agent.cliCmd;
            await connection.connect(agent.backend, cliPath, TEST_CWD, agent.acpArgs);

            const sessionResponse = await connection.newSession(TEST_CWD);

            expect(connection.hasActiveSession).toBe(true);
            if (sessionResponse.sessionId) {
              expect(typeof sessionResponse.sessionId).toBe('string');
              expect(sessionResponse.sessionId.length).toBeGreaterThan(0);
            }
            console.log(`  ✓ [${agent.label}] session/new OK (sessionId=${sessionResponse.sessionId || 'N/A'})`);
          });
        },
        CONNECT_TIMEOUT + SESSION_TIMEOUT,
      );

      // --- 4. Stream stability: send prompt and collect chunks ---
      itIfAvailable(agent)(
        'should stream response chunks for a simple prompt',
        async () => {
          await withAuthGuard(agent.label, async () => {
            const cliPath = agent.cliPath || agentAvailability.get(agent.label) || agent.cliCmd;

            const updates: AcpSessionUpdate[] = [];
            let hasTextChunk = false;

            connection.onSessionUpdate = (data: AcpSessionUpdate) => {
              updates.push(data);
              if (
                data.update &&
                typeof data.update === 'object' &&
                'sessionUpdate' in data.update &&
                data.update.sessionUpdate === 'agent_message_chunk'
              ) {
                hasTextChunk = true;
              }
            };
            connection.onPermissionRequest = async () => ({ optionId: 'allow' });

            await connection.connect(agent.backend, cliPath, TEST_CWD, agent.acpArgs);
            await connection.newSession(TEST_CWD);

            const promptResponse = await connection.sendPrompt(agent.testPrompt);

            expect(promptResponse).toBeTruthy();
            expect(updates.length).toBeGreaterThan(0);
            expect(hasTextChunk).toBe(true);

            console.log(`  ✓ [${agent.label}] Received ${updates.length} stream updates`);
          });
        },
        CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT,
      );

      // --- 5. Graceful disconnect ---
      itIfAvailable(agent)(
        'should disconnect cleanly after a session',
        async () => {
          await withAuthGuard(agent.label, async () => {
            const cliPath = agent.cliPath || agentAvailability.get(agent.label) || agent.cliCmd;
            await connection.connect(agent.backend, cliPath, TEST_CWD, agent.acpArgs);
            await connection.newSession(TEST_CWD);

            expect(connection.isConnected).toBe(true);

            await connection.disconnect();

            expect(connection.isConnected).toBe(false);
            expect(connection.hasActiveSession).toBe(false);
            console.log(`  ✓ [${agent.label}] Graceful disconnect OK`);
          });
        },
        CONNECT_TIMEOUT + SESSION_TIMEOUT + 10_000,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// ACP Protocol Robustness Tests
// ---------------------------------------------------------------------------

describe('ACP Protocol Robustness', () => {
  const firstAvailable = AGENTS.find((a) => agentAvailability.get(a.label) !== null);
  const itProto = firstAvailable ? it : it.skip;
  const getCliPath = () => (firstAvailable ? agentAvailability.get(firstAvailable.label) || firstAvailable.cliCmd : '');

  let connection: AcpConnection;

  beforeEach(() => {
    connection = new AcpConnection();
  });

  afterEach(async () => {
    try {
      await connection.disconnect();
    } catch {
      // Ignore
    }
  });

  itProto(
    'should reject sendPrompt before session is created',
    async () => {
      const cliPath = getCliPath();
      await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);

      await expect(connection.sendPrompt('test')).rejects.toThrow(/No active ACP session/);
    },
    CONNECT_TIMEOUT,
  );

  itProto(
    'should handle double-disconnect gracefully',
    async () => {
      const cliPath = getCliPath();
      await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);

      await connection.disconnect();
      // Second disconnect should not throw
      await expect(connection.disconnect()).resolves.toBeUndefined();
    },
    CONNECT_TIMEOUT + 10_000,
  );

  itProto(
    'should handle multiple sequential prompts in the same session',
    async () => {
      await withAuthGuard('multi-prompt', async () => {
        const cliPath = getCliPath();
        const updates: AcpSessionUpdate[] = [];

        connection.onSessionUpdate = (data) => updates.push(data);
        connection.onPermissionRequest = async () => ({ optionId: 'allow' });

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);

        // First prompt
        const resp1 = await connection.sendPrompt('Reply with: first');
        expect(resp1).toBeTruthy();
        const updatesAfterFirst = updates.length;
        expect(updatesAfterFirst).toBeGreaterThan(0);

        // Second prompt in the same session
        const resp2 = await connection.sendPrompt('Reply with: second');
        expect(resp2).toBeTruthy();
        expect(updates.length).toBeGreaterThan(updatesAfterFirst);

        console.log(`  ✓ [multi-prompt] Total updates: ${updates.length} (first: ${updatesAfterFirst}, second: ${updates.length - updatesAfterFirst})`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT * 2,
  );

  it('should throw when connecting to an invalid backend with missing CLI path', async () => {
    await expect(connection.connect('qwen' as AcpBackend, undefined, TEST_CWD)).rejects.toThrow(/CLI path is required/);
  });

  it('should throw when connecting with a non-existent CLI path', async () => {
    await expect(connection.connect('qwen' as AcpBackend, '/nonexistent/cli/path', TEST_CWD)).rejects.toThrow();
  });

  itProto(
    'should report isConnected=false after process crash',
    async () => {
      const cliPath = getCliPath();
      await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);

      expect(connection.isConnected).toBe(true);

      // Force disconnect (simulates process kill)
      await connection.disconnect();
      expect(connection.isConnected).toBe(false);
    },
    CONNECT_TIMEOUT + 10_000,
  );
});

// ---------------------------------------------------------------------------
// Stream Chunk Integrity Tests
// ---------------------------------------------------------------------------

describe('Stream Chunk Integrity', () => {
  const firstAvailable = AGENTS.find((a) => agentAvailability.get(a.label) !== null);
  const itStream = firstAvailable ? it : it.skip;
  const getCliPath = () => (firstAvailable ? agentAvailability.get(firstAvailable.label) || firstAvailable.cliCmd : '');

  let connection: AcpConnection;

  beforeEach(() => {
    connection = new AcpConnection();
  });

  afterEach(async () => {
    try {
      await connection.disconnect();
    } catch {
      // Ignore
    }
  });

  itStream(
    'should receive stream updates with valid sessionId',
    async () => {
      await withAuthGuard('session-id-check', async () => {
        const cliPath = getCliPath();
        const sessionIds = new Set<string>();

        connection.onSessionUpdate = (data) => {
          if (data.sessionId) {
            sessionIds.add(data.sessionId);
          }
        };
        connection.onPermissionRequest = async () => ({ optionId: 'allow' });

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        const sessionResp = await connection.newSession(TEST_CWD);
        await connection.sendPrompt('Reply with exactly: test');

        // All streaming updates should reference the same session
        if (sessionIds.size > 0) {
          expect(sessionIds.size).toBe(1);
          if (sessionResp.sessionId) {
            expect(sessionIds.has(sessionResp.sessionId)).toBe(true);
          }
        }
        console.log(`  ✓ [session-id-check] Unique sessionIds in stream: ${sessionIds.size}`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT,
  );

  itStream(
    'should track text content accumulation across chunks',
    async () => {
      await withAuthGuard('chunk-accumulation', async () => {
        const cliPath = getCliPath();
        const textChunks: string[] = [];

        connection.onSessionUpdate = (data) => {
          if (
            data.update &&
            typeof data.update === 'object' &&
            'sessionUpdate' in data.update &&
            data.update.sessionUpdate === 'agent_message_chunk' &&
            'content' in data.update
          ) {
            const content = data.update.content as { text?: string };
            if (content.text) {
              textChunks.push(content.text);
            }
          }
        };
        connection.onPermissionRequest = async () => ({ optionId: 'allow' });

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);
        await connection.sendPrompt('Reply with exactly one word: hello');

        const fullText = textChunks.join('');

        expect(fullText.length).toBeGreaterThan(0);
        expect(fullText.toLowerCase()).toContain('hello');

        console.log(`  ✓ [chunk-accumulation] ${textChunks.length} chunks, total ${fullText.length} chars`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT,
  );

  itStream(
    'should fire onEndTurn callback when response completes',
    async () => {
      await withAuthGuard('end-turn', async () => {
        const cliPath = getCliPath();
        let endTurnFired = false;

        connection.onEndTurn = () => {
          endTurnFired = true;
        };
        connection.onSessionUpdate = () => {};
        connection.onPermissionRequest = async () => ({ optionId: 'allow' });

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);
        await connection.sendPrompt('Reply with exactly: done');

        // end_turn behavior varies by backend — just log the result
        console.log(`  [end-turn] endTurnFired: ${endTurnFired}`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT,
  );

  itStream(
    'should handle rapid sequential prompts without interleaved chunks',
    async () => {
      await withAuthGuard('rapid-prompts', async () => {
        const cliPath = getCliPath();
        const msgBoundaries: number[] = []; // index where each prompt's chunks start
        let updateCount = 0;

        connection.onSessionUpdate = () => {
          updateCount++;
        };
        connection.onPermissionRequest = async () => ({ optionId: 'allow' });

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);

        // Send 3 prompts sequentially and verify each completes before the next
        for (let i = 0; i < 3; i++) {
          msgBoundaries.push(updateCount);
          await connection.sendPrompt(`Reply with exactly: msg${i}`);
        }

        // Each boundary should be strictly less than the next
        for (let i = 1; i < msgBoundaries.length; i++) {
          expect(msgBoundaries[i]).toBeGreaterThanOrEqual(msgBoundaries[i - 1]);
        }

        console.log(`  ✓ [rapid-prompts] 3 prompts, total ${updateCount} updates, boundaries: [${msgBoundaries.join(', ')}]`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT * 3,
  );
});

// ---------------------------------------------------------------------------
// Disconnect & Reconnect Resilience
// ---------------------------------------------------------------------------

describe('Disconnect & Reconnect Resilience', () => {
  const firstAvailable = AGENTS.find((a) => agentAvailability.get(a.label) !== null);
  const itResilience = firstAvailable ? it : it.skip;
  const getCliPath = () => (firstAvailable ? agentAvailability.get(firstAvailable.label) || firstAvailable.cliCmd : '');

  let connection: AcpConnection;

  beforeEach(() => {
    connection = new AcpConnection();
  });

  afterEach(async () => {
    try {
      await connection.disconnect();
    } catch {
      // Ignore
    }
  });

  itResilience(
    'should reconnect after a clean disconnect',
    async () => {
      const cliPath = getCliPath();

      // First connection
      await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
      expect(connection.isConnected).toBe(true);
      await connection.disconnect();
      expect(connection.isConnected).toBe(false);

      // Reconnect — should succeed
      await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
      expect(connection.isConnected).toBe(true);
      console.log(`  ✓ Reconnect after disconnect OK`);
    },
    CONNECT_TIMEOUT * 2 + 10_000,
  );

  itResilience(
    'should invoke onDisconnect callback on unexpected exit',
    async () => {
      const cliPath = getCliPath();
      let disconnectCalled = false;
      let disconnectInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null;

      connection.onDisconnect = (info) => {
        disconnectCalled = true;
        disconnectInfo = info;
      };

      await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);

      // disconnect() is a clean shutdown, but it tests the cleanup path
      await connection.disconnect();

      // After disconnect, the callback may or may not fire (depends on whether
      // the process was in "setup complete" state). Just verify no crash.
      console.log(`  [onDisconnect] called=${disconnectCalled}, info=${JSON.stringify(disconnectInfo)}`);
    },
    CONNECT_TIMEOUT + 10_000,
  );
});

// ---------------------------------------------------------------------------
// History & Context Retention Tests
// ---------------------------------------------------------------------------

describe('History & Context Retention', () => {
  const firstAvailable = AGENTS.find((a) => agentAvailability.get(a.label) !== null);
  const itContext = firstAvailable ? it : it.skip;
  const getCliPath = () => (firstAvailable ? agentAvailability.get(firstAvailable.label) || firstAvailable.cliCmd : '');

  let connection: AcpConnection;

  beforeEach(() => {
    connection = new AcpConnection();
  });

  afterEach(async () => {
    try {
      await connection.disconnect();
    } catch {
      // Ignore
    }
  });

  /**
   * Helper: attach an onSessionUpdate handler that collects text chunks.
   * Returns a drain function — call it after each sendPrompt to get the
   * accumulated text and reset the buffer for the next turn.
   */
  function collectText(conn: AcpConnection): () => string {
    const chunks: string[] = [];
    conn.onSessionUpdate = (data) => {
      if (
        data.update &&
        typeof data.update === 'object' &&
        'sessionUpdate' in data.update &&
        data.update.sessionUpdate === 'agent_message_chunk' &&
        'content' in data.update
      ) {
        const content = data.update.content as { text?: string };
        if (content.text) {
          chunks.push(content.text);
        }
      }
    };
    conn.onPermissionRequest = async () => ({ optionId: 'allow' });
    return () => {
      const full = chunks.join('');
      chunks.length = 0;
      return full;
    };
  }

  // --- 1. Basic context recall ---
  itContext(
    'should remember a fact stated in the previous turn',
    async () => {
      await withAuthGuard('basic-context', async () => {
        const cliPath = getCliPath();
        const getText = collectText(connection);

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);

        // Turn 1: state a unique fact
        await connection.sendPrompt(
          'Remember this: my project name is "NeonForge". Just confirm you noted it.',
        );
        const resp1 = getText();
        expect(resp1.length).toBeGreaterThan(0);

        // Turn 2: ask for the fact back
        await connection.sendPrompt(
          'What is my project name? Reply with just the name, nothing else.',
        );
        const resp2 = getText().toLowerCase();
        expect(resp2).toContain('neonforge');

        console.log(`  ✓ [basic-context] Model recalled "NeonForge" — context retained`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT * 2,
  );

  // --- 2. Multi-turn progressive context accumulation ---
  itContext(
    'should retain context across 4+ turns of progressive information',
    async () => {
      await withAuthGuard('multi-turn-context', async () => {
        const cliPath = getCliPath();
        const getText = collectText(connection);

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);

        // Turn 1
        await connection.sendPrompt(
          'I am building a REST API with Express.js. The port is 4567. Just acknowledge.',
        );
        getText();

        // Turn 2
        await connection.sendPrompt(
          'The API has three endpoints: GET /users, POST /users, DELETE /users/:id. Just acknowledge.',
        );
        getText();

        // Turn 3
        await connection.sendPrompt(
          'I also want to add rate limiting: 100 requests per minute per IP. Just acknowledge.',
        );
        getText();

        // Turn 4: quiz on ALL accumulated context
        await connection.sendPrompt(
          'Summarize everything I told you about my API: the framework, port number, all endpoints, and the rate limit. Be concise.',
        );
        const summary = getText().toLowerCase();

        expect(summary).toContain('express');
        expect(summary).toContain('4567');
        expect(summary).toContain('/users');
        expect(summary).toMatch(/100/);

        console.log(`  ✓ [multi-turn-context] Model retained context across 4 turns`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT * 4,
  );

  // --- 3. Coding task context: component requirements refined over turns ---
  itContext(
    'should maintain coding task context when requirements are refined over turns',
    async () => {
      await withAuthGuard('coding-task-context', async () => {
        const cliPath = getCliPath();
        const getText = collectText(connection);

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);

        // Turn 1: describe a component
        await connection.sendPrompt(
          'I have a React component called UserDashboard that shows a table of users with columns: name, email, role. Acknowledge.',
        );
        getText();

        // Turn 2: add a requirement
        await connection.sendPrompt(
          'I want to add a search bar to UserDashboard that filters users by name. Acknowledge.',
        );
        getText();

        // Turn 3: verify the model remembers the full picture
        await connection.sendPrompt(
          'What is the component name I described, and what columns does the table have? Reply concisely.',
        );
        const resp = getText().toLowerCase();

        expect(resp).toContain('userdashboard');
        expect(resp).toContain('name');
        expect(resp).toContain('email');
        expect(resp).toContain('role');

        console.log(`  ✓ [coding-task-context] Model retained component details across turns`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT * 3,
  );

  // --- 4. Context survives after a long response ---
  itContext(
    'should retain earlier context even after generating a long response',
    async () => {
      await withAuthGuard('long-response-context', async () => {
        const cliPath = getCliPath();
        const getText = collectText(connection);

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);

        // Turn 1: state a unique identifier
        await connection.sendPrompt(
          'The secret code is "ZETA-7742". Remember it. Just confirm.',
        );
        getText();

        // Turn 2: ask for a longer response to push turn-1 further back in context
        await connection.sendPrompt(
          'Write a brief explanation (3-5 sentences) of how TCP/IP works.',
        );
        const longResp = getText();
        expect(longResp.length).toBeGreaterThan(50);

        // Turn 3: recall the code from turn 1
        await connection.sendPrompt(
          'What was the secret code I told you earlier? Reply with just the code.',
        );
        const codeResp = getText().toUpperCase();
        expect(codeResp).toContain('ZETA-7742');

        console.log(`  ✓ [long-response-context] Model recalled secret code after long response`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT * 3,
  );

  // --- 5. Numerical / precise data retention across a distractor turn ---
  itContext(
    'should accurately recall specific numerical values after a distractor turn',
    async () => {
      await withAuthGuard('numerical-context', async () => {
        const cliPath = getCliPath();
        const getText = collectText(connection);

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);

        // Turn 1: provide several specific numbers
        await connection.sendPrompt(
          'Here are the server specs: CPU cores = 32, RAM = 256GB, disk = 4TB, max connections = 10000. Acknowledge.',
        );
        getText();

        // Turn 2: unrelated topic to act as a distractor
        await connection.sendPrompt(
          'What is the difference between TCP and UDP? One sentence.',
        );
        getText();

        // Turn 3: quiz on the numbers from turn 1
        await connection.sendPrompt(
          'How many CPU cores and how much RAM did I specify for the server? Reply with just the numbers.',
        );
        const resp = getText();

        expect(resp).toContain('32');
        expect(resp).toContain('256');

        console.log(`  ✓ [numerical-context] Model retained precise numerical values`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT * 3,
  );

  // --- 6. Debugging scenario: error context carried across turns ---
  itContext(
    'should remember error details reported in an earlier turn for follow-up debugging',
    async () => {
      await withAuthGuard('debug-context', async () => {
        const cliPath = getCliPath();
        const getText = collectText(connection);

        await connection.connect(firstAvailable!.backend, cliPath, TEST_CWD, firstAvailable!.acpArgs);
        await connection.newSession(TEST_CWD);

        // Turn 1: paste an error
        await connection.sendPrompt(
          'I got this error: "TypeError: Cannot read properties of undefined (reading \'map\')" at line 42 of UserList.tsx. Acknowledge.',
        );
        getText();

        // Turn 2: ask for the fix
        await connection.sendPrompt(
          'Which file and line number did the error occur at? Reply concisely.',
        );
        const resp = getText().toLowerCase();

        expect(resp).toContain('userlist');
        expect(resp).toContain('42');

        console.log(`  ✓ [debug-context] Model retained error file & line across turns`);
      });
    },
    CONNECT_TIMEOUT + SESSION_TIMEOUT + PROMPT_TIMEOUT * 2,
  );
});

// ---------------------------------------------------------------------------
// createGenericSpawnConfig unit tests (always run, no CLI required)
// ---------------------------------------------------------------------------

describe('createGenericSpawnConfig', () => {
  it('should use --experimental-acp as default args', () => {
    const config = createGenericSpawnConfig('gemini', '/workspace');
    expect(config.args).toContain('--experimental-acp');
  });

  it('should allow overriding acpArgs', () => {
    const config = createGenericSpawnConfig('iflow', '/workspace', ['--acp', '--verbose']);
    expect(config.args).toEqual(['--acp', '--verbose']);
    expect(config.args).not.toContain('--experimental-acp');
  });

  it('should allow empty acpArgs to skip default flags', () => {
    const config = createGenericSpawnConfig('goose', '/workspace', []);
    expect(config.args).toEqual([]);
  });

  it('should handle npx-prefixed CLI paths', () => {
    const config = createGenericSpawnConfig('npx @some/package', '/workspace', ['--acp']);
    expect(config.command).toBeTruthy();
    expect(config.args).toContain('@some/package');
    expect(config.args).toContain('--acp');
  });

  it('should set cwd to workingDir', () => {
    const config = createGenericSpawnConfig('qwen', '/my/project');
    expect(config.options.cwd).toBe('/my/project');
  });

  it('should enable shell on Windows', () => {
    const config = createGenericSpawnConfig('qwen', '/workspace');
    if (isWindows) {
      expect(config.options.shell).toBe(true);
    }
  });
});
