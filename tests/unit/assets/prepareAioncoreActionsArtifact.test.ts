import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

const {
  downloadAndExtractActionsArtifact,
  downloadFileWithAuth,
  extractArchive,
  getActionsArtifactName,
  getActionsArtifactMissingMessage,
  getActionsRepository,
  getReleaseRepository,
  getActionsRunProvenance,
  getExpectedActionsHeadSha,
  getExpectedActionsSha256,
  prepareManagedResources,
  prepareAioncore,
  validateActionsArtifactMetadata,
  validateActionsBuildManifest,
} = require('../../../packages/shared-scripts/src/prepare-aioncore');

const ARCHIVE_SHA256 = '0eb3e36bfb24dcd9bb1d1bece1531216b59539a8fde17ee80224af0653c92aa3';
const HEAD_SHA = 'ace375767d0b2ece67edf4128f09401f1de2ba8f';

it('binds Core build metadata to the verified archive, platform and workflow attempt', () => {
  const expected = { repository: 'owner/core', runId: '12', runAttempt: 1, actualHeadSha: HEAD_SHA };
  const record = {
    schema: 1,
    repository: 'owner/core',
    runId: 12,
    attempt: 1,
    headSha: HEAD_SHA,
    platform: 'windows-x64',
    target: 'x86_64-pc-windows-msvc',
    artifact: 'aioncore-manual-windows-x64',
    archive: 'core.zip',
    sha256: ARCHIVE_SHA256,
    build: {
      profile: 'release',
      rustc: 'rustc 1.95.0',
      cargoLockSha256: 'a'.repeat(64),
      toolchainSha256: 'b'.repeat(64),
      workflowSha256: 'c'.repeat(64),
      rustflags: '-C target-feature=+crt-static',
    },
  };
  expect(
    validateActionsBuildManifest(record, expected, 'aioncore-manual-windows-x64', 'core.zip', ARCHIVE_SHA256)
  ).toEqual(record);
  expect(() =>
    validateActionsBuildManifest(
      { ...record, build: undefined },
      expected,
      'aioncore-manual-windows-x64',
      'core.zip',
      ARCHIVE_SHA256
    )
  ).toThrow(/toolchain identity/);
  for (const patch of [
    { attempt: 2 },
    { headSha: 'b'.repeat(40) },
    { sha256: 'b'.repeat(64) },
    { target: 'aarch64-apple-darwin' },
  ]) {
    expect(() =>
      validateActionsBuildManifest(
        { ...record, ...patch },
        expected,
        'aioncore-manual-windows-x64',
        'core.zip',
        ARCHIVE_SHA256
      )
    ).toThrow(/manifest/);
  }
});

const posixFakeToolchainIt = process.platform === 'win32' ? it.skip : it;

function writeFile(filePath: string, contents = 'x') {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
}

function writeExecutable(filePath: string, contents: string) {
  writeFile(filePath, contents);
  chmodSync(filePath, 0o755);
}

