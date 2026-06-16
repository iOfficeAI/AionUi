import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARCH_TRIPLES,
  PY_VERSION,
  RELEASE_TAG,
  buildAssetName,
  buildDownloadUrl,
  decideVerify,
  expectedSha256,
  isArchPinned,
  resolveTriple,
  sha256Hex,
} from './fetch-bundled-python.mjs';

// --- arch / triple resolution ---------------------------------------------

test('resolveTriple maps arm64 + aliases to aarch64-apple-darwin', () => {
  assert.equal(resolveTriple('arm64'), 'aarch64-apple-darwin');
  assert.equal(resolveTriple('aarch64'), 'aarch64-apple-darwin');
});

test('resolveTriple maps x86_64 + x64 to x86_64-apple-darwin', () => {
  assert.equal(resolveTriple('x86_64'), 'x86_64-apple-darwin');
  assert.equal(resolveTriple('x64'), 'x86_64-apple-darwin');
});

test('resolveTriple throws on an unknown arch', () => {
  assert.throws(() => resolveTriple('riscv'), /Unsupported arch/);
});

// --- asset name / URL construction ----------------------------------------

test('buildAssetName builds the pinned install_only tarball name (arm64)', () => {
  assert.equal(
    buildAssetName('arm64'),
    `cpython-${PY_VERSION}+${RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz`,
  );
});

test('buildAssetName builds the x86_64 tarball name', () => {
  assert.equal(
    buildAssetName('x86_64'),
    `cpython-${PY_VERSION}+${RELEASE_TAG}-x86_64-apple-darwin-install_only.tar.gz`,
  );
});

test('buildDownloadUrl points at the pinned GitHub release download', () => {
  const url = buildDownloadUrl('arm64');
  assert.equal(
    url,
    `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_TAG}/cpython-${PY_VERSION}+${RELEASE_TAG}-aarch64-apple-darwin-install_only.tar.gz`,
  );
});

test('buildAssetName/url honor version+tag overrides (for future bumps)', () => {
  assert.equal(
    buildAssetName('arm64', { version: '3.12.99', tag: '29990101' }),
    'cpython-3.12.99+29990101-aarch64-apple-darwin-install_only.tar.gz',
  );
  assert.match(
    buildDownloadUrl('arm64', { version: '3.12.99', tag: '29990101' }),
    /29990101\/cpython-3\.12\.99\+29990101-aarch64-apple-darwin-install_only\.tar\.gz$/,
  );
});

// --- pin state -------------------------------------------------------------

test('arm64 is pinned with a 64-hex-char sha; x86_64 is unpinned (TODO)', () => {
  assert.equal(isArchPinned('arm64'), true);
  assert.match(expectedSha256('arm64'), /^[0-9a-f]{64}$/);
  assert.equal(isArchPinned('x86_64'), false);
  assert.equal(expectedSha256('x86_64'), null);
});

test('every known triple alias resolves (sanity over ARCH_TRIPLES)', () => {
  for (const arch of Object.keys(ARCH_TRIPLES)) {
    assert.ok(resolveTriple(arch).endsWith('-apple-darwin'));
  }
});

// --- fail-closed verify decision (the security keystone) -------------------

test('decideVerify OK only when a pinned expected sha matches the actual', () => {
  const sha = expectedSha256('arm64');
  const decision = decideVerify({ expected: sha, actual: sha });
  assert.equal(decision.ok, true);
});

test('decideVerify is case-insensitive on matching shas', () => {
  const sha = 'a'.repeat(64);
  assert.equal(decideVerify({ expected: sha, actual: sha.toUpperCase() }).ok, true);
});

test('decideVerify FAILS CLOSED on a sha mismatch (never extract)', () => {
  const decision = decideVerify({ expected: 'a'.repeat(64), actual: 'b'.repeat(64) });
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /mismatch/);
});

test('decideVerify FAILS CLOSED when the expected sha is unpinned (null/TODO)', () => {
  assert.equal(decideVerify({ expected: null, actual: 'a'.repeat(64) }).ok, false);
  assert.equal(decideVerify({ expected: undefined, actual: 'a'.repeat(64) }).ok, false);
  assert.equal(decideVerify({ expected: '', actual: 'a'.repeat(64) }).ok, false);
});

test('decideVerify FAILS CLOSED on a malformed expected sha (not 64 hex)', () => {
  assert.equal(decideVerify({ expected: 'deadbeef', actual: 'a'.repeat(64) }).ok, false);
  assert.equal(decideVerify({ expected: 'z'.repeat(64), actual: 'a'.repeat(64) }).ok, false);
});

test('decideVerify FAILS CLOSED when the actual sha is missing/malformed', () => {
  const expected = 'a'.repeat(64);
  assert.equal(decideVerify({ expected, actual: null }).ok, false);
  assert.equal(decideVerify({ expected, actual: '' }).ok, false);
  assert.equal(decideVerify({ expected, actual: 'short' }).ok, false);
});

// --- sha256 helper ---------------------------------------------------------

test('sha256Hex matches a known vector (empty input)', () => {
  // SHA256 of the empty string.
  assert.equal(
    sha256Hex(Buffer.alloc(0)),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

test('sha256Hex of a known buffer round-trips through decideVerify', () => {
  const buf = Buffer.from('command-eve bundled python', 'utf8');
  const actual = sha256Hex(buf);
  assert.match(actual, /^[0-9a-f]{64}$/);
  assert.equal(decideVerify({ expected: actual, actual }).ok, true);
});
