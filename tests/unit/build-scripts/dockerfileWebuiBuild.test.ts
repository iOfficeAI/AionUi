import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageJson = {
  readonly scripts: Record<string, string>;
};

const rootDir = process.cwd();
const dockerfile = readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
const packageJson = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as PackageJson;

function extractBunRunScripts(source: string): readonly string[] {
  const scripts: string[] = [];
  for (const match of source.matchAll(/\bbun\s+run\s+([A-Za-z0-9:_-]+)/g)) {
    const script = match[1];
    if (script) scripts.push(script);
  }
  return scripts;
}

function extractNodeScriptPaths(source: string): readonly string[] {
  const scriptPaths: string[] = [];
  for (const match of source.matchAll(/\bnode\s+(scripts\/[^\s;&]+)/g)) {
    const scriptPath = match[1];
    if (scriptPath) scriptPaths.push(scriptPath);
  }
  return scriptPaths;
}

describe('Dockerfile WebUI build', () => {
  it('references only package scripts and node scripts that exist in this workspace', () => {
    const bunRunScripts = extractBunRunScripts(dockerfile);
    const nodeScriptPaths = extractNodeScriptPaths(dockerfile);

    expect(bunRunScripts).not.toContain('build:renderer:web');
    expect(nodeScriptPaths).not.toContain('scripts/build-server.mjs');

    for (const script of bunRunScripts) {
      expect(packageJson.scripts[script], `missing package script: ${script}`).toBeTypeOf('string');
    }
    for (const scriptPath of nodeScriptPaths) {
      expect(existsSync(path.join(rootDir, scriptPath)), `missing node script: ${scriptPath}`).toBe(true);
    }
  });

  it('runs the maintained standalone WebUI entrypoint in the runtime image', () => {
    expect(dockerfile).toContain('AIONUI_NO_BUILD=1');
    expect(dockerfile).toContain('CMD ["bun", "scripts/webui.ts", "--no-build", "--remote"]');
  });
});
