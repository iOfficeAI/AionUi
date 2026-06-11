/**
 * Command EVE Connector Catalog – Electron bridge proof.
 *
 * Verifies the desktop app can render the governed connector manifest through
 * the Electron bridge without exposing raw MCP-add or secret-edit surfaces.
 */
import { test, expect } from '../fixtures';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tempRoots: string[] = [];
const previousCommandEveEnv = {
  COMMAND_EVE_AGENT_EVENTS_PATH: process.env.COMMAND_EVE_AGENT_EVENTS_PATH,
  COMMAND_EVE_COMPANY_OS_ROOT: process.env.COMMAND_EVE_COMPANY_OS_ROOT,
  COMMAND_EVE_CONNECTOR_MANIFEST_PATH: process.env.COMMAND_EVE_CONNECTOR_MANIFEST_PATH,
};

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createE2ECompanyOsRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'command-eve-connector-catalog-e2e-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, '.company-os', 'operations'), { recursive: true });
  writeJson(path.join(root, 'kits', 'company-os-kit', '.company-os', 'eve', 'connector-manifests.json'), {
    version: 'eve-connector-manifest/v0',
    policy: {
      state_authority: 'local-preflight-result-files-only',
      secret_rule:
        'Never ask for passwords, cookies, recovery codes, payment details, raw tokens or .env contents in chat.',
      write_rule: 'Write-capable connectors require CEO/Codex review and the matching HumanGate before use.',
    },
    connectors: [
      {
        id: 'local-company-os-workspace',
        name: 'Local Company.OS Workspace',
        tier: 'core',
        purpose: 'Find onboarding packets, local memory, install state, workspace registry and source-of-truth docs.',
        required_for: ['T0'],
        auth_method: 'local filesystem',
        auth_surface: 'installed Company.OS workspace',
        setup_mode: 'bootstrap',
        safe_preflight: ['Check local workspace'],
        verify_command: 'node scripts/operator-shell/eve-sidecar.mjs preflight',
        allowed_actions: ['read onboarding artifacts'],
        blocked_actions: ['overwrite local memory'],
        human_gate: 'HG-1 before persisting corrected company facts',
        memory_policy: 'local-first',
        preflight_result_file: path.join(
          root,
          '.company-os',
          'operations',
          'preflight-results',
          'local-company-os-workspace-latest.json'
        ),
      },
      {
        id: 'execution-ledger-plane',
        name: 'Plane Execution Ledger',
        tier: 'core',
        purpose: 'Hold Company.OS parent contracts, child worker contracts, status, blockers and review gates.',
        required_for: ['T3'],
        auth_method: 'Plane App connector preferred; app-token bridge fallback',
        auth_surface: 'Plane workspace',
        setup_mode: 'guided_connector',
        safe_preflight: ['sanity'],
        verify_command: 'node scripts/plane/plane-api-sanity.mjs',
        allowed_actions: ['read projects'],
        blocked_actions: ['mark Done'],
        human_gate: 'HG-3 before write-capable ledger changes',
        memory_policy: 'execution truth only',
        preflight_result_file: path.join(
          root,
          '.company-os',
          'operations',
          'preflight-results',
          'execution-ledger-plane-latest.json'
        ),
      },
      {
        id: 'github-gitnexus',
        name: 'GitHub + GitNexus',
        tier: 'autonomy_core',
        purpose: 'Support code delegation, repo discovery, codegraph impact analysis, PRs and update paths.',
        required_for: ['T4'],
        auth_method: 'GitHub CLI/OAuth plus local GitNexus index',
        auth_surface: 'GitHub account/org and local repos',
        setup_mode: 'guided_connector',
        safe_preflight: ['gh auth status', 'gitnexus status'],
        verify_command: 'gh auth status && gitnexus status',
        allowed_actions: ['read repos'],
        blocked_actions: ['push or merge without approval'],
        human_gate: 'HG-3 before write-capable GitHub actions',
        memory_policy: 'store repo metadata and decisions',
        preflight_result_file: path.join(
          root,
          '.company-os',
          'operations',
          'preflight-results',
          'github-gitnexus-latest.json'
        ),
      },
      {
        id: 'marketing-publishing-stack',
        name: 'Upload-Post + Social + Analytics',
        tier: 'optional_gated',
        purpose: 'Support marketing attribution, publishing, social analytics and department-specific growth loops.',
        required_for: ['marketing_wedge_only'],
        auth_method: 'OAuth/API',
        auth_surface: 'Upload-Post',
        setup_mode: 'deferred_gated_connector',
        safe_preflight: ['read-only pull'],
        verify_command: 'manual',
        allowed_actions: ['read history'],
        blocked_actions: ['publish'],
        human_gate: 'HG-4 before public publishing',
        memory_policy: 'archive exports only',
        preflight_result_file: path.join(
          root,
          '.company-os',
          'operations',
          'preflight-results',
          'marketing-publishing-stack-latest.json'
        ),
      },
    ],
  });
  return root;
}

