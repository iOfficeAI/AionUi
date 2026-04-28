import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const wordCreatorRulesPath = path.join(process.cwd(), 'src/process/resources/assistant/word-creator/word-creator.md');

function readRules(): string {
  return fs.readFileSync(wordCreatorRulesPath, 'utf8');
}

describe('Word Creator bundled rules', () => {
  it('front-loads Windows DOCX tool path guardrails', () => {
    const text = readRules();

    expect(text).toContain('## Windows DOCX Tool Path Rules');
    expect(text).toContain('Do not use Bash for Windows paths such as `C:\\...`');
    expect(text).toContain('powershell.exe -NoProfile -ExecutionPolicy Bypass -Command');
    expect(text).toContain('%APPDATA%\\AionUi\\tools\\officecli.cmd');
    expect(text).toContain('If Team Mode exposes only Linux Bash for this task');
    expect(text).toContain('BLOCKED: Windows Word production tool path unavailable.');
  });
});
