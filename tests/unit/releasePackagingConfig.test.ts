import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';

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

    expect(manualWorkflow).toContain('gea_packaged_acceptance: ${{ inputs.gea_packaged_acceptance }}');
    expect(manualWorkflow).toContain('gea_version_code: ${{ inputs.gea_version_code }}');
    expect(workflow).toContain("AIONUI_GEA_CLIENT_INTEGRATION: ${{ inputs.gea_packaged_acceptance && '1' || '' }}");
    expect(workflow).toContain("AIONUI_GEA_PACKAGED_ACCEPTANCE: ${{ inputs.gea_packaged_acceptance && '1' || '' }}");
    expect(workflow).toContain('AIONUI_GEA_VERSION_CODE: ${{ inputs.gea_version_code }}');
    expect(workflow).toContain('if [ "$INTERNAL_TEST_BUILD" != "true" ]; then');
    expect(workflow).toContain('if ! [[ "$GEA_VERSION_CODE" =~ ^[1-9][0-9]*$ ]]; then');
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

  it('uploads mac zip artifacts without a stale Windows zip glob', () => {
    const workflow = readProjectFile('.github/workflows/_build-reusable.yml');

    expect(workflow).toContain('out/GEAUi-*-mac-*.zip');
    expect(workflow).not.toContain('out/GEAUi-*-win32-*.zip');
  });

  it('fetches stable AionCore artifacts without freezing provenance as product identity', () => {
    const releaseWorkflow = readProjectFile('.github/workflows/build-and-release.yml');
    const reusableWorkflow = readProjectFile('.github/workflows/_build-reusable.yml');
    const webWorkflow = readProjectFile('.github/workflows/pack-web-cli.yml');

    expect(releaseWorkflow.match(/aioncore_repository: 'CleverC2200\/AionCore'/g)).toHaveLength(2);
    expect(releaseWorkflow.match(/aioncore_run_id: \$\{\{ vars\.AIONCORE_STABLE_RUN_ID \}\}/g)).toHaveLength(2);
    expect(releaseWorkflow.match(/aioncore_source_policy: 'verified-actions'/g)).toHaveLength(2);
    expect(releaseWorkflow).not.toContain('AIONCORE_STABLE_HEAD_SHA');
    expect(releaseWorkflow).not.toContain('AIONCORE_STABLE_SHA256S');

    expect(reusableWorkflow).toContain("default: 'CleverC2200/AionCore'");
    expect(
      reusableWorkflow.match(/AIONUI_BACKEND_EXPECTED_HEAD_SHA: \$\{\{ inputs\.aioncore_expected_head_sha \}\}/g)
    ).toHaveLength(4);
    expect(reusableWorkflow.match(/AIONUI_BACKEND_SHA256S: \$\{\{ inputs\.aioncore_sha256s \}\}/g)).toHaveLength(4);
    expect(
      reusableWorkflow.match(/AIONUI_BACKEND_SOURCE_POLICY: \$\{\{ inputs\.aioncore_source_policy \}\}/g)
    ).toHaveLength(4);
    expect(webWorkflow).toContain('AIONUI_BACKEND_SHA256S: ${{ inputs.aioncore_sha256s }}');
    expect(webWorkflow).toContain('AIONUI_BACKEND_EXPECTED_HEAD_SHA: ${{ inputs.aioncore_expected_head_sha }}');
    expect(webWorkflow).toContain("AIONUI_BACKEND_SOURCE_POLICY: ${{ inputs.aioncore_source_policy || 'default' }}");
  });

  it('retries mac prepackaged builds with both dmg and zip targets', () => {
    const script = readProjectFile('scripts/build-with-builder.js');

    expect(script).toMatch(/--mac\s+dmg\s+zip\s+--\$\{targetArch\}\s+--prepackaged/);
  });

  itWithBash('fails release asset preparation when a mac zip is missing', () => {
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

      expect(prepareResult.status).not.toBe(0);
      expect(`${prepareResult.stdout}\n${prepareResult.stderr}`).toContain('Missing macOS zip artifact');
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});
