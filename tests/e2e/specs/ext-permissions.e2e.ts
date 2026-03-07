/**
 * Extensions – Permissions & Risk Level tests.
 *
 * Validates the Figma-style permission system and risk analysis
 * exposed through the IPC bridge.
 *
 * Covers:
 *  - Querying extension permissions
 *  - Querying extension risk level
 *  - Permission schema validation
 *  - Extensions with different permission profiles
 */
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';

type PermissionsResult = {
  success?: boolean;
  data?: {
    storage?: boolean;
    network?: boolean | { allowedDomains?: string[] };
    shell?: boolean;
    filesystem?: string;
    clipboard?: boolean;
    activeUser?: boolean;
    events?: boolean;
  };
};

type RiskLevelResult = {
  success?: boolean;
  data?: {
    level?: string;
    reasons?: string[];
  };
};

test.describe('Extension: Permissions Query', () => {
  test('can query permissions for hello-world extension', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-permissions', { name: 'hello-world' })) as PermissionsResult;

    expect(result.success).toBeTruthy();
    expect(result.data).toBeTruthy();

    // hello-world has explicit permissions: storage=true, network=false, shell=false, filesystem=extension-only
    if (result.data) {
      expect(result.data.storage).toBe(true);
      expect(result.data.network).toBe(false);
      expect(result.data.shell).toBe(false);
      expect(result.data.filesystem).toBe('extension-only');
    }
  });

  test('can query permissions for e2e-full-extension', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-permissions', { name: 'e2e-full-extension' })) as PermissionsResult;

    expect(result.success).toBeTruthy();
    expect(result.data).toBeTruthy();
  });

  test('permissions query for nonexistent extension returns gracefully', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-permissions', { name: 'nonexistent-extension-xyz' })) as PermissionsResult;

    // Should not crash – may return success=false or empty data
    expect(result).toBeTruthy();
  });
});

test.describe('Extension: Risk Level Assessment', () => {
  test('can query risk level for hello-world extension', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-risk-level', { name: 'hello-world' })) as RiskLevelResult;

    expect(result.success).toBeTruthy();
    expect(result.data).toBeTruthy();

    if (result.data?.level) {
      // Risk level should be one of: low, medium, high
      expect(['low', 'medium', 'high']).toContain(result.data.level);
    }
  });

  test('can query risk level for e2e-full-extension', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-risk-level', { name: 'e2e-full-extension' })) as RiskLevelResult;

    expect(result.success).toBeTruthy();
    expect(result.data).toBeTruthy();

    if (result.data?.level) {
      expect(['low', 'medium', 'high']).toContain(result.data.level);
    }
  });

  test('risk level includes reasons array', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-risk-level', { name: 'hello-world' })) as RiskLevelResult;

    if (result.success && result.data) {
      // reasons should be an array (possibly empty for low-risk extensions)
      expect(Array.isArray(result.data.reasons)).toBeTruthy();
    }
  });
});
