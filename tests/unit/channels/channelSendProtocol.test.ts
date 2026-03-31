import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const mockGetConversation = vi.fn();

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({
    getConversation: mockGetConversation,
  })),
}));

const TEST_DIR = path.join(os.tmpdir(), `aionui-channel-send-${process.pid}`);

beforeEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  mockGetConversation.mockReset();
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('channelSendProtocol', () => {
  it('fails closed when the conversation workspace is missing', async () => {
    const { resolveChannelSendProtocol } = await import('@process/channels/utils/channelSendProtocol');
    const externalFile = path.join(TEST_DIR, 'outside.txt');
    fs.writeFileSync(externalFile, 'secret');
    mockGetConversation.mockReturnValue({ success: false });

    const parsed = await resolveChannelSendProtocol(
      `[AIONUI_CHANNEL_SEND]
{"type":"file","path":"${externalFile}"}
[/AIONUI_CHANNEL_SEND]`,
      'conv-missing-workspace'
    );

    expect(parsed.mediaActions).toEqual([]);
  });

  it('rejects symlink targets that escape the workspace root', async () => {
    const { resolveChannelSendProtocol } = await import('@process/channels/utils/channelSendProtocol');
    const workspace = path.join(TEST_DIR, 'workspace');
    const externalFile = path.join(TEST_DIR, 'outside.txt');
    const symlinkPath = path.join(workspace, 'leak.txt');

    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(externalFile, 'secret');
    fs.symlinkSync(externalFile, symlinkPath);
    mockGetConversation.mockReturnValue({ success: true, data: { extra: { workspace } } });

    const parsed = await resolveChannelSendProtocol(
      `[AIONUI_CHANNEL_SEND]
{"type":"file","path":"./leak.txt"}
[/AIONUI_CHANNEL_SEND]`,
      'conv-workspace'
    );

    expect(parsed.mediaActions).toEqual([]);
  });
});
