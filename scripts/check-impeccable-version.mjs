import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const skillRoot = path.join(homedir(), '.agents/skills/impeccable');
const repository = 'https://github.com/pbakaus/impeccable.git';

function parseSkillVersion(source) {
  const match = source.match(/^version:\s*([^\s]+)\s*$/m);
  if (!match) throw new Error('SKILL.md 缺少 version 字段');
  return match[1];
}

function compareSemver(left, right) {
  const a = left.replace(/^v/, '').split('.').map(Number);
  const b = right.replace(/^v/, '').split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} 执行失败：${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function runOptional(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const skillSource = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
const installedVersion = parseSkillVersion(skillSource);
console.log(`Impeccable Skill ${installedVersion}`);
console.log(`来源 ${repository}`);
console.log('未锁定发布标签或内容摘要。');

if (process.argv.includes('--remote')) {
  const refs = run('git', ['ls-remote', '--tags', repository, 'refs/tags/skill-v*']);
  const rows = refs.split('\n').map((line) => {
    const [commit, ref] = line.split(/\s+/);
    return { commit, ref };
  });
  const versions = rows
    .map(({ ref }) => ref.match(/refs\/tags\/skill-v(\d+\.\d+\.\d+)(?:\^\{\})?$/)?.[1])
    .filter(Boolean)
    .sort(compareSemver);
  const latestSkill = versions.at(-1);
  const latestCli = JSON.parse(run('npm', ['view', 'impeccable', 'version', '--json']));
  const installedCli = runOptional('impeccable', ['--version']);

  console.log(`远端稳定 Skill：${latestSkill ?? '未发现'}`);
  console.log(`本机 CLI：${installedCli ?? '未安装'}；npm 稳定 CLI：${latestCli}`);

  if (latestSkill && compareSemver(latestSkill, installedVersion) > 0) {
    console.log(`发现新的稳定 Skill ${latestSkill}，请按 docs/agents/impeccable.md 审核后更新。`);
  } else {
    console.log('Skill 已是最新稳定版本。');
  }
  if (installedCli && compareSemver(latestCli, installedCli) > 0) {
    console.log(`发现新的稳定 CLI ${latestCli}，CLI 与个人全局 Skill 需要分别审核升级。`);
  } else if (!installedCli) {
    console.log('个人全局 Skill 可独立使用；需要 CLI 命令时再安装稳定版 CLI。');
  }
}
