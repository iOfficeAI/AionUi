/**
 * AssistantManagement — Settings page for managing assistants.
 *
 * Editing permissions by assistant type:
 *
 * | Field          | Builtin | Extension | Custom |
 * |----------------|---------|-----------|--------|
 * | Save button    |  yes    |  no       |  yes   |
 * | Name           |  no     |  no       |  yes   |
 * | Description    |  no     |  no       |  yes   |
 * | Avatar         |  no     |  no       |  yes   |
 * | Main Agent     |  yes    |  no       |  yes   |
 * | Prompt editing |  no     |  no       |  yes   |
 * | Delete         |  no     |  no       |  yes   |
 *
 * Builtin assistants allow switching Main Agent and saving,
 * but their identity fields (name, description, avatar) and
 * prompt content are read-only.
 * Extension assistants are fully read-only.
 */
import coworkSvg from '@/renderer/assets/icons/cowork.svg';
import {
  useAssistantBackends,
  useAssistantEditor,
  useAssistantList,
  useAssistantSkills,
} from '@/renderer/hooks/assistant';
import { resolveAvatarImageSrc } from './assistantUtils';
import type { AssistantManagementProps } from './types';
import AddCustomPathModal from './AddCustomPathModal';
import AddSkillsModal from './AddSkillsModal';
import AssistantEditDrawer from './AssistantEditDrawer';
import AssistantListPanel from './AssistantListPanel';
import DeleteAssistantModal from './DeleteAssistantModal';
import SkillConfirmModals from './SkillConfirmModals';
import React, { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';

type AssistantNavigationState = {
  openAssistantId?: string;
  openAssistantEditor?: boolean;
};
const OPEN_ASSISTANT_EDITOR_INTENT_KEY = 'guid.openAssistantEditorIntent';

const AssistantManagement: React.FC<AssistantManagementProps> = ({ message }) => {
  const location = useLocation();
  const navigationState = (location.state as AssistantNavigationState | null) ?? null;
  const avatarImageMap: Record<string, string> = useMemo(
    () => ({
      'cowork.svg': coworkSvg,
      '\u{1F6E0}\u{FE0F}': coworkSvg,
    }),
    []
  );

  // Compose hooks
  const {
    assistants,
    activeAssistantId,
    setActiveAssistantId,
    activeAssistant,
    isReadonlyAssistant,
    isExtensionAssistant,
    loadAssistants,
    localeKey,
  } = useAssistantList();

  const { availableBackends, extensionAcpAdapters, refreshAgentDetection } = useAssistantBackends();

  const editor = useAssistantEditor({
    localeKey,
    activeAssistant,
    isReadonlyAssistant,
    isExtensionAssistant,
    setActiveAssistantId,
    loadAssistants,
    refreshAgentDetection,
    message,
  });

  const skills = useAssistantSkills({
    skillsModalVisible: editor.skillsModalVisible,
    customSkills: editor.customSkills,
    selectedSkills: editor.selectedSkills,
    pendingSkills: editor.pendingSkills,
    availableSkills: editor.availableSkills,
    setPendingSkills: editor.setPendingSkills,
    setCustomSkills: editor.setCustomSkills,
    setSelectedSkills: editor.setSelectedSkills,
    message,
  });

  const editAvatarImage = resolveAvatarImageSrc(editor.editAvatar, avatarImageMap);
  const hasConsumedNavigationIntentRef = useRef(false);

  useEffect(() => {
    if (hasConsumedNavigationIntentRef.current) return;
    const openAssistantFromRoute =
      navigationState?.openAssistantEditor && navigationState.openAssistantId ? navigationState.openAssistantId : null;

    let openAssistantFromSession: string | null = null;
    try {
      const rawIntent = sessionStorage.getItem(OPEN_ASSISTANT_EDITOR_INTENT_KEY);
      if (rawIntent) {
        const parsedIntent = JSON.parse(rawIntent) as { assistantId?: string; openAssistantEditor?: boolean };
        if (parsedIntent.openAssistantEditor && parsedIntent.assistantId) {
          openAssistantFromSession = parsedIntent.assistantId;
        }
      }
    } catch (error) {
      console.error('[AssistantManagement] Failed to parse assistant open intent:', error);
    }

    const targetAssistantId = openAssistantFromRoute ?? openAssistantFromSession;
    if (!targetAssistantId) return;
    if (assistants.length === 0) return;

    const targetAssistant = assistants.find((assistant) => assistant.id === targetAssistantId);
    if (!targetAssistant) return;

    hasConsumedNavigationIntentRef.current = true;
    try {
      sessionStorage.removeItem(OPEN_ASSISTANT_EDITOR_INTENT_KEY);
    } catch (error) {
      console.error('[AssistantManagement] Failed to clear assistant open intent:', error);
    }
    void editor.handleEdit(targetAssistant);
  }, [assistants, editor, navigationState]);

  return (
    <div>
      <AssistantListPanel
        assistants={assistants}
        localeKey={localeKey}
        avatarImageMap={avatarImageMap}
        isExtensionAssistant={isExtensionAssistant}
        onEdit={(assistant) => void editor.handleEdit(assistant)}
        onDuplicate={(assistant) => void editor.handleDuplicate(assistant)}
        onCreate={() => void editor.handleCreate()}
        onToggleEnabled={(assistant, checked) => void editor.handleToggleEnabled(assistant, checked)}
        setActiveAssistantId={setActiveAssistantId}
      />

      <AssistantEditDrawer
        editVisible={editor.editVisible}
        setEditVisible={editor.setEditVisible}
        isCreating={editor.isCreating}
        editName={editor.editName}
        setEditName={editor.setEditName}
        editDescription={editor.editDescription}
        setEditDescription={editor.setEditDescription}
        editAvatar={editor.editAvatar}
        setEditAvatar={editor.setEditAvatar}
        editAvatarImage={editAvatarImage}
        editAgent={editor.editAgent}
        setEditAgent={editor.setEditAgent}
        editContext={editor.editContext}
        setEditContext={editor.setEditContext}
        promptViewMode={editor.promptViewMode}
        setPromptViewMode={editor.setPromptViewMode}
        availableSkills={editor.availableSkills}
        selectedSkills={editor.selectedSkills}
        setSelectedSkills={editor.setSelectedSkills}
        pendingSkills={editor.pendingSkills}
        customSkills={editor.customSkills}
        setDeletePendingSkillName={editor.setDeletePendingSkillName}
        setDeleteCustomSkillName={editor.setDeleteCustomSkillName}
        setSkillsModalVisible={editor.setSkillsModalVisible}
        activeAssistant={activeAssistant}
        activeAssistantId={activeAssistantId}
        isReadonlyAssistant={isReadonlyAssistant}
        isExtensionAssistant={isExtensionAssistant}
        availableBackends={availableBackends}
        extensionAcpAdapters={extensionAcpAdapters}
        handleSave={editor.handleSave}
        handleDeleteClick={editor.handleDeleteClick}
      />

      <DeleteAssistantModal
        visible={editor.deleteConfirmVisible}
        onCancel={() => editor.setDeleteConfirmVisible(false)}
        onConfirm={editor.handleDeleteConfirm}
        activeAssistant={activeAssistant}
        avatarImageMap={avatarImageMap}
      />

      <AddSkillsModal
        visible={editor.skillsModalVisible}
        onCancel={() => {
          editor.setSkillsModalVisible(false);
          skills.setSearchExternalQuery('');
        }}
        externalSources={skills.externalSources}
        activeSourceTab={skills.activeSourceTab}
        setActiveSourceTab={skills.setActiveSourceTab}
        activeSource={skills.activeSource}
        filteredExternalSkills={skills.filteredExternalSkills}
        externalSkillsLoading={skills.externalSkillsLoading}
        searchExternalQuery={skills.searchExternalQuery}
        setSearchExternalQuery={skills.setSearchExternalQuery}
        refreshing={skills.refreshing}
        handleRefreshExternal={skills.handleRefreshExternal}
        setShowAddPathModal={skills.setShowAddPathModal}
        customSkills={editor.customSkills}
        handleAddFoundSkills={skills.handleAddFoundSkills}
      />

      <SkillConfirmModals
        deletePendingSkillName={editor.deletePendingSkillName}
        setDeletePendingSkillName={editor.setDeletePendingSkillName}
        pendingSkills={editor.pendingSkills}
        setPendingSkills={editor.setPendingSkills}
        deleteCustomSkillName={editor.deleteCustomSkillName}
        setDeleteCustomSkillName={editor.setDeleteCustomSkillName}
        customSkills={editor.customSkills}
        setCustomSkills={editor.setCustomSkills}
        selectedSkills={editor.selectedSkills}
        setSelectedSkills={editor.setSelectedSkills}
        message={message}
      />

      <AddCustomPathModal
        visible={skills.showAddPathModal}
        onCancel={() => {
          skills.setShowAddPathModal(false);
          skills.setCustomPathName('');
          skills.setCustomPathValue('');
        }}
        onOk={() => void skills.handleAddCustomPath()}
        customPathName={skills.customPathName}
        setCustomPathName={skills.setCustomPathName}
        customPathValue={skills.customPathValue}
        setCustomPathValue={skills.setCustomPathValue}
      />
    </div>
  );
};

export default AssistantManagement;
