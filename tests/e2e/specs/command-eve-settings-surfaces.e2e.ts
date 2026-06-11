/**
 * Command EVE settings surfaces – packaged app E2E.
 *
 * Protects the product shell from regressing back into a generic AionUI setup:
 * local Gemma tiers must be visible, EVE runtime controls must be present,
 * Hermes must remain the primary runtime identity, and Command EVE capabilities
 * must replace the legacy/global skill-market surface.
 */
import { test, expect } from '../fixtures';
import { goToSettings } from '../helpers';

test.describe('Command EVE settings surfaces', () => {
  test.setTimeout(120_000);

  test('shows local Gemma tiers plus EVE runtime status and warmup controls', async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });

    await goToSettings(page, 'model');
    await expect(page.getByText('Command EVE Local Runtime')).toBeVisible();
    await expect(page.getByText('Hermes + Ollama')).toBeVisible();
    await expect(page.getByTestId('command-eve-model-support-note')).toContainText(
      /Command EVE nutzt Hermes lokal|Command EVE uses Hermes locally/
    );
    await expect(
      page.getByText(/Derzeit unterstützt nur Aion CLI|Only Aion CLI currently supports custom models/)
    ).toHaveCount(0);

    const e4b = page.getByTestId('command-eve-model-tier-gemma-4-e4b-local-default');
    await expect(e4b).toContainText('E4B');
    await expect(e4b).toContainText('custom:command-eve-gemma4-e4b-64k:latest');
    await expect(e4b.getByTestId('command-eve-model-tier-select-gemma-4-e4b-local-default')).toBeVisible();

    const twelveB = page.getByTestId('command-eve-model-tier-gemma-4-12b-local-planning');
    await expect(twelveB).toContainText('12B');
    await expect(twelveB).toContainText('custom:command-eve-gemma4-12b-64k:latest');
    await expect(twelveB.getByTestId('command-eve-model-tier-select-gemma-4-12b-local-planning')).toBeVisible();

    const thirtyOneB = page.getByTestId('command-eve-model-tier-gemma-4-31b-local-pro');
    await expect(thirtyOneB).toContainText('31B');
    await expect(thirtyOneB).toContainText('custom:command-eve-gemma4-31b-64k:latest');

    await goToSettings(page, 'system');
    const statusRow = page.getByTestId('system-preference-commandEveRuntimeStatus');
    await expect(statusRow).toContainText(/EVE-Aktivitätsstatus anzeigen|Show EVE activity status/);
    await expect(statusRow.locator('.arco-switch')).toBeVisible();

    const warmupRow = page.getByTestId('system-preference-commandEveModelWarmup');
    await expect(warmupRow).toContainText(/Lokales EVE-Modell vorwärmen|Pre-warm local EVE model/);
    await expect(warmupRow).toContainText(/keine Cloud-Anbieter|cloud providers are not pinged/);
    await expect(warmupRow.locator('.arco-switch')).toBeVisible();
  });

  test('keeps Hermes as EVE runtime identity and hides legacy Aion CLI cards', async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });

    await goToSettings(page, 'agent');
    await expect(page.getByText(/EVE-Orchestrierung|EVE Orchestration/)).toBeVisible();
    await expect(
      page.getByText(/EVE nutzt Hermes als Standard-Runtime|EVE uses Hermes as the default runtime/)
    ).toBeVisible();
    await expect(page.getByText(/^Hermes$/).first()).toBeVisible();
    await expect(page.getByText(/^Aion CLI$/)).toHaveCount(0);
  });

  test('shows Command EVE capability catalog and suppresses legacy/global skill-market sections', async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });

    await goToSettings(page, 'capabilities');
    const section = page.getByTestId('command-eve-capability-section');
    await expect(section).toBeVisible();
    await expect(section).toContainText(/Command-EVE-Fähigkeiten|Command EVE capabilities/);
    await expect(section).toContainText('Content Machine');
    await expect(section).toContainText('Video-first Content Engine');
    await expect(section).toContainText(/Connector-Policies|Connector policies/);
    await expect(section).toContainText(/Local Command EVE runtime/i);
    await expect(section).toContainText('GitHub + GitNexus');
    await expect(section).toContainText(/Desktop observation/i);

    await expect(page.getByTestId('extension-skills-section')).toHaveCount(0);
    await expect(page.getByTestId('auto-skills-section')).toHaveCount(0);
    await expect(page.getByText('xiaohongshu-recruiter')).toHaveCount(0);
    await expect(page.getByText('weixin-file-send')).toHaveCount(0);
  });

  test('scopes the EVE assistant editor to Command EVE managed skills', async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });

    await goToSettings(page, 'assistants');
    const eveCard = page.getByTestId('assistant-card-command-eve-chief-of-staff');
    await expect(eveCard).toBeVisible({ timeout: 30_000 });
    await eveCard.click();

    const drawer = page.getByTestId('assistant-edit-drawer');
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByTestId('command-eve-managed-skills-note')).toBeVisible();
    await expect(drawer).toContainText('first-run-company-discovery', { timeout: 30_000 });
    await expect(drawer).toContainText('goal-materialization');
    await expect(drawer.getByText(/Integrierte Skills|Builtin Skills/)).toHaveCount(0);
    await expect(drawer.getByText(/Automatisch eingefügte Skills|Auto-injected Skills/)).toHaveCount(0);
    await expect(drawer.getByText('xiaohongshu-recruiter')).toHaveCount(0);
    await expect(drawer.getByText('weixin-file-send')).toHaveCount(0);
    await expect(drawer.getByText('aionui-skills')).toHaveCount(0);
  });
});
