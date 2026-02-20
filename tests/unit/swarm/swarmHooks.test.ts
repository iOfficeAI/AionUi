/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SwarmFeedEntry } from '../../../src/agent/swarm/types';

type QueuedMsg = { content: string; files?: string[]; priority?: string; source?: string };

/** Helper: create a mock SwarmHookContext for testing */
function createMockSwarmContext(role: string, overrides: Record<string, any> = {}) {
  const feedEntries: SwarmFeedEntry[] = [];
  const queuedMessages: QueuedMsg[] = [];
  return {
    role,
    name: role.charAt(0).toUpperCase() + role.slice(1),
    agentBackend: 'claude',
    peers: role === 'driver' ? ['navigator'] : ['driver'],
    turnNumber: 1,
    maxTurns: 30,
    turnStrategy: 'round-robin' as const,
    feed: {
      append: (entry: any) => {
        const full: SwarmFeedEntry = {
          id: `f-${Date.now()}-${feedEntries.length}`,
          seq: feedEntries.length + 1,
          from: role,
          ts: new Date().toISOString(),
          ...entry,
        };
        feedEntries.push(full);
        return full;
      },
      readNew: () => [] as SwarmFeedEntry[],
      readAll: () => feedEntries,
      isDone: () => feedEntries.some((e) => e.type === 'done'),
    },
    enqueue: (msg: QueuedMsg) => {
      queuedMessages.push(msg);
    },
    _feedEntries: feedEntries, // test inspection
    _queuedMessages: queuedMessages, // test inspection
    ...overrides,
  };
}

// ─── Driver hooks (the lead / planner) ───

describe('Driver hooks — output parsing', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const hooks = require('../../../assistant/dual-claude/swarm/driver/hooks/driver-hooks.js');

  test('onSwarmInit seeds feed with user task and enqueues task for Driver', async () => {
    const swarm = createMockSwarmContext('driver');
    await hooks.onSwarmInit.handler({
      swarm,
      content: 'Build a REST API',
    });

    // Driver gets the task via enqueue
    expect(swarm._queuedMessages).toHaveLength(1);
    const msg = swarm._queuedMessages[0].content;
    expect(msg).toContain('Build a REST API');
    expect(msg).toContain('Plan the approach');
    expect(msg).not.toContain('feed.jsonl');
    expect(msg).not.toContain('.swarm');

    // User task is written to feed
    expect(swarm._feedEntries).toHaveLength(1);
    expect(swarm._feedEntries[0].type).toBe('task');
    expect(swarm._feedEntries[0].to).toBe('all');
    expect(swarm._feedEntries[0].content).toBe('Build a REST API');
  });

  test('onSwarmTurnEnd parses <plan> + <directive> on first turn', async () => {
    const swarm = createMockSwarmContext('driver');
    await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: ['Let me analyze this...', '', '<plan>', '1. Create Express scaffold', '2. Add auth middleware', '3. Write tests', '</plan>', '', '<directive>', 'Create src/server.ts with Express scaffold, health endpoint on GET /health.', '</directive>'].join('\n'),
    });

    expect(swarm._feedEntries).toHaveLength(2);
    // Plan goes to all
    expect(swarm._feedEntries[0].type).toBe('plan');
    expect(swarm._feedEntries[0].to).toBe('all');
    expect(swarm._feedEntries[0].content).toContain('Create Express scaffold');
    // Directive goes to navigator
    expect(swarm._feedEntries[1].type).toBe('directive');
    expect(swarm._feedEntries[1].to).toBe('navigator');
    expect(swarm._feedEntries[1].content).toContain('src/server.ts');
    // Thinking noise is stripped
    expect(swarm._feedEntries[1].content).not.toContain('Let me analyze');
  });

  test('onSwarmTurnEnd parses <review> + <directive> on subsequent turns', async () => {
    const swarm = createMockSwarmContext('driver');
    await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: ['<review>', 'Health endpoint looks good. But missing error handling.', '</review>', '', '<directive>', 'Add try-catch in the route handler and return 500 on error.', '</directive>'].join('\n'),
    });

    expect(swarm._feedEntries).toHaveLength(2);
    expect(swarm._feedEntries[0].type).toBe('review');
    expect(swarm._feedEntries[0].to).toBe('navigator');
    expect(swarm._feedEntries[0].content).toContain('missing error handling');
    expect(swarm._feedEntries[1].type).toBe('directive');
    expect(swarm._feedEntries[1].content).toContain('try-catch');
  });

  test('onSwarmTurnEnd falls back to raw output as directive when no tags', async () => {
    const swarm = createMockSwarmContext('driver');
    await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: 'Create the database schema in src/db/schema.ts.',
    });

    expect(swarm._feedEntries).toHaveLength(1);
    expect(swarm._feedEntries[0].type).toBe('directive');
    expect(swarm._feedEntries[0].to).toBe('navigator');
    expect(swarm._feedEntries[0].content).toContain('database schema');
  });

  test('onSwarmTurnEnd detects <done> signal', async () => {
    const swarm = createMockSwarmContext('driver');
    const result = await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: '<done>\nAll endpoints implemented and tested. Ship it.\n</done>',
    });

    expect(result.done).toBe(true);
    expect(swarm._feedEntries[0].type).toBe('done');
    expect(swarm._feedEntries[0].to).toBe('all');
    expect(swarm._feedEntries[0].content).toContain('All endpoints implemented');
  });

  test('onSwarmTurnEnd detects self-closing <done/>', async () => {
    const swarm = createMockSwarmContext('driver');
    const result = await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: 'All done! <done/>',
    });

    expect(result.done).toBe(true);
  });

  test('onSwarmFeedMessage enqueues report from Navigator action', async () => {
    const swarm = createMockSwarmContext('driver');
    await hooks.onSwarmFeedMessage.handler({
      swarm,
      feedEntries: [
        {
          id: 'f-1',
          seq: 3,
          from: 'navigator',
          to: 'driver',
          type: 'action',
          content: 'Created Express server with health endpoint.',
          files: ['src/server.ts', 'package.json'],
          ts: new Date().toISOString(),
        },
      ],
    });

    expect(swarm._queuedMessages).toHaveLength(1);
    const msg = swarm._queuedMessages[0].content;
    expect(msg).toContain('Navigator report');
    expect(msg).toContain('Created Express server');
    expect(msg).toContain('src/server.ts');
    expect(msg).toContain('package.json');
  });

  test('onSwarmFeedMessage shows blocker header', async () => {
    const swarm = createMockSwarmContext('driver');
    await hooks.onSwarmFeedMessage.handler({
      swarm,
      feedEntries: [
        {
          id: 'f-2',
          seq: 4,
          from: 'navigator',
          to: 'driver',
          type: 'blocker',
          content: 'Cannot find the database config.',
          ts: new Date().toISOString(),
        },
      ],
    });

    expect(swarm._queuedMessages[0].content).toContain('Navigator is blocked');
  });

  test('onSwarmFeedMessage does not enqueue when no entries', async () => {
    const swarm = createMockSwarmContext('driver');
    await hooks.onSwarmFeedMessage.handler({
      swarm,
      feedEntries: [],
    });

    expect(swarm._queuedMessages).toHaveLength(0);
  });
});

