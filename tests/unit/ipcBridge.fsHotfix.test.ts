/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fs, shell } from '../../src/common/adapter/ipcBridge';

describe('ipcBridge.fs — createTempFile/createUploadFile use snake_case body', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ data: '/tmp/x' }),
        } as unknown as Response;
      })
    );
  });

  it('createTempFile sends {file_name}', async () => {
    await fs.createTempFile.invoke({ file_name: 'x.txt' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ file_name: 'x.txt' });
    expect(body).not.toHaveProperty('fileName');
  });

  it('createUploadFile sends {file_name, conversation_id}', async () => {
    await fs.createUploadFile.invoke({ file_name: 'y.zip', conversation_id: 'c1' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ file_name: 'y.zip', conversation_id: 'c1' });
    expect(body).not.toHaveProperty('fileName');
    expect(body).not.toHaveProperty('conversationId');
  });

  it('readBuiltinSkill sends {file_name}', async () => {
    await fs.readBuiltinSkill.invoke({ file_name: 'auto-inject/cron/SKILL.md' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ file_name: 'auto-inject/cron/SKILL.md' });
    expect(body).not.toHaveProperty('fileName');
  });

  it('readBuiltinRule sends {file_name}', async () => {
    await fs.readBuiltinRule.invoke({ file_name: 'presets/word-creator.en-US.md' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ file_name: 'presets/word-creator.en-US.md' });
    expect(body).not.toHaveProperty('fileName');
  });

  it('readAssistantRule sends {assistant_id, locale}', async () => {
    await fs.readAssistantRule.invoke({ assistant_id: 'custom-1', locale: 'zh-CN' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ assistant_id: 'custom-1', locale: 'zh-CN' });
    expect(body).not.toHaveProperty('assistantId');
  });

  it('readAssistantSkill sends {assistant_id, locale}', async () => {
    await fs.readAssistantSkill.invoke({ assistant_id: 'custom-1', locale: 'en-US' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ assistant_id: 'custom-1', locale: 'en-US' });
    expect(body).not.toHaveProperty('assistantId');
  });

  it('writeAssistantRule sends {assistant_id, content, locale}', async () => {
    await fs.writeAssistantRule.invoke({ assistant_id: 'custom-1', content: 'rule md', locale: 'zh-CN' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ assistant_id: 'custom-1', content: 'rule md', locale: 'zh-CN' });
    expect(body).not.toHaveProperty('assistantId');
  });

  it('writeAssistantSkill sends {assistant_id, content, locale}', async () => {
    await fs.writeAssistantSkill.invoke({ assistant_id: 'custom-1', content: 'skill md', locale: 'en-US' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ assistant_id: 'custom-1', content: 'skill md', locale: 'en-US' });
    expect(body).not.toHaveProperty('assistantId');
  });

  it('deleteAssistantRule builds URL /api/skills/assistant-rule/<id>', async () => {
    await fs.deleteAssistantRule.invoke({ assistant_id: 'custom-42' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/skills/assistant-rule/custom-42');
    expect(init!.method).toBe('DELETE');
    expect(init!.body).toBeUndefined();
  });

  it('deleteAssistantSkill builds URL /api/skills/assistant-skill/<id>', async () => {
    await fs.deleteAssistantSkill.invoke({ assistant_id: 'custom-42' });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/skills/assistant-skill/custom-42');
    expect(init!.method).toBe('DELETE');
    expect(init!.body).toBeUndefined();
  });
});

describe('ipcBridge.shell — file operations use {file_path}', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () => '',
        } as unknown as Response;
      })
    );
  });

  it('openFile sends {file_path}', async () => {
    await shell.openFile.invoke('/tmp/demo.md');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ file_path: '/tmp/demo.md' });
    expect(body).not.toHaveProperty('path');
  });

  it('showItemInFolder sends {file_path}', async () => {
    await shell.showItemInFolder.invoke('/tmp/demo.md');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ file_path: '/tmp/demo.md' });
    expect(body).not.toHaveProperty('path');
  });
});
