/**
 * Extensions – Lifecycle (enable / disable / state persistence) tests.
 *
 * Covers:
 *  - Disabling an extension via IPC removes its contributions
 *  - Enabling an extension via IPC restores its contributions
 *  - Extension state persists across queries
 *  - Disabling one extension does not affect others
 */
import { test, expect } from '../fixtures';
import { getExtensionSnapshot, invokeBridge } from '../helpers';

const TARGET_EXT = 'ext-feishu';
const UNRELATED_EXT = 'hello-world';

test.describe('Extension: Lifecycle – Enable / Disable', () => {
  test('can disable an extension and its contributions disappear', async ({ page }) => {
    // Verify extension is loaded initially
    const before = await getExtensionSnapshot(page);
    const hadFeishu = before.loadedExtensions.some((e) => e.name === TARGET_EXT);
    expect(hadFeishu).toBeTruthy();

    // Disable the extension
    const result = (await invokeBridge(page, 'extensions.disable', { name: TARGET_EXT, reason: 'e2e-lifecycle' })) as {
      success?: boolean;
    };
    expect(result.success).toBeTruthy();

    // Verify contributions are removed
    const after = await getExtensionSnapshot(page);
    const feishuWebui = after.webuiContributions.find((c) => c.extensionName === TARGET_EXT);
    expect(feishuWebui).toBeFalsy();
  });

  test('can re-enable an extension and its contributions restore', async ({ page }) => {
    // Enable the extension (may already be enabled or disabled from previous test)
    const result = (await invokeBridge(page, 'extensions.enable', { name: TARGET_EXT })) as {
      success?: boolean;
    };
    expect(result.success).toBeTruthy();

    // Verify contributions are restored
    const snapshot = await getExtensionSnapshot(page);
    const feishuWebui = snapshot.webuiContributions.find((c) => c.extensionName === TARGET_EXT);
    expect(feishuWebui).toBeTruthy();
    expect(feishuWebui!.apiRoutes.length).toBeGreaterThan(0);
  });

  test('disabling one extension does not affect others', async ({ page }) => {
    // Disable target
    await invokeBridge(page, 'extensions.disable', { name: TARGET_EXT, reason: 'e2e-isolation' });

    // Verify unrelated extension still works
    const snapshot = await getExtensionSnapshot(page);
    const helloExt = snapshot.loadedExtensions.find((e) => e.name === UNRELATED_EXT);
    expect(helloExt).toBeTruthy();

    const helloThemes = snapshot.themes.filter((t) => t.id.includes('hello-world'));
    expect(helloThemes.length).toBeGreaterThan(0);

    // Cleanup: re-enable
    await invokeBridge(page, 'extensions.enable', { name: TARGET_EXT });
  });

  test('extension state query returns correct disabled status', async ({ page }) => {
    // Disable
    await invokeBridge(page, 'extensions.disable', { name: TARGET_EXT, reason: 'e2e-state-check' });

    // Verify it's no longer contributing
    const snapshot = await getExtensionSnapshot(page);
    const feishuChannels = snapshot.webuiContributions.filter((c) => c.extensionName === TARGET_EXT);
    expect(feishuChannels.length).toBe(0);

    // Re-enable
    await invokeBridge(page, 'extensions.enable', { name: TARGET_EXT });

    // Verify contributions are back
    const restored = await getExtensionSnapshot(page);
    const feishuRestored = restored.webuiContributions.find((c) => c.extensionName === TARGET_EXT);
    expect(feishuRestored).toBeTruthy();
  });
});

test.describe('Extension: Lifecycle – Loaded Extensions List', () => {
  test('loaded extensions list contains all expected example extensions', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);
    const names = snapshot.loadedExtensions.map((e) => e.name);

    // Should have at least these example extensions
    expect(names).toEqual(
      expect.arrayContaining([
        'e2e-full-extension',
        'hello-world',
        'example-acp-adapter',
        'ext-feishu',
        'ext-wecom-bot',
        'star-office',
      ])
    );
  });

  test('each loaded extension has name, displayName, version', async ({ page }) => {
    const snapshot = await getExtensionSnapshot(page);

    for (const ext of snapshot.loadedExtensions) {
      expect(ext.name).toBeTruthy();
      expect(ext.displayName).toBeTruthy();
      expect(ext.version).toBeTruthy();
    }
  });
});
