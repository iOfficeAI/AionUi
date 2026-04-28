import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const skillPath = path.join(process.cwd(), 'src/process/resources/skills/officecli-docx/SKILL.md');

function readFirstLines(count: number): string {
  return fs.readFileSync(skillPath, 'utf8').split(/\r?\n/).slice(0, count).join('\n');
}

describe('officecli-docx skill', () => {
  it('front-loads the managed Windows runtime override', () => {
    const first100 = readFirstLines(100);

    expect(first100).toContain('## AionUI Windows Runtime Override');
    expect(first100).toContain('C:\\Users\\Craig\\AppData\\Roaming\\AionUi\\tools\\officecli.cmd');
    expect(first100).toContain('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command');
    expect(first100).toContain('Do not use Bash');
    expect(first100).toContain('Do not use bare `officecli` as the primary path');
    expect(first100).toContain('Do not install or update OfficeCLI during governed AionUI runs');
    expect(first100).toContain('return blocked');
  });

  it('keeps generic install guidance out of the first 100 lines', () => {
    const first100 = readFirstLines(100);

    expect(first100).not.toContain('curl -fsSL');
    expect(first100).not.toContain('| bash');
    expect(first100).not.toContain('macOS / Linux');
    expect(first100).not.toContain('officecli --version');
  });

  it('demotes generic install guidance below the managed runtime override', () => {
    const text = fs.readFileSync(skillPath, 'utf8');

    expect(text).toContain('## Generic OfficeCLI Install Reference - Not For Managed AionUI Runtime');
  });
});