function createFakeToolchain(root: string, { curlFails = false, artifactDigest = ARCHIVE_SHA256 } = {}) {
  const binDir = join(root, 'bin');
  mkdirSync(binDir, { recursive: true });

  writeExecutable(
    join(binDir, 'curl'),
    curlFails
      ? '#!/usr/bin/env bash\nexit 1\n'
      : `#!/usr/bin/env bash
set -euo pipefail
out=''
args="$*"
while [[ $# -gt 0 ]]; do
  if [[ "$1" == '-o' ]]; then
    shift
    out="$1"
  fi
  shift || true
done
if [[ -z "$out" ]]; then
  printf '{}'
  exit 0
fi
mkdir -p "$(dirname "$out")"
if [[ "$args" == *"SHASUMS256.txt"* ]]; then
  printf '${ARCHIVE_SHA256}  node-v24.11.0-win-x64.zip\n' > "$out"
else
  printf 'archive' > "$out"
fi
`
  );
  writeExecutable(join(binDir, 'wget'), '#!/usr/bin/env bash\nexit 1\n');
  writeExecutable(
    join(binDir, 'gh'),
    `#!/usr/bin/env bash
case "$*" in
  *"/actions/runs/123/artifacts"*)
    cat <<'JSON'
{"artifacts":[{"id":456,"name":"aioncore-manual-linux-x64","archive_download_url":"https://example.invalid/artifact.zip","expired":false,"digest":"sha256:${artifactDigest}","workflow_run":{"id":123}}]}
JSON
    ;;
  *"/actions/runs/123"*)
    cat <<'JSON'
{"id":123,"run_attempt":1,"name":"🔨 Manual Build","path":".github/workflows/build-manual.yml","event":"workflow_dispatch","status":"completed","conclusion":"success","head_sha":"ace375767d0b2ece67edf4128f09401f1de2ba8f","head_branch":"main","html_url":"https://github.com/CleverC2200/AionCore/actions/runs/123","created_at":"2026-08-22T00:00:00Z","updated_at":"2026-08-22T00:10:00Z","repository":{"full_name":"CleverC2200/AionCore"}}
JSON
    ;;
  *)
    printf '{"artifact":"aioncore-manual-linux-x64"}'
    ;;
esac
`
  );
  writeExecutable(
    join(binDir, 'unzip'),
    `#!/usr/bin/env bash
set -euo pipefail
out=''
args="$*"
while [[ $# -gt 0 ]]; do
  if [[ "$1" == '-d' ]]; then
    shift
    out="$1"
  fi
  shift || true
done
mkdir -p "$out"
if [[ "$args" == *"node-v24.11.0-win-x64.zip"* ]]; then
  mkdir -p "$out/node-v24.11.0-win-x64"
  printf 'node' > "$out/node-v24.11.0-win-x64/node.exe"
else
  printf 'archive' > "$out/aioncore-v0.1.46-x86_64-unknown-linux-gnu.tar.gz"
  cat > "$out/aioncore-manifest.json" <<'JSON'
{"schema":1,"repository":"CleverC2200/AionCore","runId":123,"attempt":1,"headSha":"${HEAD_SHA}","platform":"linux-x64","target":"x86_64-unknown-linux-gnu","artifact":"aioncore-manual-linux-x64","archive":"aioncore-v0.1.46-x86_64-unknown-linux-gnu.tar.gz","sha256":"${ARCHIVE_SHA256}","build":{"profile":"release","rustc":"rustc 1.95.0","cargoLockSha256":"${'a'.repeat(64)}","toolchainSha256":"${'b'.repeat(64)}","workflowSha256":"${'c'.repeat(64)}","rustflags":""}}
JSON
fi
`
  );
  writeExecutable(
    join(binDir, 'tar'),
    `#!/usr/bin/env bash
set -euo pipefail
out=''
while [[ $# -gt 0 ]]; do
  if [[ "$1" == '-C' ]]; then
    shift
    out="$1"
  fi
  shift || true
done
mkdir -p "$out"
cat > "$out/aioncore" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "$out/aioncore"
`
  );

  return binDir;
}

afterEach(() => {
  delete process.env.AIONUI_BACKEND_RUN_ID;
  delete process.env.AIONUI_BACKEND_ACTIONS_REPOSITORY;
  delete process.env.AIONUI_BACKEND_RELEASE_REPOSITORY;
  delete process.env.AIONUI_BACKEND_SOURCE_POLICY;
  delete process.env.AIONUI_BACKEND_EXPECTED_HEAD_SHA;
  delete process.env.AIONUI_BACKEND_SHA256;
  delete process.env.AIONUI_BACKEND_SHA256S;
  delete process.env.AIONUI_BACKEND_LOCAL_BUNDLE_DIR;
  delete process.env.AIONUI_BACKEND_LOCAL_BINARY;
  delete process.env.AIONUI_BACKEND_MANAGED_NODE_VERSION;
  rmSync(join(tmpdir(), 'aioncore-prepare', 'v0.1.46'), { recursive: true, force: true });
  rmSync(join(tmpdir(), 'aioncore-prepare-actions', '123'), { recursive: true, force: true });
});

