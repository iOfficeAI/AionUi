/**
 * Extensions – Permissions & Risk Level tests.
 *
 * Validates the current IPC contract exposed by the extension bridge:
 * - `extensions.get-permissions` returns `IExtensionPermissionSummary[]`
 * - `extensions.get-risk-level` returns `'safe' | 'moderate' | 'dangerous'`
 */
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';

type PermissionSummary = {
  name: string;
  description: string;
  level: 'safe' | 'moderate' | 'dangerous';
  granted: boolean;
};

type RiskLevel = 'safe' | 'moderate' | 'dangerous';

function permissionsByName(items: PermissionSummary[]): Map<string, PermissionSummary> {
  return new Map(items.map((item) => [item.name, item]));
}

test.describe('Extension: Permissions Query', () => {
  test('hello-world exposes its declared permission summary', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-permissions', {
      name: 'hello-world',
    })) as PermissionSummary[];

    expect(Array.isArray(result)).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);

    const byName = permissionsByName(result);
    expect(byName.get('storage')).toMatchObject({ granted: true, level: 'safe' });
    expect(byName.get('network')).toMatchObject({ granted: false, level: 'safe' });
    expect(byName.get('shell')).toMatchObject({ granted: false, level: 'dangerous' });
    expect(byName.get('filesystem')).toMatchObject({ granted: false, level: 'safe' });
    expect(byName.get('events')).toMatchObject({ granted: true, level: 'safe' });
  });

  test('e2e-full-extension falls back to default safe permission summary', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-permissions', {
      name: 'e2e-full-extension',
    })) as PermissionSummary[];

    expect(Array.isArray(result)).toBeTruthy();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'events',
      level: 'safe',
      granted: true,
    });
  });

  test('permissions query for nonexistent extension returns gracefully', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-permissions', {
      name: 'nonexistent-extension-xyz',
    })) as PermissionSummary[];

    expect(Array.isArray(result)).toBeTruthy();
    expect(result).toHaveLength(0);
  });
});

test.describe('Extension: Risk Level Assessment', () => {
  test('hello-world risk level matches its current permissions', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-risk-level', { name: 'hello-world' })) as RiskLevel;

    expect(result).toBe('safe');
  });

  test('e2e-full-extension risk level is safe by default', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-risk-level', { name: 'e2e-full-extension' })) as RiskLevel;

    expect(result).toBe('safe');
  });

  test('risk level query for nonexistent extension returns safe fallback', async ({ page }) => {
    const result = (await invokeBridge(page, 'extensions.get-risk-level', {
      name: 'nonexistent-extension-xyz',
    })) as RiskLevel;

    expect(['safe', 'moderate', 'dangerous']).toContain(result);
    expect(result).toBe('safe');
  });
});
