import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EGRESS_KEYSTONE_STATUS_EXIT_CODES,
  evaluateEgressKeystoneReport,
  extractPlaywrightTests,
} from './verify-egress-keystone-report-core.mjs';

function playwrightReport({ file, title, status }) {
  return {
    suites: [
      {
        specs: [
          {
            file,
            title,
            tests: [{ title, results: [{ status }] }],
          },
        ],
      },
    ],
  };
}

test('passes the default egress-boundary proof only when it passed', () => {
  const report = playwrightReport({
    file: 'specs/command-eve-egress-boundary.e2e.ts',
    title: 'blocks sensitive data from the real EVE GUI chat path and writes a fresh receipt',
    status: 'passed',
  });
  const result = evaluateEgressKeystoneReport(report, { requirePassed: true });

  assert.equal(result.status, 'PASS');
  assert.equal(result.exit_code, EGRESS_KEYSTONE_STATUS_EXIT_CODES.PASS);
  assert.equal(result.counts.passed, 1);
});

test('blocks skipped proof', () => {
  const report = playwrightReport({
    file: 'specs/command-eve-egress-boundary.e2e.ts',
    title: 'blocks sensitive data from the real EVE GUI chat path and writes a fresh receipt',
    status: 'skipped',
  });
  const result = evaluateEgressKeystoneReport(report, { requirePassed: true });

  assert.equal(result.status, 'BLOCKED_TEST_SKIPPED');
  assert.equal(result.exit_code, EGRESS_KEYSTONE_STATUS_EXIT_CODES.BLOCKED_TEST_SKIPPED);
});

test('supports explicit file and title checks for status-health proof', () => {
  const report = playwrightReport({
    file: 'specs/command-eve-status-health.e2e.ts',
    title: 'reports a blocked disconnected state when the event ledger is missing',
    status: 'passed',
  });
  const matches = extractPlaywrightTests(report, {
    filePattern: 'command-eve-status-health.e2e.ts',
    titlePattern: 'reports a blocked disconnected state',
  });
  const result = evaluateEgressKeystoneReport(report, {
    requirePassed: true,
    filePattern: 'command-eve-status-health.e2e.ts',
    titlePattern: 'reports a blocked disconnected state',
  });

  assert.equal(matches.length, 1);
  assert.equal(result.status, 'PASS');
});

test('blocks missing explicit proof', () => {
  const report = playwrightReport({
    file: 'specs/command-eve-status-health.e2e.ts',
    title: 'reports a blocked disconnected state when the event ledger is missing',
    status: 'passed',
  });
  const result = evaluateEgressKeystoneReport(report, {
    requirePassed: true,
    filePattern: 'command-eve-default-surface-inventory.e2e.ts',
    titlePattern: 'keeps raw Hermes power tabs out of the default navigation',
  });

  assert.equal(result.status, 'BLOCKED_TEST_MISSING');
});
