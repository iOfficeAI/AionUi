/**
 * OpenCode provider catalog types.
 *
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *   Source: @opencode-ai/sdk v2 gen types
 *   Script: scripts/sync-opencode-types.js
 *   Pin: <chisl-root>/opencode-sdk-version.json (single source of truth,
 *        mirrored by AionCore/crates/aionui-opencode-conformance::OPENCODE_SDK_VERSION)
 *
 * Each export below aliases an SDK type under its AionUi name so the rest of
 * the app (ipcBridge.ts, opencodeProviderCatalog.ts, ProviderAuthCard.tsx,
 * …) can keep using `OpenCode*` names without caring which SDK version is
 * installed. To regenerate after bumping @opencode-ai/sdk:
 *
 *   1. Update <chisl-root>/opencode-sdk-version.json::version (the SoT).
 *   2. bun add -d @opencode-ai/sdk@<version>
 *   3. node scripts/sync-opencode-types.js
 *   4. cd AionCore && cargo test -p aionui-opencode-conformance
 *      (the pin test will fail if step 1 + 2 disagree).
 *
 * AionUi-internal view models (OpenCodeProviderView, OpenCodeProviderCatalogView)
 * live at the bottom of this file — they are not in the SDK and are preserved
 * across regenerations.
 *
 * @see Plans/Projects/opencode_api/API_REFERENCE.md §8 Provider authentication
 * @see Plans/Projects/opencode_api/API_REFERENCE.md §9 Discovery — GET /provider
 */

// Pinned at generation: @opencode-ai/sdk@1.16.2 (matches ../opencode-sdk-version.json).

import type {
  ApiAuth,
  WellKnownAuth,
  ProviderAuthMethod,
  ProviderAuthAuthorization,
  Model,
  Provider,
  ProviderListResponses,
} from '@opencode-ai/sdk/v2';

// ---------------------------------------------------------------------------
// §8 Auth union — aliased from @opencode-ai/sdk/v2
// ---------------------------------------------------------------------------

export type OpenCodeApiAuth = ApiAuth;
export type OpenCodeWellKnownAuth = WellKnownAuth;

// ---------------------------------------------------------------------------
// §8 Provider auth method (GET /provider/auth) — aliased from SDK
// ---------------------------------------------------------------------------

export type OpenCodeProviderAuthMethod = ProviderAuthMethod;
export type OpenCodeProviderAuthAuthorization = ProviderAuthAuthorization;

// ---------------------------------------------------------------------------
// §8 Prompt types — derived from ProviderAuthMethod.prompts
// ---------------------------------------------------------------------------

export type OpenCodeAuthPrompt = NonNullable<ProviderAuthMethod['prompts']>[number];
export type OpenCodePromptWhen = NonNullable<NonNullable<ProviderAuthMethod['prompts']>[number]['when']>;

// ---------------------------------------------------------------------------
// §9 Provider / Model — aliased from SDK
// ---------------------------------------------------------------------------

export type OpenCodeProviderModel = Model;
export type OpenCodeProvider = Provider;

// ---------------------------------------------------------------------------
// §9 GET /provider + §8 GET /provider/auth — response shape aliased from SDK
// ---------------------------------------------------------------------------

export type OpenCodeProviderListResponse = ProviderListResponses[keyof ProviderListResponses];

// ---------------------------------------------------------------------------
// AionUi-internal view model (not in the SDK).
// Built by opencodeProviderCatalog.buildProviderCatalogView from the SDK
// responses above. Kept verbatim across regenerations.
// ---------------------------------------------------------------------------

/** `GET /provider/auth` response — provider id → methods */
export type OpenCodeProviderAuthMethodsResponse = Record<string, OpenCodeProviderAuthMethod[]>;

/** Merged view model for the settings UI */
export type OpenCodeProviderView = {
  provider: OpenCodeProvider;
  connected: boolean;
  authMethods: OpenCodeProviderAuthMethod[];
  models: OpenCodeProviderModel[];
  isDefaultProvider: boolean;
};

export type OpenCodeProviderCatalogView = {
  providers: OpenCodeProviderView[];
  defaultProviderId?: string;
  defaultModelId?: string;
  connectedCount: number;
};
