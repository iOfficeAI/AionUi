const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../../../scripts/quality-evidence');

test('unit evidence identity changes with GEA acceptance and other build environment flags', () => {
  const { environmentIdentity } = require('../../../scripts/quality-evidence');
  const baseline = { CI: 'true', AIONUI_GEA_PACKAGED_ACCEPTANCE: '', AIONUI_GEA_VERSION_CODE: '' };
  for (const change of [
    { AIONUI_GEA_PACKAGED_ACCEPTANCE: '1' },
    { AIONUI_GEA_VERSION_CODE: '20260907' },
    { MAIN_VITE_API_URL: 'https://example.test' },
    { NODE_ENV: 'production' },
  ])
    assert.notEqual(environmentIdentity(baseline), environmentIdentity({ ...baseline, ...change }));
  assert.equal(environmentIdentity(baseline), environmentIdentity({ GITHUB_RUN_ID: '42', ...baseline }));
});
const { selectArtifact, missingAssets, validatePackage } = require('../../../scripts/stage-release-draft');
const sha = 'a'.repeat(40),
  tree = 'b'.repeat(40),
  repository = 'owner/repo';
function fixture() {
  const current = { tree, image: 'image-1', os: 'ubuntu', suite: 'vitest-all-v1', node: '22' };
  const run = {
    id: 12,
    run_attempt: 1,
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    head_sha: sha,
    path: '.github/workflows/build-manual.yml',
    event: 'workflow_dispatch',
    status: 'completed',
    conclusion: 'success',
  };
  const artifact = {
    name: 'unit-evidence-ubuntu',
    workflow_run: { id: 12 },
    digest: `sha256:${'c'.repeat(64)}`,
    expired: false,
  };
  const jobs = [
    {
      name: 'Code Quality',
      run_attempt: 1,
      conclusion: 'success',
      steps: [{ name: 'Run unit tests', conclusion: 'success' }],
    },
  ];
  const record = { schema: 1, identity: current, source: { repository, run: 12, attempt: 1, commit: sha } };
  return {
    current,
    record,
    metadata: { repository, run, artifact, jobs, commit: { sha, commit: { tree: { sha: tree } } } },
  };
}
test('full verified suite and equivalent squash tree can reuse', () => {
  const f = fixture();
  assert.equal(validate(f.record, f.current, f.metadata), true);
  // Current identity contains the tree rather than the caller commit, permitting equal-tree squash.
  const current = { ...f.current };
  assert.equal(validate(f.record, current, f.metadata), true);
  f.metadata.run.event = 'pull_request';
  f.metadata.run.head_sha = 'd'.repeat(40);
  f.metadata.run.pull_requests = [{ base: { sha: 'e'.repeat(40) } }];
  f.metadata.commit.parents = [{ sha: 'e'.repeat(40) }, { sha: 'd'.repeat(40) }];
  assert.equal(validate(f.record, current, f.metadata), true);
});
test('changed inputs, missing proof, lightweight or failed tests never reuse', () => {
  const changes = [
    (f) => {
      f.current = { ...f.current, node: '23' };
    },
    (f) => {
      f.current = { ...f.current, suite: 'different' };
    },
    (f) => {
      f.current = { ...f.current, tree: 'f'.repeat(40) };
    },
    (f) => {
      f.metadata.run.conclusion = 'failure';
    },
    (f) => {
      f.metadata.run.head_repository.full_name = 'external/fork';
    },
    (f) => {
      f.metadata.run.path = '.github/workflows/unknown.yml';
    },
    (f) => {
      f.metadata.run.run_attempt = 2;
    },
    (f) => {
      f.metadata.artifact.digest = '';
    },
    (f) => {
      f.metadata.artifact.expired = true;
    },
    (f) => {
      f.metadata.commit.sha = 'd'.repeat(40);
    },
    (f) => {
      f.metadata.jobs[0].steps[0].name = 'Record lightweight platform pass';
    },
    (f) => {
      f.metadata.jobs[0].steps[0].conclusion = 'skipped';
    },
    (f) => {
      f.metadata.jobs = [];
    },
  ];
  for (const change of changes) {
    const f = fixture();
    change(f);
    assert.equal(validate(f.record, f.current, f.metadata), false);
  }
});
function draftFixture() {
  const f = fixture();
  return {
    ...f.metadata,
    sha,
    platform: 'macos-arm64',
    artifacts: [{ ...f.metadata.artifact, name: `macos-build-arm64-${sha.slice(0, 7)}` }],
    jobs: [
      ...f.metadata.jobs,
      {
        name: 'Build macOS',
        run_attempt: 1,
        conclusion: 'success',
        steps: [
          { name: 'Verify desktop asar isolation', conclusion: 'success' },
          { name: 'Build with electron-builder (macOS)', conclusion: 'success' },
        ],
      },
    ],
  };
}
test('draft retains a successful platform from a failed matrix but rejects its failed platform', () => {
  const f = draftFixture();
  f.run.conclusion = 'failure';
  assert.equal(selectArtifact(f).name, f.artifacts[0].name);
  f.jobs[1].conclusion = 'failure';
  assert.throws(() => selectArtifact(f), /gate missing/);
});

