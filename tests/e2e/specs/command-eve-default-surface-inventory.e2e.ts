/**
 * Command EVE default surface inventory.
 *
 * Protects the managed operator shell from exposing raw Hermes power surfaces
 * in the default navigation. The product can still use Hermes under the hood,
 * but first-run users should see governed Command EVE routes and actions.
 */
import { test, expect, type Page } from '../fixtures';
import { goToGuid, goToSettings } from '../helpers';

const FORBIDDEN_DEFAULT_SURFACES = [
  {
    id: 'raw-hermes-chat',
    patterns: [/raw\s+hermes\s+chat/i, /^hermes\s+chat$/i],
  },
  {
    id: 'raw-hermes-config-api-key-editor',
    patterns: [
      /raw\s+hermes\s+(config|configuration)/i,
      /hermes\s+api[-\s]?key\s+editor/i,
      /hermes\s+api[-\s]?schl[uü]ssel\s+editor/i,
    ],
  },
  {
    id: 'raw-mcp-add',
    patterns: [/raw\s+mcp\s+add/i, /hermes\s+mcp\s+(add|hinzuf[uü]gen)/i],
  },
  {
    id: 'raw-pairing',
    patterns: [/raw\s+pairing/i, /hermes\s+pairing/i, /hermes\s+kopplung/i],
  },
  {
    id: 'achievements',
    patterns: [/^achievements$/i, /^errungenschaften$/i, /hermes\s+achievements/i],
  },
  {
    id: 'raw-cron',
    patterns: [/raw\s+cron/i, /hermes\s+cron/i, /cron\s+gateway/i],
  },
  {
    id: 'dispatcher-auto-spawn',
    patterns: [/dispatcher\s+auto[-\s]?spawn/i, /auto[-\s]?spawn\s+dispatcher/i, /dispatch\s+in\s+gateway/i],
  },
] as const;

async function collectDefaultSurfaceLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selectors = [
      'aside',
      'nav',
      '[class*="sider"]',
      '[data-settings-path]',
      '[data-testid^="agent-pill-"]',
      '[data-testid^="command-eve"]',
      'button',
      'a',
    ];

    const labels = new Set<string>();
    for (const element of document.querySelectorAll(selectors.join(','))) {
      const text = element.textContent?.replace(/\s+/g, ' ').trim();
      if (text) labels.add(text);

      const aria = element.getAttribute('aria-label')?.replace(/\s+/g, ' ').trim();
      if (aria) labels.add(aria);

      const title = element.getAttribute('title')?.replace(/\s+/g, ' ').trim();
      if (title) labels.add(title);
    }

    return Array.from(labels);
  });
}

function expectNoForbiddenSurface(labels: string[]): void {
  const joinedLabels = labels.join('\n');
  for (const surface of FORBIDDEN_DEFAULT_SURFACES) {
    for (const pattern of surface.patterns) {
      expect(joinedLabels, `Default navigation must not expose ${surface.id}`).not.toMatch(pattern);
    }
  }
}

test.describe('Command EVE default surface inventory', () => {
  test.setTimeout(120_000);

  test('keeps raw Hermes power tabs out of the default navigation', async ({ page }) => {
    await goToGuid(page);
    await expect(page.getByTestId('layout-sider-brand-label')).toHaveText('EVE', { timeout: 30_000 });
    expectNoForbiddenSurface(await collectDefaultSurfaceLabels(page));

    await goToSettings(page, 'agent');
    await expect(page.getByText(/EVE-Orchestrierung|EVE Orchestration/)).toBeVisible({ timeout: 30_000 });
    expectNoForbiddenSurface(await collectDefaultSurfaceLabels(page));

    await goToSettings(page, 'capabilities');
    await expect(page.getByTestId('command-eve-capability-section')).toBeVisible({ timeout: 30_000 });
    expectNoForbiddenSurface(await collectDefaultSurfaceLabels(page));

    await goToSettings(page, 'system');
    await expect(page.getByText(/EVE-Aktivitätsstatus anzeigen|Show EVE activity status/)).toBeVisible({
      timeout: 30_000,
    });
    expectNoForbiddenSurface(await collectDefaultSurfaceLabels(page));
  });
});
