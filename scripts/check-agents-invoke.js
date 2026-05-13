#!/usr/bin/env node
/**
 * Static check that forbids direct `.invoke()` on the detected-agents IPC
 * channel. All `/api/agents` consumers must go through
 * `useAgents()` / `getAgents()` / `refreshAgents()` so they share the
 * `DETECTED_AGENTS_SWR_KEY` cache — otherwise each call site bypasses SWR
 * deduplication and multiplies HTTP traffic on page load.
 *
 * Exit 0 if clean, exit 1 if any violation is found.
 *
 * Usage: node scripts/check-agents-invoke.js
 */

const fs = require('fs');
const path = require('path');

const RENDERER_DIR = path.resolve(__dirname, '../packages/desktop/src/renderer');
const ALLOWED_FILES = new Set([
  // Canonical fetcher that performs the actual HTTP call.
  path.join(RENDERER_DIR, 'utils/model/agentTypes.ts'),
  // Hook/plain-function facade around the SWR cache.
  path.join(RENDERER_DIR, 'hooks/agent/useAgents.ts'),
]);

// Matches both `ipcBridge.acpConversation.getAvailableAgents.invoke`
// and the destructured `acpConversation.getAvailableAgents.invoke` style.
const FORBIDDEN_PATTERN = /\bacpConversation\.getAvailableAgents\.invoke\b/;

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield full;
    }
  }
}

let violations = 0;
for (const file of walk(RENDERER_DIR)) {
  if (ALLOWED_FILES.has(file)) continue;
  const contents = fs.readFileSync(file, 'utf8');
  const lines = contents.split('\n');
  lines.forEach((line, idx) => {
    if (FORBIDDEN_PATTERN.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
      console.error(
        `${path.relative(process.cwd(), file)}:${idx + 1}: direct acpConversation.getAvailableAgents.invoke — use useAgents()/getAgents() instead`
      );
      violations += 1;
    }
  });
}

if (violations > 0) {
  console.error(
    `\n${violations} violation(s). Import from '@/renderer/hooks/agent/useAgents' so every /api/agents consumer shares the SWR cache.`
  );
  process.exit(1);
}
console.log('check-agents-invoke: OK');
