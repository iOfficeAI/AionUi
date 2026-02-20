/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ── Output parser helpers ──

function extractTag(text, tagName) {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractFiles(text) {
  const raw = extractTag(text, 'files');
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isDone(text) {
  return /<done\s*\/?>/.test(text) || /<done>[\s\S]*?<\/done>/i.test(text);
}

// ── Hook handlers ──

module.exports = {
  /**
   * onSwarmInit — Navigator waits for the Driver's first directive.
   * Driver goes first — Navigator just receives context.
   */
  onSwarmInit: {
    handler: async (context) => {
      const { swarm } = context;
      const userTask = (context.content || '').trim();

      swarm.enqueue({
        content: [
          `Your task: ${userTask}`,
          '',
          'The Driver is analyzing this task and will send you a directive shortly.',
          'Wait for the directive, then execute it and report back.',
        ].join('\n'),
        priority: 'normal',
        source: 'hook',
      });

      return {};
    },
    priority: 50,
  },

  /**
   * onSwarmTurnEnd — Parse the Navigator's structured output, write to feed.
   *
   * Navigator outputs:
   *   <report>...</report>     — what was done
   *   <files>...</files>       — changed files
   *   <blocker>...</blocker>   — if stuck
   *   <done>...</done>         — task complete signal
   */
  onSwarmTurnEnd: {
    handler: async (context) => {
      const { swarm, agentOutput = '' } = context;

      // 1. Check for done signal
      if (isDone(agentOutput)) {
        const doneSummary = extractTag(agentOutput, 'done') || 'Navigator signals task completion.';
        swarm.feed.append({
          to: 'all',
          type: 'done',
          content: doneSummary,
        });
        return { done: true };
      }

      // 2. Parse structured output
      const report = extractTag(agentOutput, 'report');
      const blocker = extractTag(agentOutput, 'blocker');
      const files = extractFiles(agentOutput);

      // 3. Build feed content — prefer parsed tags, fallback to raw output
      let feedContent;
      if (blocker) {
        feedContent = `**Blocker:**\n${blocker}`;
        if (report) feedContent = `${report}\n\n${feedContent}`;
      } else if (report) {
        feedContent = report;
      } else {
        feedContent = agentOutput.slice(0, 4000);
      }

      // 4. Write to feed — addressed to driver
      swarm.feed.append({
        to: 'driver',
        type: blocker ? 'blocker' : 'action',
        content: feedContent.slice(0, 4000),
        files: files.length > 0 ? files : undefined,
      });

      return {};
    },
    priority: 50,
  },

  /**
   * onSwarmFeedMessage — Driver sent a directive or review to the Navigator.
   * Translate feed entries into a message the Navigator understands.
   */
  onSwarmFeedMessage: {
    handler: async (context) => {
      const { feedEntries = [], swarm } = context;
      if (feedEntries.length === 0) return {};

      const latest = feedEntries[feedEntries.length - 1];
      const turnInfo = `(turn ${swarm.turnNumber}/${swarm.maxTurns})`;

      let header;
      switch (latest.type) {
        case 'directive':
          header = `Driver directive ${turnInfo}:`;
          break;
        case 'review':
          header = `Driver review ${turnInfo}:`;
          break;
        default:
          header = `Driver ${turnInfo}:`;
      }

      swarm.enqueue({
        content: [header, '', latest.content].join('\n'),
        priority: 'normal',
        source: 'hook',
      });

      return {};
    },
    priority: 50,
  },
};
