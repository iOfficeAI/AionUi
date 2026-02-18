/**
 * Ouroboros hooks — self-feeding agent loop with compound engineering
 *
 * The serpent that eats its own tail: the agent's output becomes its own input.
 * Each iteration is a precision-engineered prompt that converges on the target.
 *
 * Architecture:
 * - INTENT:   .ouroboros/prompt.md — the user's original intent (North Star)
 *             Written by the hook on init, enriched by the agent on Turn 1.
 *             Every iteration references this to prevent drift.
 * - FEEDING:  <next>...</next> tag parsed from agent output (primary)
 *             state.json nextPrompt field (fallback)
 * - MEMORY:   state.json — plan, progress, iteration count
 * - LOG:      progress.log — auto-logged by hook after each turn (not agent's job)
 *
 * Compound Engineering:
 * Each <next> prompt is not free-form rambling — it's a precision instrument.
 * The agent must engineer each follow-up to maximize delta toward the goal
 * with minimum effort. Like gradient descent: always converging, never diverging.
 *
 * Flow:
 * 1. User sends: "Build feature X"
 * 2. onQueueInit → saves prompt.md (raw intent) → queues initialization
 * 3. Turn 1: Agent reads prompt.md, enriches it, creates plan, starts work
 * 4. onAgentResponse: auto-logs progress → parses <next> → queues it
 * 5. Turn 2+: Agent reads prompt.md + state.json → executes → writes <next>
 * 6. onAgentResponse: auto-logs progress → parses <next> → queues it
 * 7. ...converges until <done/> — each step tighter than the last
 */

const DEFAULT_MAX_ITERATIONS = 20;
const PROGRESS_SEPARATOR = '\n\n---\n\n';

// ─── Output Parsing Helpers ─────────────────────────────────────────────

/**
 * Parse <next>...</next> tag from agent response.
 * Supports multiline content.
 */
function parseNextTag(content) {
  if (!content) return null;
  const match = content.match(/<next>([\s\S]*?)<\/next>/);
  return match ? match[1].trim() : null;
}

/**
 * Check if the agent signalled completion via <done/> or <ouroboros>COMPLETE</ouroboros>
 */
function isDoneSignal(content) {
  if (!content) return false;
  return /<done\s*\/?>/.test(content) || /<ouroboros>\s*COMPLETE\s*<\/ouroboros>/.test(content);
}

// ─── Progress Logging (auto, like Ralph) ────────────────────────────────

/**
 * Extract a brief summary from agent output.
 * Tries explicit summary sections, then falls back to first paragraph.
 */
function extractSummary(output) {
  if (!output) return 'Iteration completed.';

  // Try explicit summary sections
  const patterns = [
    /##?\s*Summary\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*Files|$)/i,
    /##?\s*What I (?:did|implemented)\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*Files|$)/i,
    /##?\s*Changes?\s*(?:Made|Summary)\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*Files|$)/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1].trim()) {
      return match[1].trim().slice(0, 500);
    }
  }

  // Fallback: first substantive paragraph (skip headers, code blocks, short lines)
  const paragraphs = output
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 30 && !p.startsWith('#') && !p.startsWith('```') && !p.startsWith('<'));

  return paragraphs[0]?.slice(0, 500) || 'Iteration completed.';
}

/**
 * Extract file paths mentioned in agent output.
 * Looks for file list sections and git-style file references.
 */
