/**
 * Assistant Settings Conversation Defaults — E2E tests.
 *
 * Covers:
 * - fixed assistant defaults are materialized into conversation_assistant_snapshots on create
 * - auto assistant defaults persist the first conversation selection into both snapshot and assistant_preferences
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { ElectronApplication, Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import {
  clickCreateAssistant,
  fillAssistantName,
  getVisibleAssistantIds,
  goToAssistantSettings,
  goToGuid,
  httpInvoke,
  httpDelete,
  httpGet,
  resetGuidLastSelectedAgent,
  saveAssistant,
  sendMessageFromGuid,
  waitForAssistantEditorClose,
} from '../helpers';
import { CHAT_INPUT } from '../helpers/selectors';
import { goToNewChat, waitForAiReply } from '../helpers/conversation';
import { getAionrsTestModels, type TProviderWithModel } from '../helpers/chatAionrs';

type AssistantDetail = {
  id: string;
  engine: {
    agent_backend: string;
  };
  defaults: {
    model: { mode: 'auto' | 'fixed'; value?: string };
    permission: { mode: 'auto' | 'fixed'; value?: string };
    skills: { mode: 'auto' | 'fixed'; value: string[] };
    mcps: { mode: 'auto' | 'fixed'; value: string[] };
  };
};

type SkillRecord = {
  name: string;
};

type McpRecord = {
  id: string;
  name: string;
  enabled?: boolean;
};

type SnapshotRow = {
  default_model_mode: 'auto' | 'fixed';
  resolved_model_id: string | null;
  default_permission_mode: 'auto' | 'fixed';
  resolved_permission_value: string | null;
  default_skills_mode: 'auto' | 'fixed';
  resolved_skill_ids: string[];
  default_mcps_mode: 'auto' | 'fixed';
  resolved_mcp_ids: string[];
};

type PreferenceRow = {
  last_model_id: string | null;
  last_permission_value: string | null;
  last_skill_ids: string[];
  last_mcp_ids: string[];
};

type ConversationUiState = {
  modelLabel: string;
  modeValue: string;
};

type ConversationCreatePayload = {
  type: string;
  model?: unknown;
  name?: string | null;
  assistant?: {
    id: string;
    locale?: string;
    conversation_overrides?: {
      model?: string;
      permission?: string;
      skill_ids?: string[];
      disabled_builtin_skill_ids?: string[];
      mcp_ids?: string[];
    };
  };
  extra: {
    selected_mcp_server_ids?: string[];
    selected_session_mcp_servers?: Array<{ id: string; name: string }>;
  };
};

type EnsuredAionrsModels = {
  cleanupProviderId: string | null;
  modelA: TProviderWithModel;
  modelB: TProviderWithModel | null;
};

async function openSettingsSelect(page: Page, testId: string): Promise<void> {
  await page.locator(`[data-testid="${testId}"]`).click();
  await page
    .locator('.arco-select-option, .arco-trigger-popup button')
    .first()
    .waitFor({ state: 'visible', timeout: 5_000 });
}

async function findAssistantIdByName(page: Page, name: string): Promise<string | null> {
  for (const id of await getVisibleAssistantIds(page)) {
    const cardText = await page.locator(`[data-testid="assistant-card-${id}"]`).textContent();
    if (cardText?.includes(name)) {
      return id;
    }
  }
  return null;
}

async function ensureAionrsTestModels(page: Page): Promise<EnsuredAionrsModels> {
  const existing = await getAionrsTestModels(page);
  if (existing?.modelA) {
    return {
      cleanupProviderId: null,
      modelA: existing.modelA,
      modelB: existing.modelB,
    };
  }

  const providerId = `e2e-provider-${Date.now()}`;
  const models = ['e2e-model-a', 'e2e-model-b'];
  const created = await httpInvoke<{
    id: string;
    name: string;
    platform: string;
    base_url: string;
    api_key?: string;
    models: string[];
    enabled?: boolean;
  }>(page, 'POST', '/api/providers', {
    id: providerId,
    platform: 'new-api',
    name: `E2E Provider ${Date.now()}`,
    base_url: 'https://api.example.com/v1',
    api_key: 'sk-e2e-test',
    models,
    enabled: true,
  });

  return {
    cleanupProviderId: created.id,
    modelA: {
      ...created,
      baseUrl: created.base_url,
      apiKey: created.api_key,
      model: created.models,
      useModel: models[0],
    },
    modelB: {
      ...created,
      baseUrl: created.base_url,
      apiKey: created.api_key,
      model: created.models,
      useModel: models[1],
    },
  };
}

async function getUserDataPath(electronApp: ElectronApplication): Promise<string> {
  return electronApp.evaluate(async ({ app }) => app.getPath('userData'));
}

function querySqliteJson<T>(dbPath: string, sql: string): T {
  const out = execFileSync('sqlite3', ['-readonly', dbPath, sql], { encoding: 'utf8' }).trim();
  if (!out) {
    throw new Error(`Expected sqlite row for query: ${sql}`);
  }
  return JSON.parse(out) as T;
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''");
}

function querySnapshotByConversationId(dbPath: string, conversationId: string): SnapshotRow {
  const id = escapeSql(conversationId);
  return querySqliteJson<SnapshotRow>(
    dbPath,
    `
      SELECT json_object(
        'default_model_mode', default_model_mode,
        'resolved_model_id', resolved_model_id,
        'default_permission_mode', default_permission_mode,
        'resolved_permission_value', resolved_permission_value,
        'default_skills_mode', default_skills_mode,
        'resolved_skill_ids', json(resolved_skill_ids),
        'default_mcps_mode', default_mcps_mode,
        'resolved_mcp_ids', json(resolved_mcp_ids)
      )
      FROM conversation_assistant_snapshots
      WHERE conversation_id = '${id}'
    `
  );
}

function queryPreferencesByAssistantKey(dbPath: string, assistantKey: string): PreferenceRow {
  const key = escapeSql(assistantKey);
  return querySqliteJson<PreferenceRow>(
    dbPath,
    `
      SELECT json_object(
        'last_model_id', last_model_id,
        'last_permission_value', last_permission_value,
        'last_skill_ids', json(last_skill_ids),
        'last_mcp_ids', json(last_mcp_ids)
      )
      FROM assistant_preferences p
      JOIN assistant_definitions d ON d.definition_id = p.definition_id
      WHERE d.assistant_key = '${key}'
    `
  );
}

function queryOptionalPreferencesByAssistantKey(dbPath: string, assistantKey: string): PreferenceRow | null {
  const key = escapeSql(assistantKey);
  const out = execFileSync(
    'sqlite3',
    [
      '-readonly',
      dbPath,
      `
        SELECT json_object(
          'last_model_id', last_model_id,
          'last_permission_value', last_permission_value,
          'last_skill_ids', json(last_skill_ids),
          'last_mcp_ids', json(last_mcp_ids)
        )
        FROM assistant_preferences p
        JOIN assistant_definitions d ON d.definition_id = p.definition_id
        WHERE d.assistant_key = '${key}'
      `,
    ],
    { encoding: 'utf8' }
  ).trim();

  if (!out) {
    return null;
  }

  return JSON.parse(out) as PreferenceRow;
}

async function pickFirstFixedOption(page: Page, testId: string): Promise<void> {
  await openSettingsSelect(page, testId);
  const options = page.locator('.arco-select-option');
  const count = await options.count();
  if (count < 2) {
    throw new Error(`No fixed option available for ${testId}`);
  }
  await options.nth(1).click();
}

async function selectFixedSkill(page: Page, skillName: string): Promise<void> {
  await openSettingsSelect(page, 'select-assistant-default-skills');
  await page.locator('.arco-select-option').filter({ hasText: skillName }).first().click();
  await page.keyboard.press('Escape');
}

async function selectFixedMcp(page: Page, mcpName: string): Promise<void> {
  await openSettingsSelect(page, 'select-assistant-default-mcp');
  await page.locator('.arco-select-option').filter({ hasText: mcpName }).first().click();
  await page.keyboard.press('Escape');
}

async function selectGuidAssistant(page: Page, assistantId: string): Promise<void> {
  await resetGuidLastSelectedAgent(page);
  await goToGuid(page);
  await page.reload();
  await page.locator(`[data-testid="preset-pill-${assistantId}"]`).click();
  // Assistant defaults are applied asynchronously after the preset pill flips
  // selected and the detail cache resolves. Give the Guid page one settle pass
  // before interacting with model/mode/skills/MCP controls.
  await page.waitForTimeout(1_000);
}

async function ensureGuidModelSelection(page: Page): Promise<void> {
  const modelButton = page.locator('button.sendbox-model-btn.guid-config-btn');
  const currentLabel = ((await modelButton.textContent()) ?? '').trim();

  await modelButton.click();
  const options = page.locator(
    '.arco-trigger-popup:visible [role="menuitem"], .arco-trigger-popup:visible .arco-dropdown-menu-item'
  );
  const count = await options.count();

  for (let i = 0; i < count; i++) {
    const label = ((await options.nth(i).textContent()) ?? '').trim();
    if (label && label !== currentLabel) {
      await options.nth(i).click();
      await expect(modelButton).not.toContainText(currentLabel);
      return;
    }
  }

  await page.keyboard.press('Escape');
}

async function pickAlternateGuidMode(page: Page): Promise<string> {
  const selector = page.locator('[data-testid="mode-selector"]');
  const currentMode = (await selector.getAttribute('data-current-mode')) ?? '';

  await selector.click();
  const modeItems = page.locator('[data-mode-value]');
  const count = await modeItems.count();

  for (let i = 0; i < count; i++) {
    const nextMode = (await modeItems.nth(i).getAttribute('data-mode-value')) ?? '';
    if (nextMode && nextMode !== currentMode) {
      await modeItems.nth(i).click();
      await expect(selector).toHaveAttribute('data-current-mode', nextMode, { timeout: 5_000 });
      return nextMode;
    }
  }

  throw new Error('No alternate Guid mode option available');
}

async function openGuidPlusDropdown(page: Page): Promise<void> {
  const plusButton = page.locator('[data-testid="file-upload-btn"]');
  const dropdownMenu = page.locator('.arco-dropdown-menu').last();

  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="file-upload-btn"]');
    const trigger = button?.parentElement;
    if (!trigger) {
      throw new Error('Guid plus dropdown trigger not found');
    }
    ['mouseenter', 'mouseover', 'mousemove'].forEach((type) => {
      trigger.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
  });
  try {
    await dropdownMenu.waitFor({ state: 'visible', timeout: 1_500 });
    return;
  } catch {
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="file-upload-btn"]');
      const trigger = button?.parentElement;
      if (!trigger) {
        throw new Error('Guid plus dropdown trigger not found');
      }
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
    await dropdownMenu.waitFor({ state: 'visible', timeout: 5_000 });
  }
}

async function sendGuidMessageCapturingCreateRequest(
  page: Page,
  message: string
): Promise<{ conversationId: string; payload: ConversationCreatePayload }> {
  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      request.url().includes('/api/conversations') &&
      !request.url().includes('/api/conversations/clone')
  );

  const [request, conversationId] = await Promise.all([requestPromise, sendMessageFromGuid(page, message)]);
  const payload = request.postDataJSON() as ConversationCreatePayload;

  return {
    conversationId,
    payload,
  };
}

async function toggleGuidSkill(page: Page, skillName: string): Promise<void> {
  await openGuidPlusDropdown(page);
  await page
    .getByText(/Skills \(\d+\/\d+\)|技能 \(\d+\/\d+\)/)
    .first()
    .hover();
  const checkbox = page.locator('.arco-checkbox').filter({ hasText: skillName }).first();
  await checkbox.waitFor({ state: 'visible', timeout: 5_000 });
  await checkbox.click();
}

async function toggleGuidMcp(page: Page, mcpName: string): Promise<void> {
  await openGuidPlusDropdown(page);
  await page
    .getByText(/MCP \(\d+\/\d+\)/)
    .first()
    .hover();
  const checkbox = page.locator('.arco-checkbox').filter({ hasText: mcpName }).first();
  await checkbox.waitFor({ state: 'visible', timeout: 5_000 });
  await checkbox.click();
}

function normalizeUiText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function locateConversationModelButton(page: Page) {
  return page
    .locator('[data-testid="aionrs-model-selector"], [data-testid="chat-model-selector"], .header-model-btn')
    .first();
}

async function selectGuidModelByLabel(page: Page, modelLabel: string): Promise<void> {
  const button = page.locator('[data-testid="guid-model-selector"], button.sendbox-model-btn.guid-config-btn').first();
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  await button.click();

  const option = page
    .locator('.arco-dropdown-menu:visible .arco-dropdown-menu-item')
    .filter({ hasText: modelLabel })
    .first();
  await option.waitFor({ state: 'visible', timeout: 5_000 });
  await option.click();

  await expect.poll(async () => normalizeUiText(await button.textContent()), { timeout: 5_000 }).toContain(modelLabel);
}

async function captureConversationUiState(page: Page): Promise<ConversationUiState> {
  const modelButton = locateConversationModelButton(page);
  await modelButton.waitFor({ state: 'visible', timeout: 10_000 });

  const modeSelector = page.locator('[data-testid="mode-selector"]').first();
  await modeSelector.waitFor({ state: 'visible', timeout: 10_000 });

  const modelLabel = normalizeUiText(await modelButton.textContent());
  const modeValue =
    (await modeSelector.getAttribute('data-current-mode')) ?? normalizeUiText(await modeSelector.textContent());

  return {
    modelLabel,
    modeValue,
  };
}

async function queryConversationLoadedState(
  page: Page,
  conversationId: string
): Promise<{ skillIds: string[]; mcpIds: string[] }> {
  const conversation = await httpGet<{ extra?: { skills?: string[]; mcp_statuses?: Array<{ id?: string }> } }>(
    page,
    `/api/conversations/${conversationId}`
  );
  return {
    skillIds: conversation.extra?.skills ?? [],
    mcpIds: (conversation.extra?.mcp_statuses ?? []).map((item) => item.id).filter((id): id is string => Boolean(id)),
  };
}

async function switchConversationMode(page: Page): Promise<string> {
  const selector = page.locator('[data-testid="mode-selector"]').first();
  const currentMode = (await selector.getAttribute('data-current-mode')) ?? '';
  const trigger = page.locator('[data-testid^="agent-mode-selector-"]').first();
  await trigger.click();

  const modeItems = page.locator('[data-mode-value]');
  const count = await modeItems.count();
  for (let i = 0; i < count; i++) {
    const item = modeItems.nth(i);
    const nextMode = (await item.getAttribute('data-mode-value')) ?? '';
    if (nextMode && nextMode !== currentMode) {
      await item.click();
      await expect(selector).toHaveAttribute('data-current-mode', nextMode, { timeout: 5_000 });
      return nextMode;
    }
  }

  throw new Error('No alternate conversation mode option available');
}

async function sendConversationMessage(page: Page, message: string): Promise<void> {
  const input = page.locator(CHAT_INPUT).first();
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(message);
  await input.press('Enter');
}

async function reopenConversationFromHistory(page: Page, conversationId: string): Promise<void> {
  await goToNewChat(page);
  const historyRow = page.locator(`#c-${conversationId}`).first();
  if (await historyRow.isVisible().catch(() => false)) {
    await historyRow.click();
  } else {
    await page.evaluate((id) => {
      window.location.assign(`#/conversation/${id}`);
    }, conversationId);
  }

  await page.waitForFunction((id) => window.location.hash === `#/conversation/${id}`, conversationId, {
    timeout: 15_000,
  });
}

test.describe('Assistant Settings Conversation Defaults', () => {
  test.setTimeout(120_000);

  test('fixed defaults are written into conversation assistant snapshots on create', async ({ page, electronApp }) => {
    const assistantName = `Fixed Snapshot ${Date.now()}`;

    await goToAssistantSettings(page);
    const skills = await httpGet<SkillRecord[]>(page, '/api/skills');
    const mcps = await httpGet<McpRecord[]>(page, '/api/mcp/servers');
    const firstSkill = skills[0];
    const firstMcp = mcps.find((item) => item.enabled !== false) ?? mcps[0];

    test.skip(!firstSkill, 'No user skills available for fixed snapshot test');
    test.skip(!firstMcp, 'No MCP servers available for fixed snapshot test');
    if (!firstSkill || !firstMcp) return;

    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);
    await pickFirstFixedOption(page, 'select-assistant-default-model');
    await pickFirstFixedOption(page, 'select-assistant-default-permission');
    await selectFixedSkill(page, firstSkill.name);
    await selectFixedMcp(page, firstMcp.name);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, assistantName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    const detail = await httpGet<AssistantDetail>(page, `/api/assistants/${assistantId}?locale=en-US`);
    expect(detail.defaults.mcps.mode).toBe('fixed');
    expect(detail.defaults.mcps.value).toContain(firstMcp.id);

    await selectGuidAssistant(page, assistantId);
    await openGuidPlusDropdown(page);
    await expect(page.getByText(/MCP \(1\/\d+\)/)).toBeVisible();
    const { conversationId, payload } = await sendGuidMessageCapturingCreateRequest(page, 'fixed defaults snapshot');

    try {
      expect(payload.assistant?.conversation_overrides?.mcp_ids).toContain(firstMcp.id);

      const userDataPath = await getUserDataPath(electronApp);
      const dbPath = path.join(userDataPath, 'aionui', 'aionui-backend.db');
      const snapshot = querySnapshotByConversationId(dbPath, conversationId);

      expect(snapshot.default_model_mode).toBe('fixed');
      expect(snapshot.resolved_model_id).toBe(detail.defaults.model.value ?? null);
      expect(snapshot.default_permission_mode).toBe('fixed');
      expect(snapshot.resolved_permission_value).toBe(detail.defaults.permission.value ?? null);
      expect(snapshot.default_skills_mode).toBe('fixed');
      expect(snapshot.resolved_skill_ids).toContain(firstSkill.name);
      expect(snapshot.default_mcps_mode).toBe('fixed');
      expect(snapshot.resolved_mcp_ids).toContain(firstMcp.id);
    } finally {
      await httpDelete(page, `/api/conversations/${conversationId}`).catch(() => {});
      await httpDelete(page, `/api/assistants/${assistantId}`).catch(() => {});
    }
  });

  test('auto defaults persist guid selections into snapshot and assistant preferences on create', async ({
    page,
    electronApp,
  }) => {
    const assistantName = `Auto Snapshot ${Date.now()}`;

    await goToAssistantSettings(page);
    const skills = await httpGet<SkillRecord[]>(page, '/api/skills');
    const mcps = await httpGet<McpRecord[]>(page, '/api/mcp/servers');
    const firstSkill = skills[0];
    const firstMcp = mcps.find((item) => item.enabled !== false) ?? mcps[0];

    test.skip(!firstSkill, 'No user skills available for auto snapshot test');
    test.skip(!firstMcp, 'No MCP servers available for auto snapshot test');
    if (!firstSkill || !firstMcp) return;

    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, assistantName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    await httpInvoke(page, 'PUT', `/api/assistants/${assistantId}`, {
      id: assistantId,
      defaults: {
        skills: {
          mode: 'auto',
          value: [],
        },
        mcps: {
          mode: 'auto',
          value: [],
        },
      },
    });

    await selectGuidAssistant(page, assistantId);
    await openGuidPlusDropdown(page);
    await ensureGuidModelSelection(page);
    const selectedMode = await pickAlternateGuidMode(page);
    await toggleGuidSkill(page, firstSkill.name);
    await toggleGuidMcp(page, firstMcp.name);

    const { conversationId, payload } = await sendGuidMessageCapturingCreateRequest(page, 'auto defaults snapshot');

    try {
      expect(payload.assistant?.conversation_overrides?.skill_ids).toContain(firstSkill.name);
      expect(payload.assistant?.conversation_overrides?.mcp_ids).toContain(firstMcp.id);

      const userDataPath = await getUserDataPath(electronApp);
      const dbPath = path.join(userDataPath, 'aionui', 'aionui-backend.db');
      const snapshot = querySnapshotByConversationId(dbPath, conversationId);
      const preferences = queryPreferencesByAssistantKey(dbPath, assistantId);

      expect(snapshot.default_model_mode).toBe('auto');
      expect(snapshot.resolved_model_id).toBeTruthy();
      expect(preferences.last_model_id).toBe(snapshot.resolved_model_id);

      expect(snapshot.default_permission_mode).toBe('auto');
      expect(snapshot.resolved_permission_value).toBe(selectedMode);
      expect(preferences.last_permission_value).toBe(selectedMode);

      expect(snapshot.default_skills_mode).toBe('auto');
      expect(snapshot.resolved_skill_ids).toContain(firstSkill.name);
      expect(preferences.last_skill_ids).toContain(firstSkill.name);

      expect(snapshot.default_mcps_mode).toBe('auto');
      expect(snapshot.resolved_mcp_ids).toContain(firstMcp.id);
      expect(preferences.last_mcp_ids).toContain(firstMcp.id);
    } finally {
      await httpDelete(page, `/api/conversations/${conversationId}`).catch(() => {});
      await httpDelete(page, `/api/assistants/${assistantId}`).catch(() => {});
    }
  });

  test('fixed defaults restore conversation snapshot after reopening history entry', async ({ page, electronApp }) => {
    const assistantName = `Fixed Reopen ${Date.now()}`;

    await goToAssistantSettings(page);
    const skills = await httpGet<SkillRecord[]>(page, '/api/skills');
    const mcps = await httpGet<McpRecord[]>(page, '/api/mcp/servers');
    const firstSkill = skills[0];
    const firstMcp = mcps.find((item) => item.enabled !== false) ?? mcps[0];

    test.skip(!firstSkill, 'No user skills available for fixed reopen test');
    test.skip(!firstMcp, 'No MCP servers available for fixed reopen test');
    if (!firstSkill || !firstMcp) return;

    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);
    await pickFirstFixedOption(page, 'select-assistant-default-model');
    await pickFirstFixedOption(page, 'select-assistant-default-permission');
    await selectFixedSkill(page, firstSkill.name);
    await selectFixedMcp(page, firstMcp.name);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, assistantName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    await selectGuidAssistant(page, assistantId);
    const { conversationId } = await sendGuidMessageCapturingCreateRequest(page, 'fixed reopen baseline');
    await waitForAiReply(page);

    const userDataPath = await getUserDataPath(electronApp);
    const dbPath = path.join(userDataPath, 'aionui', 'aionui-backend.db');

    try {
      const beforeSwitch = querySnapshotByConversationId(dbPath, conversationId);
      const nextMode = await switchConversationMode(page);
      await sendConversationMessage(page, 'fixed reopen after switch');
      await waitForAiReply(page);

      const afterSwitch = querySnapshotByConversationId(dbPath, conversationId);
      const currentState = await captureConversationUiState(page);
      const currentLoadedState = await queryConversationLoadedState(page, conversationId);

      expect(afterSwitch.resolved_model_id).toBe(beforeSwitch.resolved_model_id);
      expect(afterSwitch.resolved_permission_value).toBe(nextMode);
      expect(currentLoadedState.skillIds).toContain(firstSkill.name);
      expect(currentLoadedState.mcpIds).toContain(firstMcp.id);

      await reopenConversationFromHistory(page, conversationId);
      const reopenedState = await captureConversationUiState(page);
      const reopenedLoadedState = await queryConversationLoadedState(page, conversationId);

      expect(reopenedState).toEqual(currentState);
      expect(reopenedLoadedState).toEqual(currentLoadedState);
    } finally {
      await httpDelete(page, `/api/conversations/${conversationId}`).catch(() => {});
      await httpDelete(page, `/api/assistants/${assistantId}`).catch(() => {});
    }
  });

  test('auto defaults restore conversation snapshot after reopening history entry', async ({ page, electronApp }) => {
    const assistantName = `Auto Reopen ${Date.now()}`;

    await goToAssistantSettings(page);
    const skills = await httpGet<SkillRecord[]>(page, '/api/skills');
    const mcps = await httpGet<McpRecord[]>(page, '/api/mcp/servers');
    const firstSkill = skills[0];
    const firstMcp = mcps.find((item) => item.enabled !== false) ?? mcps[0];

    test.skip(!firstSkill, 'No user skills available for auto reopen test');
    test.skip(!firstMcp, 'No MCP servers available for auto reopen test');
    if (!firstSkill || !firstMcp) return;

    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, assistantName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    await httpInvoke(page, 'PUT', `/api/assistants/${assistantId}`, {
      id: assistantId,
      defaults: {
        skills: {
          mode: 'auto',
          value: [],
        },
        mcps: {
          mode: 'auto',
          value: [],
        },
      },
    });

    await selectGuidAssistant(page, assistantId);
    await openGuidPlusDropdown(page);
    await ensureGuidModelSelection(page);
    await pickAlternateGuidMode(page);
    await toggleGuidSkill(page, firstSkill.name);
    await toggleGuidMcp(page, firstMcp.name);

    const { conversationId } = await sendGuidMessageCapturingCreateRequest(page, 'auto reopen baseline');
    await waitForAiReply(page);

    const userDataPath = await getUserDataPath(electronApp);
    const dbPath = path.join(userDataPath, 'aionui', 'aionui-backend.db');

    try {
      const beforeSwitch = querySnapshotByConversationId(dbPath, conversationId);
      const nextMode = await switchConversationMode(page);
      await sendConversationMessage(page, 'auto reopen after switch');
      await waitForAiReply(page);

      const afterSwitch = querySnapshotByConversationId(dbPath, conversationId);
      const preferences = queryPreferencesByAssistantKey(dbPath, assistantId);
      const currentState = await captureConversationUiState(page);
      const currentLoadedState = await queryConversationLoadedState(page, conversationId);

      expect(afterSwitch.resolved_model_id).toBe(beforeSwitch.resolved_model_id);
      expect(afterSwitch.resolved_permission_value).toBe(nextMode);
      expect(preferences.last_model_id).toBe(afterSwitch.resolved_model_id);
      expect(preferences.last_permission_value).toBe(nextMode);
      expect(currentState.modelLabel).toBeTruthy();
      expect(currentLoadedState.skillIds).toContain(firstSkill.name);
      expect(currentLoadedState.mcpIds).toContain(firstMcp.id);

      await reopenConversationFromHistory(page, conversationId);
      const reopenedState = await captureConversationUiState(page);
      const reopenedLoadedState = await queryConversationLoadedState(page, conversationId);

      expect(reopenedState).toEqual(currentState);
      expect(reopenedLoadedState).toEqual(currentLoadedState);
    } finally {
      await httpDelete(page, `/api/conversations/${conversationId}`).catch(() => {});
      await httpDelete(page, `/api/assistants/${assistantId}`).catch(() => {});
    }
  });

  test('switching from auto to fixed seeds preferences and new conversations use fixed defaults', async ({
    page,
    electronApp,
  }) => {
    const assistantName = `Auto Fixed Switch ${Date.now()}`;
    const aionrsModels = await ensureAionrsTestModels(page);

    await goToAssistantSettings(page);
    const skills = await httpGet<SkillRecord[]>(page, '/api/skills');
    const mcps = await httpGet<McpRecord[]>(page, '/api/mcp/servers');
    const firstSkill = skills[0];
    const firstMcp = mcps.find((item) => item.enabled !== false) ?? mcps[0];

    test.skip(!firstSkill, 'No user skills available for auto->fixed test');
    test.skip(!firstMcp, 'No MCP servers available for auto->fixed test');
    if (!firstSkill || !firstMcp) return;

    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, assistantName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    const userDataPath = await getUserDataPath(electronApp);
    const dbPath = path.join(userDataPath, 'aionui', 'aionui-backend.db');
    try {
      await httpInvoke(page, 'PUT', `/api/assistants/${assistantId}`, {
        id: assistantId,
        preset_agent_type: 'aionrs',
        defaults: {
          model: {
            mode: 'fixed',
            value: aionrsModels.modelA.useModel,
          },
          permission: {
            mode: 'fixed',
            value: 'default',
          },
          skills: {
            mode: 'fixed',
            value: [],
          },
          mcps: {
            mode: 'fixed',
            value: [],
          },
        },
      });
      const detail = await httpGet<AssistantDetail>(page, `/api/assistants/${assistantId}?locale=en-US`);
      const fixedSeedPreferences = queryPreferencesByAssistantKey(dbPath, assistantId);
      expect(fixedSeedPreferences.last_model_id).toBe(detail.defaults.model.value);
      expect(fixedSeedPreferences.last_permission_value).toBe(detail.defaults.permission.value);
      expect(fixedSeedPreferences.last_skill_ids).toEqual(detail.defaults.skills.value ?? []);
      expect(fixedSeedPreferences.last_mcp_ids).toEqual(detail.defaults.mcps.value ?? []);

      await selectGuidAssistant(page, assistantId);
      const { conversationId: fixedConversationId } = await sendGuidMessageCapturingCreateRequest(
        page,
        'fixed should use editor-selected defaults'
      );

      const fixedSnapshot = querySnapshotByConversationId(dbPath, fixedConversationId);

      expect(fixedSnapshot.default_model_mode).toBe('fixed');
      expect(fixedSnapshot.resolved_model_id).toBe(detail.defaults.model.value ?? null);
      expect(fixedSnapshot.default_permission_mode).toBe('fixed');
      expect(fixedSnapshot.resolved_permission_value).toBe(detail.defaults.permission.value ?? null);
      expect(fixedSnapshot.default_skills_mode).toBe('fixed');
      expect(fixedSnapshot.resolved_skill_ids).toEqual(detail.defaults.skills.value ?? []);
      expect(fixedSnapshot.default_mcps_mode).toBe('fixed');
      expect(fixedSnapshot.resolved_mcp_ids).toEqual(detail.defaults.mcps.value ?? []);

      await httpDelete(page, `/api/conversations/${fixedConversationId}`).catch(() => {});
    } finally {
      await httpDelete(page, `/api/assistants/${assistantId}`).catch(() => {});
      if (aionrsModels.cleanupProviderId) {
        await httpDelete(page, `/api/providers/${aionrsModels.cleanupProviderId}`).catch(() => {});
      }
    }
  });

  test('switching from fixed back to auto clears remembered preferences before new assistant conversations', async ({
    page,
    electronApp,
  }) => {
    const assistantName = `Fixed Auto Switch ${Date.now()}`;
    const aionrsModels = await ensureAionrsTestModels(page);

    await goToAssistantSettings(page);
    const skills = await httpGet<SkillRecord[]>(page, '/api/skills');
    const mcps = await httpGet<McpRecord[]>(page, '/api/mcp/servers');
    const firstSkill = skills[0];
    const firstMcp = mcps.find((item) => item.enabled !== false) ?? mcps[0];

    test.skip(!firstSkill, 'No user skills available for fixed->auto test');
    test.skip(!firstMcp, 'No MCP servers available for fixed->auto test');
    if (!firstSkill || !firstMcp) return;

    await clickCreateAssistant(page);
    await fillAssistantName(page, assistantName);
    await saveAssistant(page);
    await waitForAssistantEditorClose(page);

    const assistantId = await findAssistantIdByName(page, assistantName);
    test.skip(!assistantId, 'Created assistant not found');
    if (!assistantId) return;

    const userDataPath = await getUserDataPath(electronApp);
    const dbPath = path.join(userDataPath, 'aionui', 'aionui-backend.db');

    try {
      await httpInvoke(page, 'PUT', `/api/assistants/${assistantId}`, {
        id: assistantId,
        preset_agent_type: 'aionrs',
        defaults: {
          model: {
            mode: 'fixed',
            value: aionrsModels.modelA.useModel,
          },
          permission: {
            mode: 'fixed',
            value: 'default',
          },
          skills: {
            mode: 'fixed',
            value: [],
          },
          mcps: {
            mode: 'fixed',
            value: [],
          },
        },
      });
      const fixedDetail = await httpGet<AssistantDetail>(page, `/api/assistants/${assistantId}?locale=en-US`);
      const fixedPreferences = queryPreferencesByAssistantKey(dbPath, assistantId);
      expect(fixedPreferences.last_model_id).toBe(fixedDetail.defaults.model.value);
      expect(fixedPreferences.last_permission_value).toBe(fixedDetail.defaults.permission.value);
      expect(fixedPreferences.last_skill_ids).toEqual(fixedDetail.defaults.skills.value ?? []);
      expect(fixedPreferences.last_mcp_ids).toEqual(fixedDetail.defaults.mcps.value ?? []);

      await httpInvoke(page, 'PUT', `/api/assistants/${assistantId}`, {
        id: assistantId,
        defaults: {
          model: {
            mode: 'auto',
            value: null,
          },
          permission: {
            mode: 'auto',
            value: null,
          },
          skills: {
            mode: 'auto',
            value: [],
          },
          mcps: {
            mode: 'auto',
            value: [],
          },
        },
      });

      expect(queryOptionalPreferencesByAssistantKey(dbPath, assistantId)).toBeNull();

      await selectGuidAssistant(page, assistantId);
      await ensureGuidModelSelection(page);
      const selectedMode = await pickAlternateGuidMode(page);
      await toggleGuidSkill(page, firstSkill.name);
      await toggleGuidMcp(page, firstMcp.name);
      const { conversationId: autoConversationId } = await sendGuidMessageCapturingCreateRequest(
        page,
        'auto should start from fresh remembered state'
      );

      const autoSnapshot = querySnapshotByConversationId(dbPath, autoConversationId);
      const preferencesAfterAuto = queryPreferencesByAssistantKey(dbPath, assistantId);

      expect(autoSnapshot.default_model_mode).toBe('auto');
      expect(autoSnapshot.resolved_model_id).toBe(preferencesAfterAuto.last_model_id);
      expect(preferencesAfterAuto.last_model_id).toBeTruthy();
      expect(autoSnapshot.default_permission_mode).toBe('auto');
      expect(autoSnapshot.resolved_permission_value).toBe(selectedMode);
      expect(autoSnapshot.default_skills_mode).toBe('auto');
      expect(autoSnapshot.resolved_skill_ids).toContain(firstSkill.name);
      expect(autoSnapshot.default_mcps_mode).toBe('auto');
      expect(autoSnapshot.resolved_mcp_ids).toContain(firstMcp.id);
      expect(preferencesAfterAuto.last_permission_value).toBe(selectedMode);
      expect(preferencesAfterAuto.last_skill_ids).toContain(firstSkill.name);
      expect(preferencesAfterAuto.last_mcp_ids).toContain(firstMcp.id);

      await httpDelete(page, `/api/conversations/${autoConversationId}`).catch(() => {});
    } finally {
      await httpDelete(page, `/api/assistants/${assistantId}`).catch(() => {});
      if (aionrsModels.cleanupProviderId) {
        await httpDelete(page, `/api/providers/${aionrsModels.cleanupProviderId}`).catch(() => {});
      }
    }
  });
});
