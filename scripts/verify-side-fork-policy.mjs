#!/usr/bin/env bun
/**
 * Verify side-conversation fork policy against a running or spawned aioncore (--local).
 * Exit 0 only when claude→agent_fork (or explicit skip), codex→text_snapshot, openclaw rejected.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const aioncore = process.env.AIONUI_BACKEND_BIN ?? path.join(repoRoot, '.aioncore-explore/target/debug/aioncore');
const dataDir =
  process.env.AIONUI_DATA_DIR ?? path.join(os.homedir(), 'Library/Application Support/AionUi-Dev-2/aionui');
const port = Number(process.env.VERIFY_PORT ?? 25999);
const host = '127.0.0.1';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(maxMs = 60000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://${host}:${port}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  throw new Error(`Backend not healthy on :${port} after ${maxMs}ms`);
}

async function api(method, apiPath, body) {
  const res = await fetch(`http://${host}:${port}${apiPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  const data = json?.data ?? json;
  return { ok: res.ok, status: res.status, data, json };
}

async function listConversations() {
  const { ok, data } = await api('GET', '/api/conversations');
  if (!ok) throw new Error('GET /api/conversations failed');
  return Array.isArray(data) ? data : (data?.items ?? []);
}

function pickParent(conversations, predicate) {
  return conversations.find(predicate);
}

async function createSide(parentId, label) {
  const { ok, status, data } = await api('POST', `/api/conversations/${parentId}/side`, {
    guardrail: 'reference_readonly',
  });
  return { ok, status, data, label };
}

async function deleteConversation(id) {
  await api('DELETE', `/api/conversations/${id}`);
}

function backendFromExtra(extra) {
  if (!extra || typeof extra !== 'object') return undefined;
  return extra.backend;
}

async function main() {
  if (!fs.existsSync(aioncore)) {
    console.error('Missing aioncore:', aioncore);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(dataDir, 'aionui-backend.db'))) {
    console.error('Missing dev DB:', path.join(dataDir, 'aionui-backend.db'));
    process.exit(1);
  }

  const child = spawn(aioncore, ['--local', '--port', String(port), '--data-dir', dataDir, '--log-level', 'warn'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, AIONUI_WORK_DIR: dataDir },
  });
  let backendLog = '';
  child.stdout?.on('data', (c) => {
    backendLog += c.toString();
  });
  child.stderr?.on('data', (c) => {
    backendLog += c.toString();
  });

  const cleanup = () => {
    child.kill('SIGTERM');
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  try {
    await waitForHealth();
    console.log(`Backend ready :${port} data=${dataDir}`);

    const conversations = await listConversations();
    const claudeParent = pickParent(
      conversations,
      (c) => (c.type === 'acp' && backendFromExtra(c.extra) === 'claude') || (c.type === 'codex' && false)
    );
    const codexParent = pickParent(conversations, (c) => c.type === 'acp' && backendFromExtra(c.extra) === 'codex');
    const aionrsParent = pickParent(conversations, (c) => c.type === 'aionrs');
    const openclawParent = pickParent(conversations, (c) => c.type === 'openclaw-gateway');

    const failures = [];
    const createdChildIds = [];

    if (codexParent) {
      const r = await createSide(codexParent.id, 'codex');
      if (r.ok && r.data?.fork_mode === 'text_snapshot') {
        console.log('PASS codex → text_snapshot');
        if (r.data?.conversation_id) createdChildIds.push(r.data.conversation_id);
      } else {
        failures.push(`FAIL codex: status=${r.status} fork_mode=${r.data?.fork_mode}`);
      }
    } else {
      console.log('SKIP codex: no parent conversation in DB');
    }

    if (aionrsParent) {
      const r = await createSide(aionrsParent.id, 'aionrs');
      if (r.ok && r.data?.fork_mode === 'text_snapshot') {
        console.log('PASS aionrs → text_snapshot');
        if (r.data?.conversation_id) createdChildIds.push(r.data.conversation_id);
      } else {
        failures.push(`FAIL aionrs: status=${r.status} fork_mode=${r.data?.fork_mode}`);
      }
    } else {
      console.log('SKIP aionrs: no parent conversation in DB');
    }

    if (openclawParent) {
      const r = await createSide(openclawParent.id, 'openclaw');
      if (r.status === 400 || r.status === 422 || !r.ok) {
        console.log(`PASS openclaw rejected (${r.status})`);
      } else {
        failures.push(`FAIL openclaw: expected reject, got ${r.status} fork=${r.data?.fork_mode}`);
        if (r.data?.conversation_id) createdChildIds.push(r.data.conversation_id);
      }
    } else {
      console.log('SKIP openclaw: no parent in DB');
    }

    if (claudeParent) {
      const r = await createSide(claudeParent.id, 'claude');
      if (r.ok && r.data?.fork_mode === 'agent_fork') {
        console.log('PASS claude → agent_fork');
        if (r.data?.conversation_id) createdChildIds.push(r.data.conversation_id);
      } else if (!r.ok && r.status === 400 && String(r.data?.error ?? r.json?.error ?? '').includes('fork')) {
        console.log('WARN claude: fork requires warm parent session (400) — start parent chat once, then re-run');
        failures.push(`claude not warm: ${JSON.stringify(r.data ?? r.json).slice(0, 200)}`);
      } else {
        failures.push(`FAIL claude: status=${r.status} fork_mode=${r.data?.fork_mode}`);
      }
    } else {
      console.log('SKIP claude: no claude acp parent in DB');
    }

    for (const id of createdChildIds) {
      await deleteConversation(id);
    }

    if (failures.length) {
      console.error('\nVerification failures:');
      for (const f of failures) console.error(' -', f);
      if (backendLog) console.error('\nBackend log tail:\n', backendLog.slice(-2000));
      process.exit(1);
    }
    console.log('\nAll executed side-fork policy checks passed.');
    process.exit(0);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
