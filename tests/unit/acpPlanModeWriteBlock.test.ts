/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockWriteTextFile } = vi.hoisted(() => ({
  mockWriteTextFile: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/process/agent/acp/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/process/agent/acp/utils')>();
  return {
    ...original,
    writeTextFile: mockWriteTextFile,
  };
});

import { AcpConnection } from '../../src/process/agent/acp/AcpConnection';

// helpers

/** Create an AcpConnection with internal state set up for testing */
function makeConnection(): AcpConnection {
  const conn = new AcpConnection();
  (conn as any).sessionId = 'test-session';
  (conn as any).backend = 'claude';
  (conn as any).workingDir = '/tmp';
  (conn as any).child = {
    stdin: { write: vi.fn() },
    killed: false,
    pid: 12345,
    kill: vi.fn(),
  };
  return conn;
}

// Plan-mode write blocking

describe('AcpConnection plan-mode write blocking', () => {
  let conn: AcpConnection;

  beforeEach(() => {
    conn = makeConnection();
    mockWriteTextFile.mockClear();
  });

  it('rejects fs/write_text_file when currentModeId is "plan"', async () => {
    (conn as any).currentModeId = 'plan';

    await expect((conn as any).handleWriteOperation({ path: '/tmp/test.txt', content: 'hello' })).rejects.toThrow(
      'Write operations are disabled in plan mode'
    );

    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });

  it('allows fs/write_text_file when currentModeId is "acceptEdits"', async () => {
    (conn as any).currentModeId = 'acceptEdits';

    await (conn as any).handleWriteOperation({ path: '/tmp/test.txt', content: 'hello' });

    expect(mockWriteTextFile).toHaveBeenCalledWith('/tmp/test.txt', 'hello');
  });

  it('allows fs/write_text_file when currentModeId is null', async () => {
    (conn as any).currentModeId = null;

    await (conn as any).handleWriteOperation({ path: '/tmp/test.txt', content: 'hello' });

    expect(mockWriteTextFile).toHaveBeenCalledWith('/tmp/test.txt', 'hello');
  });

  it('updates currentModeId after setSessionMode succeeds', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({});

    expect(conn.getCurrentModeId()).toBeNull();

    await conn.setSessionMode('plan');

    expect(conn.getCurrentModeId()).toBe('plan');
  });

  it('updates currentModeId when switching out of plan mode', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({});

    await conn.setSessionMode('plan');
    expect(conn.getCurrentModeId()).toBe('plan');

    await conn.setSessionMode('acceptEdits');
    expect(conn.getCurrentModeId()).toBe('acceptEdits');
  });

  it('clears currentModeId on disconnect', async () => {
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({});
    await conn.setSessionMode('plan');
    expect(conn.getCurrentModeId()).toBe('plan');

    await conn.disconnect();

    expect(conn.getCurrentModeId()).toBeNull();
  });

  it('clears currentModeId on process exit', () => {
    (conn as any).currentModeId = 'plan';
    (conn as any).isSetupComplete = true;

    // Simulate process exit by calling handleProcessExit directly
    (conn as any).handleProcessExit(1, 'SIGTERM');

    expect(conn.getCurrentModeId()).toBeNull();
  });
});

// Initialize capability advertisement

describe('AcpConnection.initialize() capability advertisement', () => {
  it('advertises writeTextFile: true when no initial mode is set', async () => {
    const conn = makeConnection();
    const sendRequest = vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({
      protocolVersion: 1,
      capabilities: {},
    });

    await (conn as any).initialize();

    const params = sendRequest.mock.calls[0][1];
    expect(params.clientCapabilities.fs.writeTextFile).toBe(true);
  });

  it('advertises writeTextFile: false when initial mode is "plan"', async () => {
    const conn = makeConnection();
    conn.setInitialModeId('plan');
    const sendRequest = vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({
      protocolVersion: 1,
      capabilities: {},
    });

    await (conn as any).initialize();

    const params = sendRequest.mock.calls[0][1];
    expect(params.clientCapabilities.fs.writeTextFile).toBe(false);
  });

  it('advertises writeTextFile: true when initial mode is "acceptEdits"', async () => {
    const conn = makeConnection();
    conn.setInitialModeId('acceptEdits');
    const sendRequest = vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({
      protocolVersion: 1,
      capabilities: {},
    });

    await (conn as any).initialize();

    const params = sendRequest.mock.calls[0][1];
    expect(params.clientCapabilities.fs.writeTextFile).toBe(true);
  });

  it('seeds currentModeId from initialModeId during initialize', async () => {
    const conn = makeConnection();
    conn.setInitialModeId('plan');
    vi.spyOn(conn as any, 'sendRequest').mockResolvedValue({
      protocolVersion: 1,
      capabilities: {},
    });

    expect(conn.getCurrentModeId()).toBeNull();

    await (conn as any).initialize();

    expect(conn.getCurrentModeId()).toBe('plan');
  });
});
