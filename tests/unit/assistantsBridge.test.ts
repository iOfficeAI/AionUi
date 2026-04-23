/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assistants } from '../../src/common/adapter/ipcBridge';
import type {
  Assistant,
  CreateAssistantRequest,
  ImportAssistantsRequest,
  ImportAssistantsResult,
  SetAssistantStateRequest,
  UpdateAssistantRequest,
} from '../../src/common/types/assistantTypes';

// ---------------------------------------------------------------------------
// fetch stub
// ---------------------------------------------------------------------------

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
  headers: Record<string, string>;
};

let fetchCalls: FetchCall[];
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response>;

function installFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  fetchImpl = impl;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    fetchCalls.push({
      url,
      method: (init?.method ?? 'GET').toUpperCase(),
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      headers: (init?.headers as Record<string, string>) ?? {},
    });
    return fetchImpl(url, init);
  }) as unknown as typeof fetch;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(status: number, body: unknown = { success: false, msg: 'err' }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchCalls = [];
});

afterEach(() => {
  // Reset the backend port hint between tests if any test set it.
  if (typeof window !== 'undefined') {
    delete (window as Window & { __backendPort?: number }).__backendPort;
  }
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAssistant(overrides: Partial<Assistant> = {}): Assistant {
  return {
    id: 'custom-1',
    source: 'user',
    name: 'Custom',
    nameI18n: {},
    descriptionI18n: {},
    enabled: true,
    sortOrder: 0,
    presetAgentType: 'gemini',
    enabledSkills: [],
    customSkillNames: [],
    disabledBuiltinSkills: [],
    contextI18n: {},
    prompts: [],
    promptsI18n: {},
    models: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// list — GET /api/assistants
// ---------------------------------------------------------------------------

describe('ipcBridge.assistants.list', () => {
  it('issues GET /api/assistants with no body', async () => {
    const list = [makeAssistant({ id: 'a' }), makeAssistant({ id: 'b', source: 'builtin' })];
    installFetch(async () => jsonResponse(list));

    const result = await assistants.list.invoke();

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe('GET');
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:13400/api/assistants');
    expect(fetchCalls[0].body).toBeUndefined();
    expect(result).toEqual(list);
  });

  it('unwraps the { success, data } envelope', async () => {
    const list = [makeAssistant({ id: 'x' })];
    installFetch(async () =>
      new Response(JSON.stringify({ success: true, data: list, extra: 'ignored' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await assistants.list.invoke();
    expect(result).toEqual(list);
  });

  it('throws with status + body details when the backend returns 500', async () => {
    installFetch(async () => errorResponse(500, { success: false, msg: 'boom' }));

    await expect(assistants.list.invoke()).rejects.toThrow(/GET \/api\/assistants failed \(500\)/);
  });
});

// ---------------------------------------------------------------------------
// create — POST /api/assistants
// ---------------------------------------------------------------------------

describe('ipcBridge.assistants.create', () => {
  it('issues POST /api/assistants with the request body as JSON', async () => {
    const created = makeAssistant({ id: 'new-1', name: 'New' });
    const request: CreateAssistantRequest = {
      name: 'New',
      description: 'desc',
      presetAgentType: 'claude',
      enabledSkills: ['pptx'],
    };
    installFetch(async () => jsonResponse(created));

    const result = await assistants.create.invoke(request);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe('POST');
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:13400/api/assistants');
    expect(fetchCalls[0].body).toEqual(request);
    expect(fetchCalls[0].headers['Content-Type']).toBe('application/json');
    expect(result).toEqual(created);
  });

  it('propagates 4xx errors from the backend', async () => {
    installFetch(async () => errorResponse(400, { success: false, msg: 'name required' }));

    await expect(assistants.create.invoke({ name: '' })).rejects.toThrow(
      /POST \/api\/assistants failed \(400\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// update — PUT /api/assistants/:id
// ---------------------------------------------------------------------------

describe('ipcBridge.assistants.update', () => {
  it('issues PUT /api/assistants/:id with the id in the path and full body', async () => {
    const updated = makeAssistant({ id: 'custom-1', name: 'Renamed' });
    const request: UpdateAssistantRequest = {
      id: 'custom-1',
      name: 'Renamed',
      description: 'd',
    };
    installFetch(async () => jsonResponse(updated));

    const result = await assistants.update.invoke(request);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe('PUT');
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:13400/api/assistants/custom-1');
    // The current adapter passes the full params object (including id) as the body.
    expect(fetchCalls[0].body).toEqual(request);
    expect(result).toEqual(updated);
  });

  it('propagates 404 when the assistant is absent', async () => {
    installFetch(async () => errorResponse(404, { success: false, msg: 'not found' }));

    await expect(assistants.update.invoke({ id: 'missing' })).rejects.toThrow(
      /PUT \/api\/assistants\/missing failed \(404\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// delete — DELETE /api/assistants/:id
// ---------------------------------------------------------------------------

describe('ipcBridge.assistants.delete', () => {
  it('issues DELETE /api/assistants/:id with no body', async () => {
    installFetch(async () => new Response(null, { status: 204 }));

    await assistants.delete.invoke({ id: 'custom-1' });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe('DELETE');
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:13400/api/assistants/custom-1');
    expect(fetchCalls[0].body).toBeUndefined();
  });

  it('propagates backend errors on delete', async () => {
    installFetch(async () => errorResponse(409, { success: false, msg: 'builtin immutable' }));

    await expect(assistants.delete.invoke({ id: 'builtin-office' })).rejects.toThrow(
      /DELETE \/api\/assistants\/builtin-office failed \(409\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// setState — PATCH /api/assistants/:id/state
// ---------------------------------------------------------------------------

describe('ipcBridge.assistants.setState', () => {
  it('issues PATCH /api/assistants/:id/state with body stripped of id', async () => {
    const updated = makeAssistant({ id: 'custom-1', enabled: false });
    const request: SetAssistantStateRequest = {
      id: 'custom-1',
      enabled: false,
      sortOrder: 3,
    };
    installFetch(async () => jsonResponse(updated));

    const result = await assistants.setState.invoke(request);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe('PATCH');
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:13400/api/assistants/custom-1/state');
    // Adapter pulls `id` out of the body; the path carries the id instead.
    expect(fetchCalls[0].body).toEqual({ enabled: false, sortOrder: 3 });
    expect(result).toEqual(updated);
  });

  it('propagates 400 when the state payload is invalid', async () => {
    installFetch(async () => errorResponse(400));

    await expect(assistants.setState.invoke({ id: 'custom-1' })).rejects.toThrow(
      /PATCH \/api\/assistants\/custom-1\/state failed \(400\)/,
    );
  });
});

// ---------------------------------------------------------------------------
// import — POST /api/assistants/import
// ---------------------------------------------------------------------------

describe('ipcBridge.assistants.import', () => {
  it('issues POST /api/assistants/import with the full ImportAssistantsRequest body', async () => {
    const request: ImportAssistantsRequest = {
      assistants: [
        { name: 'A' },
        { name: 'B', presetAgentType: 'claude' },
      ],
    };
    const response: ImportAssistantsResult = {
      imported: 2,
      skipped: 0,
      failed: 0,
      errors: [],
    };
    installFetch(async () => jsonResponse(response));

    const result = await assistants.import.invoke(request);

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].method).toBe('POST');
    expect(fetchCalls[0].url).toBe('http://127.0.0.1:13400/api/assistants/import');
    expect(fetchCalls[0].body).toEqual(request);
    expect(result).toEqual(response);
  });

  it('surfaces per-row import errors in the typed response', async () => {
    const response: ImportAssistantsResult = {
      imported: 1,
      skipped: 0,
      failed: 1,
      errors: [{ id: 'custom-bad', error: 'invalid name' }],
    };
    installFetch(async () => jsonResponse(response));

    const result = await assistants.import.invoke({
      assistants: [{ name: 'ok' }, { id: 'custom-bad', name: '' }],
    });

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toEqual({ id: 'custom-bad', error: 'invalid name' });
  });

  it('propagates 500 from the import endpoint', async () => {
    installFetch(async () => errorResponse(500));

    await expect(
      assistants.import.invoke({ assistants: [{ name: 'x' }] }),
    ).rejects.toThrow(/POST \/api\/assistants\/import failed \(500\)/);
  });
});
