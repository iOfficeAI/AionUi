/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  navigateMock,
  requestPrefillMock,
  routeState,
  archiveMock,
  leaveOwnGroupMock,
  messageSuccess,
  messageError,
  messageWarning,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  requestPrefillMock: vi.fn(),
  routeState: { id: 'current-conversation' as string | undefined, groupId: undefined as string | undefined },
  archiveMock: vi.fn(async () => true),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  messageWarning: vi.fn(),
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
    useParams: () => ({ id: routeState.id, groupId: routeState.groupId }),
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
    Message: { success: messageSuccess, error: messageError, warning: messageWarning },
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

type LeaveOptions = { moveToSurvivor: (survivor_id: string, group_id: string) => boolean };

/** The leave options a given row was handed, by the row's id. */
const leaveOptionsFor = (item_id: string): LeaveOptions => {
  const call = leaveOwnGroupMock.mock.calls.find(([id]) => id === item_id);
  if (!call) throw new Error(`leaveOwnGroup was never asked about ${item_id}`);
  return call[1] as LeaveOptions;
};

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
    expect(leaveOptionsFor('member-a').moveToSurvivor('member-b')).toBe(true);
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
    expect(leaveOptionsFor('loner').moveToSurvivor('anyone')).toBe(true);
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
    expect(leaveOwnGroupMock).toHaveBeenCalledWith('member-a', expect.anything());
    expect(archiveMock).not.toHaveBeenCalled();
  });

  it('archives normally once the leave lands', async () => {
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(makeConversation('member-a', 'acp'));
    });
    expect(archiveMock).toHaveBeenCalledWith({ item_type: 'conversation', item_id: 'member-a' });
  });

  const runBatch = async (ids: string[]) => {
    const { result } = renderActions(undefined, new Set(ids));
    await act(async () => {
      result.current.handleBatchArchive();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('does not hand the user a survivor it is about to archive', async () => {
    // Archiving both members of a pair dissolves it. Following that dissolve
    // would drop the user on the survivor moments before the next call takes
    // it out of the list too.
    await runBatch(['member-a', 'member-b']);
    expect(leaveOptionsFor('member-a').moveToSurvivor('member-b')).toBe(false);
    expect(leaveOptionsFor('member-b').moveToSurvivor('member-a')).toBe(false);
  });

  it('does follow the dissolve when the survivor is not in the batch', async () => {
    // Archiving one member of a pair alongside an unrelated row dissolves the
    // pair, but its survivor stays. Suppressing the move here left the open
    // split route on its not-found screen although the survivor remained.
    await runBatch(['member-a', 'unrelated']);
    expect(leaveOptionsFor('member-a').moveToSurvivor('member-b')).toBe(true);
    expect(leaveOptionsFor('member-a').moveToSurvivor('unrelated')).toBe(false);
  });

  it('still shows the survivor when a single row leaves a pair', async () => {
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(makeConversation('member-a', 'acp'));
    });
    // One row leaving is the case the survivor navigation was written for:
    // the group's columns are gone, and that is where the user was looking.
    expect(leaveOptionsFor('member-a').moveToSurvivor('member-b')).toBe(true);
  });

  it('archiving a folder follows the dissolve only to a survivor outside the folder', async () => {
    // A group can span two folders: the survivor in the other folder stays,
    // and the user should land on it; a survivor in this folder is going too.
    const { result } = renderActions();
    act(() => {
      result.current.handleArchiveProject('folder', [
        makeConversation('member-a', 'acp'),
        makeConversation('member-c', 'acp'),
      ]);
    });
    await act(async () => {
      await result.current.handleArchiveProjectConfirm();
    });
    expect(leaveOptionsFor('member-a').moveToSurvivor('member-b')).toBe(true);
    expect(leaveOptionsFor('member-a').moveToSurvivor('member-c')).toBe(false);
    expect(archiveMock).toHaveBeenCalledTimes(2);
  });

  it('never opens the folder archive for a folder with nothing in it, so nothing is ever reported for it', async () => {
    // With no rows there would be nothing to settle, and an empty settlement
    // would read as "archived 0" success. The flow is refused before it opens.
    const { result } = renderActions();
    act(() => {
      result.current.handleArchiveProject('empty', []);
    });
    expect(result.current.archiveProjectTarget).toBeNull();
    await act(async () => {
      await result.current.handleArchiveProjectConfirm();
    });
    expect(archiveMock).not.toHaveBeenCalled();
    expect(messageSuccess).not.toHaveBeenCalled();
    expect(messageError).not.toHaveBeenCalled();
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

/**
 * Which step failed decides what the user is told. It used to be read back out
 * of the error's text, so an archive failing while echoing a conversation's own
 * words could be mistaken for a failed leave and say nothing at all.
 */
describe('archive failure is reported for the step that actually failed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaveOwnGroupMock.mockResolvedValue(true);
    archiveMock.mockResolvedValue(true);
    routeState.id = 'current-conversation';
  });

  it('says the archive failed when the archive is the thing that failed', async () => {
    archiveMock.mockRejectedValue(new Error('backend refused'));
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(makeConversation('member-a', 'acp'));
    });
    expect(messageError).toHaveBeenCalledWith('conversation.history.archiveFailed');
  });

  it('stays quiet when the leave failed, because the write path already spoke', async () => {
    leaveOwnGroupMock.mockResolvedValue(false);
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(makeConversation('member-a', 'acp'));
    });
    expect(messageError).not.toHaveBeenCalled();
  });

  it('treats a leave that throws as a failed leave, not a failed archive — and still says so', async () => {
    // The queue normally answers false and speaks for itself; anything that
    // gets past it is still a failure of the same step, must not be reported
    // as the next one, and must not go unreported either: the queue never saw
    // it, so nobody else has told the user.
    leaveOwnGroupMock.mockRejectedValue(new Error('ipc exploded'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result } = renderActions();
      await act(async () => {
        await result.current.handleArchive(makeConversation('member-a', 'acp'));
      });
      expect(archiveMock).not.toHaveBeenCalled();
      expect(messageError).toHaveBeenCalledTimes(1);
      expect(messageError).toHaveBeenCalledWith('conversation.splitGroup.updateFailed');
      expect(messageError).not.toHaveBeenCalledWith('conversation.history.archiveFailed');
    } finally {
      error.mockRestore();
    }
  });

  it('does not mistake an archive error that quotes the leave wording', async () => {
    // The old check matched this message as a leave failure and swallowed the
    // toast for a real archive failure.
    archiveMock.mockRejectedValue(new Error('a conversation named "could not leave its split group"'));
    const { result } = renderActions();
    await act(async () => {
      await result.current.handleArchive(makeConversation('member-a', 'acp'));
    });
    expect(messageError).toHaveBeenCalledWith('conversation.history.archiveFailed');
  });
});

