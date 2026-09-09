#!/usr/bin/env node
const { parseArgs } = require('node:util');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { source, coreTarget, command, writeJson, acquire, worktree, stateDirectory } = require('./local-build-state');
const { audit, clean } = require('./local-build-audit');
const { inputHash, sha256 } = require('../packages/shared-scripts/src/build-cache');

function plan(mode, options = {}) {
  const builder = (name, flags) => ({
    name,
    command: process.execPath,
    args: ['scripts/build-with-builder.js', process.arch, ...flags],
  });
  switch (mode) {
    case 'dev':
      return [{ name: 'dev', command: 'bun', args: ['run', 'start'] }];
    case 'focused':
      if (!options.crate || !/^[a-zA-Z0-9_-]+$/.test(options.crate))
        throw new Error('focused requires --crate <package>');
      return [
        {
          name: 'focused',
          command: 'cargo',
          core: true,
          args: ['test', '--locked', '-p', options.crate, ...(options.test ? ['--test', options.test] : ['--lib'])],
        },
      ];
    case 'wire':
      return [
        {
          name: 'mcp-build',
          command: process.execPath,
          args: ['scripts/build-mcp-servers.js', ...(options.force ? ['--force'] : [])],
        },
        { name: 'wire', command: process.execPath, args: ['scripts/local-mcp-wire.mjs'] },
      ];
    case 'full':
      return [{ name: 'full', command: 'just', args: ['gate'] }];
    case 'build':
      return [builder('build', ['--pack-only', ...(options.force ? ['--force'] : [])])];
    case 'package':
      if (options.force) throw new Error('Use build --force before package; package never compiles');
      if (!['darwin', 'win32'].includes(process.platform))
        throw new Error('Local installers support macOS and Windows');
      return [
        builder('package', [
          '--package-only',
          ...(process.platform === 'darwin' ? ['--mac', 'dmg'] : ['--win', 'nsis']),
        ]),
      ];
    case 'release':
      return [...plan('full', options), ...plan('build', options), ...plan('package')];
    default:
      throw new Error(`Unknown mode: ${mode}`);
  }
}

