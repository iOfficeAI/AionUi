/**
 * OpenCode provider catalog types.
 *
 * Aligned with OpenCode server API §8–§9 and `@opencode-ai/sdk` v2 gen types
 * (Context7 / API_REFERENCE.md). V1 `GET /provider` is the settings UI source
 * of truth; auth methods come from `GET /provider/auth`.
 *
 * @see Plans/Projects/opencode_api/API_REFERENCE.md §8 Provider authentication
 * @see Plans/Projects/opencode_api/API_REFERENCE.md §9 Discovery — GET /provider
 */

/** §8 `Auth` union — `ApiAuth` */
export type OpenCodeApiAuth = {
  type: 'api';
  key: string;
  metadata?: Record<string, string>;
};

/** §8 `Auth` union — `WellKnownAuth` */
export type OpenCodeWellKnownAuth = {
  type: 'wellknown';
  key: string;
  token: string;
};

/** §8 `ProviderAuthMethod` — from GET /provider/auth */
export type OpenCodeProviderAuthMethod = {
  type: 'oauth' | 'api';
  label: string;
  prompts?: OpenCodeAuthPrompt[];
};

export type OpenCodeAuthPrompt =
  | {
      type: 'text';
      key: string;
      message: string;
      placeholder?: string;
      when?: OpenCodePromptWhen;
    }
  | {
      type: 'select';
      key: string;
      message: string;
      options: Array<{ label: string; value: string; hint?: string }>;
      when?: OpenCodePromptWhen;
    };

export type OpenCodePromptWhen = {
  key: string;
  op: 'eq' | 'neq';
  value: string;
};

/** §8 `ProviderAuthAuthorization` — POST .../oauth/authorize response */
export type OpenCodeProviderAuthAuthorization = {
  url: string;
  method: 'auto' | 'code';
  instructions: string;
};

/** §9 `Model` — nested under Provider.models */
export type OpenCodeProviderModel = {
  id: string;
  providerID?: string;
  name: string;
  family?: string;
  status?: 'alpha' | 'beta' | 'deprecated' | 'active';
  release_date?: string;
  limit?: { context?: number; output?: number; input?: number };
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  tool_call?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  attachment?: boolean;
  experimental?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  capabilities?: {
    toolcall?: boolean;
    reasoning?: boolean;
    temperature?: boolean;
    attachment?: boolean;
    input?: Record<string, boolean>;
    output?: Record<string, boolean>;
  };
};

/** §9 `Provider` */
export type OpenCodeProvider = {
  id: string;
  name: string;
  source?: 'env' | 'config' | 'custom' | 'api';
  env?: string[];
  key?: string;
  api?: string;
  npm?: string;
  options?: Record<string, unknown>;
  models?: Record<string, OpenCodeProviderModel>;
};

/** §9 `GET /provider` response */
export type OpenCodeProviderListResponse = {
  all: OpenCodeProvider[];
  default?: Record<string, string>;
  connected: string[] | OpenCodeProvider[];
};

/** §8 `GET /provider/auth` response — provider id → methods */
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