const connectorCatalogE2ERoot = createE2ECompanyOsRoot();
process.env.COMMAND_EVE_CONNECTOR_MANIFEST_PATH = path.join(
  connectorCatalogE2ERoot,
  'kits',
  'company-os-kit',
  '.company-os',
  'eve',
  'connector-manifests.json'
);
if (!process.env.COMMAND_EVE_COMPANY_OS_ROOT) {
  process.env.COMMAND_EVE_COMPANY_OS_ROOT = connectorCatalogE2ERoot;
}
if (!process.env.COMMAND_EVE_AGENT_EVENTS_PATH) {
  process.env.COMMAND_EVE_AGENT_EVENTS_PATH = path.join(connectorCatalogE2ERoot, 'metrics', 'agent-events.jsonl');
}

test.describe('Command EVE Connector Catalog', () => {
  test.setTimeout(120_000);

  test('renders governed connector cards from the local manifest', async ({ page }, testInfo) => {
    await page.waitForSelector('body', { state: 'visible' });

    await page.evaluate(() => {
      window.location.hash = '#/connectors';
    });

    await expect(page.getByText('Connector Catalog').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('CONNECTOR_CATALOG_ELECTRON_BRIDGE_REQUIRED')).toHaveCount(0);
    await expect(page.getByText('connector-manifests.json')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Plane Execution Ledger').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('GitHub + GitNexus').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Upload-Post + Social + Analytics').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Geführter Setup-Pfad|Guided setup path/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/MCP Enable|MCP enable/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/HUMANGATE_AND_PREFLIGHT_REQUIRED/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/HumanGate anfordern|Request HumanGate/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Nie im Chat|Never in chat/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('raw_mcp_add')).toHaveCount(0);
    await expect(page.getByText(/Rohes MCP-Setup|Raw MCP setup/).first()).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText(/Verbunden|Connected|Gated|Auth nötig|Needs auth|Unverifiziert|Unverified/).first()
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByRole('button', { name: /Read-only Preflight ausführen|Run read-only preflight/ })
    ).toHaveCount(3);

    await page
      .getByRole('button', { name: /Read-only Preflight ausführen|Run read-only preflight/ })
      .first()
      .click();
    await expect(page.getByText(/Preflight-Receipt geschrieben|Preflight receipt written/).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/LOCAL_COMPANY_OS_WORKSPACE_READY/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Audit-Event|Audit event/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/agent-events(?:\.clean)?\.jsonl/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Receipt ansehen|View receipt/).first()).toBeVisible({ timeout: 30_000 });

    const screenshotPath = 'tests/e2e/results/command-eve-connector-catalog.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await testInfo.attach('command-eve-connector-catalog', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });
});

test.afterAll(() => {
  for (const [key, value] of Object.entries(previousCommandEveEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
