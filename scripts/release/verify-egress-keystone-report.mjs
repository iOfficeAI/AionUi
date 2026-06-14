#!/usr/bin/env node

import fs from 'node:fs';

import {
  EGRESS_KEYSTONE_VERIFIER_VERSION,
  evaluateEgressKeystoneReport,
} from './verify-egress-keystone-report-core.mjs';

function parseArgs(argv) {
  const args = {
    jsonReport: '',
    requirePassed: false,
    title: '',
    file: '',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json-report') args.jsonReport = argv[++index] || '';
    else if (arg === '--require-passed') args.requirePassed = true;
    else if (arg === '--title') args.title = argv[++index] || '';
    else if (arg === '--file') args.file = argv[++index] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return `Usage:
  node scripts/release/verify-egress-keystone-report.mjs \\
    --json-report <playwright-report.json> \\
    --require-passed \\
    [--file command-eve-egress-boundary.e2e.ts] \\
    [--title "blocks sensitive data"] \\
    [--json]

Fails closed when the required Command EVE Playwright proof is missing, failed,
or skipped. Use --file/--title for status-health and surface-inventory proofs.`;
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.status}: ${result.detail}`);
  if (result.matches?.length) {
    for (const match of result.matches) {
      console.log(`- ${match.status}: ${match.file} :: ${match.title}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const errors = [];
  if (!args.jsonReport) errors.push('--json-report is required');
  if (args.jsonReport && !fs.existsSync(args.jsonReport)) {
    errors.push(`--json-report not found: ${args.jsonReport}`);
  }

  if (errors.length) {
    const result = {
      version: EGRESS_KEYSTONE_VERIFIER_VERSION,
      ok: false,
      status: 'BLOCKED_REPORT_MALFORMED',
      detail: errors.join('; '),
      errors,
    };
    printResult(result, args.json);
    process.exitCode = 5;
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(args.jsonReport, 'utf8'));
  } catch (error) {
    const result = {
      version: EGRESS_KEYSTONE_VERIFIER_VERSION,
      ok: false,
      status: 'BLOCKED_REPORT_MALFORMED',
      detail: `Cannot parse Playwright JSON report: ${error.message}`,
      errors: [error.message],
    };
    printResult(result, args.json);
    process.exitCode = 5;
    return;
  }

  const result = {
    version: EGRESS_KEYSTONE_VERIFIER_VERSION,
    report_path: args.jsonReport,
    require_passed: args.requirePassed,
    ...evaluateEgressKeystoneReport(parsed, {
      requirePassed: args.requirePassed,
      filePattern: args.file || undefined,
      titlePattern: args.title || undefined,
    }),
  };
  result.ok = result.status === 'PASS';
  printResult(result, args.json);
  process.exitCode = result.exit_code;
}

main().catch((error) => {
  console.error(`verify-egress-keystone-report failed: ${error.message}`);
  process.exitCode = 5;
});
