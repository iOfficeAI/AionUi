/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CRUD wire-level coverage for ModelModalContent after the `/api/providers`
 * migration. Each test renders the component with a controlled SWR state,
 * triggers a specific UI action, and asserts the resulting
 * `ipcBridge.mode.*` call matches the backend spec.
 *
 * What this file locks in (spec:
 * `docs/backend-migration/specs/2026-04-24-model-config-frontend-migration-design.md`):
 *
 * - Reads go through `listProviders`.
 * - Adding a platform issues `createProvider` (full body, caller-supplied id).
 * - Updating an existing platform issues `updateProvider` with `{id, ...patch}`.
 * - Deleting issues `deleteProvider` with just `{id}` (no body fields leak).
 * - Clearing health status uses a pure `model_health`-only partial PUT —
 *   critically, it must NOT ship the whole IProvider (that was the
 *   pre-migration pattern).
 *
 * What this file deliberately does NOT lock in:
 *
 * - Per-model toggles (enable/disable, protocol cycle) currently flow
 *   through the `updatePlatform → persistPlatform` upsert helper, which
 *   mutates the full IProvider and PUTs the whole thing. The plan's
 *   idealized wording ("partial updateProvider with ONLY the changed
 *   field") is not what T2 shipped. Testing against the actual
 *   implementation keeps this file honest; the difference is called out
 *   in the e2e report so coordinator can follow up if desired.
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ---------------------------------------------------------------------------
// ipcBridge mock — we spy on the 4 CRUD entries used by the component.
// `vi.hoisted` keeps the spies alive across vi.mock's hoist-to-top rewrite.
// ---------------------------------------------------------------------------

const spies = vi.hoisted(() => ({
  listProvidersInvoke: vi.fn(),
  createProviderInvoke: vi.fn(),
  updateProviderInvoke: vi.fn(),
  deleteProviderInvoke: vi.fn(),
}));

const { listProvidersInvoke, createProviderInvoke, updateProviderInvoke, deleteProviderInvoke } = spies;

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: spies.listProvidersInvoke },
      createProvider: { invoke: spies.createProviderInvoke },
      updateProvider: { invoke: spies.updateProviderInvoke },
      deleteProvider: { invoke: spies.deleteProviderInvoke },
    },
    conversation: {
      create: { invoke: vi.fn() },
      remove: { invoke: vi.fn() },
      sendMessage: { invoke: vi.fn() },
      responseStream: { on: vi.fn(() => () => {}) },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  const MessageMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    useMessage: () => [{ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }, null],
  };
  return {
    ...actual,
    Message: MessageMock,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallbackOrOpts?: unknown) => {
      if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
      if (fallbackOrOpts && typeof fallbackOrOpts === 'object' && 'defaultValue' in fallbackOrOpts) {
        return String((fallbackOrOpts as { defaultValue: unknown }).defaultValue);
      }
      return key;
    },
    i18n: { language: 'en-US' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@icon-park/react', () => {
  // oxlint-disable-next-line consistent-function-scoping -- vi.mock is hoisted; stub must be inside the factory
  const stub = (label: string) => () => <span data-testid={`icon-${label}`} />;
  return {
    DeleteFour: stub('delete'),
    Info: stub('info'),
    Minus: stub('minus'),
    Plus: stub('plus'),
    Write: stub('write'),
    Heartbeat: stub('heartbeat'),
  };
});

// Stub the submodals — they render extra DOM we don't need and each pull
// in their own ipcBridge calls. We only care about the top-level CRUD here.
vi.mock('@/renderer/pages/settings/components/AddPlatformModal', () => {
  const AddPlatformModal: {
    useModal: (opts: {
      onSubmit: (payload: unknown) => void;
    }) => [{ open: (...args: unknown[]) => void; close: () => void; __submit: (p: unknown) => void }, React.ReactNode];
  } = {
    useModal: ({ onSubmit }) => {
      const controller = {
        open: () => {},
        close: () => {},
        __submit: onSubmit,
      };
      (globalThis as unknown as { __addPlatformSubmit?: (p: unknown) => void }).__addPlatformSubmit = onSubmit;
      return [controller, null];
    },
  };
  return { default: AddPlatformModal };
});

vi.mock('@/renderer/pages/settings/components/AddModelModal', () => ({
  default: {
    useModal: ({ onSubmit }: { onSubmit: (p: unknown) => void }) => {
      (globalThis as unknown as { __addModelSubmit?: (p: unknown) => void }).__addModelSubmit = onSubmit;
      return [{ open: () => {}, close: () => {} }, null];
    },
  },
}));

