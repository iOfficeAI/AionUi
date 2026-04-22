import type { Page } from '@playwright/test';
import { invokeBridge } from './bridge';
import { navigateTo } from './navigation';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises';

/**
 * Skills Hub E2E Test Helpers
 *
 * Data-testid additions required (authorization granted by team-lead):
 * - All testid additions will be documented here as they're added to source files
 * - Source files modified: (to be populated during implementation)
 */

// ============================================================================
// Types
// ============================================================================

export type SkillSource = 'builtin' | 'custom' | 'extension' | 'auto';

export interface Skill {
  name: string;
  description?: string;
  source: SkillSource;
  location?: string;
}

export interface ExternalSource {
  source: string;
  path: string;
  count: number;
  skills: Skill[];
}

// ============================================================================
// Navigation
// ============================================================================

/**
 * Navigate to Skills Hub settings page using UI click
 * Note: /settings/skills-hub redirects to /settings/capabilities?tab=skills
 * The Skills content should be visible by default as it's the first tab.
 */
export async function goToSkillsHub(page: Page): Promise<void> {
  // Navigate to Capabilities settings page
  await navigateTo(page, '#/settings/capabilities');

  // Wait a bit for React Router and Tabs component to initialize
  await page.waitForTimeout(500);

  // Try to click Skills tab if it exists and isn't already active
  const skillsTab = page.locator('.arco-tabs-header-title, .arco-tabs-nav-tab').filter({ hasText: /Skills|技能/i }).first();
  const isVisible = await skillsTab.isVisible().catch(() => false);

  if (isVisible) {
    // Check if tab is already active by looking at aria-selected or active class
    const isActive = await skillsTab.evaluate(el => {
      return el.classList.contains('arco-tabs-nav-tab-active') ||
             el.getAttribute('aria-selected') === 'true';
    }).catch(() => false);

    if (!isActive) {
      await skillsTab.click();
      await page.waitForTimeout(300);
    }
  }

  // Wait for tab content to load
  const section = page.locator('[data-testid="my-skills-section"]');
  await section.waitFor({ state: 'visible', timeout: 5_000 });

  // Wait for Bridge initialization (fs.* providers take longer to initialize)
  // Use a simple Bridge call as health check
  let bridgeReady = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await invokeBridge(page, 'get-skill-paths', undefined, 3000);
      bridgeReady = true;
      break;
    } catch {
      await page.waitForTimeout(1000);
    }
  }

  if (!bridgeReady) {
    console.warn('[goToSkillsHub] Bridge fs.* providers not ready after 5 attempts');
  }
}

/**
 * Refresh the Skills Hub page to trigger data reload
 */
export async function refreshSkillsHub(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await page.waitForTimeout(100);
  await goToSkillsHub(page);
}

// ============================================================================
// Bridge Queries
// ============================================================================

/**
 * Get all skills in "My Skills" section
 */
export async function getMySkills(page: Page): Promise<Skill[]> {
  return invokeBridge<Skill[]>(page, 'list-available-skills');
}

/**
 * Get all external skill sources
 * Note: Bridge returns { success, data: ExternalSource[] }
 */
export async function getExternalSources(page: Page): Promise<ExternalSource[]> {
  const result = await invokeBridge<{ success: boolean; data: ExternalSource[] }>(
    page,
    'detect-and-count-external-skills'
  );
  return result.data || [];
}

/**
 * Get auto-injected skills
 */
export async function getAutoSkills(page: Page): Promise<Skill[]> {
  return invokeBridge<Skill[]>(page, 'list-builtin-auto-skills');
}

/**
 * Get custom external paths configuration
 */
export async function getCustomExternalPaths(page: Page): Promise<Array<{ name: string; path: string }>> {
  // Note: This bridge key needs verification - may not exist
  // Will verify during implementation and update test-strategy if needed
  try {
    return invokeBridge<Array<{ name: string; path: string }>>(page, 'get-custom-external-paths');
  } catch {
    // Fallback: return empty array if bridge key doesn't exist
    return [];
  }
}

// ============================================================================
// Bridge Data Construction (Setup)
// ============================================================================

/**
 * Create a real skill directory with SKILL.md file
 */
export async function createSkillDir(parentDir: string, skillName: string): Promise<string> {
  const skillDir = path.join(parentDir, skillName);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, 'SKILL.md'),
    `---
name: ${skillName}
description: E2E test skill
---

# ${skillName}

This is a test skill for E2E testing.
`
  );
  return skillDir;
}

