// Build evidence only. File inventory is not target-system runtime acceptance.
const fs = require('node:fs');
const path = require('node:path');
const { inventory } = require('../packaging-audit');
const { sha256 } = require('../../packages/shared-scripts/src/build-cache');

function logicalSize(file) {
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink()) return 0;
  if (stat.isFile()) return stat.size;
  return fs.readdirSync(file).reduce((sum, name) => sum + logicalSize(path.join(file, name)), 0);
}

function buildReport({ root = process.cwd(), platform, stageFile, env = process.env }) {
  const out = path.join(root, 'out');
  const files = fs.existsSync(out) ? fs.readdirSync(out) : [];
  const installers = files
    .filter((name) => /^GEAUi-.*\.(dmg|exe)$/.test(name))
    .map((name) => ({
      name,
      bytes: fs.statSync(path.join(out, name)).size,
      sha256: sha256(path.join(out, name)),
    }));
  const candidates = platform?.startsWith('windows')
    ? ['win-unpacked', 'win-x64-unpacked', 'win-arm64-unpacked']
    : ['mac-arm64', 'mac', 'mac-x64'];
  const unpacked = candidates.map((name) => path.join(out, name)).find((dir) => fs.existsSync(dir));
  let resources;
  if (unpacked) {
    if (platform?.startsWith('windows')) resources = path.join(unpacked, 'resources');
    else {
      const app = fs.readdirSync(unpacked).find((name) => name.endsWith('.app'));
      if (app) resources = path.join(unpacked, app, 'Contents/Resources');
    }
  }
  let content;
  if (resources && fs.existsSync(path.join(resources, 'app.asar'))) {
    content = inventory(path.join(resources, 'app.asar'), resources);
    content.archive = path.relative(out, content.archive).replace(/\\/g, '/');
  }
  return {
    schema: 1,
    repository: env.GITHUB_REPOSITORY,
    run: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
    platform,
    node: process.version,
    image: env.ImageVersion,
    runnerOS: env.ImageOS,
    caches: {
      dependencies: env.BUN_CACHE_HIT || 'miss',
      electron: env.ELECTRON_CACHE_HIT || 'miss',
      resources: env.RESOURCE_CACHE_HIT || 'miss',
      compilationArchive: env.COMPILATION_CACHE_HIT || 'miss',
    },
    stages:
      stageFile && fs.existsSync(stageFile)
        ? fs.readFileSync(stageFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
        : [],
    installers,
    installedLogicalBytes: unpacked ? logicalSize(unpacked) : null,
    inventory: content,
    runtimeAcceptance: 'not-run',
    interpretation:
      'Cache archive restoration is not compilation reuse. Job restore/save durations are available in Actions steps. Installed bytes are logical unpacked bytes, not allocated disk usage.',
  };
}

if (require.main === module) {
  const report = buildReport({ platform: process.env.BUILD_PLATFORM, stageFile: process.env.BUILD_STAGE_REPORT });
  fs.mkdirSync('out', { recursive: true });
  fs.writeFileSync('out/cloud-build-report.json', JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `\n## ${report.platform} build evidence`,
        ...report.installers.map((item) => `- ${item.name}: ${item.bytes} bytes; SHA256 ${item.sha256}`),
        `- Installed logical bytes: ${report.installedLogicalBytes ?? 'unavailable'}`,
        ...report.stages.map((item) => `- ${item.stage}: ${item.elapsedMs} ms (${item.status})`),
        '- Runtime acceptance is recorded separately from this inventory.',
        '',
      ].join('\n')
    );
  }
}

module.exports = { buildReport, logicalSize };
