/**
 * Command EVE Status / Health surface.
 *
 * Proves the Command Center status panel is backed by the real Company.OS
 * status-surface CLI, and that missing runtime truth fails loudly instead of
 * rendering a confident green state.
 */
import path from 'path';
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';

type StatusSurfaceBridgeResponse = {
  success?: boolean;
  msg?: string;
  data?: {
    version?: string;
    ok?: boolean;
    status?: string;
    reason_code?: string;
    message?: string;
    surface?: {
      schema_version?: string;
      status?: string;
      status_label?: string;
      empty_states?: string[];
      blocked_actions?: string[];
      sources?: {
        event_ledger?: string;
      };
      morning_brief?: {
        totals?: {
          runs?: number;
        };
      };
    };
    source?: {
      company_os_root?: string;
      event_ledger?: string;
      status_surface_cli?: string;
    };
  };
};

const companyOsRoot = process.env.COMMAND_EVE_COMPANY_OS_ROOT;
const statusHealthLedger = companyOsRoot
  ? process.env.COMMAND_EVE_STATUS_HEALTH_LEDGER || path.join(companyOsRoot, 'metrics', 'agent-events.example.jsonl')
  : '';

test.describe('Command EVE status health', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });
  });

  test('renders a populated status surface from a canonical Company.OS event ledger', async ({ page }) => {
    test.skip(!companyOsRoot, 'COMMAND_EVE_COMPANY_OS_ROOT is required for status-health E2E proof.');

    const response = await invokeBridge<StatusSurfaceBridgeResponse>(
      page,
      'command-eve.status-surface',
      {
        companyOsRoot,
        eventLedgerPath: statusHealthLedger,
        maxRuns: 8,
      },
      30_000
    );

    expect(response.success, JSON.stringify(response, null, 2)).toBe(true);
    expect(response.data?.version).toBe('command-eve-status-surface-bridge/v0');
    expect(response.data?.status).toBe('ready');
    expect(response.data?.surface?.schema_version).toBe('command-eve-status-surface/v0');
    expect(response.data?.surface?.status).not.toBe('BLOCK');
    expect(response.data?.surface?.sources?.event_ledger).toBe(statusHealthLedger);
    expect(response.data?.surface?.morning_brief?.totals?.runs ?? 0).toBeGreaterThan(0);
  });

  test('reports a blocked disconnected state when the event ledger is missing', async ({ page }) => {
    test.skip(!companyOsRoot, 'COMMAND_EVE_COMPANY_OS_ROOT is required for status-health E2E proof.');

    const missingLedger = path.join(companyOsRoot, 'tmp', `missing-status-health-${Date.now()}.jsonl`);
    const response = await invokeBridge<StatusSurfaceBridgeResponse>(
      page,
      'command-eve.status-surface',
      {
        companyOsRoot,
        eventLedgerPath: missingLedger,
        maxRuns: 8,
      },
      30_000
    );

    expect(response.success, JSON.stringify(response, null, 2)).toBe(false);
    expect(response.data?.version).toBe('command-eve-status-surface-bridge/v0');
    expect(response.data?.status).toBe('blocked');
    expect(response.data?.surface?.schema_version).toBe('command-eve-status-surface/v0');
    expect(response.data?.surface?.status).toBe('BLOCK');
    expect(response.data?.surface?.empty_states ?? []).toContain('event_ledger_missing');
    expect(response.data?.surface?.blocked_actions ?? []).toContain('worker_dispatch');
  });
});