// ─── Navigator hooks (the implementer) ───

describe('Navigator hooks — output parsing', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const hooks = require('../../../assistant/dual-claude/swarm/navigator/hooks/navigator-hooks.js');

  test('onSwarmInit enqueues task context for Navigator (no feed write)', async () => {
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmInit.handler({
      swarm,
      content: 'Build a REST API',
    });

    expect(swarm._queuedMessages).toHaveLength(1);
    const msg = swarm._queuedMessages[0].content;
    expect(msg).toContain('Build a REST API');
    expect(msg).toContain('Driver is analyzing');
    expect(msg).not.toContain('feed.jsonl');

    // Navigator does NOT write to feed on init — Driver goes first
    expect(swarm._feedEntries).toHaveLength(0);
  });

  test('onSwarmTurnEnd parses <report> tag and writes to feed for Driver', async () => {
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: 'Some thinking...\n\n<report>\nCreated src/server.ts with Express setup.\nRan tests — all passing.\n</report>',
    });

    expect(swarm._feedEntries).toHaveLength(1);
    expect(swarm._feedEntries[0].to).toBe('driver');
    expect(swarm._feedEntries[0].type).toBe('action');
    expect(swarm._feedEntries[0].content).toContain('Created src/server.ts');
    expect(swarm._feedEntries[0].content).not.toContain('Some thinking');
  });

  test('onSwarmTurnEnd parses <files> tag into feed entry', async () => {
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: '<report>\nAdded auth middleware.\n</report>\n<files>\nsrc/middleware/auth.ts\nsrc/server.ts\n</files>',
    });

    expect(swarm._feedEntries[0].files).toEqual(['src/middleware/auth.ts', 'src/server.ts']);
  });

  test('onSwarmTurnEnd parses <blocker> tag and sets blocker type', async () => {
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: '<report>\nTried to run tests.\n</report>\n<blocker>\nCannot find test config.\n</blocker>',
    });

    expect(swarm._feedEntries[0].type).toBe('blocker');
    expect(swarm._feedEntries[0].to).toBe('driver');
    expect(swarm._feedEntries[0].content).toContain('Blocker');
    expect(swarm._feedEntries[0].content).toContain('Cannot find test config');
  });

  test('onSwarmTurnEnd falls back to raw output when no tags', async () => {
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: 'I created the file and ran the tests.',
    });

    expect(swarm._feedEntries[0].type).toBe('action');
    expect(swarm._feedEntries[0].to).toBe('driver');
    expect(swarm._feedEntries[0].content).toBe('I created the file and ran the tests.');
  });

  test('onSwarmTurnEnd detects <done> signal', async () => {
    const swarm = createMockSwarmContext('navigator');
    const result = await hooks.onSwarmTurnEnd.handler({
      swarm,
      agentOutput: '<done>\nImplementation complete.\n</done>',
    });

    expect(result.done).toBe(true);
    expect(swarm._feedEntries[0].type).toBe('done');
  });

  test('onSwarmFeedMessage enqueues directive message from Driver', async () => {
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmFeedMessage.handler({
      swarm,
      feedEntries: [
        {
          id: 'f-1',
          seq: 2,
          from: 'driver',
          to: 'navigator',
          type: 'directive',
          content: 'Create auth middleware in src/middleware/auth.ts.',
          ts: new Date().toISOString(),
        },
      ],
    });

    expect(swarm._queuedMessages).toHaveLength(1);
    expect(swarm._queuedMessages[0].content).toContain('Driver directive');
    expect(swarm._queuedMessages[0].content).toContain('Create auth middleware');
  });

  test('onSwarmFeedMessage enqueues review message from Driver', async () => {
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmFeedMessage.handler({
      swarm,
      feedEntries: [
        {
          id: 'f-1',
          seq: 3,
          from: 'driver',
          to: 'navigator',
          type: 'review',
          content: 'Good, but missing error handling on /login.',
          ts: new Date().toISOString(),
        },
      ],
    });

    expect(swarm._queuedMessages[0].content).toContain('Driver review');
    expect(swarm._queuedMessages[0].content).toContain('missing error handling');
  });

  test('onSwarmFeedMessage does not enqueue when no entries', async () => {
    const swarm = createMockSwarmContext('navigator');
    await hooks.onSwarmFeedMessage.handler({
      swarm,
      feedEntries: [],
    });

    expect(swarm._queuedMessages).toHaveLength(0);
  });
});

