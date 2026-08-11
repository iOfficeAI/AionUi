import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

const TEST_DIR = path.join(os.tmpdir(), `aionui-channel-send-${process.pid}`);
const mockGetConversation = vi.fn();
const TEST_DATA_ROOT = path.join(TEST_DIR, 'data-root');
const TEST_CONFIG_ROOT = path.join(TEST_DIR, 'config-root');

function buildChannelSendProtocol(action: {
  type: 'image' | 'file';
  path: string;
  fileName?: string;
  caption?: string;
}): string {
  return `[AIONUI_CHANNEL_SEND]
${JSON.stringify(action)}
[/AIONUI_CHANNEL_SEND]`;
}

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({
    getConversation: mockGetConversation,
  })),
}));

vi.mock('@process/utils', () => ({
  getDataPath: vi.fn(() => TEST_DATA_ROOT),
  getConfigPath: vi.fn(() => TEST_CONFIG_ROOT),
}));

beforeEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(TEST_DATA_ROOT, { recursive: true });
  fs.mkdirSync(path.join(TEST_CONFIG_ROOT, 'temp'), { recursive: true });
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
      buildChannelSendProtocol({ type: 'file', path: externalFile }),
      'conv-missing-workspace'
    );

    expect(parsed.mediaActions).toEqual([]);
    expect(parsed.rejectedActions).toEqual([
      {
        type: 'file',
        path: externalFile,
        reason: 'workspace_unavailable',
      },
    ]);
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
      buildChannelSendProtocol({ type: 'file', path: './leak.txt' }),
      'conv-workspace'
    );

    expect(parsed.mediaActions).toEqual([]);
    expect(parsed.rejectedActions).toEqual([
      {
        type: 'file',
        path: './leak.txt',
        reason: 'outside_allowed',
      },
    ]);
  });

  it('allows files from sibling managed temp workspaces under the app data root', async () => {
    const { resolveChannelSendProtocol } = await import('@process/channels/utils/channelSendProtocol');
    const workspace = path.join(TEST_DATA_ROOT, 'codex-temp-100');
    const siblingWorkspace = path.join(TEST_DATA_ROOT, 'claude-temp-200');
    const sharedFile = path.join(siblingWorkspace, 'uploads', 'report.pdf');

    fs.mkdirSync(path.dirname(sharedFile), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(sharedFile, 'report');
    mockGetConversation.mockReturnValue({ success: true, data: { extra: { workspace } } });
    const canonicalSharedFile = fs.realpathSync(sharedFile);

    const parsed = await resolveChannelSendProtocol(
      buildChannelSendProtocol({
        type: 'file',
        path: '../claude-temp-200/uploads/report.pdf',
        fileName: 'report.pdf',
      }),
      'conv-sibling-temp'
    );

    expect(parsed.mediaActions).toEqual([
      {
        type: 'file',
        path: canonicalSharedFile,
        fileName: 'report.pdf',
      },
    ]);
    expect(parsed.rejectedActions).toEqual([]);
  });

  it('allows files from config temp storage', async () => {
    const { resolveChannelSendProtocol } = await import('@process/channels/utils/channelSendProtocol');
    const workspace = path.join(TEST_DATA_ROOT, 'codex-temp-100');
    const tempFile = path.join(TEST_CONFIG_ROOT, 'temp', 'image.png');

    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(tempFile, 'image-bytes');
    mockGetConversation.mockReturnValue({ success: true, data: { extra: { workspace } } });
    const canonicalTempFile = fs.realpathSync(tempFile);

    const parsed = await resolveChannelSendProtocol(
      buildChannelSendProtocol({ type: 'image', path: tempFile }),
      'conv-config-temp'
    );

    expect(parsed.mediaActions).toEqual([
      {
        type: 'image',
        path: canonicalTempFile,
      },
    ]);
    expect(parsed.rejectedActions).toEqual([]);
  });

  it('still rejects arbitrary files that only happen to live under the app data root', async () => {
    const { resolveChannelSendProtocol } = await import('@process/channels/utils/channelSendProtocol');
    const workspace = path.join(TEST_DATA_ROOT, 'codex-temp-100');
    const dbFile = path.join(TEST_DATA_ROOT, 'aionui.db');

    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(dbFile, 'not-shareable');
    mockGetConversation.mockReturnValue({ success: true, data: { extra: { workspace } } });

    const parsed = await resolveChannelSendProtocol(
      buildChannelSendProtocol({
        type: 'file',
        path: '../aionui.db',
        fileName: 'aionui.db',
      }),
      'conv-reject-data-root-file'
    );

    expect(parsed.mediaActions).toEqual([]);
    expect(parsed.rejectedActions).toEqual([
      {
        type: 'file',
        path: '../aionui.db',
        fileName: 'aionui.db',
        reason: 'outside_allowed',
      },
    ]);
  });
});
