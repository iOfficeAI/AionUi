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
  it('keeps the native rebuild target aligned with the Electron runtime', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      devDependencies: { electron: string };
      electronRebuild: { electronVersion: string };
    };

    expect(packageJson.electronRebuild.electronVersion).toBe(packageJson.devDependencies.electron);
  });

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

  it('does not expose the crash-prone Windows metadata stripping option', () => {
    const workflows = [
      readProjectFile('.github/workflows/build-and-release.yml'),
      readProjectFile('.github/workflows/build-manual.yml'),
      readProjectFile('.github/workflows/_build-reusable.yml'),
    ].join('\n');

    expect(workflows).not.toContain('strip_windows_exe_metadata');
    expect(workflows).not.toContain('RESOURCE_HACKER_PATH');
    expect(workflows).not.toContain('Resource Hacker');
  });

  it('passes the manual version to the reusable build', () => {
    const manualWorkflow = readProjectFile('.github/workflows/build-manual.yml');

    expect(manualWorkflow).toContain('version: ${{ inputs.version }}');
  });

  it('keeps Sentry source map upload optional when release secrets are unavailable', () => {
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(reusableWorkflow).toContain('if [ "${SENTRY_UPLOAD_SOURCE_MAPS:-false}" != "true" ]; then');
    expect(reusableWorkflow).toContain(
      'elif [ -n "$SENTRY_AUTH_TOKEN" ] && [ -n "$SENTRY_ORG" ] && [ -n "$SENTRY_PROJECT" ]; then'
    );
    expect(reusableWorkflow).toContain('Sentry credentials are not configured; building without source map upload');
  });

  it('supports manually publishing an existing release tag', () => {
    const releaseWorkflow = readProjectFile('.github/workflows/build-and-release.yml');

    expect(releaseWorkflow).toMatch(/workflow_dispatch:\r?\n\s+inputs:\r?\n\s+release_tag:/);
    expect(releaseWorkflow).toContain(
      "ref: ${{ github.event_name == 'workflow_dispatch' && inputs.release_tag || '' }}"
    );
    expect(releaseWorkflow).toContain('git show-ref --verify --quiet "refs/tags/$RELEASE_TAG"');
    expect(releaseWorkflow).toContain("github.event_name == 'workflow_dispatch' || needs.create-tag.result");
  });

  it('writes the selected update policy before signing release manifests', () => {
    const releaseWorkflow = readProjectFile('.github/workflows/build-and-release.yml');
    const policyIndex = releaseWorkflow.indexOf('Apply release update policy');
    const signingIndex = releaseWorkflow.indexOf('Sign update manifests');

    expect(releaseWorkflow).toContain('minimum_supported_version:');
    expect(policyIndex).toBeGreaterThan(-1);
    expect(signingIndex).toBeGreaterThan(policyIndex);
  });

  it('defaults every release path to an optional update', () => {
    const releaseWorkflow = readProjectFile('.github/workflows/build-and-release.yml');

    expect(releaseWorkflow).toMatch(/update_mode:[\s\S]*?default: optional/);
    expect(releaseWorkflow).toContain("inputs.update_mode || 'optional'");
  });

  it('uses Node 24-based actions throughout the release pipelines', () => {
    const workflows = [
      readProjectFile('.github/workflows/build-and-release.yml'),
      readProjectFile('.github/workflows/_build-reusable.yml'),
      readProjectFile('.github/workflows/pack-web-cli.yml'),
    ].join('\n');

    expect(workflows).not.toMatch(/actions\/setup-node@v4/);
    expect(workflows).not.toMatch(/actions\/setup-python@v5/);
    expect(workflows).not.toMatch(/actions\/cache@v4/);
    expect(workflows).not.toMatch(/nick-fields\/retry@v3/);
  });

  it('reports lint errors without publishing pre-existing warnings as release annotations', () => {
    const workflows = [
      readProjectFile('.github/workflows/build-and-release.yml'),
      readProjectFile('.github/workflows/_build-reusable.yml'),
      readProjectFile('.github/workflows/pack-web-cli.yml'),
    ].join('\n');

    expect(workflows.match(/bun run lint -- --quiet/g)).toHaveLength(3);
  });

  it('preserves application VERSIONINFO after electron-builder edits resources', () => {
    const afterSign = readProjectFile('scripts/afterSign.js');
    const buildScript = readProjectFile('scripts/build-with-builder.js');

    expect(afterSign).not.toContain('stripWindowsExecutableVersionInfo');
    expect(afterSign).not.toContain('RESOURCE_HACKER_PATH');
    expect(buildScript).not.toContain('CSBU_WORKMATE_METADATA_FREE');
  });

  it('uses electron-builder CSBU WorkMate metadata without legacy brand overrides', () => {
    const packageJson = JSON.parse(readProjectFile('package.json')) as {
      author: { name: string };
      productName: string;
    };
    const afterPack = readProjectFile('scripts/afterPack.js');
    const afterSign = readProjectFile('scripts/afterSign.js');
    const buildScript = readProjectFile('scripts/build-with-builder.js');
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(packageJson.author.name).toBe('CSBU');
    expect(packageJson.productName).toBe('CSBU WorkMate');
    expect(afterPack).not.toContain('锐捷Codex');
    expect(afterSign).not.toContain('setWindowsExecutableMetadata');
    expect(buildScript).not.toContain('锐捷Codex');
    expect(buildScript).not.toContain('Patched electron-builder NSIS Windows EXE metadata.');
    expect(reusableWorkflow).toContain("$expectedProductName = 'CSBU WorkMate'");
    expect(reusableWorkflow).toContain("$expectedLegalCopyright = 'Copyright © 2026 CSBU'");
    expect(reusableWorkflow).toContain('if ($info.ProductName -ne $expectedProductName)');
    expect(reusableWorkflow).toContain('if ($info.LegalCopyright -ne $expectedLegalCopyright)');
  });

  it('preserves installer VERSIONINFO while keeping NSIS integrity checks enabled', () => {
    const nsisInclude = readProjectFile('resources/windows/installer-update-verify.nsh');

    expect(nsisInclude).not.toContain('!packhdr');
    expect(nsisInclude).not.toContain('strip-exe-version-info.ps1');
    expect(nsisInclude).not.toMatch(/CRCCheck\s+off/i);
  });

  it('bounds Windows installer smoke phases and preserves diagnostics', () => {
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const smokeScript = readProjectFile('resources/windows/support/verify-installer-migration.ps1');

    expect(reusableWorkflow).toContain('Verify fresh Windows installation');
    expect(reusableWorkflow).toContain('Prepare registry-free migration fixture');
    expect(reusableWorkflow).toContain('Upload pre-upgrade migration diagnostics');
    expect(reusableWorkflow).toContain('Verify registry-free migration upgrade');
    expect(reusableWorkflow).toContain('windows-installer-smoke:');
    expect(reusableWorkflow).toContain('needs: build');
    expect(reusableWorkflow).toContain('actions/download-artifact@v7');
    expect(reusableWorkflow).toContain("& 'resources/windows/support/verify-installer-migration.ps1'");
    expect(reusableWorkflow).toContain('run_windows_registry_free_migration_smoke:');
    expect(reusableWorkflow).toContain(
      'scenario: ${{ fromJSON(inputs.run_windows_registry_free_migration_smoke && \'["fresh","migration"]\' || \'["fresh"]\') }}'
    );
    expect(reusableWorkflow).toContain("if: matrix.scenario == 'migration'");
    expect(reusableWorkflow).toContain("-Mode 'migration-prepare'");
    expect(reusableWorkflow).toContain("-Mode 'migration-upgrade'");
    expect(smokeScript).toContain("-Filter 'Uninstall*.exe'");
    expect(smokeScript).toContain("[ValidateSet('fresh', 'migration-prepare', 'migration-upgrade')]");
    expect(smokeScript).toContain("if ($Mode -eq 'fresh')");
    expect(smokeScript).toContain('$process.WaitForExit(5000)');
    expect(smokeScript).toContain('heartbeat: pid=$($process.Id)');
    expect(smokeScript).toContain('Select-Object -Skip $reportedLogLineCount');
    expect(smokeScript).toContain('& taskkill.exe /PID $process.Id /T /F');
    expect(smokeScript).toContain('function Wait-ForUninstallCompletion');
    expect(smokeScript).toContain("-Phase 'fresh-install'");
    expect(smokeScript).toContain("-Phase 'fresh-uninstall'");
    expect(smokeScript).toContain("-Phase 'migrated-uninstall'");
    expect(smokeScript).toContain('function Assert-LegacyMigrationState');
    expect(smokeScript).toContain("Save-DiagnosticsSnapshot -Phase 'before-upgrade'");
    expect(smokeScript).toContain('$migrationInstallDirectory = Join-Path $env:LOCALAPPDATA');
    expect(smokeScript).toContain("'smoke-status.txt'");
    expect(reusableWorkflow).toContain('Upload Windows installer smoke diagnostics');
  });

  it('uploads Windows builds before running installer smoke tests', () => {
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const uploadIndex = reusableWorkflow.indexOf('Upload Windows build artifacts before installer smoke tests');
    const smokeIndex = reusableWorkflow.lastIndexOf('Verify registry-free migration upgrade');

    expect(uploadIndex).toBeGreaterThan(-1);
    expect(smokeIndex).toBeGreaterThan(uploadIndex);
  });

  it('runs installer smoke tests on clean downstream Windows runners', () => {
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const releaseWorkflow = readProjectFile('.github/workflows/build-and-release.yml');
    const manualWorkflow = readProjectFile('.github/workflows/build-manual.yml');

    expect(releaseWorkflow).toContain('run_windows_installer_smoke: true');
    expect(releaseWorkflow).not.toContain('run_windows_registry_free_migration_smoke: true');
    expect(releaseWorkflow).toContain('"platform":"windows-arm64"');
    expect(reusableWorkflow).toContain(
      "if: ${{ always() && inputs.run_windows_installer_smoke && needs.build.result == 'success' }}"
    );
    expect(manualWorkflow).toContain(
      'run_windows_installer_smoke: ${{ steps.set-matrix.outputs.run_windows_installer_smoke }}'
    );
    expect(manualWorkflow).toContain(
      'run_windows_installer_smoke: ${{ fromJSON(needs.prepare-matrix.outputs.run_windows_installer_smoke) }}'
    );
    expect(manualWorkflow).toContain(
      'windows_installer_smoke_matrix: ${{ needs.prepare-matrix.outputs.windows_installer_smoke_matrix }}'
    );
  });

  it('uses standard current-user registry entries and retains a one-time legacy migration reader', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const installerState = readProjectFile('resources/windows/support/installer-state.ps1');
    const installerMigration = readProjectFile('resources/windows/installer-repair-heal.nsh');
    const installerProcessControl = readProjectFile('resources/windows/installer-process-control.nsh');

    expect(config).toContain('allowElevation: false');
    expect(config).toContain('perMachine: false');
    expect(installerState).toContain("'installer-state.ini'");
    expect(installerMigration).toContain('$CsbuWorkMateLegacyMigrationPending == "1"');
    expect(installerMigration).toContain('StrCpy $CsbuWorkMateLegacyMigrationPending "1"');
    expect(installerMigration).toContain('-Action prepare-migration');
    expect(installerMigration).toContain('-Action rollback-migration');
    expect(installerMigration).toContain('-Action commit-migration');
    expect(installerProcessControl).toContain('!insertmacro CSBU_WORKMATE_PREPARE_LEGACY_MIGRATION');
    expect(readProjectFile('scripts/build-with-builder.js')).toContain('CSBU WorkMate migration direct extraction');
    expect(reusableWorkflow).toContain('Standard Windows installation registration is missing');
    expect(reusableWorkflow).toContain('Legacy registry-free installer state remains after installation');
    expect(reusableWorkflow).toContain("CSBU_WORKMATE_LEGACY_INSTALLER_TAG: 'v2.1.51'");
    expect(reusableWorkflow).toContain('gh release download $env:CSBU_WORKMATE_LEGACY_INSTALLER_TAG');
    expect(reusableWorkflow).toContain('Get-FileHash -LiteralPath $fixturePath -Algorithm SHA256');
    expect(readProjectFile('resources/windows/support/verify-installer-migration.ps1')).toContain(
      "-Phase 'registry-free-migration'"
    );
    expect(reusableWorkflow).not.toContain('-Action write');
  });

  it('configures GitHub Releases without requiring Windows Authenticode signing', () => {
    const config = readProjectFile('packages/desktop/electron-builder.yml');
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(config).toContain('provider: github');
    expect(config).toContain('owner: suoak');
    expect(config).toContain('repo: AionUi');
    expect(config).not.toContain('publisherName:');
    expect(reusableWorkflow).not.toContain('WIN_CSC_LINK');
    expect(reusableWorkflow).not.toContain('Authenticode');
    expect(reusableWorkflow).toContain('UPDATE_MANIFEST_ED25519_PUBLIC_KEY');
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
