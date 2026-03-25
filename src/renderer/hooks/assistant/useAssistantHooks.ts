import { ipcBridge } from '@/common';
import type { Message } from '@arco-design/web-react';
import type { HookInfo } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UseAssistantHooksParams = {
  editVisible: boolean;
  setAvailableHooks: (hooks: HookInfo[]) => void;
  selectedHooks: string[];
  setSelectedHooks: (hooks: string[]) => void;
  message: ReturnType<typeof Message.useMessage>[0];
};

export const useAssistantHooks = ({
  editVisible,
  setAvailableHooks,
  selectedHooks,
  setSelectedHooks,
  message,
}: UseAssistantHooksParams) => {
  const { t } = useTranslation();
  const [hooksLoading, setHooksLoading] = useState(false);
  const [hooksDir, setHooksDir] = useState('');
  const [deleteHookName, setDeleteHookName] = useState<string | null>(null);

  const loadAvailableHooks = useCallback(async () => {
    setHooksLoading(true);
    try {
      const [hooks, paths] = await Promise.all([
        ipcBridge.fs.listAvailableHooks.invoke(),
        ipcBridge.fs.getHookPaths.invoke(),
      ]);
      setAvailableHooks(hooks);
      setHooksDir(paths.userHooksDir);
      return hooks;
    } catch (error) {
      console.error('Failed to load hooks:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
      setAvailableHooks([]);
      return [];
    } finally {
      setHooksLoading(false);
    }
  }, [message, setAvailableHooks, t]);

  useEffect(() => {
    if (editVisible) {
      void loadAvailableHooks();
    }
  }, [editVisible, loadAvailableHooks]);

  const handleImportHook = useCallback(async () => {
    try {
      const result = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openDirectory'],
      });

      if (!result || result.length === 0) {
        return;
      }

      const importResult = await ipcBridge.fs.importHookWithSymlink.invoke({
        hookPath: result[0],
      });

      if (!importResult.success) {
        message.error(importResult.msg || t('settings.hookImportFailed', { defaultValue: 'Failed to import hook' }));
        return;
      }

      message.success(importResult.msg || t('settings.hookImported', { defaultValue: 'Hook imported successfully' }));
      await loadAvailableHooks();
    } catch (error) {
      console.error('Failed to import hook:', error);
      message.error(t('settings.hookImportFailed', { defaultValue: 'Failed to import hook' }));
    }
  }, [loadAvailableHooks, message, t]);

  const handleOpenHooksDir = useCallback(async () => {
    const nextHooksDir =
      hooksDir ||
      (await ipcBridge.fs.getHookPaths.invoke().then((paths) => {
        setHooksDir(paths.userHooksDir);
        return paths.userHooksDir;
      }));

    if (!nextHooksDir) {
      message.error(t('settings.hookOpenFolderFailed', { defaultValue: 'Failed to open hook folder' }));
      return;
    }

    try {
      await ipcBridge.shell.openFile.invoke(nextHooksDir);
    } catch (error) {
      console.error('Failed to open hooks directory:', error);
      message.error(t('settings.hookOpenFolderFailed', { defaultValue: 'Failed to open hook folder' }));
    }
  }, [hooksDir, message, t]);

  const handleDeleteHookConfirm = useCallback(async () => {
    if (!deleteHookName) {
      return;
    }

    try {
      const result = await ipcBridge.fs.deleteHook.invoke({ hookName: deleteHookName });
      if (!result.success) {
        message.error(result.msg || t('settings.hookDeleteFailed', { defaultValue: 'Failed to delete hook' }));
        return;
      }

      setSelectedHooks(selectedHooks.filter((hookName) => hookName !== deleteHookName));
      message.success(result.msg || t('settings.hookDeleted', { defaultValue: 'Hook deleted successfully' }));
      setDeleteHookName(null);
      await loadAvailableHooks();
    } catch (error) {
      console.error('Failed to delete hook:', error);
      message.error(t('settings.hookDeleteFailed', { defaultValue: 'Failed to delete hook' }));
    }
  }, [deleteHookName, loadAvailableHooks, message, selectedHooks, setSelectedHooks, t]);

  return {
    hooksLoading,
    hooksDir,
    deleteHookName,
    setDeleteHookName,
    loadAvailableHooks,
    handleImportHook,
    handleOpenHooksDir,
    handleDeleteHookConfirm,
  };
};
