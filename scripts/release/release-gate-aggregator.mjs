#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  EGRESS_KEYSTONE_VERIFIER_VERSION,
  evaluateEgressKeystoneReport,
} from './verify-egress-keystone-report-core.mjs';
import {
  RELEASE_GATE_AGGREGATOR_VERSION,
  runReleaseGates,
} from './release-gate-aggregator-core.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOTARIZATION_GATE = path.join(HERE, 'verify-notarization-stapled.mjs');

function parseArgs(argv) {
  const args = { egressJsonReport: '', dmg: '', json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--egress-json-report') args.egressJsonReport = argv[++index] || '';
    else if (arg === '--dmg') args.dmg = argv[++index] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/release/release-gate-aggregator.mjs \\
    --egress-json-report <playwright-report.json> \\
    --dmg <path-to.dmg> \\
    [--json]

Runs the REQUIRED, fail-closed release gates and blocks the release unless every
one passes:
  - egress-keystone     (Command EVE egress-boundary Playwright proof)
  - notarization-stapled (DMG stapler-valid + accepted by Gatekeeper/spctl)

A non-stapled or spctl-rejected DMG, a missing/failed/skipped egress proof, or a
missing input fails the whole gate closed.`;
}

// Runner for the egress-keystone gate: reads the Playwright JSON report and
// runs the same pure evaluator the standalone gate CLI uses. A missing or
// unparseable report fails closed.
function makeEgressKeystoneRunner(jsonReportPath) {
  return () => {
    if (!jsonReportPath) {
      return {
        version: EGRESS_KEYSTONE_VERIFIER_VERSION,
        status: 'BLOCKED_REPORT_MALFORMED',
        detail: '--egress-json-report is required',
      };
    }
    if (!fs.existsSync(jsonReportPath)) {
      return {
        version: EGRESS_KEYSTONE_VERIFIER_VERSION,
        status: 'BLOCKED_REPORT_MALFORMED',
        detail: `--egress-json-report not found: ${jsonReportPath}`,
      };
    }
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(jsonReportPath, 'utf8'));
    } catch (error) {
      return {
        version: EGRESS_KEYSTONE_VERIFIER_VERSION,
        status: 'BLOCKED_REPORT_MALFORMED',
        detail: `Cannot parse Playwright JSON report: ${error.message}`,
      };
    }
    return {
      version: EGRESS_KEYSTONE_VERIFIER_VERSION,
      ...evaluateEgressKeystoneReport(parsed, { requirePassed: true }),
    };
  };
}

// Runner for the notarization-stapled gate: spawns the Batch-1 gate CLI so it
// does the real xcrun/spctl assessment (and fails closed off-darwin / on a
// non-stapled DMG). We parse its --json output back into the aggregator's
// gate-result shape. A non-zero exit or unparseable output is fail-closed.
function makeNotarizationStapledRunner(dmgPath) {
  return () => {
    if (!dmgPath) {
      return { status: 'BLOCKED_ARTIFACT_MISSING', detail: '--dmg is required' };
    }
    const run = spawnSync(process.execPath, [NOTARIZATION_GATE, '--dmg', dmgPath, '--json'], {
      encoding: 'utf8',
    });
    if (run.error) {
      return {
        status: 'BLOCKED_CHECK_ERROR',
        detail: `notarization gate could not run: ${run.error.message}`,
      };
    }
    let parsed;
    try {
      parsed = JSON.parse(run.stdout || '');
    } catch {
      return {
        status: 'BLOCKED_CHECK_ERROR',
        detail: `notarization gate produced unparseable output (exit ${run.status})`,
        exit_code: run.status,
      };
    }
    // Trust the gate's own status, but never let a zero-ish status leak through:
    // if the child exited non-zero, force a block regardless of parsed status.
    if (run.status !== 0 && parsed.status === 'PASS') {
      return {
        status: 'BLOCKED_CHECK_ERROR',
        detail: `notarization gate reported PASS but exited ${run.status}; failing closed`,
        exit_code: run.status,
      };
    }
    return parsed;
  };
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.status}: ${result.detail}`);
  for (const gate of result.gates || []) {
    console.log(`- ${gate.ok ? 'PASS' : 'BLOCK'} ${gate.id}: ${gate.status} :: ${gate.detail}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const result = await runReleaseGates({
    egressKeystone: makeEgressKeystoneRunner(args.egressJsonReport),
    notarizationStapled: makeNotarizationStapledRunner(args.dmg),
  });
  result.aggregator_version = RELEASE_GATE_AGGREGATOR_VERSION;
  printResult(result, args.json);
  process.exitCode = result.exit_code;
}

main().catch((error) => {
  console.error(`release-gate-aggregator failed: ${error.message}`);
  process.exitCode = 6;
});