vi.mock('@/renderer/pages/settings/components/EditModeModal', () => ({
  default: {
    useModal: ({ onChange }: { onChange: (p: unknown) => void }) => {
      (globalThis as unknown as { __editModeChange?: (p: unknown) => void }).__editModeChange = onChange;
      return [{ open: () => {}, close: () => {} }, null];
    },
  },
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/hooks/system/useDeepLink', () => ({
  consumePendingDeepLink: () => null,
}));

vi.mock('@/renderer/utils/model/modelPlatforms', () => ({
  isNewApiPlatform: (_p: string) => false,
  NEW_API_PROTOCOL_OPTIONS: [
    { value: 'openai', label: 'OpenAI' },
    { value: 'anthropic', label: 'Anthropic' },
    { value: 'gemini', label: 'Gemini' },
  ],
}));

vi.mock('../../src/renderer/components/settings/SettingsModal/contents/healthCheckUtils', () => ({
  classifyHealthCheckMessage: () => 'skip',
}));

vi.mock('../../src/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/common/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/utils')>();
  return {
    ...actual,
    uuid: vi.fn(() => 'abcd1234'),
  };
});

// Silence the empty model-provider.css side-effect import.
vi.mock('../../src/renderer/components/settings/SettingsModal/contents/../model-provider.css', () => ({}));

import ModelModalContent from '../../src/renderer/components/settings/SettingsModal/contents/ModelModalContent';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    platform: 'openai',
    name: 'OpenAI',
    base_url: 'https://api.openai.com',
    api_key: 'sk-existing',
    models: ['gpt-4'],
    model_enabled: { 'gpt-4': true },
    enabled: true,
    ...overrides,
  };
}

async function renderWithProviders(providers: unknown[]) {
  listProvidersInvoke.mockResolvedValue(providers);
  // Each test gets its own SWR provider map — SWR's default global cache
  // would carry provider lists across tests and we'd assert against stale
  // DOM from the previous render.
  const utils = render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ModelModalContent />
    </SWRConfig>
  );
  // Wait for the initial SWR fetch to settle and the provider card(s) to mount.
  if (providers.length > 0) {
    const first = providers[0] as { name: string };
    await waitFor(() => {
      expect(utils.getAllByText(first.name).length).toBeGreaterThan(0);
    });
  } else {
    await waitFor(() => {
      expect(utils.getByText('settings.noConfiguredModels')).toBeTruthy();
    });
  }
  return utils;
}

