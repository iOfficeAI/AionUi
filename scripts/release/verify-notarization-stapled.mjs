#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import {
  NOTARIZATION_STAPLED_STATUS_EXIT_CODES,
  NOTARIZATION_STAPLED_VERIFIER_VERSION,
  buildSpctlAssessArgs,
  buildStaplerValidateArgs,
  evaluateNotarizationStapled,
} from './verify-notarization-stapled-core.mjs';

function parseArgs(argv) {
  const args = { dmg: '', json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dmg') args.dmg = argv[++index] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (!args.dmg && !arg.startsWith('-')) args.dmg = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/release/verify-notarization-stapled.mjs --dmg <path-to.dmg> [--json]

Fail-closed release gate. Asserts that the DMG carries a stapled Apple
notarization ticket (xcrun stapler validate) AND is accepted by Gatekeeper
(spctl -a -t open). Exits non-zero with a clear reason on any failure.`;
}

// Run a tool and collect a combined exit code + stdout/stderr blob for the
// pure-logic evaluator. macOS-only tools (xcrun/spctl) are absent off-darwin,
// which the evaluator treats as a fail-closed block.
function runCheck(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: 'utf8' });
  if (result.error) {
    return { exitCode: result.status ?? 127, output: `${command} could not run: ${result.error.message}` };
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return { exitCode: result.status, output };
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.status}: ${result.detail}`);
  if (result.stapler?.detail) console.log(`- stapler: ${result.stapler.detail}`);
  if (result.spctl?.detail) console.log(`- spctl:   ${result.spctl.detail}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const errors = [];
  if (!args.dmg) errors.push('--dmg is required');
  else if (!fs.existsSync(args.dmg)) errors.push(`--dmg not found: ${args.dmg}`);

  if (errors.length) {
    const result = {
      version: NOTARIZATION_STAPLED_VERIFIER_VERSION,
      ok: false,
      status: 'BLOCKED_ARTIFACT_MISSING',
      detail: errors.join('; '),
      errors,
    };
    printResult(result, args.json);
    process.exitCode = NOTARIZATION_STAPLED_STATUS_EXIT_CODES.BLOCKED_ARTIFACT_MISSING;
    return;
  }

  if (process.platform !== 'darwin') {
    const result = {
      version: NOTARIZATION_STAPLED_VERIFIER_VERSION,
      ok: false,
      status: 'BLOCKED_CHECK_ERROR',
      detail: 'Notarization verification requires macOS (xcrun + spctl); refusing to pass off-darwin',
    };
    printResult(result, args.json);
    process.exitCode = NOTARIZATION_STAPLED_STATUS_EXIT_CODES.BLOCKED_CHECK_ERROR;
    return;
  }

  const stapler = runCheck('xcrun', buildStaplerValidateArgs(args.dmg));
  const spctl = runCheck('spctl', buildSpctlAssessArgs(args.dmg));

  const result = {
    version: NOTARIZATION_STAPLED_VERIFIER_VERSION,
    dmg_path: args.dmg,
    ...evaluateNotarizationStapled({ stapler, spctl }),
  };
  result.ok = result.status === 'PASS';
  printResult(result, args.json);
  process.exitCode = result.exit_code;
}

try {
  main();
} catch (error) {
  console.error(`verify-notarization-stapled failed: ${error.message}`);
  process.exitCode = NOTARIZATION_STAPLED_STATUS_EXIT_CODES.BLOCKED_CHECK_ERROR;
}