describe('prepare-aioncore GitHub Actions artifact resolver', () => {
  posixFakeToolchainIt('uses the host unzip tool when extracting a Windows target on POSIX', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-windows-extract-'));
    const fakeBin = createFakeToolchain(tmp);
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;

    try {
      const outputDir = join(tmp, 'extracted');
      extractArchive(join(tmp, 'artifact.zip'), outputDir, 'win32');
      expect(readFileSync(join(outputDir, 'aioncore-v0.1.46-x86_64-unknown-linux-gnu.tar.gz'), 'utf8')).toBe('archive');
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  posixFakeToolchainIt('prepares checksummed Windows managed resources on a POSIX build host', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-windows-managed-node-'));
    const fakeBin = createFakeToolchain(tmp);
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;
    process.env.AIONUI_BACKEND_MANAGED_NODE_VERSION = '24.11.0';

    try {
      const binaryPath = join(tmp, 'aioncore.exe');
      const targetDir = join(tmp, 'bundle');
      writeFile(binaryPath, 'target binary uses managed Node 24.11.0');
      prepareManagedResources(binaryPath, targetDir, 'win32', 'x64');
      expect(JSON.parse(readFileSync(join(targetDir, 'managed-resources', 'manifest.json'), 'utf8'))).toEqual({
        schemaVersion: 2,
        runtimeKey: 'win32-x64',
        node: {
          version: '24.11.0',
          root: 'node/node-v24.11.0-win-x64',
          executable: 'node.exe',
        },
        clis: [],
      });
      expect(
        readFileSync(join(targetDir, 'managed-resources', 'node', 'node-v24.11.0-win-x64', 'node.exe'), 'utf8')
      ).toBe('node');
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  posixFakeToolchainIt('writes the gh api response when curl cannot download an artifact', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-actions-download-'));
    const fakeBin = createFakeToolchain(tmp, { curlFails: true });
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;

    try {
      const outputPath = join(tmp, 'artifact.zip');
      downloadFileWithAuth('https://api.github.com/repos/example/repo/actions/artifacts/123/zip', outputPath);
      expect(readFileSync(outputPath, 'utf8')).toContain('aioncore-manual-linux-x64');
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('uses the personal repository by default and accepts an explicit workflow repository', () => {
    expect(getActionsRepository()).toBe('CleverC2200/AionCore');

    process.env.AIONUI_BACKEND_ACTIONS_REPOSITORY = 'iOfficeAI/AionCore';
    expect(getActionsRepository()).toBe('iOfficeAI/AionCore');
  });

  it('rejects malformed workflow repositories', () => {
    process.env.AIONUI_BACKEND_ACTIONS_REPOSITORY = 'https://github.com/CleverC2200/AionCore';
    expect(() => getActionsRepository()).toThrow(/Invalid AionCore Actions repository/);
  });

  it('uses the pinned release repository and accepts an explicit override', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-release-repository-'));
    try {
      writeFile(join(tmp, 'package.json'), JSON.stringify({ aioncoreRepository: 'CleverC2200/AionCore' }));
      expect(getReleaseRepository(tmp)).toBe('CleverC2200/AionCore');

      process.env.AIONUI_BACKEND_RELEASE_REPOSITORY = 'iOfficeAI/AionCore';
      expect(getReleaseRepository(tmp)).toBe('iOfficeAI/AionCore');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('rejects a malformed pinned release repository', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-release-repository-invalid-'));
    try {
      writeFile(join(tmp, 'package.json'), JSON.stringify({ aioncoreRepository: 'https://github.com/AionCore' }));
      expect(() => getReleaseRepository(tmp)).toThrow(/Invalid AionCore release repository/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('does not hide a malformed package pin by falling back to the official repository', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-release-repository-malformed-package-'));
    try {
      writeFile(join(tmp, 'package.json'), '{');
      expect(() => getReleaseRepository(tmp)).toThrow(SyntaxError);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('requires one unambiguous workflow artifact source under verified-actions policy', () => {
    process.env.AIONUI_BACKEND_SOURCE_POLICY = 'verified-actions';
    expect(() =>
      prepareAioncore({
        projectRoot: '/unused',
        platform: 'linux',
        arch: 'x64',
        version: 'v0.1.71',
      })
    ).toThrow(/AIONUI_BACKEND_RUN_ID is required/);

    process.env.AIONUI_BACKEND_RUN_ID = '123';
    process.env.AIONUI_BACKEND_EXPECTED_HEAD_SHA = 'abc123';
    expect(() =>
      prepareAioncore({
        projectRoot: '/unused',
        platform: 'linux',
        arch: 'x64',
        version: 'v0.1.71',
      })
    ).toThrow(/exactly 40 lowercase hexadecimal characters/);

    delete process.env.AIONUI_BACKEND_EXPECTED_HEAD_SHA;
    process.env.AIONUI_BACKEND_LOCAL_BINARY = '/tmp/untrusted-aioncore';
    expect(() =>
      prepareAioncore({
        projectRoot: '/unused',
        platform: 'linux',
        arch: 'x64',
        version: 'v0.1.71',
      })
    ).toThrow(/rejects local AionCore overrides/);
  });

  it('resolves checksums by frozen artifact name and rejects malformed maps', () => {
    process.env.AIONUI_BACKEND_SHA256S = JSON.stringify({
      'aioncore-manual-linux-x64': ARCHIVE_SHA256,
    });
    expect(getExpectedActionsSha256('aioncore-manual-linux-x64', { required: true })).toBe(ARCHIVE_SHA256);

    process.env.AIONUI_BACKEND_SHA256S = '{bad json';
    expect(() => getExpectedActionsSha256('aioncore-manual-linux-x64')).toThrow(/Invalid AIONUI_BACKEND_SHA256S JSON/);
  });

  it('accepts an exact expected head SHA', () => {
    process.env.AIONUI_BACKEND_EXPECTED_HEAD_SHA = HEAD_SHA;
    expect(getExpectedActionsHeadSha({ required: true })).toBe(HEAD_SHA);
  });

  it.each([
    [
      'missing',
      {
        id: 456,
        digest: `sha256:${ARCHIVE_SHA256}`,
        workflow_run: { id: 123 },
      },
    ],
    [
      'null',
      {
        id: 456,
        expired: null,
        digest: `sha256:${ARCHIVE_SHA256}`,
        workflow_run: { id: 123 },
      },
    ],
    [
      'wrong',
      {
        id: 456,
        expired: true,
        digest: `sha256:${ARCHIVE_SHA256}`,
        workflow_run: { id: 123 },
      },
    ],
  ])('rejects %s expired metadata in verified-actions mode', (_case, artifact) => {
    expect(() =>
      validateActionsArtifactMetadata(artifact, '123', 'aioncore-manual-linux-x64', { verifiedActions: true })
    ).toThrow(/must explicitly report expired=false/);
  });

  it.each([
    [
      'missing',
      {
        id: 456,
        expired: false,
        digest: `sha256:${ARCHIVE_SHA256}`,
      },
    ],
    [
      'null',
      {
        id: 456,
        expired: false,
        digest: `sha256:${ARCHIVE_SHA256}`,
        workflow_run: { id: null },
      },
    ],
    [
      'wrong',
      {
        id: 456,
        expired: false,
        digest: `sha256:${ARCHIVE_SHA256}`,
        workflow_run: { id: 999 },
      },
    ],
  ])('rejects %s workflow run ownership in verified-actions mode', (_case, artifact) => {
    expect(() =>
      validateActionsArtifactMetadata(artifact, '123', 'aioncore-manual-linux-x64', { verifiedActions: true })
    ).toThrow(/must explicitly belong to workflow run 123/);
  });

  it.each([
    [
      'missing',
      {
        id: 456,
        expired: false,
        workflow_run: { id: 123 },
      },
    ],
    [
      'null',
      {
        id: 456,
        expired: false,
        digest: null,
        workflow_run: { id: 123 },
      },
    ],
    [
      'wrong',
      {
        id: 456,
        expired: false,
        digest: `sha512:${ARCHIVE_SHA256}`,
        workflow_run: { id: 123 },
      },
    ],
  ])('rejects %s artifact digest metadata in verified-actions mode', (_case, artifact) => {
    expect(() =>
      validateActionsArtifactMetadata(artifact, '123', 'aioncore-manual-linux-x64', { verifiedActions: true })
    ).toThrow(/must provide a valid sha256 digest/);
  });

  it('keeps missing optional artifact metadata compatible in default mode', () => {
    expect(
      validateActionsArtifactMetadata({ id: 456 }, '123', 'aioncore-manual-linux-x64', {
        verifiedActions: false,
      })
    ).toBeNull();
  });

  posixFakeToolchainIt('verifies artifact content and records provenance without frozen build identity', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-verified-actions-'));
    const fakeBin = createFakeToolchain(tmp);
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;
    process.env.AIONUI_BACKEND_ACTIONS_REPOSITORY = 'CleverC2200/AionCore';

    try {
      const result = downloadAndExtractActionsArtifact('linux', 'x64', '123', { verifiedActions: true });
      expect(result.artifactName).toBe('aioncore-manual-linux-x64');
      expect(result.artifactId).toBe(456);
      expect(result.artifactDigest).toBe(ARCHIVE_SHA256);
      expect(result.artifactZipSha256).toBe(ARCHIVE_SHA256);
      expect(result.archiveSha256).toBe(ARCHIVE_SHA256);
      expect(result.expectedArchiveSha256).toBeNull();
      expect(result.provenance).toMatchObject({
        repository: 'CleverC2200/AionCore',
        runId: '123',
        workflowPath: '.github/workflows/build-manual.yml',
        event: 'workflow_dispatch',
        conclusion: 'success',
        expectedHeadSha: null,
        actualHeadSha: HEAD_SHA,
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  posixFakeToolchainIt('rejects unsuccessful workflow run provenance before artifact use', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-actions-provenance-'));
    const fakeBin = createFakeToolchain(tmp);
    writeExecutable(
      join(fakeBin, 'gh'),
      `#!/usr/bin/env bash
cat <<'JSON'
{"id":123,"path":".github/workflows/build-manual.yml","event":"workflow_dispatch","status":"completed","conclusion":"failure","head_sha":"ace375767d0b2ece67edf4128f09401f1de2ba8f","repository":{"full_name":"CleverC2200/AionCore"}}
JSON
`
    );
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;

    try {
      expect(() => getActionsRunProvenance('123', 'CleverC2200/AionCore')).toThrow(/not a completed success/);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  posixFakeToolchainIt('rejects a workflow run whose head differs from the frozen expected SHA', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-actions-head-'));
    const fakeBin = createFakeToolchain(tmp);
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;
    process.env.AIONUI_BACKEND_ACTIONS_REPOSITORY = 'CleverC2200/AionCore';
    process.env.AIONUI_BACKEND_EXPECTED_HEAD_SHA = 'b'.repeat(40);
    process.env.AIONUI_BACKEND_SHA256 = ARCHIVE_SHA256;

    try {
      expect(() =>
        downloadAndExtractActionsArtifact('linux', 'x64', '123', {
          verifiedActions: true,
        })
      ).toThrow(/head SHA mismatch/);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  posixFakeToolchainIt('rejects a downloaded artifact ZIP that mismatches its required digest', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-actions-digest-'));
    const fakeBin = createFakeToolchain(tmp, { artifactDigest: '0'.repeat(64) });
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;
    process.env.AIONUI_BACKEND_ACTIONS_REPOSITORY = 'CleverC2200/AionCore';
    process.env.AIONUI_BACKEND_EXPECTED_HEAD_SHA = HEAD_SHA;
    process.env.AIONUI_BACKEND_SHA256 = ARCHIVE_SHA256;

    try {
      expect(() =>
        downloadAndExtractActionsArtifact('linux', 'x64', '123', {
          verifiedActions: true,
        })
      ).toThrow(/SHA256 mismatch for artifact aioncore-manual-linux-x64/);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  posixFakeToolchainIt('fails closed when the downloaded archive checksum differs', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-actions-checksum-'));
    const fakeBin = createFakeToolchain(tmp);
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;
    process.env.AIONUI_BACKEND_ACTIONS_REPOSITORY = 'CleverC2200/AionCore';
    process.env.AIONUI_BACKEND_EXPECTED_HEAD_SHA = HEAD_SHA;
    process.env.AIONUI_BACKEND_SHA256 = '0'.repeat(64);

    try {
      expect(() =>
        downloadAndExtractActionsArtifact('linux', 'x64', '123', {
          verifiedActions: true,
        })
      ).toThrow(/SHA256 mismatch for AionCore archive/);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each([
    ['win32', 'x64', 'aioncore-manual-windows-x64'],
    ['win32', 'arm64', 'aioncore-manual-windows-arm64'],
    ['darwin', 'x64', 'aioncore-manual-macos-x64'],
    ['darwin', 'arm64', 'aioncore-manual-macos-arm64'],
    ['linux', 'x64', 'aioncore-manual-linux-x64'],
    ['linux', 'arm64', 'aioncore-manual-linux-arm64'],
  ])('maps %s-%s to %s', (platform, arch, artifactName) => {
    expect(getActionsArtifactName(platform, arch)).toBe(artifactName);
  });

  it('explains which AionCore manual artifact is missing for the requested platform', () => {
    expect(
      getActionsArtifactMissingMessage({
        runId: '27319522909',
        platform: 'win32',
        arch: 'x64',
        expectedArtifactName: 'aioncore-manual-windows-x64',
        availableArtifactNames: ['aioncore-manual-macos-arm64', 'aioncore-manual-linux-x64'],
      })
    ).toBe(
      [
        'AionCore run 27319522909 does not contain artifact [ aioncore-manual-windows-x64 ] required for [ win32-x64 ].',
        'Available artifacts: aioncore-manual-macos-arm64, aioncore-manual-linux-x64.',
        'Re-run AionCore Manual Build with platform [ windows-x64 ] or all.',
      ].join(' ')
    );
  });

  // These cases execute a temporary POSIX shell-script aioncore binary. Windows
  // coverage for contract rejection lives in the verifier/local-bundle tests.
  posixFakeToolchainIt('hard fails Actions artifact input when prepared managed resources lack contract', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-actions-gate-'));
    const fakeBin = createFakeToolchain(tmp);
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;
    process.env.AIONUI_BACKEND_RUN_ID = '123';

    try {
      expect(() =>
        prepareAioncore({
          projectRoot: join(tmp, 'project'),
          platform: 'linux',
          arch: 'x64',
          version: 'v0.1.46',
        })
      ).toThrow(/managed-resources\/manifest\.json/);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  posixFakeToolchainIt('hard fails GitHub release download input when prepared managed resources lack contract', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-download-gate-'));
    const fakeBin = createFakeToolchain(tmp);
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;

    try {
      expect(() =>
        prepareAioncore({
          projectRoot: join(tmp, 'project'),
          platform: 'linux',
          arch: 'x64',
          version: 'v0.1.46',
        })
      ).toThrow(/managed-resources\/manifest\.json/);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  posixFakeToolchainIt('hard fails local binary fallback when prepared managed resources lack contract', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aionui-local-binary-gate-'));
    const localBinary = join(tmp, 'aioncore');
    writeExecutable(localBinary, '#!/usr/bin/env bash\nexit 0\n');
    const fakeBin = createFakeToolchain(tmp, { curlFails: true });
    const previousPath = process.env.PATH;
    process.env.PATH = `${fakeBin}${delimiter}${previousPath || ''}`;
    process.env.AIONUI_BACKEND_LOCAL_BINARY = localBinary;

    try {
      expect(() =>
        prepareAioncore({
          projectRoot: join(tmp, 'project'),
          platform: 'linux',
          arch: 'x64',
          version: 'v0.1.46',
        })
      ).toThrow(/managed-resources\/manifest\.json/);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