/**
 * Create a temporary directory for external source
 */
export async function createTempExternalSourceDir(): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'e2e-skills-'));
  return {
    path: tempDir,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true });
    }
  };
}

/**
 * Import a skill via Bridge (for test setup)
 */
export async function importSkillViaBridge(
  page: Page,
  skillPath: string
): Promise<{ success: boolean; msg?: string }> {
  return invokeBridge(page, 'import-skill-with-symlink', { skillPath });
}

/**
 * Delete a skill via Bridge (for test cleanup)
 */
export async function deleteSkillViaBridge(
  page: Page,
  skillName: string
): Promise<{ success: boolean; msg?: string }> {
  return invokeBridge(page, 'delete-skill', { skillName });
}

/**
 * Add a custom external path via Bridge
 */
export async function addCustomExternalPath(
  page: Page,
  name: string,
  pathValue: string
): Promise<{ success: boolean; msg?: string }> {
  return invokeBridge(page, 'add-custom-external-path', { name, path: pathValue });
}

/**
 * Remove a custom external path via Bridge
 */
export async function removeCustomExternalPath(
  page: Page,
  pathValue: string
): Promise<{ success: boolean; msg?: string }> {
  return invokeBridge(page, 'remove-custom-external-path', { path: pathValue });
}

// ============================================================================
// UI Operations
// ============================================================================

/**
 * Search in "My Skills" section
 */
export async function searchMySkills(page: Page, query: string): Promise<void> {
  await page.fill('[data-testid="input-search-my-skills"]', query);
  await page.waitForTimeout(100); // No debounce in current implementation
}

/**
 * Search in "External Skills" section
 */
export async function searchExternalSkills(page: Page, query: string): Promise<void> {
  await page.fill('[data-testid="input-search-external"]', query);
  await page.waitForTimeout(100);
}

/**
 * Refresh "My Skills" list
 */
export async function refreshMySkills(page: Page): Promise<void> {
  await page.click('[data-testid="btn-refresh-my-skills"]');
  await page.waitForTimeout(500); // Wait for refresh to complete
}

/**
 * Refresh external skills list
 */
export async function refreshExternalSkills(page: Page): Promise<void> {
  await page.click('[data-testid="btn-refresh-external"]');
  await page.waitForTimeout(500);
}

/**
 * Import a skill via UI (single skill from external sources)
 * Note: The entire card is clickable, not just the button
 */
export async function importSkillViaUI(
  page: Page,
  skillName: string
): Promise<void> {
  const normalizedName = normalizeTestId(skillName);
  // Click the card itself (the entire card triggers import)
  await page.click(`[data-testid="external-skill-card-${normalizedName}"]`);
  await page.waitForSelector('.arco-message-success', { timeout: 10_000 });
  await page.waitForTimeout(500); // Wait for list refresh
}

/**
 * Delete a skill via UI
 */
export async function deleteSkillViaUI(
  page: Page,
  skillName: string
): Promise<void> {
  const normalizedName = normalizeTestId(skillName);

  // Click delete button
  await page.click(`[data-testid="btn-delete-${normalizedName}"]`);

  // Confirm in modal
  await page.waitForSelector('[data-testid="modal-delete-skill"]', { timeout: 2000 });
  await page.click('[data-testid="btn-confirm-delete"]');

  // Wait for success message
  await page.waitForSelector('.arco-message-success', { timeout: 5000 });
  await page.waitForTimeout(500); // Wait for list refresh
}

/**
 * Export a skill to an external source via UI
 */
export async function exportSkillViaUI(
  page: Page,
  skillName: string,
  targetSource: string
): Promise<void> {
  const normalizedName = normalizeTestId(skillName);

  // Click export button (opens dropdown)
  await page.click(`[data-testid="btn-export-${normalizedName}"]`);

  // Select target source from dropdown
  // Note: Dropdown structure may need adjustment based on actual implementation
  await page.click(`text="${targetSource}"`);

  // Wait for processing message or success
  await page.waitForSelector('.arco-message', { timeout: 10_000 });
}

/**
 * Import all skills from current external source
 */
export async function importAllSkills(page: Page): Promise<void> {
  await page.click('[data-testid="btn-import-all"]');
  await page.waitForSelector('.arco-message-success', { timeout: 10_000 });
  await page.waitForTimeout(500); // Wait for list refresh
}

