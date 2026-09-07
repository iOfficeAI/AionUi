import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';

const { parseMacCodeSignature } = require('../../scripts/afterSign');

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
  it('defaults to the desktop pair and reports Windows packaging failure truthfully', () => {
    const manual = readProjectFile('.github/workflows/build-manual.yml');
    expect(manual.split('      platform:')[1].split('      skip_code_quality:')[0]).toContain('default: desktop');
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const windows = workflow.split('- name: Build with electron-builder (Windows)')[1].split('        env:')[0];
    expect(windows).toContain('if ($LASTEXITCODE -ne 0)');
    expect(windows).toContain('exit 1');
  });

  it('distinguishes stable Developer ID signatures from ad-hoc signatures', () => {
    expect(parseMacCodeSignature('Signature=adhoc\nTeamIdentifier=not set\n')).toEqual({
      authority: null,
      certificateSigned: false,
      signature: 'adhoc',
      stable: false,
      teamIdentifier: null,
    });
    expect(
      parseMacCodeSignature(
        'Authority=Developer ID Application: Example Corp (TEAM123456)\nSignature size=8978\nTeamIdentifier=TEAM123456\n'
      )
    ).toEqual({
      authority: 'Developer ID Application: Example Corp (TEAM123456)',
      certificateSigned: true,
      signature: 'signed',
      stable: true,
      teamIdentifier: 'TEAM123456',
    });
    expect(
      parseMacCodeSignature('Authority=GEAUi Local Code Signing\nSignature size=2048\nTeamIdentifier=not set\n')
    ).toEqual({
      authority: 'GEAUi Local Code Signing',
      certificateSigned: true,
      signature: 'signed',
      stable: false,
      teamIdentifier: null,
    });
  });

  it('requires stable macOS signing in distributable CI builds', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain(
      "AIONUI_REQUIRE_STABLE_MAC_SIGNATURE: ${{ inputs.internal_test_build && 'false' || 'true' }}"
    );
    expect(workflow).toMatch(/internal_test_build:\n\s+description:.*\n\s+type: boolean\n\s+default: false/);
    const manualWorkflow = readProjectFile('.github/workflows/build-manual.yml');
    expect(manualWorkflow).toContain('internal_test_build: ${{ inputs.internal_test_build }}');
    expect(manualWorkflow).toContain('--mac dmg --arm64');
    expect(manualWorkflow).toContain(
      "aioncore_source_policy: ${{ inputs.aioncore_run_id != '' && 'verified-actions' || 'default' }}"
    );
  });

  it('gates packaged GEA acceptance behind explicit internal build inputs', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const manualWorkflow = readProjectFile('.github/workflows/build-manual.yml');
    const codeQualityBlock = workflow.slice(workflow.indexOf('  code-quality:'), workflow.indexOf('  build:'));
    const buildBlock = workflow.slice(workflow.indexOf('  build:'));

    expect(manualWorkflow).toContain('gea_packaged_acceptance: ${{ inputs.gea_packaged_acceptance }}');
    expect(manualWorkflow).toContain('gea_version_code: ${{ inputs.gea_version_code }}');
    expect(codeQualityBlock).not.toContain('AIONUI_GEA_CLIENT_INTEGRATION');
    expect(codeQualityBlock).not.toContain('AIONUI_GEA_PACKAGED_ACCEPTANCE');
    expect(codeQualityBlock).not.toContain('AIONUI_GEA_VERSION_CODE');
    expect(buildBlock).toContain("AIONUI_GEA_CLIENT_INTEGRATION: ${{ inputs.gea_packaged_acceptance && '1' || '' }}");
    expect(buildBlock).toContain("AIONUI_GEA_PACKAGED_ACCEPTANCE: ${{ inputs.gea_packaged_acceptance && '1' || '' }}");
    expect(buildBlock).toContain('AIONUI_GEA_VERSION_CODE: ${{ inputs.gea_version_code }}');
    expect(workflow).toContain('if [ "$INTERNAL_TEST_BUILD" != "true" ]; then');
    expect(workflow).toContain('if ! [[ "$GEA_VERSION_CODE" =~ ^[1-9][0-9]*$ ]]; then');
  });

  it('builds only DMG installers for macOS', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const macBlock = yamlBlock(config, 'mac');

    expect(macBlock).toContain('    - dmg');
    expect(macBlock).not.toContain('    - zip');
  });

  itWithBash('accepts the macOS DMG and metadata in the PR artifact gate without legacy ZIPs', () => {
    const workflow = readProjectFile('.github/workflows/pr-checks.yml');
    const script = workflow
      .split('- name: Verify build artifacts exist')[1]
      .split('- name: Silent install smoke test')[0]
      .split('run: |')[1]
      .replaceAll('${{ matrix.platform }}', 'macos-arm64');
    const root = mkdtempSync(resolve(tmpdir(), 'pr-mac-artifacts-'));
    try {
      mkdirSync(resolve(root, 'out'));
      const dmg = resolve(root, 'out/GEAUi-test-mac-arm64.dmg');
      writeFileSync(dmg, 'fixture installer');
      writeFileSync(resolve(root, 'out/latest-mac.yml'), 'version: test');
      const run = () => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], { cwd: root, encoding: 'utf8' });
      const complete = run();
      expect(complete.status, complete.stderr).toBe(0);
      rmSync(dmg);
      expect(run().status).not.toBe(0);
      writeFileSync(dmg, 'fixture installer');
      rmSync(resolve(root, 'out/latest-mac.yml'));
      expect(run().status).not.toBe(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('pins PR packaging to the same verified Hub resource version as release packaging', () => {
    const release = readProjectFile('.github/workflows/_build-reusable.yml');
    const prBuild = readProjectFile('.github/workflows/pr-checks.yml').split('  build-test:')[1];
    const pin = release.match(/AIONUI_HUB_TAG: '[^']+'/)?.[0];
    expect(pin).toBeTruthy();
    expect(prBuild).toContain(pin);
  });

  it('does not build Windows zip artifacts', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const winBlock = yamlBlock(config, 'win');

    expect(winBlock).toContain('    - nsis');
    expect(winBlock).not.toContain('    - zip');
  });

  it('unpacks every external Node MCP entry used by the packaged app', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');

    expect(config).toContain("- 'out/main/builtin-mcp-browser.js'");
    expect(config).toContain("- 'out/main/builtin-mcp-lark-cli.js'");
    expect(config).toContain("- '**/node_modules/chrome-devtools-mcp/**/*'");
  });

  it('keeps Windows installer executable checks aligned with electron-builder', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const executableName = config.match(/^executableName:\s*(.+)$/m)?.[1]?.trim();
    const observability = readProjectFile('resources/windows/installer-observability.nsh');
    const updateVerify = readProjectFile('resources/windows/installer-update-verify.nsh');

    expect(executableName).toBeTruthy();
    expect(observability).toContain(`!define AIONUI_APP_EXECUTABLE_FILENAME "${executableName}.exe"`);
    expect(observability).toContain('${FileExists} "$INSTDIR\\${AIONUI_APP_EXECUTABLE_FILENAME}"');
    expect(updateVerify).toContain('AIONUI_VERIFY_REQUIRED_FILE "$INSTDIR\\${AIONUI_APP_EXECUTABLE_FILENAME}"');
  });

  it('uploads only supported desktop installers', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).not.toContain('out/GEAUi-*-mac-*.zip');
    expect(workflow).not.toContain('out/*.deb');
    expect(workflow).toContain('out/*.dmg');
    expect(workflow).toContain('out/*.exe');
    expect(workflow).not.toContain('out/GEAUi-*-win32-*.zip');
  });

  it('fetches stable AionCore artifacts without freezing provenance as product identity', () => {
    const releaseWorkflow = readProjectFile('.github/workflows/build-and-release.yml');
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const webWorkflow = readProjectFile('.github/workflows/pack-web-cli.yml');

    expect(releaseWorkflow.match(/aioncore_repository: 'CleverC2200\/AionCore'/g)).toHaveLength(1);
    expect(releaseWorkflow.match(/aioncore_run_id: \$\{\{ vars\.AIONCORE_STABLE_RUN_ID \}\}/g)).toHaveLength(1);
    expect(releaseWorkflow.match(/aioncore_source_policy: 'verified-actions'/g)).toHaveLength(1);
    expect(releaseWorkflow).not.toContain('AIONCORE_STABLE_HEAD_SHA');
    expect(releaseWorkflow).not.toContain('AIONCORE_STABLE_SHA256S');

    expect(reusableWorkflow).toContain("default: 'CleverC2200/AionCore'");
    expect(
      reusableWorkflow.match(/AIONUI_BACKEND_EXPECTED_HEAD_SHA: \$\{\{ inputs\.aioncore_expected_head_sha \}\}/g)
    ).toHaveLength(4);
    expect(reusableWorkflow.match(/AIONUI_BACKEND_SHA256S: \$\{\{ inputs\.aioncore_sha256s \}\}/g)).toHaveLength(4);
    expect(
      reusableWorkflow.match(
        /AIONUI_BACKEND_SOURCE_POLICY: \$\{\{ matrix\.core-run-id != '' && 'verified-actions' \|\| inputs\.aioncore_source_policy \}\}/g
      )
    ).toHaveLength(4);
    expect(webWorkflow).toContain('AIONUI_BACKEND_SHA256S: ${{ inputs.aioncore_sha256s }}');
    expect(webWorkflow).toContain('AIONUI_BACKEND_EXPECTED_HEAD_SHA: ${{ inputs.aioncore_expected_head_sha }}');
    expect(webWorkflow).toContain("AIONUI_BACKEND_SOURCE_POLICY: ${{ inputs.aioncore_source_policy || 'default' }}");
  });

  itWithBash('builds the desktop pair in one matrix with platform-specific Core sources', () => {
    const manual = readProjectFile('.github/workflows/build-manual.yml');
    const script = manual
      .split('        run: |\n')[1]
      .split('\n  build-pipeline:')[0]
      .replace(/^          /gm, '');
    const dir = mkdtempSync(resolve(tmpdir(), 'desktop-matrix-'));
    try {
      const output = resolve(dir, 'output');
      const result = spawnSync('bash', ['-c', script.replaceAll('${{ inputs.platform }}', 'desktop')], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: output, CORE_RUN_IDS: '{"macos-arm64":"123","windows-x64":"456"}' },
      });
      expect(result.status, result.stderr).toBe(0);
      const matrix = JSON.parse(readFileSync(output, 'utf8').trim().slice('matrix='.length));
      expect(matrix.include.map((entry: Record<string, string>) => [entry.platform, entry['core-run-id']])).toEqual([
        ['macos-arm64', '123'],
        ['windows-x64', '456'],
      ]);
      expect(matrix.include[0].command).toContain('--mac dmg --arm64');
      expect(matrix.include[1].command).toContain('--win --x64');
      for (const runs of ['[]', '{"macos-arm64":"invalid"}']) {
        const invalid = spawnSync('bash', ['-c', script.replaceAll('${{ inputs.platform }}', 'desktop')], {
          encoding: 'utf8',
          env: { ...process.env, GITHUB_OUTPUT: output, CORE_RUN_IDS: runs },
        });
        expect(invalid.status).not.toBe(0);
      }
      const reusable = readProjectFile('.github/workflows/_build-reusable.yml');
      expect(reusable).toContain('fail-fast: false');
      expect(reusable).not.toContain('max-parallel: 1');
      expect(
        reusable.match(/AIONUI_BACKEND_RUN_ID: \$\{\{ matrix\.core-run-id \|\| inputs\.aioncore_run_id \}\}/g)
      ).toHaveLength(4);
      expect(reusable).toContain('CORE_RUN_ID: ${{ matrix.core-run-id || inputs.aioncore_run_id }}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  itWithBash('skips Sentry uploads only for explicit internal test builds', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const script = workflow
      .split('- name: Configure Sentry source map upload owner')[1]
      .split('        run: |\n')[1]
      .split('\n      - name: Validate Sentry')[0]
      .replace(/^          /gm, '');
    const dir = mkdtempSync(resolve(tmpdir(), 'sentry-upload-'));
    try {
      for (const [platform, internal, expected] of [
        ['macos-arm64', 'true', 'false'],
        ['macos-arm64', 'false', 'true'],
        ['windows-x64', 'false', 'false'],
      ]) {
        const output = resolve(dir, `${platform}-${internal}`);
        const result = spawnSync(
          'bash',
          [
            '-c',
            script
              .replaceAll('${{ matrix.platform }}', platform)
              .replaceAll('${{ inputs.internal_test_build }}', internal),
          ],
          {
            encoding: 'utf8',
            env: { ...process.env, GITHUB_ENV: output },
          }
        );
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(output, 'utf8').trim()).toBe(`SENTRY_UPLOAD_SOURCE_MAPS=${expected}`);
      }
      expect(workflow).toContain("if: matrix.platform == 'macos-arm64' && !inputs.internal_test_build");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['--mac dmg --arm64', '--mac dmg --x64'])('preserves retry targets for %s', (args) => {
    const script = readProjectFile('scripts/build-with-builder.js');
    const helper = script.slice(
      script.indexOf('function createMacArtifactsWithPrepackaged('),
      script.indexOf('function buildWithDmgRetry(')
    );
    const commands: string[] = [];
    const command = `bunx electron-builder ${args} --publish=never`;
    runInNewContext(`${helper}; createMacArtifactsWithPrepackaged('/tmp/output', command);`, {
      fs: { readdirSync: () => ['GEAUi.app'] },
      path: { join: (...parts: string[]) => parts.join('/') },
      execSync: (value: string) => commands.push(value),
      process: { platform: 'darwin' },
      command,
    });
    expect(commands).toEqual([`${command} --prepackaged "/tmp/output/GEAUi.app"`]);
  });

  itWithBash('publishes only DMG and EXE even when legacy artifacts are present', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'aionui-release-assets-'));
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

      rmSync(resolve(artifactsDir, 'macos-build-arm64', 'GEAUi-1.0.0-mac-arm64.zip'), { force: true });

      const prepareResult = spawnSync('bash', ['scripts/prepare-release-assets.sh', artifactsDir, outputDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });

      expect(prepareResult.status, prepareResult.stderr).toBe(0);
      expect(readdirSync(outputDir).toSorted()).toEqual([
        'GEAUi-1.0.0-mac-arm64.dmg',
        'GEAUi-1.0.0-mac-x64.dmg',
        'GEAUi-1.0.0-win-arm64.exe',
        'GEAUi-1.0.0-win-x64.exe',
        'SHA256SUMS.txt',
        'latest-win-arm64.yml',
        'latest.yml',
      ]);
      const verify = spawnSync('bash', ['scripts/verify-release-assets.sh', outputDir], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      expect(verify.status, verify.stdout + verify.stderr).toBe(0);
      writeFileSync(resolve(outputDir, 'GEAUi-1.0.0-mac-arm64.dmg'), 'tampered');
      const corrupted = spawnSync('bash', ['scripts/verify-release-assets.sh', outputDir], {
        cwd: projectRoot,
        encoding: 'utf8',
      });
      expect(corrupted.status).not.toBe(0);
      expect(corrupted.stdout).toContain('FAIL: release checksums');
      rmSync(resolve(artifactsDir, 'macos-build-arm64', 'GEAUi-1.0.0-mac-arm64.dmg'));
      const missing = spawnSync('bash', ['scripts/prepare-release-assets.sh', artifactsDir, outputDir], {
        cwd: projectRoot,
        env,
        encoding: 'utf8',
      });
      expect(missing.status).not.toBe(0);
      expect(missing.stdout).toContain('Missing desktop installer');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
