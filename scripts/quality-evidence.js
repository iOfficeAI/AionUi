// Reuse only a completed full Linux unit suite, never the broader quality gate.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ARTIFACT = 'unit-evidence-ubuntu';
const WORKFLOWS = new Set([
  '.github/workflows/pr-checks.yml',
  '.github/workflows/build-manual.yml',
  '.github/workflows/build-and-release.yml',
]);
function command(executable, args, timeout = 30000) {
  return execFileSync(executable, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout }).trim();
}
function environmentIdentity(env = process.env) {
  const fixed = ['CI', 'NODE_OPTIONS', 'NODE_ENV', 'TZ', 'LANG', 'BUN_INSTALL_REGISTRY'];
  const names = new Set([
    ...fixed,
    ...Object.keys(env).filter((name) => /^(AIONUI_|VITE_|MAIN_VITE_|PRELOAD_VITE_|RENDERER_VITE_|SENTRY_)/.test(name)),
  ]);
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([...names].sort().map((name) => [name, env[name] || ''])))
    .digest('hex');
}
function identity() {
  if (command('git', ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('dirty-checkout');
  if (process.platform !== 'linux' || process.env.CI !== 'true') throw new Error('unsupported-environment');
  return {
    schema: 1,
    tree: command('git', ['rev-parse', 'HEAD^{tree}']),
    suite: 'vitest-all-v1',
    node: process.version,
    bun: command('bun', ['--version']),
    arch: process.arch,
    image: process.env.ImageVersion || '',
    os: process.env.ImageOS || '',
    environment: environmentIdentity(),
  };
}
function validate(record, current, { repository, run, artifact, jobs, commit }) {
  if (record?.schema !== 1 || JSON.stringify(record.identity) !== JSON.stringify(current)) return false;
  if (!current.image || !current.os || !/^[a-f0-9]{40}$/.test(current.tree)) return false;
  if (run?.repository?.full_name !== repository || run?.head_repository?.full_name !== repository) return false;
  if (run.status !== 'completed' || run.conclusion !== 'success' || !WORKFLOWS.has(run.path?.split('@')[0]))
    return false;
  if (!['pull_request', 'workflow_dispatch', 'push'].includes(run.event)) return false;
  if (
    record.source?.repository !== repository ||
    String(record.source.run) !== String(run.id) ||
    Number(record.source.attempt) !== run.run_attempt
  )
    return false;
  if (
    artifact?.name !== ARTIFACT ||
    artifact.expired ||
    artifact.workflow_run?.id !== run.id ||
    !/^sha256:[a-f0-9]{64}$/.test(artifact.digest || '')
  )
    return false;
  if (commit?.sha !== record.source.commit || commit.commit?.tree?.sha !== current.tree) return false;
  const checkoutBound =
    commit.sha === run.head_sha ||
    (run.event === 'pull_request' &&
      commit.parents?.length === 2 &&
      commit.parents[1].sha === run.head_sha &&
      run.pull_requests?.some((pr) => pr.base.sha === commit.parents[0].sha));
  if (!checkoutBound) return false;
  const matchingJob = jobs.find(
    (job) =>
      job.run_attempt === run.run_attempt &&
      job.conclusion === 'success' &&
      (job.name === 'Unit Tests (ubuntu-latest)' || /(^|\/ )Code Quality$/.test(job.name)) &&
      job.steps?.some(
        (step) => ['Run unit tests', 'Run extension system tests'].includes(step.name) && step.conclusion === 'success'
      )
  );
  return !!matchingJob;
}
function api(endpoint) {
  return JSON.parse(command('gh', ['api', endpoint], 5000));
}
function readRecord(repository, artifact) {
  if (artifact.size_in_bytes > 1024 * 1024) throw new Error('oversized-evidence');
  const zip = execFileSync('gh', ['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`], {
    timeout: 5000,
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (`sha256:${crypto.createHash('sha256').update(zip).digest('hex')}` !== artifact.digest)
    throw new Error('evidence-digest-mismatch');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-evidence-'));
  try {
    const archive = path.join(temp, 'record.zip');
    fs.writeFileSync(archive, zip);
    return JSON.parse(command('unzip', ['-p', archive, 'unit-evidence.json']));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
function probe() {
  let reused = false;
  let source = '';
  try {
    const repository = process.env.GITHUB_REPOSITORY;
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('repository-unavailable');
    const current = identity();
    const runs = api(`repos/${repository}/actions/runs?status=success&per_page=10`).workflow_runs;
    const deadline = Date.now() + 30000;
    for (const candidate of runs.slice(0, 5)) {
      if (Date.now() > deadline) break;
      if (!WORKFLOWS.has(candidate.path?.split('@')[0]) || String(candidate.id) === process.env.GITHUB_RUN_ID) continue;
      try {
        const run = api(`repos/${repository}/actions/runs/${candidate.id}`);
        const artifacts = api(
          `repos/${repository}/actions/runs/${candidate.id}/artifacts?per_page=100`
        ).artifacts.filter((a) => a.name === ARTIFACT && !a.expired);
        if (artifacts.length !== 1) continue;
        const artifact = artifacts[0];
        const record = readRecord(repository, artifact);
        if (!/^[a-f0-9]{40}$/.test(record.source?.commit || '')) continue;
        const commit = api(`repos/${repository}/commits/${record.source.commit}`);
        const jobs = api(
          `repos/${repository}/actions/runs/${candidate.id}/attempts/${run.run_attempt}/jobs?per_page=100`
        ).jobs;
        if (!validate(record, current, { repository, run, artifact, jobs, commit })) continue;
        reused = true;
        source = String(run.id);
        break;
      } catch {
        /* Missing, expired or unverifiable evidence runs the normal suite. */
      }
    }
  } catch {
    /* Evidence is an optimization, never permission to omit a test. */
  }
  console.log(
    `[unit-evidence] ${reused ? 'verified reuse' : 'miss; run full suite'}${source ? ` from run ${source}` : ''}`
  );
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `reused=${reused}\n`);
}
function writeRecord(destination) {
  const payload = {
    schema: 1,
    identity: identity(),
    source: {
      repository: process.env.GITHUB_REPOSITORY,
      run: process.env.GITHUB_RUN_ID,
      attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      commit: command('git', ['rev-parse', 'HEAD']),
    },
  };
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(payload));
}
if (require.main === module) {
  if (process.argv[2] === 'probe') probe();
  else if (process.argv[2] === 'record') writeRecord(process.argv[3]);
  else throw new Error('Expected probe or record <destination>');
}
module.exports = { validate, identity, environmentIdentity };
