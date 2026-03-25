import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import type { HookInfo } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import { getIncompatibleHookNames } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/assistantUtils';
import { getConversationEnabledHooks, resolveConversationHookBackend } from '../utils/sessionHooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageApi } from '../types';

type UseSessionHooksParams = {
  conversation: TChatConversation;
  messageApi: MessageApi;
};

export const useSessionHooks = ({ conversation, messageApi }: UseSessionHooksParams) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hooksSaving, setHooksSaving] = useState(false);
  const [availableHooks, setAvailableHooks] = useState<HookInfo[]>([]);
  const [selectedHooks, setSelectedHooks] = useState<string[]>([]);

  const currentBackend = useMemo(() => resolveConversationHookBackend(conversation), [conversation]);

  const loadHooks = useCallback(async () => {
    setHooksLoading(true);
    try {
      const hooks = await ipcBridge.fs.listAvailableHooks.invoke();
      setAvailableHooks(hooks);
      setSelectedHooks(getConversationEnabledHooks(conversation));
      return hooks;
    } catch (error) {
      console.error('Failed to load session hooks:', error);
      messageApi.error(t('conversation.workspace.sessionHooksLoadFailed', { defaultValue: 'Failed to load hooks' }));
      setAvailableHooks([]);
      setSelectedHooks(getConversationEnabledHooks(conversation));
      return [];
    } finally {
      setHooksLoading(false);
    }
  }, [conversation, messageApi, t]);

  useEffect(() => {
    if (visible) {
      void loadHooks();
    }
  }, [loadHooks, visible]);

  const handleSave = useCallback(async () => {
    setHooksSaving(true);
    try {
      const incompatibleHookNames = getIncompatibleHookNames(availableHooks, selectedHooks, currentBackend);
      if (incompatibleHookNames.length > 0) {
        messageApi.error(
          t('settings.hookSaveIncompatible', {
            hooks: incompatibleHookNames.join(', '),
            defaultValue: 'Remove hooks not supported by the selected agent before saving: {{hooks}}',
          })
        );
        return false;
      }

      const success = await ipcBridge.conversation.update.invoke({
        id: conversation.id,
        updates: {
          extra: {
            ...conversation.extra,
            enabledHooks: selectedHooks,
          },
        },
      });

      if (!success) {
        messageApi.error(
          t('conversation.workspace.sessionHooksSaveFailed', {
            defaultValue: 'Failed to save session hooks',
          })
        );
        return false;
      }

      messageApi.success(
        t('conversation.workspace.sessionHooksSaved', {
          defaultValue: 'Session hooks updated',
        })
      );
      setVisible(false);
      return true;
    } catch (error) {
      console.error('Failed to save session hooks:', error);
      messageApi.error(
        t('conversation.workspace.sessionHooksSaveFailed', {
          defaultValue: 'Failed to save session hooks',
        })
      );
      return false;
    } finally {
      setHooksSaving(false);
    }
  }, [availableHooks, conversation.extra, conversation.id, currentBackend, messageApi, selectedHooks, t]);

  return {
    visible,
    setVisible,
    hooksLoading,
    hooksSaving,
    availableHooks,
    selectedHooks,
    setSelectedHooks,
    currentBackend,
    loadHooks,
    handleSave,
  };
};