function tool(cwd, name, args = ['--version']) {
  try {
    return command(cwd, name, args);
  } catch {
    return 'unknown';
  }
}
function run(stage, cwd, env, logPath) {
  return new Promise((resolve, reject) => {
    const log = fs.createWriteStream(logPath);
    const child = spawn(stage.command, stage.args, { cwd, env, stdio: ['inherit', 'pipe', 'pipe'] });
    const forward = (signal) => child.kill(signal);
    const interrupt = () => forward('SIGINT');
    const terminate = () => forward('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    for (const [stream, output] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      stream.on('data', (data) => {
        log.write(data);
        output.write(data);
      });
    }
    child.once('error', reject);
    child.once('close', (code, signal) => {
      log.end();
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
      resolve({ code, signal });
    });
  });
}
async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      core: { type: 'string' },
      crate: { type: 'string' },
      test: { type: 'string' },
      force: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      compare: { type: 'string' },
      target: { type: 'string' },
      execute: { type: 'boolean' },
    },
  });
  if (positionals.length !== 1)
    throw new Error(
      'Usage: bun run local <dev|focused|wire|full|build|package|release|audit|clean> [--core PATH --crate NAME --test NAME] [--force] [--dry-run]'
    );
  const mode = positionals[0];
  const root = worktree(path.resolve(__dirname, '..'));
  const core = values.core ? worktree(path.resolve(values.core)) : undefined;
  const directory = path.join(root, '.workspace/local-build');
  if (mode === 'clean') {
    if (!values.target) throw new Error('clean requires --target <exact audited path>; defaults to dry-run');
    console.log(JSON.stringify(clean(root, core, values.target, !!values.execute && !values['dry-run']), null, 2));
    return;
  }
  if (mode === 'audit') {
    const previous = values.compare ? JSON.parse(fs.readFileSync(values.compare, 'utf8')) : undefined;
    const report = audit(root, core, previous);
    const destination = path.join(directory, `audit-${Date.now()}.json`);
    writeJson(destination, report);
    console.log(JSON.stringify({ ...report, reportPath: destination }, null, 2));
    return;
  }
  const stages = plan(mode, values);
  if (stages.some((stage) => stage.core) && !core) throw new Error('focused requires --core <worktree root>');
  if (values.force && !['focused', 'wire', 'build', 'release'].includes(mode))
    throw new Error('--force is only supported for focused, wire, build or release');
  console.log(JSON.stringify({ mode, stages, subsequentStages: 'only those listed' }, null, 2));
  if (values['dry-run']) return;
  const release = acquire(root);
  let releaseCore;
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const runDir = path.join(directory, id);
  fs.mkdirSync(runDir, { recursive: true });
  const report = {
    schema: 1,
    id,
    mode,
    evidenceSource: 'local-current-source',
    platform: process.platform,
    arch: process.arch,
    startedAt: new Date().toISOString(),
    status: 'failed',
    force: !!values.force,
    coverage: stages.map((stage) => stage.name),
    stages: [],
    artifacts: [],
    ciEvidenceReused: false,
    logs: runDir,
  };
  const eventPath = path.join(runDir, 'events.jsonl');
  fs.writeFileSync(eventPath, '');
  try {
    if (stages.some((stage) => stage.core)) releaseCore = acquire(core);
    report.source = source(root);
    report.core = core
      ? {
          ...source(core),
          target: coreTarget(core),
          role: 'focused source; packaged Core identity is recorded separately',
        }
      : null;
    report.tools = {
      node: process.version,
      bun: tool(root, 'bun'),
      cargo: core ? tool(core, 'cargo') : 'not-used',
      rustc: core ? tool(core, 'rustc') : 'not-used',
    };
    report.before = audit(root, core);
    if (values.force && mode === 'focused') {
      // A new namespace forces recompilation without deleting caches that another
      // Cargo process could hold. It remains under this worktree's target.
      report.core.target = path.join(coreTarget(core), 'local-force', id);
    }
    for (const stage of stages) {
      const started = performance.now();
      const cwd = stage.core ? core : root;
      const env = { ...process.env };
      // Full tests spawn synthetic builders; their cache records are test data,
      // not evidence of this worktree's compiled outputs.
      if (['build', 'package', 'mcp-build'].includes(stage.name)) env.BUILD_STAGE_REPORT = eventPath;
      else delete env.BUILD_STAGE_REPORT;
      if (['build', 'package'].includes(stage.name)) env.LOCAL_BUILD_WORKFLOW = '1';
      if (stage.core) {
        stage.args = [...stage.args, '--target-dir', report.core.target, '--message-format=json'];
        env.CARGO_TARGET_DIR = report.core.target;
      }
      const logPath = path.join(runDir, `${stage.name}.log`);
      const result = await run(stage, cwd, env, logPath);
      const record = {
        ...stage,
        cwd,
        ...result,
        elapsedMs: Math.round(performance.now() - started),
        logPath,
        status: result.code === 0 ? 'ok' : 'failed',
      };
      if (stage.core) {
        const messages = fs
          .readFileSync(logPath, 'utf8')
          .split('\n')
          .flatMap((line) => {
            try {
              return [JSON.parse(line)];
            } catch {
              return [];
            }
          });
        const artifacts = messages.filter((message) => message.reason === 'compiler-artifact');
        record.cache = {
          source: 'cargo compiler-artifact fresh flag',
          fresh: artifacts.filter((item) => item.fresh).length,
          compiled: artifacts.filter((item) => !item.fresh).length,
          forced: !!values.force,
        };
      }
      report.stages.push(record);
      if (result.code !== 0)
        throw new Error(
          `${stage.name} failed; fix it and retry. Unfinished stages: ${
            stages
              .slice(report.stages.length)
              .map((item) => item.name)
              .join(', ') || 'none'
          }`
        );
    }
    const finalSource = source(root);
    report.inputsUnchanged =
      finalSource.inputHash === report.source.inputHash && finalSource.commit === report.source.commit;
    if (core) report.inputsUnchanged &&= source(core).inputHash === report.core.inputHash;
    if (!report.inputsUnchanged)
      throw new Error(
        'Source changed during the run; receipt cannot validate the current input set. Retry the affected stage.'
      );
    if (mode === 'focused' && !values.force) {
      const target = path.join(report.core.target, 'debug');
      writeJson(path.join(stateDirectory(core), 'cargo-output.json'), {
        target,
        outputHash: inputHash(core, [path.relative(core, target)]),
        source: report.core.inputHash,
        buildId: id,
      });
    }
    report.status = 'ok';
  } catch (error) {
    report.error = error.message;
    throw error;
  } finally {
    try {
      report.finishedAt = new Date().toISOString();
      report.events = fs
        .readFileSync(eventPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      report.after = audit(root, core, report.before);
      if (report.status === 'ok' && ['build', 'package', 'release'].includes(mode)) {
        report.outputHash = inputHash(root, ['out/main', 'out/preload', 'out/renderer']);
        const manifest = path.join(
          root,
          `resources/bundled-aioncore/${process.platform}-${process.arch}/manifest.json`
        );
        if (mode !== 'build' && fs.existsSync(manifest))
          report.packagedCore = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        for (const name of fs.readdirSync(path.join(root, 'out'))) {
          const file = path.join(root, 'out', name);
          if (
            mode !== 'build' &&
            /\.(dmg|exe)$/.test(name) &&
            fs.statSync(file).mtimeMs >= Date.parse(report.startedAt)
          ) {
            report.artifacts.push({ path: file, sha256: sha256(file), bytes: fs.statSync(file).size });
          }
        }
      }
      if (report.status === 'ok' && ['package', 'release'].includes(mode) && report.artifacts.length === 0) {
        report.status = 'failed';
        report.error = 'No installer produced by this run; no deliverable receipt can be claimed';
        process.exitCode = 1;
      }
      const file = path.join(runDir, 'manifest.json');
      writeJson(file, report);
      for (const artifact of report.artifacts) writeJson(`${artifact.path}.build.json`, report);
      console.log(`[local-build] ${report.status}; manifest=${file}`);
    } finally {
      releaseCore?.();
      release();
    }
  }
}
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
module.exports = { plan, main };