function getAddPlatformSubmit(): (p: unknown) => void {
  const fn = (globalThis as unknown as { __addPlatformSubmit?: (p: unknown) => void }).__addPlatformSubmit;
  if (!fn) throw new Error('AddPlatformModal onSubmit was not registered');
  return fn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModelModalContent — /api/providers CRUD wiring', () => {
  beforeEach(() => {
    listProvidersInvoke.mockReset();
    createProviderInvoke.mockReset();
    updateProviderInvoke.mockReset();
    deleteProviderInvoke.mockReset();
    createProviderInvoke.mockResolvedValue(undefined);
    updateProviderInvoke.mockResolvedValue(undefined);
    deleteProviderInvoke.mockResolvedValue(undefined);
  });

  it('lists providers via ipcBridge.mode.listProviders on mount', async () => {
    await renderWithProviders([makeProvider()]);
    expect(listProvidersInvoke).toHaveBeenCalled();
  });

  it('adding a new platform issues createProvider with the caller-supplied id', async () => {
    await renderWithProviders([]); // no providers yet
    const submit = getAddPlatformSubmit();

    const newPlatform = {
      id: 'newabcd',
      platform: 'openai',
      name: 'Added',
      base_url: 'https://api.openai.com',
      api_key: 'sk-new',
      models: ['gpt-4o'],
    };

    await act(async () => {
      submit(newPlatform);
    });

    await waitFor(() => {
      expect(createProviderInvoke).toHaveBeenCalledTimes(1);
    });
    expect(createProviderInvoke).toHaveBeenCalledWith(newPlatform);
    // Must NOT have issued updateProvider/deleteProvider as collateral.
    expect(updateProviderInvoke).not.toHaveBeenCalled();
    expect(deleteProviderInvoke).not.toHaveBeenCalled();
  });

  it('editing an existing platform issues updateProvider with { id, ...body }', async () => {
    const existing = makeProvider();
    await renderWithProviders([existing]);

    const editSubmit = (globalThis as unknown as { __editModeChange?: (p: unknown) => void }).__editModeChange;
    if (!editSubmit) throw new Error('EditModeModal onChange was not registered');

    const patched = { ...existing, name: 'OpenAI renamed', api_key: 'sk-new' };
    await act(async () => {
      editSubmit(patched);
    });

    await waitFor(() => {
      expect(updateProviderInvoke).toHaveBeenCalledTimes(1);
    });
    const [args] = updateProviderInvoke.mock.calls[0] as [Record<string, unknown>];
    expect(args.id).toBe('p1');
    // Caller passes full IProvider shape; updateProvider extracts id from
    // URL at the bridge layer — see ipcBridge.providers.test.ts.
    expect(args.name).toBe('OpenAI renamed');
    expect(args.api_key).toBe('sk-new');
    expect(createProviderInvoke).not.toHaveBeenCalled();
  });

  it('deleting a platform issues deleteProvider with only { id }', async () => {
    const existing = makeProvider();
    const utils = await renderWithProviders([existing]);

    // Click the Minus icon button (second action button in the header).
    const minusIcon = utils.getByTestId('icon-minus');
    const minusButton = minusIcon.closest('button');
    if (!minusButton) throw new Error('minus button not found');
    fireEvent.click(minusButton);

    // Arco Popconfirm renders its confirm button with `arco-btn-primary`
    // inside `.arco-popconfirm-btn`. Select structurally — the label text
    // depends on Arco's locale (default zh = "确定") which would make the
    // assertion brittle to a locale change that's unrelated to this spec.
    const confirmButton = await waitFor(() => {
      const btn = document.querySelector('.arco-popconfirm-btn .arco-btn-primary');
      if (!btn) throw new Error('confirm button not found');
      return btn as HTMLButtonElement;
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteProviderInvoke).toHaveBeenCalledTimes(1);
    });
    expect(deleteProviderInvoke).toHaveBeenCalledWith({ id: 'p1' });
    // Must NOT have collaterally updated or recreated.
    expect(updateProviderInvoke).not.toHaveBeenCalled();
    expect(createProviderInvoke).not.toHaveBeenCalled();
  });

  it('clearing all health status issues a pure model_health PATCH per provider', async () => {
    // This is the one place the UI genuinely issues a partial update —
    // `{ id, model_health: undefined }` — rather than a full upsert.
    // Freeze that so a refactor doesn't accidentally start shipping the
    // whole IProvider again.
    const p1 = makeProvider({
      id: 'p1',
      model_health: { 'gpt-4': { status: 'healthy', last_check: 1, latency: 50 } },
    });
    const p2 = makeProvider({
      id: 'p2',
      name: 'Second',
      model_health: { 'gpt-4': { status: 'unhealthy', last_check: 2 } },
    });
    const utils = await renderWithProviders([p1, p2]);

    const clearButton = utils.getByText('settings.clearStatus').closest('button');
    if (!clearButton) throw new Error('clear status button not found');
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(updateProviderInvoke).toHaveBeenCalledTimes(2);
    });

    const bodies = updateProviderInvoke.mock.calls.map((call) => call[0] as Record<string, unknown>);
    const ids = bodies.map((b) => b.id).toSorted();
    expect(ids).toEqual(['p1', 'p2']);
    for (const body of bodies) {
      expect(body.model_health).toBeUndefined();
      // PATCH shape must be minimal — only id + model_health. If anyone
      // sneaks the whole provider back in, this check flags it loudly.
      const extraKeys = Object.keys(body).filter((k) => k !== 'id' && k !== 'model_health');
      expect(extraKeys).toEqual([]);
    }
    expect(createProviderInvoke).not.toHaveBeenCalled();
    expect(deleteProviderInvoke).not.toHaveBeenCalled();
  });

  it('renders the empty-state CTA when listProviders returns an empty array', async () => {
    const utils = await renderWithProviders([]);
    expect(utils.getByText('settings.noConfiguredModels')).toBeTruthy();
    // No CRUD calls fire as a side-effect of an empty list.
    expect(createProviderInvoke).not.toHaveBeenCalled();
    expect(updateProviderInvoke).not.toHaveBeenCalled();
    expect(deleteProviderInvoke).not.toHaveBeenCalled();
  });

  it('reads providers once per render (no accidental polling/infinite-fetch loop)', async () => {
    await renderWithProviders([makeProvider()]);
    const initialCount = listProvidersInvoke.mock.calls.length;
    // Give React a tick so any stray effect would have fired.
    await new Promise((r) => setTimeout(r, 50));
    expect(listProvidersInvoke.mock.calls.length).toBe(initialCount);
  });
});

// Keep `within` referenced so Vitest doesn't warn about the unused import
// under strict mode; tests may evolve to use it.
void within;
