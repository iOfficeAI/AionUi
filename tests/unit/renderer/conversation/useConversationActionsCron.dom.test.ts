/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateMock, requestPrefillMock, routeState, archiveMock, leaveOwnGroupMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  requestPrefillMock: vi.fn(),
  routeState: { id: 'current-conversation' as string | undefined },
  archiveMock: vi.fn(async () => true),
  leaveOwnGroupMock: vi.fn(async () => true),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'cron.status.defaultPrompt' ? 'Create with /cron in AionUi' : key),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ id: routeState.id }),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      remove: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
    },
    sidebar: { archive: { invoke: archiveMock } },
  },
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations', () => ({
  useSplitGroupMutations: () => ({ leaveOwnGroup: leaveOwnGroupMock }),
  nextFocusNonce: () => 1,
  splitGroupRoute: (group_id: string) => `/split/${group_id}`,
}));

// Arco's Message renders through the React 18 ReactDOM.render shim, which is
// gone in React 19; the archive actions below are the only ones here that
// reach it, and what they show is not what these tests are about.
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    // The batch archive asks for confirmation; these tests are about what it
    // does once confirmed.
    Modal: { ...actual.Modal, confirm: (config: { onOk?: () => unknown }) => void config.onOk?.() },
  };
});

vi.mock('@/renderer/hooks/chat/useSendBoxDraft', () => ({
  requestConversationSendBoxPrefill: requestPrefillMock,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: vi.fn(),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: vi.fn() },
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';

const makeConversation = (id: string, type: TChatConversation['type']): TChatConversation =>
  ({
    id,
    type,
    name: id,
    created_at: 1,
    modified_at: 1,
    extra: type === 'acp' ? { backend: 'claude' } : {},
    model: {},
  }) as TChatConversation;

const renderActions = (onSessionClick?: () => void, selectedConversationIds = new Set<string>()) =>
  renderHook(() =>
    useConversationActions({
      batchMode: false,
      onSessionClick,
      selectedConversationIds,
      setSelectedConversationIds: vi.fn(),
      toggleSelectedConversation: vi.fn(),
      markAsRead: vi.fn(),
    })
  );

describe('create scheduled task conversation action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.id = 'current-conversation';
  });

  it('prefills the current editable conversation without navigating', () => {
    const { result } = renderActions();

    act(() => result.current.handleCreateCronTask(makeConversation('current-conversation', 'acp')));

    expect(requestPrefillMock).toHaveBeenCalledWith('current-conversation', 'Create with /cron in AionUi');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('queues the target-scoped prefill before navigating to a background conversation', () => {
    const onSessionClick = vi.fn();
    const { result } = renderActions(onSessionClick);

    act(() => result.current.handleCreateCronTask(makeConversation('background-conversation', 'aionrs')));

    expect(requestPrefillMock).toHaveBeenCalledWith('background-conversation', 'Create with /cron in AionUi');
    expect(navigateMock).toHaveBeenCalledWith('/conversation/background-conversation');
    expect(requestPrefillMock.mock.invocationCallOrder[0]).toBeLessThan(navigateMock.mock.invocationCallOrder[0]);
    expect(onSessionClick).toHaveBeenCalledOnce();
  });

  it.each(['openclaw-gateway', 'nanobot', 'remote', 'gemini', 'codex'])(
    'routes the read-only %s conversation to a draft-preserving Guid prefill',
    (type) => {
      const { result } = renderActions();

      act(() => result.current.handleCreateCronTask(makeConversation(`readonly-${type}`, type)));

      expect(requestPrefillMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/guid', {
        state: {
          prefillPrompt: 'Create with /cron in AionUi',
          preservePrefillDraft: true,
          focusPrefill: true,
        },
      });
    }
  );
});