// ─── Flow integration ───

describe('End-to-end flow: Driver leads, Navigator implements', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const driverHooks = require('../../../assistant/dual-claude/swarm/driver/hooks/driver-hooks.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const navigatorHooks = require('../../../assistant/dual-claude/swarm/navigator/hooks/navigator-hooks.js');

  test('full cycle: user → driver plans → navigator executes → driver reviews', async () => {
    const driverSwarm = createMockSwarmContext('driver');
    const navigatorSwarm = createMockSwarmContext('navigator');

    // 1. User sends task → Driver init seeds feed, Navigator gets context
    await driverHooks.onSwarmInit.handler({ swarm: driverSwarm, content: 'Add login endpoint' });
    await navigatorHooks.onSwarmInit.handler({ swarm: navigatorSwarm, content: 'Add login endpoint' });

    expect(driverSwarm._queuedMessages[0].content).toContain('Plan the approach');
    expect(navigatorSwarm._queuedMessages[0].content).toContain('Driver is analyzing');
    expect(driverSwarm._feedEntries[0].type).toBe('task'); // Driver seeds feed
    expect(navigatorSwarm._feedEntries).toHaveLength(0); // Navigator does NOT seed

    // 2. Driver plans and sends directive → hook writes to feed
    await driverHooks.onSwarmTurnEnd.handler({
      swarm: driverSwarm,
      agentOutput: '<plan>\n1. Create POST /login\n2. Add validation\n</plan>\n\n<directive>\nCreate POST /login endpoint in src/routes/auth.ts.\n</directive>',
    });

    expect(driverSwarm._feedEntries).toHaveLength(3); // task + plan + directive
    expect(driverSwarm._feedEntries[2].type).toBe('directive');
    expect(driverSwarm._feedEntries[2].to).toBe('navigator');

    // 3. Navigator receives directive via onSwarmFeedMessage
    await navigatorHooks.onSwarmFeedMessage.handler({
      swarm: navigatorSwarm,
      feedEntries: [driverSwarm._feedEntries[2]], // the directive
    });

    // Navigator init + feed message = 2 queued messages
    expect(navigatorSwarm._queuedMessages[1].content).toContain('Driver directive');
    expect(navigatorSwarm._queuedMessages[1].content).toContain('POST /login');

    // 4. Navigator executes and reports back
    await navigatorHooks.onSwarmTurnEnd.handler({
      swarm: navigatorSwarm,
      agentOutput: '<report>\nCreated POST /login in src/routes/auth.ts. Tests passing.\n</report>\n<files>\nsrc/routes/auth.ts\n</files>',
    });

    expect(navigatorSwarm._feedEntries[0].type).toBe('action');
    expect(navigatorSwarm._feedEntries[0].to).toBe('driver');
    expect(navigatorSwarm._feedEntries[0].files).toEqual(['src/routes/auth.ts']);

    // 5. Driver receives report via onSwarmFeedMessage
    await driverHooks.onSwarmFeedMessage.handler({
      swarm: driverSwarm,
      feedEntries: [navigatorSwarm._feedEntries[0]], // the action report
    });

    // Driver init + feed message = 2 queued messages
    expect(driverSwarm._queuedMessages[1].content).toContain('Navigator report');
    expect(driverSwarm._queuedMessages[1].content).toContain('src/routes/auth.ts');
  });

  test('seed messages do not leak internal details', async () => {
    const swarm = createMockSwarmContext('driver');
    await driverHooks.onSwarmInit.handler({
      swarm,
      content: 'Build REST API',
    });

    const msg = swarm._queuedMessages[0].content;
    expect(msg).not.toContain('.swarm');
    expect(msg).not.toContain('feed.jsonl');
    expect(msg).not.toContain('onSwarm');
  });
});
