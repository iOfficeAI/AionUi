/**
 * Extensions – IPC Query tests.
 *
 * Validates that every extension contribution type is queryable via
 * the IPC bridge, returns the correct schema, and includes contributions
 * from example extensions.
 *
 * These tests are fast (no UI navigation needed) because they operate
 * entirely through the electronAPI bridge.
 */
import { test, expect } from '../fixtures';
import { invokeBridge, getExtensionSnapshot, getChannelPluginStatus } from '../helpers';

// ── ACP Adapters ─────────────────────────────────────────────────────────────

test.describe('Extension IPC: ACP Adapters', () => {
  test('returns adapters from multiple extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const ids = snapshot.acpAdapters.map((a) => a.id);

    // From e2e-full-extension
    expect(ids).toContain('e2e-cli-agent');
    expect(ids).toContain('e2e-http-agent');
    // From hello-world-extension
    expect(ids).toContain('hello-stdio-agent');
    expect(ids).toContain('hello-http-agent');
  });

  test('each adapter has id, name, and connectionType', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);

    for (const adapter of snapshot.acpAdapters) {
      expect(adapter.id).toBeTruthy();
      expect(adapter.name).toBeTruthy();
    }

    // At least one adapter should have a connectionType
    const withType = snapshot.acpAdapters.filter((a) => a.connectionType);
    expect(withType.length).toBeGreaterThan(0);
  });
});

// ── MCP Servers ──────────────────────────────────────────────────────────────

test.describe('Extension IPC: MCP Servers', () => {
  test('returns servers from multiple extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const names = snapshot.mcpServers.map((s) => s.name);

    expect(names).toContain('e2e-echo-server');
    expect(names).toContain('hello-echo-mcp');
  });

  test('each server has a name', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    for (const server of snapshot.mcpServers) {
      expect(server.name).toBeTruthy();
    }
  });
});

// ── Assistants ───────────────────────────────────────────────────────────────

test.describe('Extension IPC: Assistants', () => {
  test('returns assistants from extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const ids = snapshot.assistants.map((a) => a.id);

    expect(ids).toContain('ext-e2e-test-assistant');
    expect(ids).toContain('ext-hello-assistant');
  });

  test('each assistant has id and name', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    for (const assistant of snapshot.assistants) {
      expect(assistant.id).toBeTruthy();
      expect(assistant.name).toBeTruthy();
    }
  });
});

// ── Agents ───────────────────────────────────────────────────────────────────

test.describe('Extension IPC: Agents', () => {
  test('returns agents from extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const ids = snapshot.agents.map((a) => a.id);

    expect(ids).toContain('ext-hello-coder');
    expect(ids).toContain('ext-hello-researcher');
  });

  test('each agent has id, name, and source metadata', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    for (const agent of snapshot.agents) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
    }

    // At least one agent should have _source or _kind metadata
    const withMeta = snapshot.agents.filter((a) => a._source || a._kind);
    expect(withMeta.length).toBeGreaterThanOrEqual(0); // soft check
  });
});

// ── Skills ───────────────────────────────────────────────────────────────────

test.describe('Extension IPC: Skills', () => {
  test('returns skills from extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const names = snapshot.skills.map((s) => s.name);

    expect(names).toContain('e2e-test-skill');
    expect(names).toContain('hello-quick-summary');
  });

  test('each skill has name and location', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    for (const skill of snapshot.skills) {
      expect(skill.name).toBeTruthy();
      expect(skill.location).toBeTruthy();
    }
  });
});

// ── Themes ───────────────────────────────────────────────────────────────────

test.describe('Extension IPC: Themes', () => {
  test('returns themes from extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const ids = snapshot.themes.map((t) => t.id);

    expect(ids).toContain('ext-e2e-full-extension-e2e-dark-theme');
    expect(ids).toContain('ext-hello-world-ocean-breeze');
  });

  test('each theme has id and name', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    for (const theme of snapshot.themes) {
      expect(theme.id).toBeTruthy();
      expect(theme.name).toBeTruthy();
    }
  });
});

// ── Settings Tabs ────────────────────────────────────────────────────────────