/**
 * Archiving a split-group member used to leave its tag behind. The row left
 * the active list, so the group showed one loaded member and folded back into
 * a plain row — while the census, which counts archived rows, still saw two and
 * refused both to dissolve the group and to let the survivor join another one.
 * Every archive path now takes the conversation out of its group first, which
 * turns that dead end into an ordinary removal.
 */
describe('archiving takes a conversation out of its split group first', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeState.id = 'current-conversation';
  });

  it('leaves the group before the row archives', async () => {
    const conversation = makeConversation('member-a', 'acp');
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(conversation);
    });
    expect(leaveOwnGroupMock).toHaveBeenCalledWith('member-a', { moveToSurvivor: true });
    expect(archiveMock).toHaveBeenCalledWith({ item_type: 'conversation', item_id: 'member-a' });
    // Order matters: archiving first would strand the tag on a row the active
    // list can no longer show.
    expect(leaveOwnGroupMock.mock.invocationCallOrder[0]).toBeLessThan(archiveMock.mock.invocationCallOrder[0]);
  });

  it('does the same for a conversation that is in no group — the write path decides, not the caller', async () => {
    const conversation = makeConversation('loner', 'acp');
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(conversation);
    });
    // leaveOwnGroup is a no-op for an ungrouped row, so the caller never has to
    // know which rows are members.
    expect(leaveOwnGroupMock).toHaveBeenCalledWith('loner', { moveToSurvivor: true });
    expect(archiveMock).toHaveBeenCalledTimes(1);
  });
});

/**
 * A conversation that could not leave its group must not be archived. The
 * archive drops it out of the active list while the census still counts it, so
 * the tag it kept would be one no later read can clear — the dead end the
 * leave-first order exists to avoid. Reporting the archive as done on top of
 * that would hide it.
 */
describe('a refused leave stops the archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaveOwnGroupMock.mockResolvedValue(true);
    archiveMock.mockResolvedValue(true);
    routeState.id = 'current-conversation';
  });

  it('archives nothing when the conversation could not leave its group', async () => {
    leaveOwnGroupMock.mockResolvedValue(false);
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(makeConversation('member-a', 'acp'));
    });
    expect(leaveOwnGroupMock).toHaveBeenCalledWith('member-a', { moveToSurvivor: true });
    expect(archiveMock).not.toHaveBeenCalled();
  });

  it('archives normally once the leave lands', async () => {
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(makeConversation('member-a', 'acp'));
    });
    expect(archiveMock).toHaveBeenCalledWith({ item_type: 'conversation', item_id: 'member-a' });
  });

  it('does not hand the user a survivor it is about to archive', async () => {
    // Archiving both members of a pair dissolves it. Following that dissolve
    // would drop the user on the survivor moments before the next call takes
    // it out of the list too.
    const { result } = renderActions(undefined, new Set(['member-a', 'member-b']));
    await act(async () => {
      result.current.handleBatchArchive();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    for (const call of leaveOwnGroupMock.mock.calls) {
      expect(call[1]).toEqual({ moveToSurvivor: false });
    }
  });

  it('still shows the survivor when a single row leaves a pair', async () => {
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(makeConversation('member-a', 'acp'));
    });
    // One row leaving is the case the survivor navigation was written for:
    // the group's columns are gone, and that is where the user was looking.
    expect(leaveOwnGroupMock).toHaveBeenCalledWith('member-a', { moveToSurvivor: true });
  });

  it('lets the rest of a batch through when one row cannot leave', async () => {
    // The old shape awaited every leave together, so one refusal vetoed the
    // whole selection; each row now stands on its own.
    leaveOwnGroupMock.mockImplementation(async (id: string) => id !== 'bad');
    const { result } = renderActions(undefined, new Set(['good-1', 'bad', 'good-2']));
    await act(async () => {
      result.current.handleBatchArchive();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const archived = archiveMock.mock.calls.map((call) => (call[0] as { item_id: string }).item_id);
    expect(archived).toContain('good-1');
    expect(archived).toContain('good-2');
    expect(archived).not.toContain('bad');
  });
});