/**
 * Add custom external path via UI
 */
export async function addCustomPathViaUI(
  page: Page,
  name: string,
  pathValue: string
): Promise<void> {
  // Click add button
  await page.click('[data-testid="btn-add-custom-source"]');

  // Wait for modal
  await page.waitForSelector('[data-testid="modal-add-custom-path"]', { timeout: 2000 });

  // Fill form
  await page.fill('[data-testid="input-custom-path-name"]', name);
  await page.fill('[data-testid="input-custom-path-value"]', pathValue);

  // Confirm
  await page.click('button:has-text("Confirm")'); // May need testid adjustment

  // Wait for modal close
  await page.waitForSelector('[data-testid="modal-add-custom-path"]', {
    state: 'hidden',
    timeout: 2000
  });
}

// ============================================================================
// Test Data Management
// ============================================================================

/**
 * Normalize skill name for data-testid usage
 * Converts special characters to hyphens
 */
export function normalizeTestId(name: string): string {
  return name.replace(/[:\/\s<>"'|?*]/g, '-');
}

/**
 * Create a temporary external skill source for testing
 */
export function createTempExternalSource(sourceName: string): {
  path: string;
  cleanup: () => void;
} {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-e2e-external-'));

  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { path: tempDir, cleanup };
}

/**
 * Create a test skill in a directory
 */
export function createTestSkill(
  dir: string,
  skillName: string,
  description = 'Test skill for E2E'
): void {
  const skillDir = path.join(dir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });

  const skillMd = `---
name: ${skillName}
description: "${description}"
---
# ${skillName}

This is a test skill created for E2E testing.
`;

  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
}

/**
 * RESERVED FOR FUTURE OPTION A IMPLEMENTATION
 * Create a temporary extension for testing Extension Skills board
 * (TC-S-27 Option A - not used in current v1.3, uses Option B instead)
 *
 * NOTE: v1.3 uses Option B (Bridge query + container assertion),
 * so this helper is not called. Kept for potential future use.
 */
// export function createTempExtension(extensionName: string): {
//   path: string;
//   cleanup: () => void;
// } {
//   const examplesDir = path.join(process.cwd(), 'examples');
//   const extDir = path.join(examplesDir, extensionName);
//
//   // Create extension with skills directory
//   fs.mkdirSync(path.join(extDir, 'skills'), { recursive: true });
//
//   const cleanup = () => {
//     try {
//       fs.rmSync(extDir, { recursive: true, force: true });
//     } catch {
//       // Ignore cleanup errors
//     }
//   };
//
//   return { path: extDir, cleanup };
// }

/**
 * RESERVED FOR FUTURE OPTION A IMPLEMENTATION
 * Create a temporary auto-injected skill for testing Auto Skills board
 * (TC-S-28 Option A - not used in current v1.3, uses Option B instead)
 *
 * NOTE: v1.3 uses Option B (Bridge query + container assertion),
 * so this helper is not called. Kept for potential future use.
 */
// export function createTempAutoSkill(skillName: string): {
//   path: string;
//   cleanup: () => void;
// } {
//   const builtinDir = path.join(process.cwd(), '_builtin');
//   const skillDir = path.join(builtinDir, skillName);
//
//   fs.mkdirSync(skillDir, { recursive: true });
//
//   const cleanup = () => {
//     try {
//       fs.rmSync(skillDir, { recursive: true, force: true });
//     } catch {
//       // Ignore cleanup errors
//     }
//   };
//
//   return { path: skillDir, cleanup };
// }

/**
 * Clean up all E2E test skills and custom paths
 */
export async function cleanupTestSkills(page: Page): Promise<void> {
  try {
    // Delete all skills starting with E2E-Test-
    const skills = await getMySkills(page);
    for (const skill of skills) {
      if (skill.name.startsWith('E2E-Test-')) {
        try {
          await deleteSkillViaBridge(page, skill.name);
        } catch (err) {
          console.warn(`Failed to delete skill ${skill.name}:`, err);
        }
      }
    }

    // Remove custom external paths starting with E2E
    const customPaths = await getCustomExternalPaths(page);
    for (const entry of customPaths) {
      if (entry.name.startsWith('E2E')) {
        try {
          await removeCustomExternalPath(page, entry.path);
        } catch (err) {
          console.warn(`Failed to remove path ${entry.path}:`, err);
        }
      }
    }
  } catch (err) {
    console.warn('Cleanup failed:', err);
  }
}