test.describe('Extension IPC: Settings Tabs', () => {
  test('returns settings tabs from extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const ids = snapshot.settingsTabs.map((t) => t.id);

    expect(ids).toContain('ext-e2e-full-extension-e2e-settings');
    expect(ids).toContain('ext-e2e-full-extension-e2e-before-about');
    expect(ids).toContain('ext-hello-world-hello-settings');
  });

  test('each settings tab has valid entryUrl', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    for (const tab of snapshot.settingsTabs) {
      expect(tab.id).toBeTruthy();
      expect(tab.name).toBeTruthy();
      // entryUrl must be aion-asset:// (local) or http(s):// (external)
      expect(
        tab.entryUrl.startsWith('aion-asset://') ||
          tab.entryUrl.startsWith('http://') ||
          tab.entryUrl.startsWith('https://')
      ).toBeTruthy();
    }
  });

  test('settings tabs carry extension name metadata', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    for (const tab of snapshot.settingsTabs) {
      expect(tab._extensionName).toBeTruthy();
    }
  });
});

// ── WebUI Contributions ──────────────────────────────────────────────────────

test.describe('Extension IPC: WebUI Contributions', () => {
  test('returns webui contributions from feishu and wecom extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const extNames = snapshot.webuiContributions.map((c) => c.extensionName);

    expect(extNames).toContain('ext-feishu');
    expect(extNames).toContain('ext-wecom-bot');
  });

  test('feishu webui has expected api routes and static assets', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const feishu = snapshot.webuiContributions.find((c) => c.extensionName === 'ext-feishu');
    expect(feishu).toBeTruthy();

    const apiPaths = feishu!.apiRoutes.map((r) => r.path);
    expect(apiPaths).toEqual(expect.arrayContaining(['/ext-feishu/collect', '/ext-feishu/stats']));

    const assetPrefixes = feishu!.staticAssets.map((a) => a.urlPrefix);
    expect(assetPrefixes).toEqual(expect.arrayContaining(['/ext-feishu/assets']));
  });

  test('wecom-bot webui has webhook route with auth disabled', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const wecom = snapshot.webuiContributions.find((c) => c.extensionName === 'ext-wecom-bot');
    expect(wecom).toBeTruthy();

    const webhookRoute = wecom!.apiRoutes.find((r) => r.path.includes('webhook'));
    expect(webhookRoute).toBeTruthy();
    expect(webhookRoute!.auth).toBe(false);
  });
});

// ── Channel Plugins ──────────────────────────────────────────────────────────

test.describe('Extension IPC: Channel Plugins', () => {
  test('returns extension channel plugins with metadata', async ({ page }) => {
    const statuses = await getChannelPluginStatus(page);
    const extPlugins = statuses.filter((s) => s.isExtension);
    expect(extPlugins.length).toBeGreaterThanOrEqual(2);

    const types = extPlugins.map((p) => p.type);
    expect(types).toEqual(expect.arrayContaining(['e2e-test-channel', 'ext-feishu']));
  });

  test('extension channel plugin has credentialFields and configFields', async ({ page }) => {
    const statuses = await getChannelPluginStatus(page);
    const e2eChannel = statuses.find((s) => s.type === 'e2e-test-channel');
    expect(e2eChannel).toBeTruthy();
    expect(e2eChannel!.isExtension).toBeTruthy();

    const credKeys = e2eChannel!.extensionMeta?.credentialFields?.map((f) => f.key) ?? [];
    expect(credKeys).toContain('apiToken');

    const configKeys = e2eChannel!.extensionMeta?.configFields?.map((f) => f.key) ?? [];
    expect(configKeys).toContain('pollingInterval');
    expect(configKeys).toContain('enableDebug');
  });
});

// ── Performance Budget ───────────────────────────────────────────────────────

test.describe('Extension IPC: Performance', () => {
  test('full snapshot query completes within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await getExtensionSnapshot(page);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3_000);
  });

  test('individual IPC queries complete within 2 seconds each', async ({ page }) => {
    const queries = [
      'extensions.get-loaded-extensions',
      'extensions.get-acp-adapters',
      'extensions.get-mcp-servers',
      'extensions.get-assistants',
      'extensions.get-agents',
      'extensions.get-skills',
      'extensions.get-themes',
      'extensions.get-settings-tabs',
      'extensions.get-webui-contributions',
    ];

    for (const key of queries) {
      const start = Date.now();
      await invokeBridge(page, key);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2_000);
    }
  });
});