test('draft accepts only matching successful source and built commit', () => {
  const initial = draftFixture();
  assert.equal(selectArtifact(initial).name, initial.artifacts[0].name);
  for (const change of [
    (f) => {
      f.jobs[0].conclusion = 'skipped';
    },
    (f) => {
      f.run.head_sha = 'f'.repeat(40);
    },
    (f) => {
      f.artifacts[0].name = 'macos-build-arm64-deadbee';
    },
    (f) => {
      f.artifacts.push(f.artifacts[0]);
    },
    (f) => {
      f.jobs[1].steps[0].conclusion = 'skipped';
    },
    (f) => {
      f.artifacts[0].expired = true;
    },
  ]) {
    const copy = draftFixture();
    change(copy);
    assert.throws(() => selectArtifact(copy));
  }
});
test('partial uploads retry missing files, never replace conflicts or published releases', () => {
  const expected = { 'one.dmg': 'a'.repeat(64), 'two.exe': 'b'.repeat(64) };
  const release = { draft: true, assets: [{ name: 'one.dmg', digest: `sha256:${expected['one.dmg']}` }] };
  assert.deepEqual(missingAssets(release, expected), ['two.exe']);
  assert.throws(() => missingAssets({ ...release, draft: false }, expected));
  assert.throws(() => missingAssets({ ...release, assets: [{ name: 'one.dmg', digest: 'unknown' }] }, expected));
  assert.throws(() => missingAssets({ ...release, assets: [...release.assets, { name: 'extra.zip' }] }, expected));
});

test('package evidence binds attempt, platform and common Core identity', () => {
  const f = draftFixture();
  const record = {
    schema: 1,
    repository,
    run: 12,
    attempt: 1,
    sha,
    platform: f.platform,
    core: { repository: 'owner/core', head: 'a'.repeat(40) },
  };
  assert.deepEqual(validatePackage(record, f), record.core);
  assert.throws(() => validatePackage({ ...record, attempt: 2 }, f));
  assert.throws(() => validatePackage({ ...record, platform: 'macos-x64' }, f));
  assert.throws(() => validatePackage(record, f, { ...record.core, head: 'b'.repeat(40) }));
});

test('package recorder takes Core identity from the verified bundle instead of an optional hint', (t) => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { execFileSync, spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'package-record-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'out'));
  fs.mkdirSync(path.join(root, 'resources/bundled-aioncore/win32-x64'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(
    path.join(root, 'resources/bundled-aioncore/win32-x64/manifest.json'),
    JSON.stringify({
      sourceType: 'actions-artifact',
      source: { repository: 'owner/core', runId: '12', actualHeadSha: sha },
    })
  );
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['add', 'package.json'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'], {
    cwd: root,
  });
  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, '../../../scripts/stage-release-draft.js'), 'record'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CORE_RUN_ID: '12',
        CORE_REPOSITORY: 'owner/core',
        CORE_HEAD_SHA: '',
        BUILD_PLATFORM: 'windows-x64',
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'out/package-evidence.json'))).core, {
    repository: 'owner/core',
    head: sha,
  });
});

