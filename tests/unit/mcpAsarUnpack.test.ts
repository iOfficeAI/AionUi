import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

/**
 * Extract outfile basenames from build-mcp-servers.js.
 * Matches patterns like: outfile: path.join(ROOT, 'out/main/xxx.js')
 */
function getBuildOutputFiles(): string[] {
  const script = fs.readFileSync(path.join(ROOT, 'scripts/build-mcp-servers.js'), 'utf-8');
  const matches = [...script.matchAll(/outfile:\s*path\.join\(ROOT,\s*'([^']+)'\)/g)];
  return matches.map((m) => m[1]);
}

/**
 * Extract asarUnpack entries from electron-builder.yml that match out/main/*.js
 */
function getAsarUnpackEntries(): string[] {
  const yml = fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf-8');
  const matches = [...yml.matchAll(/-\s*'(out\/main\/[^']+\.js)'/g)];
  return matches.map((m) => m[1]);
}

describe('MCP asar unpack consistency', () => {
  it('every MCP build output must be listed in electron-builder.yml asarUnpack', () => {
    const buildOutputs = getBuildOutputFiles();
    const asarEntries = getAsarUnpackEntries();

    expect(buildOutputs.length).toBeGreaterThan(0);

    const missing = buildOutputs.filter((f) => !asarEntries.includes(f));
    if (missing.length > 0) {
      throw new Error(
        `MCP scripts built but NOT in asarUnpack:\n` +
          missing.map((f) => `  - ${f}`).join('\n') +
          `\n\nAdd them to electron-builder.yml asarUnpack section.`
      );
    }
  });
});
