import assert from 'node:assert/strict';
import test from 'node:test';

import {
  REQUIRED_RELEASE_GATES,
  RELEASE_GATE_AGGREGATOR_STATUS_EXIT_CODES,
  normalizeGateResult,
  runReleaseGates,
} from './release-gate-aggregator-core.mjs';

const PASS_EGRESS = { status: 'PASS', detail: 'egress proof passed', exit_code: 0 };
const PASS_NOTARIZATION = { status: 'PASS', detail: 'Artifact is stapled and accepted by Gatekeeper', exit_code: 0 };

test('notarization-stapled is a required, fail-closed gate in the roster', () => {
  const ids = REQUIRED_RELEASE_GATES.map((gate) => gate.id);
  assert.ok(ids.includes('notarization-stapled'), 'notarization-stapled must be a required gate');
  assert.ok(ids.includes('egress-keystone'), 'egress-keystone stays a required gate');
});

test('aggregate PASSes only when every required gate passes', async () => {
  const result = await runReleaseGates({
    egressKeystone: () => PASS_EGRESS,
    notarizationStapled: () => PASS_NOTARIZATION,
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.exit_code, RELEASE_GATE_AGGREGATOR_STATUS_EXIT_CODES.PASS);
  assert.deepEqual(result.blocked_gates, []);
});

test('aggregator invokes the notarization gate runner exactly once', async () => {
  let notarizationCalls = 0;
  await runReleaseGates({
    egressKeystone: () => PASS_EGRESS,
    notarizationStapled: () => {
      notarizationCalls += 1;
      return PASS_NOTARIZATION;
    },
  });
  assert.equal(notarizationCalls, 1, 'notarization gate must be invoked by the aggregator');
});

test('aggregate FAILS CLOSED when the notarization gate reports BLOCKED (spctl rejected)', async () => {
  const result = await runReleaseGates({
    egressKeystone: () => PASS_EGRESS,
    notarizationStapled: () => ({
      status: 'BLOCKED_SPCTL_REJECTED',
      detail: 'spctl rejected the artifact (Gatekeeper would block it)',
      exit_code: 4,
    }),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.exit_code, RELEASE_GATE_AGGREGATOR_STATUS_EXIT_CODES.BLOCKED);
  assert.ok(
    result.blocked_gates.includes('notarization-stapled'),
    'a BLOCKED notarization gate must block the whole release'
  );
});

test('aggregate FAILS CLOSED when the notarization gate reports an unstapled DMG', async () => {
  const result = await runReleaseGates({
    egressKeystone: () => PASS_EGRESS,
    notarizationStapled: () => ({
      status: 'BLOCKED_STAPLE_INVALID',
      detail: 'stapler validate did not confirm a stapled ticket',
      exit_code: 3,
    }),
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blocked_gates.includes('notarization-stapled'));
});

test('aggregate FAILS CLOSED when the notarization runner throws', async () => {
  const result = await runReleaseGates({
    egressKeystone: () => PASS_EGRESS,
    notarizationStapled: () => {
      throw new Error('xcrun missing');
    },
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blocked_gates.includes('notarization-stapled'));
});

test('aggregate FAILS CLOSED when the notarization runner returns no result', async () => {
  const result = await runReleaseGates({
    egressKeystone: () => PASS_EGRESS,
    notarizationStapled: () => undefined,
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blocked_gates.includes('notarization-stapled'));
});

test('a missing notarization runner is a fail-closed config error', async () => {
  const result = await runReleaseGates({
    egressKeystone: () => PASS_EGRESS,
    // notarizationStapled intentionally omitted
  });
  assert.equal(result.status, 'BLOCKED_CONFIG_ERROR');
  assert.equal(result.exit_code, RELEASE_GATE_AGGREGATOR_STATUS_EXIT_CODES.BLOCKED_CONFIG_ERROR);
  assert.ok(result.blocked_gates.includes('notarization-stapled'));
});

test('a blocked egress gate also blocks even when notarization passes', async () => {
  const result = await runReleaseGates({
    egressKeystone: () => ({ status: 'BLOCKED_TEST_SKIPPED', detail: 'egress proof skipped' }),
    notarizationStapled: () => PASS_NOTARIZATION,
  });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blocked_gates.includes('egress-keystone'));
});

test('normalizeGateResult treats any non-PASS status as a block', () => {
  const gate = { id: 'notarization-stapled' };
  assert.equal(normalizeGateResult(gate, { status: 'PASS' }).ok, true);
  assert.equal(normalizeGateResult(gate, { status: 'BLOCKED_SPCTL_REJECTED' }).ok, false);
  assert.equal(normalizeGateResult(gate, { status: '' }).ok, false);
  assert.equal(normalizeGateResult(gate, null).ok, false);
});
