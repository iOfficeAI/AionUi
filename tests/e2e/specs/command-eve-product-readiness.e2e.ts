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
};

type AgentRecord = {
  id?: string;
  name?: string;
  agent_type?: string;
  backend?: string;
  command?: string;
  handshake?: {
    available_models?: {
      current_model_id?: string;
      current_model_label?: string;
      available_models?: Array<{ id?: string; label?: string }>;
    };
  };
};

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

test.describe('Command EVE product readiness', () => {
  test.setTimeout(240_000);

  test('boots EVE on Hermes with local Gemma tiers exposed', async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });
    const status = await ensureRuntimeReady(page);

    expect(status.status).toBe('ready');
    expect(status.provider).toBe('ollama');
    expect(status.default_model).toContain('command-eve-gemma4-e4b');

    const assistants = await httpGet<AssistantRecord[]>(page, '/api/assistants');
    const eve = assistants.find((assistant) => assistant.id === COMMAND_EVE_ASSISTANT_ID);
    expect(eve).toMatchObject({
      id: COMMAND_EVE_ASSISTANT_ID,
      name: 'EVE',
      preset_agent_type: 'hermes',
    });

    const agents = await httpGet<AgentRecord[]>(page, '/api/agents');
    const hermes = agents.find((agent) => (agent.backend || agent.agent_type) === 'hermes');
    expect(hermes, 'Hermes agent must be registered in the packaged app').toBeTruthy();
    expect(hermes?.command).toBe('hermes');

    const models = hermes?.handshake?.available_models;
    const modelIds = (models?.available_models || []).map((model) => model.id || model.label || '');
    expect(models?.current_model_id).toContain('command-eve-gemma4-e4b');
    expect(modelIds).toContain('custom:command-eve-gemma4-e4b-64k:latest');
    expect(modelIds).toContain('custom:command-eve-gemma4-12b-64k:latest');
  });

  test('persists German first-run rules plus Command EVE skills and connector catalog', async ({ page }) => {
    await page.waitForSelector('body', { state: 'visible' });
    await ensureRuntimeReady(page);

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
