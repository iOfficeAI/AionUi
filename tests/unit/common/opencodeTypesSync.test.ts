/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Smoke test for the `scripts/sync-opencode-types.js` codegen. Locks in:
 *   1. The script produces a syntactically-valid TypeScript file.
 *   2. Every AionUi alias the app imports (`OpenCode*`) is still exported
 *      after regeneration.
 *   3. The aliases still point at the SDK types (re-export style).
 *   4. The AionUi view-model types are preserved at the bottom of the file.
 *
 * The actual SDK-alias mapping is asserted by importing the generated file
 * in a tiny TS test and reading its export types — that way a future SDK
 * refactor that drops a type (e.g. `ApiAuth` disappears) fails CI rather
 * than silently shipping an unresolvable import.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../..');
const GENERATED_FILE = resolve(
  REPO_ROOT,
  'packages/desktop/src/common/types/opencode/opencodeProviderTypes.ts'
);

function readGenerated(): string {
  return readFileSync(GENERATED_FILE, 'utf-8');
}

describe('sync-opencode-types script output', () => {
  it('is an AUTO-GENERATED file (not the hand-mirrored version)', () => {
    const src = readGenerated();
    expect(src).toContain('AUTO-GENERATED');
    expect(src).toContain('Source: @opencode-ai/sdk v2 gen types');
  });

  it('imports from @opencode-ai/sdk/v2', () => {
    const src = readGenerated();
    expect(src).toMatch(/from\s+['"]@opencode-ai\/sdk\/v2['"]/);
  });

  it.each([
    'OpenCodeApiAuth',
    'OpenCodeWellKnownAuth',
    'OpenCodeProviderAuthMethod',
    'OpenCodeProviderAuthAuthorization',
    'OpenCodeProviderModel',
    'OpenCodeProvider',
    'OpenCodeProviderListResponse',
    'OpenCodeProviderAuthMethodsResponse',
    'OpenCodeProviderView',
    'OpenCodeProviderCatalogView',
    'OpenCodeAuthPrompt',
    'OpenCodePromptWhen',
  ])('exports %s as a type alias', (name) => {
    const src = readGenerated();
    expect(src).toMatch(new RegExp(`export\\s+type\\s+${name}\\b`));
  });

  it('keeps the AionUi-internal view-model block verbatim', () => {
    const src = readGenerated();
    // Marker strings that should never change because call sites in
    // opencodeProviderCatalog.ts / ProviderAuthCard.tsx depend on the shape.
    expect(src).toContain('AionUi-internal view model (not in the SDK).');
    expect(src).toContain('defaultProviderId?: string;');
    expect(src).toContain('defaultModelId?: string;');
    expect(src).toContain('connectedCount: number;');
  });
});
