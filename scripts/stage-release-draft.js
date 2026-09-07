// Stage verified installers in a draft. Publishing and real-device acceptance remain separate.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function gh(args, binary = false) {
  return execFileSync('gh', args, {
    encoding: binary ? undefined : 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    timeout: 300000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const api = (endpoint) => JSON.parse(gh(['api', endpoint]));
function selectArtifact({ run, jobs, artifacts, repository, sha, platform }) {
  if (
    !/^[a-f0-9]{40}$/.test(sha) ||
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    run.head_sha !== sha ||
    run.path !== '.github/workflows/build-manual.yml' ||
    run.event !== 'workflow_dispatch' ||
    run.status !== 'completed' ||
    !['success', 'failure'].includes(run.conclusion)
  )
    throw new Error('Untrusted or incomplete build run');
  const quality = jobs.some(
    (j) => /(^|\/ )Code Quality$/.test(j.name) && j.run_attempt === run.run_attempt && j.conclusion === 'success'
  );
  const build = jobs.some(
    (j) =>
      j.run_attempt === run.run_attempt &&
      j.conclusion === 'success' &&
      j.steps?.some((s) => s.name === 'Verify desktop asar isolation' && s.conclusion === 'success') &&
      j.steps?.some(
        (s) =>
          s.name === `Build with electron-builder (${platform === 'macos-arm64' ? 'macOS' : 'Windows'})` &&
          s.conclusion === 'success'
      )
  );
  if (!quality || !build) throw new Error('Required quality or packaging gate missing');
  const prefix = { 'macos-arm64': 'macos-build-arm64-', 'windows-x64': 'windows-build-x64-' }[platform];
  if (!prefix) throw new Error('Unsupported installer platform');
  const selected = artifacts.filter(
    (a) =>
      a.name.startsWith(prefix) &&
      /^[a-f0-9]{7,40}$/.test(a.name.slice(prefix.length)) &&
      sha.startsWith(a.name.slice(prefix.length)) &&
      a.workflow_run?.id === run.id &&
      !a.expired &&
      /^sha256:[a-f0-9]{64}$/.test(a.digest || '')
  );
  if (selected.length !== 1) throw new Error('Installer artifact identity is missing or ambiguous');
  return selected[0];
}
function recordPackage() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  let core = { repository: pkg.aioncoreRepository, release: pkg.aioncoreVersion };
  if (process.env.CORE_RUN_ID) {
    const runtime = process.env.BUILD_PLATFORM?.replace(/^macos-/, 'darwin-').replace(/^windows-/, 'win32-');
    if (!/^(darwin|win32|linux)-(x64|arm64)$/.test(runtime || '')) throw new Error('Unsupported bundle platform');
    const bundle = JSON.parse(fs.readFileSync(`resources/bundled-aioncore/${runtime}/manifest.json`, 'utf8'));
    const source = bundle.source;
    if (
      bundle.sourceType !== 'actions-artifact' ||
      source?.repository !== process.env.CORE_REPOSITORY ||
      String(source?.runId) !== process.env.CORE_RUN_ID ||
      !/^[a-f0-9]{40}$/.test(source?.actualHeadSha || '') ||
      (process.env.CORE_HEAD_SHA && source.actualHeadSha !== process.env.CORE_HEAD_SHA)
    )
      throw new Error('Prepared Core bundle does not match the requested source');
    core = { repository: source.repository, head: source.actualHeadSha };
  }
  fs.writeFileSync(
    'out/package-evidence.json',
    JSON.stringify({
      schema: 1,
      repository: process.env.GITHUB_REPOSITORY,
      run: Number(process.env.GITHUB_RUN_ID),
      attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      sha,
      platform: process.env.BUILD_PLATFORM,
      core,
    })
  );
}
function validatePackage(record, { repository, run, sha, platform }, previousCore) {
  if (
    record.schema !== 1 ||
    record.repository !== repository ||
    record.run !== run.id ||
    record.attempt !== run.run_attempt ||
    record.sha !== sha ||
    record.platform !== platform
  )
    throw new Error('Package provenance mismatch');
  if (!record.core?.repository || (!record.core.release && !/^[a-f0-9]{40}$/.test(record.core.head || '')))
    throw new Error('Core identity missing');
  if (previousCore && JSON.stringify(previousCore) !== JSON.stringify(record.core))
    throw new Error('Platform Core identities differ');
  return record.core;
}
function missingAssets(release, expected) {
  if (!release.draft) throw new Error('Refusing to modify a published release');
  const missing = [];
  for (const [name, hash] of Object.entries(expected)) {
    const matches = release.assets.filter((a) => a.name === name);
    if (matches.length > 1 || (matches.length && matches[0].digest !== `sha256:${hash}`))
      throw new Error(`Existing asset identity conflict: ${name}`);
    if (!matches.length) missing.push(name);
  }
  if (release.assets.some((a) => !(a.name in expected)))
    throw new Error('Unexpected assets already exist in this draft');
  return missing;
}
function stage() {
  const repository = process.env.GITHUB_REPOSITORY;
  const sha = process.env.RELEASE_SHA;
  const tag = process.env.RELEASE_TAG;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository || '') ||
    !/^v\d+\.\d+\.\d+-[\w.-]+$/.test(tag || '') ||
    !/^[a-f0-9]{40}$/.test(sha || '')
  )
    throw new Error('Expected repository, exact SHA and prerelease tag');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-draft-'));
  try {
    const hashes = {};
    let core;
    for (const [platform, runId, suffix] of [
      ['macos-arm64', process.env.MAC_RUN_ID, 'mac-arm64.dmg'],
      ['windows-x64', process.env.WINDOWS_RUN_ID, 'win-x64.exe'],
    ]) {
      if (!/^\d+$/.test(runId || '')) throw new Error('Both source run IDs are required');
      const run = api(`repos/${repository}/actions/runs/${runId}`);
      const jobs = api(`repos/${repository}/actions/runs/${runId}/attempts/${run.run_attempt}/jobs?per_page=100`).jobs;
      const artifacts = api(`repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`).artifacts;
      const artifact = selectArtifact({ run, jobs, artifacts, repository, sha, platform });
      const bytes = gh(['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`], true);
      if (`sha256:${digest(bytes)}` !== artifact.digest) throw new Error('Downloaded artifact checksum mismatch');
      const archive = path.join(temp, `${platform}.zip`);
      fs.writeFileSync(archive, bytes);
      const members = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
      const filename = `GEAUi-${tag.slice(1)}-${suffix}`;
      if (members.filter((name) => name === filename).length !== 1)
        throw new Error(`Expected versioned installer missing: ${filename}`);
      if (members.filter((name) => name === 'package-evidence.json').length !== 1)
        throw new Error('Package evidence missing or ambiguous');
      const record = JSON.parse(
        execFileSync('unzip', ['-p', archive, 'package-evidence.json'], { encoding: 'utf8', maxBuffer: 65536 })
      );
      core = validatePackage(record, { repository, run, sha, platform }, core);
      const output = path.join(temp, filename);
      const fd = fs.openSync(output, 'wx');
      try {
        execFileSync('unzip', ['-p', archive, filename], { stdio: ['ignore', fd, 'pipe'], timeout: 120000 });
      } finally {
        fs.closeSync(fd);
      }
      if (!fs.statSync(output).size) throw new Error('Empty installer');
      hashes[filename] = digest(fs.readFileSync(output));
      if (platform === 'windows-x64') {
        // Derive metadata from the verified installer, never an unbound latest.yml.
        const hash = crypto.createHash('sha512').update(fs.readFileSync(output)).digest('base64');
        const metadata = [
          `version: ${JSON.stringify(tag.slice(1))}`,
          'files:',
          `  - url: ${JSON.stringify(filename)}`,
          `    sha512: ${hash}`,
          `    size: ${fs.statSync(output).size}`,
          `path: ${JSON.stringify(filename)}`,
          `sha512: ${hash}`,
          '',
        ].join('\n');
        fs.writeFileSync(path.join(temp, 'latest.yml'), metadata);
        hashes['latest.yml'] = digest(metadata);
      }
    }
    const sums = Object.entries(hashes)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([name, hash]) => `${hash}  ${name}\n`)
      .join('');
    fs.writeFileSync(path.join(temp, 'SHA256SUMS.txt'), sums);
    hashes['SHA256SUMS.txt'] = digest(sums);
    // A read error must not be interpreted as absence or authorize overwriting.
    const releases = JSON.parse(
      gh(['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`])
    ).flat();
    let release = releases.find((r) => r.tag_name === tag);
    if (!release) {
      // Release listings can lag behind a successful creation. Bind readback to
      // the creation response ID, never create again because a list is stale.
      const created = JSON.parse(
        gh([
          'api',
          '--method',
          'POST',
          '-f',
          `tag_name=${tag}`,
          '-f',
          `target_commitish=${sha}`,
          '-F',
          'draft=true',
          '-F',
          'prerelease=true',
          '-f',
          'make_latest=false',
          '-f',
          `name=${tag}`,
          '-f',
          'body=Verified CI installers. Draft only: real macOS and Windows acceptance is still required before publication.',
          `repos/${repository}/releases`,
        ])
      );
      if (!Number.isSafeInteger(created.id) || created.id <= 0 || created.tag_name !== tag)
        throw new Error('Created draft identity cannot be verified; inspect before retrying');
      release = api(`repos/${repository}/releases/${created.id}`);
      if (release.id !== created.id || release.tag_name !== tag)
        throw new Error('Created draft readback identity mismatch');
    }
    if (!release.prerelease || release.target_commitish !== sha)
      throw new Error('Draft release target or channel mismatch');
    for (const name of missingAssets(release, hashes))
      gh(['release', 'upload', tag, path.join(temp, name), '--repo', repository]);
    const final = api(`repos/${repository}/releases/${release.id}`);
    if (missingAssets(final, hashes).length) throw new Error('Release upload is incomplete');
    console.log(`Verified draft ${tag}: two installers, Windows update metadata and SHA256SUMS.txt; not published`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
if (require.main === module) {
  if (process.argv[2] === 'record') recordPackage();
  else stage();
}
module.exports = { selectArtifact, missingAssets, validatePackage };