// The draft workflow runs on Ubuntu and invokes Unix zip/unzip tools.
test(
  'draft entrypoint uploads both verified installers once and rejects incomplete builds before mutation',
  { skip: process.platform === 'win32' },
  () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const crypto = require('node:crypto');
    const { execFileSync, spawnSync } = require('node:child_process');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-entry-test-'));
    try {
      const fixtures = {};
      for (const [platform, id, suffix] of [
        ['macos-arm64', 12, 'mac-arm64.dmg'],
        ['windows-x64', 13, 'win-x64.exe'],
      ]) {
        const dir = path.join(temp, platform);
        fs.mkdirSync(dir);
        const filename = `GEAUi-1.0.0-test-${suffix}`;
        fs.writeFileSync(path.join(dir, filename), `fixture installer ${platform}`);
        fs.writeFileSync(
          path.join(dir, 'package-evidence.json'),
          JSON.stringify({
            schema: 1,
            repository,
            run: id,
            attempt: 1,
            sha,
            platform,
            core: { repository: 'owner/core', head: sha },
          })
        );
        const zip = path.join(temp, `${id}.zip`);
        execFileSync('zip', ['-q', zip, filename, 'package-evidence.json'], { cwd: dir });
        const sample = draftFixture();
        sample.run.id = id;
        sample.artifacts[0].id = id;
        sample.artifacts[0].workflow_run.id = id;
        sample.artifacts[0].name = `${platform === 'macos-arm64' ? 'macos-build-arm64' : 'windows-build-x64'}-${sha.slice(0, 7)}`;
        sample.artifacts[0].digest = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
        if (platform === 'windows-x64') sample.jobs[1].steps[1].name = 'Build with electron-builder (Windows)';
        fixtures[`repos/${repository}/actions/runs/${id}`] = sample.run;
        fixtures[`repos/${repository}/actions/runs/${id}/attempts/1/jobs?per_page=100`] = { jobs: sample.jobs };
        fixtures[`repos/${repository}/actions/runs/${id}/artifacts?per_page=100`] = { artifacts: sample.artifacts };
      }
      fs.writeFileSync(path.join(temp, 'fixtures.json'), JSON.stringify(fixtures));
      fs.writeFileSync(
        path.join(temp, 'gh'),
        `#!${process.execPath}
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.env.MOCK_ROOT,args=process.argv.slice(2),stateFile=path.join(root,'state.json');
const state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile)):null;
fs.appendFileSync(path.join(root,'calls.jsonl'),JSON.stringify(args)+'\\n');
const endpoint=args.at(-1);
if(args[0]==='api') {
  if(args.includes('POST') && endpoint.endsWith('/releases')) {
    const field=name=>args.find(value=>value.startsWith(name+'=')).slice(name.length+1);
    const created={id:99,tag_name:field('tag_name'),draft:field('draft')==='true',prerelease:field('prerelease')==='true',target_commitish:field('target_commitish'),assets:[]};
    fs.writeFileSync(stateFile,JSON.stringify(created));console.log(JSON.stringify(created));
  }
  else if(endpoint.endsWith('/zip')) process.stdout.write(fs.readFileSync(path.join(root,endpoint.split('/').at(-2)+'.zip')));
  else if(endpoint.includes('/releases?')) console.log(JSON.stringify([state && !process.env.MOCK_STALE_RELEASE_LIST?[state]:[]]));
  else if(endpoint.endsWith('/releases/99')) console.log(JSON.stringify(state));
  else { const f=JSON.parse(fs.readFileSync(path.join(root,'fixtures.json'))); if(!f[endpoint])process.exit(2); console.log(JSON.stringify(f[endpoint])); }
} else if(args[0]==='release' && args[1]==='upload') {
  if(process.env.MOCK_FAIL_UPLOAD===path.basename(args[3]))process.exit(4);
  fs.copyFileSync(args[3],path.join(root,'uploaded-'+path.basename(args[3])));
  state.assets.push({name:path.basename(args[3]),digest:'sha256:'+crypto.createHash('sha256').update(fs.readFileSync(args[3])).digest('hex')});
  fs.writeFileSync(stateFile,JSON.stringify(state));
} else process.exit(3);
`,
        { mode: 0o755 }
      );
      const run = (changes = {}) =>
        spawnSync(process.execPath, [path.resolve(__dirname, '../../../scripts/stage-release-draft.js')], {
          env: {
            ...process.env,
            PATH: `${temp}${path.delimiter}${process.env.PATH}`,
            MOCK_ROOT: temp,
            GITHUB_REPOSITORY: repository,
            RELEASE_SHA: sha,
            RELEASE_TAG: 'v1.0.0-test',
            MAC_RUN_ID: '12',
            WINDOWS_RUN_ID: '13',
            ...changes,
          },
          encoding: 'utf8',
          timeout: 15000,
        });
      let result = run();
      assert.equal(result.status, 0, result.stderr);
      const release = JSON.parse(fs.readFileSync(path.join(temp, 'state.json')));
      assert.equal(release.draft, true);
      assert.equal(release.assets.length, 4);
      assert.ok(release.assets.some((asset) => asset.name === 'latest.yml'));
      const metadata = fs.readFileSync(path.join(temp, 'uploaded-latest.yml'), 'utf8');
      assert.match(metadata, /version: "1.0.0-test"/);
      assert.match(metadata, /url: "GEAUi-1.0.0-test-win-x64.exe"/);
      result = run();
      assert.equal(result.status, 0, result.stderr);
      const calls = fs.readFileSync(path.join(temp, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(calls.filter((args) => args[0] === 'release' && args[1] === 'upload').length, 4);
      fs.unlinkSync(path.join(temp, 'state.json'));
      fs.writeFileSync(path.join(temp, 'calls.jsonl'), '');
      result = run({ MOCK_FAIL_UPLOAD: 'latest.yml' });
      assert.notEqual(result.status, 0);
      assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'state.json'))).assets.length, 2);
      result = run();
      assert.equal(result.status, 0, result.stderr);
      const recoveryCalls = fs.readFileSync(path.join(temp, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(recoveryCalls.filter((args) => args[0] === 'api' && args.includes('POST')).length, 1);
      assert.equal(recoveryCalls.filter((args) => args[1] === 'upload' && /\.(exe|dmg)$/.test(args[3])).length, 2);
      fs.unlinkSync(path.join(temp, 'state.json'));
      result = run({ MOCK_STALE_RELEASE_LIST: '1' });
      assert.equal(
        result.status,
        0,
        'A stale release list after creation must not prevent ID-bound verification: ' + result.stderr
      );
      assert.equal(JSON.parse(fs.readFileSync(path.join(temp, 'state.json'))).assets.length, 4);
      fs.unlinkSync(path.join(temp, 'state.json'));
      fs.writeFileSync(path.join(temp, 'calls.jsonl'), '');
      fixtures[`repos/${repository}/actions/runs/13`].conclusion = 'failure';
      fixtures[`repos/${repository}/actions/runs/13/attempts/1/jobs?per_page=100`].jobs[1].conclusion = 'failure';
      fs.writeFileSync(path.join(temp, 'fixtures.json'), JSON.stringify(fixtures));
      result = run();
      assert.notEqual(result.status, 0);
      assert.equal(fs.existsSync(path.join(temp, 'state.json')), false);
      assert.equal(fs.readFileSync(path.join(temp, 'calls.jsonl'), 'utf8').includes('["release"'), false);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
);
