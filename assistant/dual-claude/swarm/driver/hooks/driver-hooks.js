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

function isDone(text) {
  return /<done\s*\/?>/.test(text) || /<done>[\s\S]*?<\/done>/i.test(text);
}

// ── Hook handlers ──

module.exports = {
  /**
   * onSwarmInit — Driver receives the user's task first.
   * Writes user task to feed as seed, gives Driver the task to analyze.
   */
  onSwarmInit: {
    handler: async (context) => {
      const { swarm } = context;
      const userTask = (context.content || '').trim();

      // Seed the feed with the user's task
      swarm.feed.append({
        to: 'all',
        type: 'task',
        content: userTask,
      });

      // Read system prompt directly and inject it
      const fs = require('fs');
      const path = require('path');
      const promptPath = path.join(__dirname, '../driver.md');
      const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

      swarm.enqueue({
        content: ['[SYSTEM INSTRUCTIONS - YOU MUST FOLLOW THESE EXACTLY]', '', systemPrompt, '', '=' + '='.repeat(79), '', `Your task: ${userTask}`, '', 'Analyze this task. Plan the approach and send the Navigator the first directive.', '', "REMEMBER: You MUST use <plan> and <directive> XML tags. Do NOT use Write, WebFetch, or other tools - that is the Navigator's job."].join('\n'),
        priority: 'normal',
        source: 'hook',
      });

      return {};
    },
    priority: 50,
  },

  /**
   * onSwarmTurnEnd — Parse the Driver's structured output, write to feed.
   *
   * Driver outputs:
   *   <plan>...</plan>           — high-level plan (first turn)
   *   <directive>...</directive> — instruction for Navigator
   *   <review>...</review>      — assessment of Navigator's work
   *   <done>...</done>          — task complete signal
   */
  onSwarmTurnEnd: {
    handler: async (context) => {
      const { swarm, agentOutput = '' } = context;

      // 1. Check for done signal
      if (isDone(agentOutput)) {
        const doneSummary = extractTag(agentOutput, 'done') || 'Driver signals task completion.';
        swarm.feed.append({
          to: 'all',
          type: 'done',
          content: doneSummary,
        });
        return { done: true };
      }

      // 2. Parse structured output
      const plan = extractTag(agentOutput, 'plan');
      const directive = extractTag(agentOutput, 'directive');
      const review = extractTag(agentOutput, 'review');

      // 3. Write plan to feed if present (informational for both agents)
      if (plan) {
        swarm.feed.append({
          to: 'all',
          type: 'plan',
          content: plan.slice(0, 4000),
        });
      }

      // 4. Write review to feed if present
      if (review) {
        swarm.feed.append({
          to: 'navigator',
          type: 'review',
          content: review.slice(0, 4000),
        });
      }

      // 5. Write directive to feed
      if (directive) {
        swarm.feed.append({
          to: 'navigator',
          type: 'directive',
          content: directive.slice(0, 4000),
        });
      }

      // 6. Fallback — no recognized tags, treat entire output as directive
      if (!directive && !review && !plan) {
        swarm.feed.append({
          to: 'navigator',
          type: 'directive',
          content: agentOutput.slice(0, 4000),
        });
      }

      return {};
    },
    priority: 50,
  },

  /**
   * onSwarmFeedMessage — Navigator posted a report or blocker for the Driver.
   * Translate feed entries into a message the Driver understands.
   */
  onSwarmFeedMessage: {
    handler: async (context) => {
      const { feedEntries = [], swarm } = context;
      if (feedEntries.length === 0) return {};

      const latest = feedEntries[feedEntries.length - 1];
      const turnInfo = `(turn ${swarm.turnNumber}/${swarm.maxTurns})`;

      let header;
      switch (latest.type) {
        case 'action':
          header = `Navigator report ${turnInfo}:`;
          break;
        case 'blocker':
          header = `Navigator is blocked ${turnInfo}:`;
          break;
        default:
          header = `Navigator ${turnInfo}:`;
      }

      // Include file list if present
      const parts = [header, '', latest.content];
      if (latest.files && latest.files.length > 0) {
        parts.push('', 'Files changed:', ...latest.files.map((f) => `- ${f}`));
      }

      swarm.enqueue({
        content: parts.join('\n'),
        priority: 'normal',
        source: 'hook',
      });

      return {};
    },
    priority: 50,
  },
};