function extractFilesChanged(output) {
  if (!output) return [];
  const files = [];

  // Explicit file list sections
  const filePatterns = [
    /##?\s*Files?\s*Changed\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i,
    /\*\*Files?\s*(?:Changed|Modified)\*\*:?\s*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i,
  ];

  for (const pattern of filePatterns) {
    const match = output.match(pattern);
    if (match) {
      const listItems = match[1].match(/[-*]\s+`?([^\n`]+)`?/g);
      if (listItems) {
        for (const item of listItems) {
          const cleaned = item.replace(/^[-*]\s+`?/, '').replace(/`?\s*$/, '').trim();
          if (cleaned && !files.includes(cleaned)) files.push(cleaned);
        }
      }
    }
  }

  // Git-style references: "modified: path/to/file"
  const gitPattern = /(?:modified|created|added|deleted|renamed):\s+(\S+)/gi;
  let gitMatch;
  while ((gitMatch = gitPattern.exec(output)) !== null) {
    const file = gitMatch[1].trim();
    if (file && !files.includes(file)) files.push(file);
  }

  return files;
}

/**
 * Format and append a progress entry to progress.log.
 * Called automatically by the hook — agent doesn't need to do this.
 */
function appendProgressLog(fs, logPath, entry) {
  const lines = [];
  lines.push(`## Iteration ${entry.iteration} — ${entry.stepTitle}`);
  lines.push(`**Time:** ${new Date().toISOString()}`);
  lines.push('');

  lines.push('### Summary');
  lines.push(entry.summary);
  lines.push('');

  if (entry.filesChanged.length > 0) {
    lines.push('### Files Changed');
    for (const f of entry.filesChanged) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  if (entry.nextAction) {
    lines.push('### Next Action');
    lines.push(entry.nextAction.slice(0, 200));
    lines.push('');
  }

  const formatted = lines.join('\n');

  try {
    let existing = '';
    if (fs.existsSync(logPath)) {
      existing = fs.readFileSync(logPath, 'utf-8');
    }

    if (!existing || existing.trim() === '') {
      fs.writeFileSync(logPath, `# Ouroboros Progress Log\n${PROGRESS_SEPARATOR}${formatted}`, 'utf-8');
    } else {
      fs.writeFileSync(logPath, `${existing.trimEnd()}${PROGRESS_SEPARATOR}${formatted}`, 'utf-8');
    }
  } catch {
    // Non-fatal — progress logging should never break the loop
  }
}

// ─── Hook Exports ───────────────────────────────────────────────────────

module.exports = {
  /**
   * onQueueInit — Save intent & seed the first turn
   *
   * 1. Persists the user's raw request to .ouroboros/prompt.md (North Star)
   * 2. Queues the initialization prompt that instructs the agent to
   *    enrich the intent, create a convergent plan, and begin
   */
  onQueueInit: {
    handler: async (context) => {
      if (!context.backend) return {};

      const userRequest = (context.content || '').trim();
      if (!userRequest) return {};

      // Persist user intent as the North Star
      const fs = require('fs');
      const path = require('path');
      const ouroDir = path.join(context.workspace, '.ouroboros');

      try {
        if (!fs.existsSync(ouroDir)) {
          fs.mkdirSync(ouroDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(ouroDir, 'prompt.md'),
          [
            '# Original Intent',
            '',
            userRequest,
            '',
            '---',
            `*Captured: ${new Date().toISOString()}*`,
          ].join('\n'),
          'utf-8'
        );
      } catch {
        // Non-fatal — agent can still work without it
      }

      const seedPrompt = [
        '## Ouroboros — Initialization',
        '',
        'A new task has been captured in `.ouroboros/prompt.md`. Your job:',
        '',
        '1. **Read** `.ouroboros/prompt.md` — this is the user\'s original intent (your North Star)',
        '2. **Enrich** it — rewrite prompt.md with a refined understanding:',
        '   - Clarify ambiguities, infer implicit requirements',
        '   - Define what "done" looks like (acceptance criteria)',
        '   - Identify constraints and boundaries',
        '3. **Plan** — write `.ouroboros/state.json` with a convergent plan:',
        '   - Each step should be the highest-leverage action remaining',
        '   - Order by impact: do the thing that unblocks the most first',
        '   - Keep steps small and verifiable',
        '4. **Execute** the first step if feasible',
        '5. **End with `<next>`** — engineer a prompt that maximizes progress:',
        '',
        '```',
        '<next>Precise, self-contained prompt for the next highest-leverage step</next>',
        '```',
        '',
        '### Compound Engineering Rules',
        '',
        'Each `<next>` prompt you write must:',
        '- **Reference the goal** — re-read prompt.md, stay aligned',
        '- **Maximize delta** — what single action moves us closest to done?',
        '- **Minimize scope** — do exactly what\'s needed, nothing more',
        '- **Be self-contained** — include file paths, function names, exact requirements',
        '- **Converge** — each iteration should be tighter than the last',
        '',
        'When all work is done, output `<done/>` instead.',
        '',
        'Progress is logged automatically — you don\'t need to maintain progress.log.',
        '',
        'You are the serpent and the tail. Begin.',
      ].join('\n');

      return {
        queueMessages: [
          {
            content: seedPrompt,
            priority: 'normal',
            source: 'system',
          },
        ],
      };
    },
    priority: 50,
  },

  /**
   * onAgentResponse — The self-feeding mechanism + auto progress logging
   *
   * After each agent turn:
   * 1. Auto-log progress (extract summary + files from output)
   * 2. Check for <done/> signal → stop
   * 3. Parse <next>...</next> from agent output → queue it (primary)
   * 4. If no <next> tag, read state.json nextPrompt → queue it (fallback)
   * 5. If neither exists → stop
   *
   * Progress is a system concern, not the agent's burden.
   * The agent focuses on convergence; the hook handles bookkeeping.
   */
  onAgentResponse: {
    handler: async (context) => {
      if (!context.backend || !context.workspace) return {};

      const agentOutput = context.content || '';
      const fs = require('fs');
      const path = require('path');
      const stateDir = path.join(context.workspace, '.ouroboros');
      const statePath = path.join(stateDir, 'state.json');
      const promptPath = path.join(stateDir, 'prompt.md');
      const logPath = path.join(stateDir, 'progress.log');

      // Read state for metadata (iteration count, plan progress, max iterations)
      let state = null;
      if (fs.existsSync(statePath)) {
        try {
          state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        } catch {
          // Malformed JSON — continue without state
        }
      }

      const currentIter = (state && state.iteration) || 0;
      const maxIter = (state && state.maxIterations) || DEFAULT_MAX_ITERATIONS;

      // Determine current step title from state plan
      let currentStepTitle = 'Unknown';
      if (state && state.plan) {
        const inProgress = state.plan.find((s) => s.status === 'in_progress');
        const lastDone = [...(state.plan || [])].reverse().find((s) => s.status === 'done');
        currentStepTitle = (inProgress && inProgress.title) || (lastDone && lastDone.title) || 'Planning';
      }

      // ── Auto-log progress ──
      // Extract summary and files from agent output, append to progress.log
      // This is a system concern — the agent never needs to think about logging
      if (agentOutput && state) {
        const nextPromptForLog = parseNextTag(agentOutput);
        appendProgressLog(fs, logPath, {
          iteration: currentIter,
          stepTitle: currentStepTitle,
          summary: extractSummary(agentOutput),
          filesChanged: extractFilesChanged(agentOutput),
          nextAction: nextPromptForLog || (isDoneSignal(agentOutput) ? 'DONE' : null),
        });
      }

      // ── Check termination conditions ──

      // Done via output signal
      if (isDoneSignal(agentOutput)) return {};

      // Done via state file
      if (state && state.status === 'done') return {};

      // Safety valve — max iterations reached
      if (currentIter >= maxIter) {
        return {
          queueMessages: [
            {
              content: [
                '## Ouroboros — Maximum Iterations Reached',
                '',
                `You have reached the iteration limit (${maxIter}).`,
                'Please wrap up your current work:',
                '',
                '1. Re-read `.ouroboros/prompt.md` — verify how close we are to the original intent',
                '2. Commit any pending changes',
                '3. Update `.ouroboros/state.json` with `status: "done"`',
                '4. Write a final summary: what was accomplished vs. the original intent',
                '5. Output `<done/>`',
              ].join('\n'),
              priority: 'normal',
              source: 'system',
            },
          ],
        };
      }

      // ── Self-feeding: parse next prompt ──

      // PRIMARY: Parse <next> tag from agent output
      let nextPrompt = parseNextTag(agentOutput);

      // FALLBACK: Read nextPrompt from state.json
      if (!nextPrompt && state) {
        nextPrompt = (state.nextPrompt || '').trim();
      }

      // No follow-up found — the loop ends
      if (!nextPrompt) return {};

      // Build context header from state metadata
      const iteration = currentIter + 1;
      const totalSteps = state ? (state.plan || []).length : '?';
      const doneSteps = state ? (state.plan || []).filter((s) => s.status === 'done').length : '?';
      const hasPrompt = fs.existsSync(promptPath);

      const wrappedPrompt = [
        `## Ouroboros — Iteration ${iteration}/${maxIter} (${doneSteps}/${totalSteps} steps done)`,
        '',
        nextPrompt,
        '',
        '---',
        hasPrompt ? '_Re-read `.ouroboros/prompt.md` to stay aligned with the original intent._' : '',
        '_Update `.ouroboros/state.json` when done. Progress is logged automatically._',
        '_Compound: maximize delta toward goal, minimize effort. Then `<next>` or `<done/>`._',
      ]
        .filter(Boolean)
        .join('\n');

      return {
        queueMessages: [
          {
            content: wrappedPrompt,
            priority: 'normal',
            source: 'system',
          },
        ],
      };
    },
    priority: 50,
  },
};
