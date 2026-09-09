/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { requestConversationSendBoxPrefill } from '@/renderer/hooks/chat/useSendBoxDraft';
import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';
import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { emitter } from '@/renderer/utils/emitter';
import { blockMobileInputFocus, blurActiveElement } from '@/renderer/utils/ui/focus';
import { Message, Modal } from '@arco-design/web-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';

import { isConversationPinned } from '../utils/groupingHelpers';
import type { SplitGroup } from '../utils/splitGroupHelpers';
import { nextFocusNonce, splitGroupRoute, useSplitGroupMutations } from './useSplitGroupMutations';

type UseConversationActionsParams = {
  batchMode: boolean;
  onSessionClick?: () => void;
  onBatchModeChange?: (value: boolean) => void;
  selectedConversationIds: Set<string>;
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleSelectedConversation: (conversation: TChatConversation) => void;
  markAsRead: (conversation_id: string) => void;
  markManualUnread: (conversation_id: string) => void;
  clearManualUnread: (conversation_id: string) => void;
  isManualUnread: (conversation_id: string) => boolean;
};

/** Marks the step that failed, so the caller does not have to read the message. */
const LEAVE_FAILED = 'split-group-leave-failed';
type StagedError = Error & { code?: string };
const leaveFailed = (item_id: string): StagedError =>
  Object.assign(new Error(`${item_id} could not leave its split group`), { code: LEAVE_FAILED });
const isLeaveFailure = (error: unknown): boolean => (error as StagedError | null)?.code === LEAVE_FAILED;