/**
 * A batch settles row by row, so "some worked" is a real outcome. It used to be
 * reported as plain success, and the rows that failed said nothing at all.
 */
describe('a partly archived batch says so', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    leaveOwnGroupMock.mockResolvedValue(true);
    archiveMock.mockResolvedValue(true);
    routeState.id = 'current-conversation';
  });

  const runBatch = async (ids: string[]) => {
    const { result } = renderActions(undefined, new Set(ids));
    await act(async () => {
      result.current.handleBatchArchive();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('warns with the counts when only some rows archived', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      leaveOwnGroupMock.mockImplementation(async (id: string) => id !== 'bad');
      await runBatch(['good-1', 'bad', 'good-2']);
      expect(messageWarning).toHaveBeenCalledWith('conversation.history.batchArchivePartial');
      expect(messageSuccess).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('reports plain success only when every row archived', async () => {
    await runBatch(['good-1', 'good-2']);
    expect(messageSuccess).toHaveBeenCalledWith('conversation.history.batchArchiveSuccess');
    expect(messageWarning).not.toHaveBeenCalled();
  });

  it('reports failure when no row archived', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      leaveOwnGroupMock.mockResolvedValue(false);
      await runBatch(['a', 'b']);
      expect(messageError).toHaveBeenCalledWith('conversation.history.archiveFailed');
    } finally {
      error.mockRestore();
    }
  });

  it('says the step that failed once per row and the batch outcome once, never the archive message for a leave', async () => {
    // A leave that throws inside a batch is told twice, on purpose: the row's
    // own message names the step (the split view could not be updated), and
    // the batch summary counts the outcome — exactly the pair a *refused*
    // leave has produced since the summary existed, where the queue names the
    // step. What must never appear is the archive-failed message for a leave.
    leaveOwnGroupMock.mockImplementation(async (id: string) => {
      if (id === 'bad') throw new Error('ipc exploded');
      return true;
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runBatch(['good-1', 'bad', 'good-2']);
      expect(messageError).toHaveBeenCalledTimes(1);
      expect(messageError).toHaveBeenCalledWith('conversation.splitGroup.updateFailed');
      expect(messageError).not.toHaveBeenCalledWith('conversation.history.archiveFailed');
      expect(messageWarning).toHaveBeenCalledTimes(1);
      expect(messageWarning).toHaveBeenCalledWith('conversation.history.batchArchivePartial');
    } finally {
      error.mockRestore();
    }
  });

  it('refuses an empty selection before anything settles, so nothing is ever reported for it', () => {
    // `Promise.allSettled([])` would resolve to zero results and read as
    // "archived 0" success; the flow never gets that far.
    const { result } = renderActions(undefined, new Set());
    act(() => {
      result.current.handleBatchArchive();
    });
    expect(messageWarning).toHaveBeenCalledWith('conversation.history.batchNoSelection');
    expect(archiveMock).not.toHaveBeenCalled();
    expect(messageSuccess).not.toHaveBeenCalled();
    expect(messageError).not.toHaveBeenCalled();
  });
});

/**
 * A batch decides not to follow a dissolve onto its survivor because it is about
 * to archive the survivor too — before that archive has run. If it then fails,
 * the survivor is still in the sidebar and the user is on the dissolved group's
 * route, which now shows nothing.
 */
describe('a batch that fails to take the survivor lands the user on it', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    archiveMock.mockResolvedValue(true);
    routeState.id = undefined;
    routeState.groupId = 'g';
    // Archiving member-a dissolves the pair; the write reports member-b as the survivor of group g.
    leaveOwnGroupMock.mockImplementation(async (item_id: string, options?: LeaveOptions) => {
      if (item_id === 'member-a') options?.moveToSurvivor('member-b', 'g');
      return true;
    });
  });

  const runBatch = async (ids: string[]) => {
    const { result } = renderActions(undefined, new Set(ids));
    await act(async () => {
      result.current.handleBatchArchive();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  it("navigates to the survivor when the survivor's own archive was refused and its group is the open route", async () => {
    archiveMock.mockImplementation(async ({ item_id }: { item_id: string }) => {
      if (item_id === 'member-b') throw new Error('backend refused');
      return true;
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runBatch(['member-a', 'member-b']);
      expect(navigateMock).toHaveBeenCalledWith('/conversation/member-b', { replace: true });
    } finally {
      error.mockRestore();
    }
  });

  it('stays put when the survivor was archived as planned', async () => {
    await runBatch(['member-a', 'member-b']);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('stays put when the open route is not that group', async () => {
    routeState.groupId = 'some-other-group';
    archiveMock.mockImplementation(async ({ item_id }: { item_id: string }) => {
      if (item_id === 'member-b') throw new Error('backend refused');
      return true;
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await runBatch(['member-a', 'member-b']);
      expect(navigateMock).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('does the same for a folder archive', async () => {
    archiveMock.mockImplementation(async ({ item_id }: { item_id: string }) => {
      if (item_id === 'member-b') throw new Error('backend refused');
      return true;
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { result } = renderActions();
      act(() => {
        result.current.handleArchiveProject('folder', [
          makeConversation('member-a', 'acp'),
          makeConversation('member-b', 'acp'),
        ]);
      });
      await act(async () => {
        await result.current.handleArchiveProjectConfirm();
      });
      expect(navigateMock).toHaveBeenCalledWith('/conversation/member-b', { replace: true });
    } finally {
      error.mockRestore();
    }
  });
});
