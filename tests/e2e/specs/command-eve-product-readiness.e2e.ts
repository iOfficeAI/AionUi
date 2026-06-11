/**
 * Command EVE product readiness – packaged app E2E.
 *
 * Verifies the installed desktop shell exposes the Command EVE runtime truth:
 * EVE is bound to Hermes, local Gemma model tiers are visible, and the
 * first-run Chief-of-Staff context carries the Command EVE skills/connectors.
 */
import { test, expect } from '../fixtures';
import { httpGet, httpPost } from '../helpers/httpBridge';
import { invokeBridge } from '../helpers/bridge/invoke';
import { goToGuid } from '../helpers/navigation';
import { COMMAND_EVE_ASSISTANT_ID } from '@/common/config/commandEveShell';

type RuntimeStatusResponse = {
  success?: boolean;
  msg?: string;
  data?: RuntimeStatus;
};

type RuntimeStatus = {
  status?: string;
  default_model?: string;
  provider?: string;
  next_action?: string;
};

type AssistantRecord = {
  id: string;
  name: string;
  preset_agent_type: string;
  enabled_skills?: string[];
  custom_skill_names?: string[];
};

type AgentRecord = {
  id?: string;
  name?: string;
  agent_type?: string;
  backend?: string;
  command?: string;
};

type AssistantReadinessResponse = {
  success?: boolean;
  msg?: string;
  data?: {
    status?: string;
    assistant_id?: string;
    preset_agent_type?: string;
    enabled_skills?: string[];
    custom_skill_names?: string[];
    skill_count?: number;
  };
};

const COMMAND_EVE_ACTIVE_SKILLS = [
  'first-run-company-discovery',
  'system-inventory',
  'connector-setup',
  'memory-ledger-setup',
  'goal-materialization',
];

async function runtimeStatus(page: Parameters<typeof invokeBridge>[0]): Promise<RuntimeStatus> {
  const response = await invokeBridge<RuntimeStatusResponse>(page, 'command-eve.runtime-status', undefined, 15_000);
  expect(response.success, response.msg || 'Command EVE runtime status failed').toBe(true);
  expect(response.data).toBeTruthy();
  return response.data!;
}

async function ensureRuntimeReady(page: Parameters<typeof invokeBridge>[0]): Promise<RuntimeStatus> {
  const initial = await runtimeStatus(page);
  if (initial.status === 'ready') return initial;

  const ensured = await invokeBridge<RuntimeStatusResponse>(
    page,
    'command-eve.ensure-local-model-tier',
    { tierId: 'e4b' },
    180_000
  );
  expect(ensured.success, ensured.msg || ensured.data?.next_action || 'Command EVE runtime ensure failed').toBe(true);
  expect(ensured.data?.status).toBe('ready');
  return ensured.data!;
}

async function ensureEveAssistantReady(page: Parameters<typeof invokeBridge>[0]): Promise<void> {
  const ensured = await invokeBridge<AssistantReadinessResponse>(
    page,
    'command-eve.ensure-assistant',
    undefined,
    90_000
  );
  expect(ensured.success, ensured.msg || 'Command EVE assistant readiness failed').toBe(true);
  expect(ensured.data?.status).toBe('ready');
  expect(ensured.data?.assistant_id).toBe(COMMAND_EVE_ASSISTANT_ID);
  expect(ensured.data?.preset_agent_type).toBe('hermes');
  expect(ensured.data?.enabled_skills || []).toEqual(expect.arrayContaining(COMMAND_EVE_ACTIVE_SKILLS));
}

async function loadEveAssistant(page: Parameters<typeof httpGet>[0]): Promise<AssistantRecord | undefined> {
  const assistants = await httpGet<AssistantRecord[]>(page, '/api/assistants');
  return assistants.find((assistant) => assistant.id === COMMAND_EVE_ASSISTANT_ID);
}

async function waitForEveAssistantWithSkills(page: Parameters<typeof httpGet>[0]): Promise<AssistantRecord> {
  let eve: AssistantRecord | undefined;
  await expect
    .poll(
      async () => {
        eve = await loadEveAssistant(page);
        return eve?.enabled_skills || [];
      },
      {
        timeout: 15_000,
        message: 'EVE assistant should reconcile Command EVE managed skills before product readiness checks',
      }
    )
    .toEqual(expect.arrayContaining(COMMAND_EVE_ACTIVE_SKILLS));

  expect(eve).toBeTruthy();
  return eve!;
}

test.describe('Command EVE product readiness', () => {
  test.setTimeout(240_000);

  test('boots EVE on Hermes with local Gemma tiers exposed', async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });
    await goToGuid(page);
    const status = await ensureRuntimeReady(page);
    await ensureEveAssistantReady(page);

    expect(status.status).toBe('ready');
    expect(status.provider).toBe('ollama');
    expect(status.default_model).toContain('command-eve-gemma4-e4b');

    const eve = await waitForEveAssistantWithSkills(page);
    expect(eve).toMatchObject({
      id: COMMAND_EVE_ASSISTANT_ID,
      name: 'EVE',
      preset_agent_type: 'hermes',
    });
    expect(eve.enabled_skills).toEqual(expect.arrayContaining(COMMAND_EVE_ACTIVE_SKILLS));

    const agents = await httpGet<AgentRecord[]>(page, '/api/agents');
    const hermes = agents.find((agent) => (agent.backend || agent.agent_type) === 'hermes');
    expect(hermes, 'Hermes agent must be registered in the packaged app').toBeTruthy();
    expect(hermes?.command).toBe('hermes');

    const modelSelector = page.getByTestId('guid-model-selector');
    await expect(modelSelector).toContainText('Gemma 4 E4B');
    await modelSelector.click();
    const modelMenu = page.getByRole('menu');
    await expect(modelMenu.getByText('Gemma 4 E4B')).toBeVisible();
    await expect(modelMenu.getByText('Gemma 4 12B')).toBeVisible();
    await expect(modelMenu.getByText('Gemma 4 31B')).toBeVisible();
  });

  test('persists German first-run rules plus Command EVE skills and connector catalog', async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });
    await goToGuid(page);
    await ensureRuntimeReady(page);
    await ensureEveAssistantReady(page);

    const germanRule = await httpPost<string>(page, '/api/skills/assistant-rule/read', {
      assistant_id: COMMAND_EVE_ASSISTANT_ID,
      locale: 'de-DE',
    });
    expect(germanRule).toContain('Du bist EVE');
    expect(germanRule).toContain('Deutsch und per Du');
    expect(germanRule).toContain('Du setzt keine Plane-Items auf Done');

    const germanSkill = await httpPost<string>(page, '/api/skills/assistant-skill/read', {
      assistant_id: COMMAND_EVE_ASSISTANT_ID,
      locale: 'de-DE',
    });
    expect(germanSkill).toContain('Lokaler First-Run-Kontext');
    expect(germanSkill).toContain('content-machine');
    expect(germanSkill).toContain('video-first-content-engine');
    expect(germanSkill).toContain('Connector installed: local-command-eve-runtime');
    expect(germanSkill).toContain('Connector needs_auth: github-gitnexus');
    expect(germanSkill).toContain('Skills installiert: 14; Connector Policies: 18');
    expect(germanSkill).toContain('Connector gated: macos-desktop-observation');
    expect(germanSkill).toContain('marketing-publishing-stack');
  });
});