export const useConversationActions = ({
  batchMode,
  onSessionClick,
  onBatchModeChange,
  selectedConversationIds,
  setSelectedConversationIds,
  toggleSelectedConversation,
  markAsRead,
  markManualUnread,
  clearManualUnread,
  isManualUnread,
}: UseConversationActionsParams) => {
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameModalName, setRenameModalName] = useState<string>('');
  const [renameModalId, setRenameModalId] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [dropdownVisibleId, setDropdownVisibleId] = useState<string | null>(null);
  const { id, groupId } = useParams();
  // Read at settlement, not captured when the batch starts: the user may have
  // gone elsewhere while it settled, and must not be pulled back.
  const groupIdRef = useRef(groupId);
  groupIdRef.current = groupId;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useLayoutContext()?.isMobile ?? false;
  // Archiving a split-group member has to take it out of the group first —
  // see `leaveOwnGroup`. Every archive path below goes through it.
  const { leaveOwnGroup } = useSplitGroupMutations();

  // Close dropdown when entering batch mode
  useEffect(() => {
    if (batchMode) {
      setDropdownVisibleId(null);
    }
  }, [batchMode]);

  const handleConversationClick = useCallback(
    (conversation: TChatConversation) => {
      setDropdownVisibleId(null);
      if (batchMode) {
        toggleSelectedConversation(conversation);
        return;
      }
      blockMobileInputFocus();
      blurActiveElement();

      markAsRead(conversation.id);

      void navigate(`/conversation/${conversation.id}`);
      if (onSessionClick) {
        onSessionClick();
      }
    },
    [batchMode, toggleSelectedConversation, markAsRead, navigate, onSessionClick]
  );

  // Open a split group's columns. Naming a member asks the column view to give
  // that column the focus once it is on screen (the focus store derives the
  // answer on read, so the request can land before the columns mount).
  const handleSplitGroupOpen = useCallback(
    (group: SplitGroup, member_id?: string) => {
      setDropdownVisibleId(null);
      if (batchMode) return;
      blockMobileInputFocus();
      blurActiveElement();

      // Only a member can be asked for; anything else opens the first column.
      const focus = member_id && group.members.some((member) => member.id === member_id) ? member_id : undefined;
      // Desktop shows every column, so every member is seen; a narrow
      // viewport shows one tab, and the others are marked read as they open.
      const shown = isMobile ? [focus ?? group.members[0].id] : group.members.map((member) => member.id);
      for (const shown_id of shown) markAsRead(shown_id);

      // The nonce makes a repeated request for the same member a new one — a
      // counter, so a held Enter cannot issue two of them in the same millisecond.
      void navigate(splitGroupRoute(group.id), { state: focus ? { focus, nonce: nextFocusNonce() } : null });
      if (onSessionClick) {
        onSessionClick();
      }
    },
    [batchMode, isMobile, markAsRead, navigate, onSessionClick]
  );

  const removeConversation = useCallback(
    async (conversation_id: string) => {
      const success = await ipcBridge.conversation.remove.invoke({ id: conversation_id });
      if (!success) {
        return false;
      }

      emitter.emit('conversation.deleted', conversation_id);
      if (id === conversation_id) {
        void navigate('/');
      }
      return true;
    },
    [id, navigate]
  );

  /**
   * Archive one conversation, taking it out of its split group first.
   *
   * The order is deliberate and is the lesser of two partial failures. Leaving
   * first means a refused archive leaves the conversation ungrouped but intact
   * and still in the sidebar — visible, and something the user can simply drag
   * back. Archiving first would mean a refused leave strands the tag on a row
   * the active list no longer shows, where no census will ever clear it and
   * the survivor can never join another group. There is no transaction across
   * the two calls, so one of the two windows has to exist; this is the one
   * that stays recoverable.
   *
   * A leave that fails stops the archive outright. The queue has already said
   * what went wrong, so this adds no second message of its own.
   */
  const archiveConversation = useCallback(
    async (
      item_id: string,
      /**
       * The rest of the rows this archive is taking. A dissolve moves the user
       * onto the survivor only when the survivor is not one of them — landing
       * on a row moments before archiving it is worse than not moving at all,
       * but a survivor that stays is exactly where the user should end up,
       * since the columns they were looking at are gone.
       */
      {
        alsoArchiving = new Set<string>(),
        survivorsLeftBehind,
      }: {
        alsoArchiving?: ReadonlySet<string>;
        /** Where to note a survivor this archive chose not to follow, by the group it survived. */
        survivorsLeftBehind?: Map<string, string>;
      } = {}
    ): Promise<void> => {
      // Which step failed decides what the user is told, so it is carried on
      // the error rather than read back out of its text: an archive that fails
      // while echoing a conversation's own words must not be mistaken for a
      // failed leave, and renaming the message must not silently change which
      // branch runs.
      let left = false;
      try {
        left = await leaveOwnGroup(item_id, {
          moveToSurvivor: (survivor_id, group_id) => {
            if (!alsoArchiving.has(survivor_id)) return true;
            survivorsLeftBehind?.set(group_id, survivor_id);
            return false;
          },
        });
      } catch (error) {
        // The queue normally answers `false` rather than throwing, and has
        // already said so on screen when it does. Anything that gets past it is
        // still a failure of the same step — but one the queue never reported,
        // so it is said here, once, before the caller suppresses the archive
        // message for it.
        console.error(`Failed to take ${item_id} out of its split group:`, error);
        Message.error(t('conversation.splitGroup.updateFailed'));
        throw leaveFailed(item_id);
      }
      if (!left) throw leaveFailed(item_id);
      await ipcBridge.sidebar.archive.invoke({ item_type: 'conversation', item_id });
    },
    [leaveOwnGroup, t]
  );

  /**
   * A batch chose not to follow a dissolve onto its survivor because the batch
   * was about to archive that survivor too. That decision was made before the
   * survivor's own archive ran; if it then failed, the survivor is still there,
   * the group's columns are gone, and the user is on a route for a group that
   * no longer exists. Land them on the survivor after all — but only when the
   * open route is that group's, and only when the survivor actually stayed.
   */
  const landOnSurvivorLeftBehind = useCallback(
    (survivorsLeftBehind: Map<string, string>, ids: string[], results: PromiseSettledResult<void>[]) => {
      const openGroup = groupIdRef.current;
      if (!openGroup) return;
      const survivor = survivorsLeftBehind.get(openGroup);
      if (!survivor) return;
      const outcome = results[ids.indexOf(survivor)];
      if (outcome?.status !== 'rejected') return;
      void navigate(`/conversation/${survivor}`, { replace: true });
    },
    [navigate]
  );

  /**
   * Say what actually happened to a batch. Rows are settled one by one, so
   * "some worked" is a real outcome and used to be reported as plain success —
   * the rows that failed said nothing at all.
   */
  const reportArchived = useCallback(
    (results: PromiseSettledResult<void>[]) => {
      const count = results.filter((result) => result.status === 'fulfilled').length;
      for (const result of results) {
        if (result.status === 'rejected') console.error('Failed to archive a conversation:', result.reason);
      }
      if (count === results.length) {
        Message.success(t('conversation.history.batchArchiveSuccess', { count }));
        return;
      }
      if (count === 0) {
        Message.error(t('conversation.history.archiveFailed'));
        return;
      }
      Message.warning(t('conversation.history.batchArchivePartial', { count, total: results.length }));
    },
    [t]
  );

  const handleBatchArchive = useCallback(() => {
    if (selectedConversationIds.size === 0) {
      Message.warning(t('conversation.history.batchNoSelection'));
      return;
    }

    Modal.confirm({
      title: t('conversation.history.batchArchive'),
      content: t('conversation.history.batchArchiveConfirm', { count: selectedConversationIds.size }),
      okText: t('conversation.history.batchArchive'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        // No batch endpoint exists; archive each selected conversation on its
        // own. The active list (both read models) drops archived rows, so the
        // refresh clears the selection's rows and the archive page picks them up.
        const selectedIds = Array.from(selectedConversationIds);
        try {
          // Each row leaves its group and then archives, on its own. One row
          // that cannot leave is one row that does not archive — it is not a
          // reason to leave the rest of the selection where it was.
          // A dissolve moves the user onto the survivor only if the survivor is
          // not further down this very selection.
          const alsoArchiving = new Set(selectedIds);
          const survivorsLeftBehind = new Map<string, string>();
          const results = await Promise.allSettled(
            selectedIds.map((item_id) => archiveConversation(item_id, { alsoArchiving, survivorsLeftBehind }))
          );
          emitter.emit('chat.history.refresh');
          landOnSurvivorLeftBehind(survivorsLeftBehind, selectedIds, results);
          reportArchived(results);
        } catch (error) {
          console.error('Failed to batch archive conversations:', error);
          Message.error(t('conversation.history.archiveFailed'));
        } finally {
          setSelectedConversationIds(new Set());
          onBatchModeChange?.(false);
        }
      },
      style: { borderRadius: '12px' },
      alignCenter: true,
      getPopupContainer: () => document.body,
    });
  }, [
    archiveConversation,
    landOnSurvivorLeftBehind,
    onBatchModeChange,
    reportArchived,
    selectedConversationIds,
    t,
    setSelectedConversationIds,
  ]);

  const handleEditStart = useCallback((conversation: TChatConversation) => {
    setRenameModalId(conversation.id);
    setRenameModalName(conversation.name);
    setRenameModalVisible(true);
  }, []);

  const handleRenameConfirm = useCallback(async () => {
    if (!renameModalId || !renameModalName.trim()) return;

    setRenameLoading(true);
    try {
      const success = await ipcBridge.conversation.update.invoke({
        id: renameModalId,
        updates: { name: renameModalName.trim() },
      });

      if (success) {
        await refreshConversationCache(renameModalId);
        emitter.emit('chat.history.refresh');
        setRenameModalVisible(false);
        setRenameModalId(null);
        setRenameModalName('');
        Message.success(t('conversation.history.renameSuccess'));
      } else {
        Message.error(t('conversation.history.renameFailed'));
      }
    } catch (error) {
      console.error('Failed to update conversation name:', error);
      Message.error(t('conversation.history.renameFailed'));
    } finally {
      setRenameLoading(false);
    }
  }, [renameModalId, renameModalName, t]);

  const handleRenameCancel = useCallback(() => {
    setRenameModalVisible(false);
    setRenameModalId(null);
    setRenameModalName('');
  }, []);

  const handleTogglePin = useCallback(
    async (conversation: TChatConversation) => {
      const pinned = isConversationPinned(conversation);

      try {
        const success = await ipcBridge.conversation.update.invoke({
          id: conversation.id,
          updates: {
            extra: {
              pinned: !pinned,
              pinned_at: pinned ? undefined : Date.now(),
            } as Partial<TChatConversation['extra']>,
          } as Partial<TChatConversation>,
          merge_extra: true,
        });

        if (success) {
          emitter.emit('chat.history.refresh');
        } else {
          Message.error(t('conversation.history.pinFailed'));
        }
      } catch (error) {
        console.error('Failed to toggle pin conversation:', error);
        Message.error(t('conversation.history.pinFailed'));
      }
    },
    [t]
  );

  const handleMenuVisibleChange = useCallback((conversation_id: string, visible: boolean) => {
    setDropdownVisibleId(visible ? conversation_id : null);
  }, []);

  const handleToggleManualUnread = useCallback(
    (conversation: TChatConversation) => {
      if (isManualUnread(conversation.id)) {
        clearManualUnread(conversation.id);
      } else {
        markManualUnread(conversation.id);
      }
    },
    [clearManualUnread, isManualUnread, markManualUnread]
  );

  const handleOpenMenu = useCallback((conversation: TChatConversation) => {
    setDropdownVisibleId(conversation.id);
  }, []);

  const handleCreateCronTask = useCallback(
    (conversation: TChatConversation) => {
      const prefillPrompt = t('cron.status.defaultPrompt');
      setDropdownVisibleId(null);

      if (isLegacyReadOnlyConversationType(conversation.type)) {
        void navigate('/guid', {
          state: {
            prefillPrompt,
            preservePrefillDraft: true,
            focusPrefill: true,
          },
        });
      } else {
        requestConversationSendBoxPrefill(conversation.id, prefillPrompt);
        if (id !== conversation.id) {
          void navigate(`/conversation/${conversation.id}`);
        }
      }

      onSessionClick?.();
    },
    [id, navigate, onSessionClick, t]
  );

  /**
   * Archive-project state — rendered via AionModal in the GroupedHistory component.
   * The left panel groups conversations by workspace folder (not by a bound
   * project record), so there is no project id to hand the `archiveProject`
   * endpoint. Archiving the group therefore archives each conversation in it —
   * the same soft move as the per-row and batch archive actions.
   */
  const [archiveProjectTarget, setArchiveProjectTarget] = useState<{
    name: string;
    conversations: TChatConversation[];
  } | null>(null);
  const [archiveProjectLoading, setArchiveProjectLoading] = useState(false);

  const handleArchiveProject = useCallback((projectName: string, conversations: TChatConversation[]) => {
    if (conversations.length === 0) return;
    setArchiveProjectTarget({ name: projectName, conversations });
  }, []);

  const handleArchiveProjectCancel = useCallback(() => {
    if (archiveProjectLoading) return;
    setArchiveProjectTarget(null);
  }, [archiveProjectLoading]);

  const handleArchiveProjectConfirm = useCallback(async () => {
    if (!archiveProjectTarget) return;
    setArchiveProjectLoading(true);
    try {
      // A group can span two folders; a survivor in the other folder stays,
      // and the user should land on it.
      const ids = archiveProjectTarget.conversations.map((c) => c.id);
      const alsoArchiving = new Set(ids);
      const survivorsLeftBehind = new Map<string, string>();
      const results = await Promise.allSettled(
        ids.map((item_id) => archiveConversation(item_id, { alsoArchiving, survivorsLeftBehind }))
      );
      emitter.emit('chat.history.refresh');
      landOnSurvivorLeftBehind(survivorsLeftBehind, ids, results);
      reportArchived(results);
      setArchiveProjectTarget(null);
    } catch (error) {
      console.error('Failed to archive project:', error);
      Message.error(t('conversation.history.archiveFailed'));
    } finally {
      setArchiveProjectLoading(false);
    }
  }, [archiveConversation, archiveProjectTarget, landOnSurvivorLeftBehind, reportArchived, t]);

  const handleArchive = useCallback(
    async (conversation: TChatConversation) => {
      // Archiving moves the conversation into the archived slice (the backend
      // also unpins it). Both the new sidebar read model and the legacy list
      // exclude archived rows, so the refresh drops the row from the active
      // list on its own; the archived management page picks it up.
      setDropdownVisibleId(null);
      try {
        await archiveConversation(conversation.id);
        emitter.emit('chat.history.refresh');
        Message.success(t('conversation.history.archiveSuccess'));
      } catch (error) {
        console.error('Failed to archive conversation:', error);
        // A refused leave has already been reported by the write path; only a
        // refused archive needs saying here.
        if (!isLeaveFailure(error)) {
          Message.error(t('conversation.history.archiveFailed'));
        }
        emitter.emit('chat.history.refresh');
      }
    },
    [archiveConversation, t]
  );

  return {
    renameModalVisible,
    renameModalName,
    setRenameModalName,
    renameLoading,
    dropdownVisibleId,
    handleConversationClick,
    handleSplitGroupOpen,
    handleBatchArchive,
    handleArchive,
    handleEditStart,
    handleRenameConfirm,
    handleRenameCancel,
    handleTogglePin,
    handleMenuVisibleChange,
    handleOpenMenu,
    handleToggleManualUnread,
    handleCreateCronTask,
    handleArchiveProject,
    archiveProjectTarget,
    archiveProjectLoading,
    handleArchiveProjectCancel,
    handleArchiveProjectConfirm,
  };
};
