import { ipcBridge } from '@/common';
import type { Message } from '@arco-design/web-react';
import type {
  ExternalSource,
  PendingSkill,
  SkillInfo,
} from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UseAssistantSkillsParams = {
  skillsModalVisible: boolean;
  customSkills: string[];
  selectedSkills: string[];
  pendingSkills: PendingSkill[];
  availableSkills: SkillInfo[];
  setPendingSkills: (skills: PendingSkill[]) => void;
  setCustomSkills: (skills: string[]) => void;
  setSelectedSkills: (skills: string[]) => void;
  message: ReturnType<typeof Message.useMessage>[0];
};

/**
 * Manages external skill sources discovery, searching, filtering,
 * and custom path management for the Add Skills modal.
 */
export const useAssistantSkills = ({
  skillsModalVisible,
  customSkills,
  selectedSkills,
  pendingSkills,
  availableSkills,
  setPendingSkills,
  setCustomSkills,
  setSelectedSkills,
  message,
}: UseAssistantSkillsParams) => {
  const { t } = useTranslation();

  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [activeSourceTab, setActiveSourceTab] = useState<string>('');
  const [searchExternalQuery, setSearchExternalQuery] = useState('');
  const [externalSkillsLoading, setExternalSkillsLoading] = useState(false);
  const [showAddPathModal, setShowAddPathModal] = useState(false);
  const [customPathName, setCustomPathName] = useState('');
  const [customPathValue, setCustomPathValue] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [skillPath, setSkillPath] = useState('');
  const [commonPaths, setCommonPaths] = useState<Array<{ name: string; path: string }>>([]);

  // Reload external skills data
  const handleRefreshExternal = useCallback(async () => {
    setExternalSkillsLoading(true);
    setRefreshing(true);
    try {
      const response = await ipcBridge.fs.detectAndCountExternalSkills.invoke();
      if (response.success && response.data) {
        setExternalSources(response.data);
        if (response.data.length > 0 && !response.data.find((s) => s.source === activeSourceTab)) {
          setActiveSourceTab(response.data[0].source);
        }
      }
    } catch (error) {
      console.error('Failed to detect external skills:', error);
    } finally {
      setExternalSkillsLoading(false);
      setRefreshing(false);
    }
  }, [activeSourceTab]);

  // Detect external skill paths when modal opens
  useEffect(() => {
    if (skillsModalVisible) {
      setSearchExternalQuery('');
      void handleRefreshExternal();
    }
  }, [skillsModalVisible, handleRefreshExternal]);

  const handleAddCustomPath = useCallback(async () => {
    if (!customPathName.trim() || !customPathValue.trim()) return;
    try {
      const result = await ipcBridge.fs.addCustomExternalPath.invoke({
        name: customPathName.trim(),
        path: customPathValue.trim(),
      });
      if (result.success) {
        setShowAddPathModal(false);
        setCustomPathName('');
        setCustomPathValue('');
        message.success(t('common.success', { defaultValue: 'Successfully added path' }));
        void handleRefreshExternal();
      } else {
        message.error(result.msg || 'Failed to add path');
      }
    } catch (_error) {
      message.error('Failed to add custom path');
    }
  }, [customPathName, customPathValue, handleRefreshExternal, message, t]);

  const handleAddFoundSkills = (skillsToAdd: Array<{ name: string; description: string; path: string }>) => {
    let addedCount = 0;
    let skippedCount = 0;
    const newPendingSkills: PendingSkill[] = [];
    const newCustomSkillNames: string[] = [];
    const newSelectedSkills: string[] = [];

    for (const skill of skillsToAdd) {
      const { name, description, path: sPath } = skill;

      // Check if already in this assistant's list
      const alreadyInAssistant = customSkills.includes(name) || newCustomSkillNames.includes(name);

      if (alreadyInAssistant) {
        skippedCount++;
        continue;
      }

      // Check if already exists in system
      const existsInAvailable = availableSkills.some((s) => s.name === name);
      const existsInPending = pendingSkills.some((s) => s.name === name);

      if (!existsInAvailable && !existsInPending) {
        // Only add to pending if not in system
        newPendingSkills.push({ path: sPath, name, description });
      }

      newCustomSkillNames.push(name);
      newSelectedSkills.push(name);
      addedCount++;
    }

    if (addedCount > 0) {
      setPendingSkills([...pendingSkills, ...newPendingSkills]);
      setCustomSkills([...customSkills, ...newCustomSkillNames]);
      setSelectedSkills([...selectedSkills, ...newSelectedSkills]);
      const skippedCountText =
        skippedCount > 0
          ? ` (${t('settings.skippedCount', { count: skippedCount, defaultValue: `${skippedCount} skipped` })})`
          : '';
      message.success(
        t('settings.skillsAdded', {
          addedCount,
          skippedCountText,
          defaultValue: `${addedCount} skills added and selected${skippedCountText}`,
        })
      );
    } else if (skippedCount > 0) {
      message.warning(t('settings.allSkillsExist', { defaultValue: 'All found skills already exist' }));
    }
  };

  const activeSource = externalSources.find((s) => s.source === activeSourceTab);

  const filteredExternalSkills = React.useMemo(() => {
    if (!activeSource) return [];
    if (!searchExternalQuery.trim()) return activeSource.skills;
    const lowerQuery = searchExternalQuery.toLowerCase();
    return activeSource.skills.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) || (s.description && s.description.toLowerCase().includes(lowerQuery))
    );
  }, [activeSource, searchExternalQuery]);

  return {
    externalSources,
    activeSourceTab,
    setActiveSourceTab,
    searchExternalQuery,
    setSearchExternalQuery,
    externalSkillsLoading,
    showAddPathModal,
    setShowAddPathModal,
    customPathName,
    setCustomPathName,
    customPathValue,
    setCustomPathValue,
    refreshing,
    skillPath,
    setSkillPath,
    commonPaths,
    setCommonPaths,
    activeSource,
    filteredExternalSkills,
    handleRefreshExternal,
    handleAddCustomPath,
    handleAddFoundSkills,
  };
};
