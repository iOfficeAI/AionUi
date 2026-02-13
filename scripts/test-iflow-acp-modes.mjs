#!/usr/bin/env node
/**
 * Test script: Verify whether iFlow CLI supports ACP session/set_mode.
 *
 * Usage:
 *   node scripts/test-iflow-acp-modes.mjs [/path/to/iflow]
 *
 * What it does:
 *   1. Spawns iFlow with --experimental-acp
 *   2. Sends `initialize` request
 *   3. Sends `session/new` and inspects modes in response
 *   4. If modes exist, attempts `session/set_mode` for each available mode
 *   5. Reports results
 */

import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';

// ─── Config ────────────────────────────────────────────────────────────────
const TIMEOUT_MS = 30_000;
const CWD = process.cwd();

// ─── Helpers ───────────────────────────────────────────────────────────────
let requestId = 1;

function makeRequest(method, params) {
  return JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }) + '\n';
}

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [${tag}] ${typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2)}`);
}

function findIflow() {
  const arg = process.argv[2];
  if (arg) return arg;
  try {
    return execSync('which iflow', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const iflowPath = findIflow();
  if (!iflowPath) {
    console.error('Error: iflow not found. Provide path as argument or ensure it is in PATH.');
    process.exit(1);
  }
  log('INIT', `Using iflow at: ${iflowPath}`);

  // Spawn iflow with ACP
  const child = spawn(iflowPath, ['--experimental-acp'], {
    cwd: CWD,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const pendingRequests = new Map();
  const notifications = [];
  let buffer = '';

  // Parse JSON-RPC messages from stdout
  const rl = createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      if (msg.id != null && pendingRequests.has(msg.id)) {
        // Response to our request
        pendingRequests.get(msg.id).resolve(msg);
        pendingRequests.delete(msg.id);
      } else if (msg.method) {
        // Notification or incoming request from agent
        notifications.push(msg);
        log('NOTIFY', `${msg.method}: ${JSON.stringify(msg.params ?? {}).slice(0, 200)}`);
        // Auto-respond to incoming requests (e.g. fs/read_text_file)
        if (msg.id != null) {
          const response = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\n';
          child.stdin.write(response);
        }
      }
    } catch {
      // Not JSON, log as stderr-like output
      log('STDOUT', trimmed.slice(0, 300));
    }
  });

  // Log stderr
  child.stderr?.on('data', (data) => {
    const text = data.toString().trim();
    if (text) log('STDERR', text.slice(0, 500));
  });

  // Send a request and wait for response
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = requestId;
      const req = makeRequest(method, params);
      log('SEND', `[id=${id}] ${method} ${JSON.stringify(params ?? {}).slice(0, 300)}`);
      pendingRequests.set(id, { resolve, reject });
      child.stdin.write(req);

      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
        }
      }, TIMEOUT_MS);
    });
  }

  // Global timeout
  const globalTimeout = setTimeout(() => {
    console.error('\nGlobal timeout reached. Killing process.');
    child.kill('SIGTERM');
    process.exit(1);
  }, TIMEOUT_MS * 4);

  try {
    // ── Step 1: Initialize ──────────────────────────────────────────────
    log('STEP', '1. Sending initialize...');
    const initResp = await send('initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'aionui-test', version: '1.0.0' },
      clientCapabilities: {
        prompts: {},
        tools: {},
        fs: { readTextFile: true, writeTextFile: true },
      },
    });
    log('RESP', `initialize => ${initResp.error ? 'ERROR: ' + JSON.stringify(initResp.error) : 'OK'}`);
    if (initResp.error) {
      log('FAIL', 'initialize failed, aborting.');
      child.kill('SIGTERM');
      return;
    }

    // ── Step 2: Create session ──────────────────────────────────────────
    log('STEP', '2. Sending session/new...');
    const sessionResp = await send('session/new', { cwd: CWD, mcpServers: [] });
    const sessionResult = sessionResp.result ?? sessionResp;
    const sessionId = sessionResult.sessionId;
    log('RESP', `session/new => full response:`);
    log('RESP', JSON.stringify(sessionResp, null, 2));

    // ── Step 3: Inspect modes ───────────────────────────────────────────
    log('STEP', '3. Inspecting modes in session/new response...');
    const modes = sessionResult.modes;

    console.log('\n' + '='.repeat(60));
    console.log('  SESSION/NEW RESPONSE — MODES FIELD');
    console.log('='.repeat(60));

    if (!modes) {
      console.log('  modes: NOT PRESENT in response');
      console.log('  → iFlow did NOT return modes. session/set_mode likely unsupported.');
    } else {
      console.log(`  modes.currentModeId: ${modes.currentModeId ?? 'N/A'}`);
      console.log(`  modes.availableModes:`);
      if (modes.availableModes && modes.availableModes.length > 0) {
        for (const m of modes.availableModes) {
          console.log(`    - id: "${m.id}", name: "${m.name}"${m.description ? ', desc: "' + m.description + '"' : ''}`);
        }
      } else {
        console.log('    (empty or not present)');
      }
    }
    console.log('='.repeat(60) + '\n');

    // ── Step 4: Test session/set_mode ───────────────────────────────────
    if (!sessionId) {
      log('FAIL', 'No sessionId returned, cannot test set_mode.');
      child.kill('SIGTERM');
      return;
    }

    // Determine which modes to test
    const modesToTest = modes?.availableModes?.map((m) => m.id) ?? ['plan', 'default', 'yolo'];

    console.log('='.repeat(60));
    console.log('  TESTING session/set_mode');
    console.log('='.repeat(60));

    for (const modeId of modesToTest) {
      log('STEP', `4. Sending session/set_mode { modeId: "${modeId}" }...`);
      try {
        const modeResp = await send('session/set_mode', { sessionId, modeId });
        const hasError = modeResp.error != null;
        const symbol = hasError ? '✗' : '✓';
        console.log(`  ${symbol} set_mode("${modeId}") => ${hasError ? 'ERROR: ' + JSON.stringify(modeResp.error) : 'SUCCESS ' + JSON.stringify(modeResp.result ?? {})}`);
      } catch (err) {
        console.log(`  ✗ set_mode("${modeId}") => TIMEOUT/ERROR: ${err.message}`);
      }
    }

    console.log('='.repeat(60) + '\n');

    // ── Summary ─────────────────────────────────────────────────────────
    console.log('='.repeat(60));
    console.log('  SUMMARY');
    console.log('='.repeat(60));
    if (modes?.availableModes?.length > 0) {
      console.log('  iFlow returned availableModes in session/new response.');
      console.log('  session/set_mode is SUPPORTED.');
      console.log(`  Available modes: ${modes.availableModes.map((m) => m.id).join(', ')}`);
      console.log(`  Current mode: ${modes.currentModeId}`);
    } else {
      console.log('  iFlow did NOT return availableModes.');
      console.log('  session/set_mode is likely NOT SUPPORTED.');
    }
    console.log('='.repeat(60));

  } catch (err) {
    log('ERROR', err.message);
  } finally {
    clearTimeout(globalTimeout);
    child.kill('SIGTERM');
    // Give process time to exit
    await new Promise((r) => setTimeout(r, 1000));
    process.exit(0);
  }
}

main();
