import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const projectRoot = resolve(__dirname, '../..');
const itWithBash = spawnSync('bash', ['--version'], { encoding: 'utf8' }).status === 0 ? it : it.skip;

function readProjectFile(path: string): string {
  return readFileSync(resolve(projectRoot, path), 'utf8');
}

function yamlBlock(content: string, key: string): string {
  const startMatch = content.match(new RegExp(`^${key}:\\s*$`, 'm'));
  if (!startMatch || startMatch.index === undefined) return '';

  const blockStart = startMatch.index + startMatch[0].length;
  const rest = content.slice(blockStart);
  const nextTopLevelKey = rest.search(/^[a-zA-Z][a-zA-Z0-9]*:\s*$/m);
  return nextTopLevelKey === -1 ? rest : rest.slice(0, nextTopLevelKey);
}

describe('release packaging configuration', () => {
  it('keeps mac zip artifacts enabled', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const macBlock = yamlBlock(config, 'mac');

    expect(macBlock).toContain('    - dmg');
    expect(macBlock).toContain('    - zip');
  });

  it('does not build Windows zip artifacts', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const winBlock = yamlBlock(config, 'win');

    expect(winBlock).toContain('    - nsis');
    expect(winBlock).not.toContain('    - zip');
  });

  it('uploads mac zip artifacts without a stale Windows zip glob', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain('out/CSBU-WorkMate-*-mac-*.zip');
    expect(workflow).not.toContain('out/CSBU-WorkMate-*-win32-*.zip');
  });

  it('retries mac prepackaged builds with both dmg and zip targets', () => {
    const script = readProjectFile('scripts/build-with-builder.js');

    expect(script).toMatch(/--mac\s+dmg\s+zip\s+--\$\{targetArch\}\s+--prepackaged/);
  });

  it('enables metadata-free Windows executables for release builds', () => {
    const releaseWorkflow = readProjectFile('.github/workflows/build-and-release.yml');

    expect(releaseWorkflow).toContain('strip_windows_exe_metadata: true');
  });

  it('passes manual version and Windows metadata options to the reusable build', () => {
    const manualWorkflow = readProjectFile('.github/workflows/build-manual.yml');

    expect(manualWorkflow).toContain('version: ${{ inputs.version }}');
    expect(manualWorkflow).toMatch(
      /strip_windows_exe_metadata:\r?\n\s+description:.*\r?\n\s+required: false\r?\n\s+type: boolean\r?\n\s+default: true/
    );
    expect(manualWorkflow).toContain('strip_windows_exe_metadata: ${{ inputs.strip_windows_exe_metadata }}');
  });

  it('prepares the manual package version and pinned Resource Hacker tool', () => {
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(reusableWorkflow).toMatch(
      /strip_windows_exe_metadata:\r?\n\s+description:.*\r?\n\s+type: boolean\r?\n\s+default: true/
    );
    expect(reusableWorkflow).toContain('Apply package version override');
    expect(reusableWorkflow).toContain('Setup Resource Hacker for metadata-free Windows executables');
    expect(reusableWorkflow).toContain('52F81EE4778070D6AA72D8719A1A68FEA2F288005DEB02667542754F747776F8');
  });

  it('removes application VERSIONINFO during afterPack', () => {
    const afterPack = readProjectFile('scripts/afterPack.js');
    const metadataScript = readProjectFile('resources/windows/support/strip-exe-version-info.ps1');

    expect(afterPack).toContain('stripWindowsExecutableVersionInfo(appOutDir, packager)');
    expect(metadataScript).toContain("'-mask', 'VERSIONINFO,,'");
  });

  it('removes installer VERSIONINFO before NSIS assembles integrity data', () => {
    const nsisInclude = readProjectFile('resources/windows/installer-update-verify.nsh');

    expect(nsisInclude).toContain('!packhdr');
    expect(nsisInclude).toContain('strip-exe-version-info.ps1');
    expect(nsisInclude).not.toMatch(/CRCCheck\s+off/i);
  });

  it('runs push checks for every branch and cancels stale branch runs', () => {
    const workflow = readProjectFile('.github/workflows/push-checks.yml');

    expect(workflow).toMatch(/push:\r?\n\s+branches:\r?\n\s+- '\*\*'/);
    expect(workflow).toContain('group: push-checks-${{ github.ref }}');
    expect(workflow).toContain('cancel-in-progress: true');
  });

  it('runs lint, formatting, and type checks after a push', () => {
    const workflow = readProjectFile('.github/workflows/push-checks.yml');

    expect(workflow).toContain('bun run lint -- --quiet');
    expect(workflow).toContain('bun run format:check');
    expect(workflow).toContain('bunx tsc --noEmit');
  });

  it('runs i18n validation and unit tests after a push', () => {
    const workflow = readProjectFile('.github/workflows/push-checks.yml');

    expect(workflow).toContain('bun run i18n:types');
    expect(workflow).toContain('node scripts/check-i18n.js');
    expect(workflow).toContain('bun run test');
  });

  itWithBash('fails release asset preparation when a mac zip is missing', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'csbu-workmate-release-assets-'));
    const artifactsDir = resolve(tempDir, 'build-artifacts');
    const outputDir = resolve(tempDir, 'release-assets');

    try {
      const env = { ...process.env, MOCK_VERSION: '1.0.0' };
      const createResult = spawnSync('bash', ['scripts/create-mock-release-artifacts.sh', artifactsDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });
      expect(createResult.status).toBe(0);

      rmSync(resolve(artifactsDir, 'macos-build-arm64', 'CSBU-WorkMate-1.0.0-mac-arm64.zip'), { force: true });

      const prepareResult = spawnSync('bash', ['scripts/prepare-release-assets.sh', artifactsDir, outputDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });

      expect(prepareResult.status).not.toBe(0);
      expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain('Missing macOS zip artifact');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
