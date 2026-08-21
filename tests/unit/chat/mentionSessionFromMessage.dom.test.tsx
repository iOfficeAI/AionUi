/**
 * @vitest-environment jsdom
 */

/**
 * Clicking a conversation reference on an earlier message to mention it again.
 *
 * Two things are load-bearing and neither is visual:
 *
 * 1. The click emits the RESOLVED name, not the one baked into the old message.
 *    An agent may have renamed the conversation since, and the token has to match
 *    what the reconciliation will look for.
 * 2. An ineligible target never reaches the send box. A `@@` reference is atomic,
 *    so a stale one fails the entire message at the send boundary — after the user
 *    has written it.
 */

import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listMock, warningMock, emitMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  warningMock: vi.fn(),
  emitMock: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  sessionMention: { list: { invoke: listMock } },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      getCrossSessionMessageEnabled: { invoke: vi.fn().mockResolvedValue({ cross_session_message_enabled: true }) },
      setCrossSessionMessageEnabled: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversation_id: 'conv-here' }),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: emitMock },
}));

vi.mock('@arco-design/web-react', () => ({
  Message: { warning: warningMock },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { useMentionSessionFromMessage } = await import('@/renderer/hooks/chat/useMentionSessionFromMessage');
const { resetCrossSessionMessageEnabledCache } = await import('@/renderer/hooks/chat/useCrossSessionMessageEnabled');

const Probe: React.FC = () => {
  const { available, mention } = useMentionSessionFromMessage();
  return (
    <div>
      <span data-testid='available'>{String(available)}</span>
      <button type='button' onClick={() => mention({ id: 'conv-target', name: 'stale name' })}>
        mention
      </button>
    </div>
  );
};

const clickMention = async (): Promise<void> => {
  await act(async () => {
    screen.getByText('mention').click();
  });
};

describe('useMentionSessionFromMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    act(() => {
      resetCrossSessionMessageEnabledCache();
    });
  });

  it('is available in an ordinary conversation', async () => {
    await act(async () => {
      render(<Probe />);
    });
    expect(screen.getByTestId('available').textContent).toBe('true');
  });

  it('emits the name the lookup returns, not the stale one from the message', async () => {
    listMock.mockResolvedValue({ items: [{ id: 'conv-target', name: 'the current name' }] });
    await act(async () => {
      render(<Probe />);
    });

    await clickMention();

    expect(listMock).toHaveBeenCalledWith({ current_conversation_id: 'conv-here', id: 'conv-target', limit: 1 });
    expect(emitMock).toHaveBeenCalledWith(
      'sendbox.mention.session',
      { id: 'conv-target', name: 'the current name' },
      'conv-here'
    );
  });

  it('warns and emits nothing when the target is no longer mentionable', async () => {
    // Deleted, joined a team, or is the conversation we are already in — all
    // arrive as an empty page from the same route the picker uses.
    listMock.mockResolvedValue({ items: [] });
    await act(async () => {
      render(<Probe />);
    });

    await clickMention();

    expect(warningMock).toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('warns and emits nothing when the lookup is refused', async () => {
    // A 403 from the master switch or from a team-owned sender.
    listMock.mockRejectedValue(new Error('forbidden'));
    await act(async () => {
      render(<Probe />);
    });

    await clickMention();

    expect(warningMock).toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('is unavailable while the master switch is off', async () => {
    const { ipcBridge } = await import('@/common');
    vi.mocked(ipcBridge.systemSettings!.getCrossSessionMessageEnabled!.invoke!).mockResolvedValue({
      cross_session_message_enabled: false,
    });
    act(() => {
      resetCrossSessionMessageEnabledCache();
    });

    await act(async () => {
      render(<Probe />);
    });

    expect(screen.getByTestId('available').textContent).toBe('false');
  });
});
