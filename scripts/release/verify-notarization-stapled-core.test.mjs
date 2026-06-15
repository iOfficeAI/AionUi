import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOTARIZATION_STAPLED_STATUS_EXIT_CODES,
  buildSpctlAssessArgs,
  buildStaplerValidateArgs,
  evaluateNotarizationStapled,
  evaluateSpctlAssessment,
  evaluateStaplerValidate,
} from './verify-notarization-stapled-core.mjs';

test('builds stapler validate args for a DMG path', () => {
  assert.deepEqual(buildStaplerValidateArgs('/tmp/Command EVE.dmg'), [
    'stapler',
    'validate',
    '/tmp/Command EVE.dmg',
  ]);
});

test('builds spctl open-assessment args with the primary-signature context', () => {
  assert.deepEqual(buildSpctlAssessArgs('/tmp/Command EVE.dmg'), [
    '-a',
    '-t',
    'open',
    '--context',
    'context:primary-signature',
    '/tmp/Command EVE.dmg',
  ]);
});

test('stapler validate passes on the worked string with exit 0', () => {
  const result = evaluateStaplerValidate({ exitCode: 0, output: 'The validate action worked!' });
  assert.equal(result.ok, true);
});

test('stapler validate fails when the ticket is absent (exit 65)', () => {
  const result = evaluateStaplerValidate({
    exitCode: 65,
    output: 'Could not validate ticket: does not have a ticket stapled to it.',
  });
  assert.equal(result.ok, false);
});

test('stapler validate fails closed when exit is non-zero even if a success string leaks', () => {
  const result = evaluateStaplerValidate({ exitCode: 1, output: 'The validate action worked!' });
  assert.equal(result.ok, false);
});

test('stapler validate fails closed on missing exit code', () => {
  const result = evaluateStaplerValidate({ exitCode: null, output: '' });
  assert.equal(result.ok, false);
});

test('spctl assessment passes on accepted + Notarized Developer ID', () => {
  const result = evaluateSpctlAssessment({
    exitCode: 0,
    output: '/tmp/Command EVE.dmg: accepted\nsource=Notarized Developer ID',
  });
  assert.equal(result.ok, true);
});

test('spctl assessment fails on rejected verdict', () => {
  const result = evaluateSpctlAssessment({
    exitCode: 3,
    output: '/tmp/Command EVE.dmg: rejected\nsource=no usable signature',
  });
  assert.equal(result.ok, false);
});

test('spctl assessment fails closed on non-zero exit without a verdict', () => {
  const result = evaluateSpctlAssessment({ exitCode: 1, output: '' });
  assert.equal(result.ok, false);
});

test('spctl assessment fails closed when "accepted" appears but exit is non-zero', () => {
  const result = evaluateSpctlAssessment({ exitCode: 1, output: 'accepted' });
  assert.equal(result.ok, false);
});

test('combined gate PASSes only when both stapler and spctl pass', () => {
  const result = evaluateNotarizationStapled({
    stapler: { exitCode: 0, output: 'The validate action worked!' },
    spctl: { exitCode: 0, output: 'accepted\nsource=Notarized Developer ID' },
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.exit_code, NOTARIZATION_STAPLED_STATUS_EXIT_CODES.PASS);
});

test('combined gate blocks on bad staple before even checking spctl', () => {
  const result = evaluateNotarizationStapled({
    stapler: { exitCode: 65, output: 'does not have a ticket stapled' },
    spctl: { exitCode: 0, output: 'accepted' },
  });
  assert.equal(result.status, 'BLOCKED_STAPLE_INVALID');
  assert.equal(result.exit_code, NOTARIZATION_STAPLED_STATUS_EXIT_CODES.BLOCKED_STAPLE_INVALID);
  assert.equal(result.spctl, null);
});

test('combined gate blocks when staple is fine but spctl rejects', () => {
  const result = evaluateNotarizationStapled({
    stapler: { exitCode: 0, output: 'The validate action worked!' },
    spctl: { exitCode: 3, output: 'rejected' },
  });
  assert.equal(result.status, 'BLOCKED_SPCTL_REJECTED');
  assert.equal(result.exit_code, NOTARIZATION_STAPLED_STATUS_EXIT_CODES.BLOCKED_SPCTL_REJECTED);
});

test('combined gate fails closed on empty input (no checks ran)', () => {
  const result = evaluateNotarizationStapled({});
  assert.equal(result.status, 'BLOCKED_STAPLE_INVALID');
});
