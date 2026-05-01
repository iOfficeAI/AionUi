import { describe, expect, it, vi } from 'vitest';
import type { IConfirmation } from '@/common/chat/chatLib';
import { CodexPermissionResolver } from '@/process/agent/codex/appserver/CodexPermissionResolver';

describe('CodexPermissionResolver', () => {
  it('maps command approval requests to AionUi confirmations and resolves approved decisions', async () => {
    const addConfirmation = vi.fn<(confirmation: IConfirmation<string>) => void>();
    const resolver = new CodexPermissionResolver({ addConfirmation });

    const promise = resolver.handleRequest({
      jsonrpc: '2.0',
      id: 7,
      method: 'item/commandExecution/requestApproval',
      params: {
        itemId: 'cmd-1',
        command: ['bun', 'test'],
        cwd: '/workspace',
        reason: 'run tests',
      },
    });

    expect(addConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'codex_native_7',
        action: 'exec',
        callId: 'codex_native_7',
        description: expect.stringContaining('bun test'),
        options: [
          expect.objectContaining({ value: 'allow_once' }),
          expect.objectContaining({ value: 'allow_always' }),
          expect.objectContaining({ value: 'reject_once' }),
          expect.objectContaining({ value: 'reject_always' }),
        ],
      })
    );
    expect(addConfirmation.mock.calls[0]?.[0].description).toContain('run tests');

    resolver.resolve('codex_native_7', 'allow_once');

    await expect(promise).resolves.toEqual({ decision: 'accept' });
  });

  it.each([
    ['allow_always', 'acceptForSession'],
    ['reject_once', 'decline'],
    ['reject_always', 'cancel'],
    ['unexpected', 'decline'],
  ])('maps %s confirmation choices to %s server decisions', async (option, decision) => {
    const resolver = new CodexPermissionResolver({ addConfirmation: vi.fn() });

    const promise = resolver.handleRequest({
      jsonrpc: '2.0',
      id: `choice-${option}`,
      method: 'item/commandExecution/requestApproval',
      params: { command: 'pwd' },
    });

    resolver.resolve(`codex_native_choice-${option}`, option);

    await expect(promise).resolves.toEqual({ decision });
  });

  it('maps file change approval requests to edit confirmations', async () => {
    const addConfirmation = vi.fn<(confirmation: IConfirmation<string>) => void>();
    const resolver = new CodexPermissionResolver({ addConfirmation });

    const promise = resolver.handleRequest({
      jsonrpc: '2.0',
      id: 'file-1',
      method: 'item/fileChange/requestApproval',
      params: {
        itemId: 'patch-1',
        path: 'src/app.ts',
        reason: 'update implementation',
      },
    });

    expect(addConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'codex_native_file-1',
        action: 'edit',
        callId: 'codex_native_file-1',
        description: expect.stringContaining('src/app.ts'),
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'allow_once' }),
          expect.objectContaining({ value: 'reject_once' }),
        ]),
      })
    );

    resolver.resolve('codex_native_file-1', 'allow_always');

    await expect(promise).resolves.toEqual({ decision: 'acceptForSession' });
  });

  it('maps permission approval requests to granted permission profiles', async () => {
    const addConfirmation = vi.fn<(confirmation: IConfirmation<string>) => void>();
    const resolver = new CodexPermissionResolver({ addConfirmation });

    const promise = resolver.handleRequest({
      jsonrpc: '2.0',
      id: 'perm-1',
      method: 'item/permissions/requestApproval',
      params: {
        itemId: 'call-1',
        permissions: {
          network: { enabled: true },
          fileSystem: {
            write: ['/workspace/generated'],
          },
        },
        permission: 'network_access',
        reason: 'fetch remote docs',
      },
    });

    expect(addConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'codex_native_perm-1',
        action: 'edit',
        callId: 'codex_native_perm-1',
        description: expect.stringContaining('network_access'),
      })
    );

    resolver.resolve('codex_native_perm-1', 'allow_once');

    await expect(promise).resolves.toEqual({
      permissions: {
        network: { enabled: true },
        fileSystem: {
          write: ['/workspace/generated'],
        },
      },
      scope: 'turn',
    });
  });

  it('denies permission approval requests with an empty granted profile', async () => {
    const resolver = new CodexPermissionResolver({ addConfirmation: vi.fn() });

    const promise = resolver.handleRequest({
      jsonrpc: '2.0',
      id: 'perm-denied',
      method: 'item/permissions/requestApproval',
      params: {
        itemId: 'call-1',
        permissions: {
          network: { enabled: true },
        },
      },
    });

    resolver.resolve('codex_native_perm-denied', 'reject_once');

    await expect(promise).resolves.toEqual({
      permissions: {},
      scope: 'turn',
    });
  });

  it('rejects unsupported app-server request methods by default', async () => {
    const resolver = new CodexPermissionResolver({ addConfirmation: vi.fn() });

    await expect(
      resolver.handleRequest({ jsonrpc: '2.0', id: 8, method: 'unknown/request', params: {} })
    ).resolves.toEqual({
      decision: 'decline',
      reason: 'Unsupported Codex app-server request: unknown/request',
    });
  });
});
