/**
 * AssistantSettings — Settings page for managing assistants.
 *
 * Editing permissions by assistant type:
 *
 * | Field          | Builtin | Custom |
 * |----------------|---------|--------|
 * | Save button    |  yes    |  yes   |
 * | Name           |  no     |  yes   |
 * | Description    |  no     |  yes   |
 * | Avatar         |  no     |  yes   |
 * | Main Agent     |  yes    |  yes   |
 * | Prompt editing |  no     |  yes   |
 * | Delete         |  no     |  yes   |
 *
 * Builtin assistants only allow Main Agent plus default model / permission
 * overrides. The full-page editor still renders builtin skills and prompts as
 * read-only so users can inspect what's bundled.
 */
import { Message } from '@arco-design/web-react';
import coworkSvg from '@/renderer/assets/icons/cowork.svg';
import { useDetectedAgents, useAssistantEditor, useAssistantList } from '@/renderer/hooks/assistant';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { resolveAvatarImageSrc } from './assistantUtils';
import AssistantEditorPage from './AssistantEditorPage';
import AssistantListPanel from './AssistantListPanel';
import DeleteAssistantModal from './DeleteAssistantModal';
import SkillConfirmModals from './SkillConfirmModals';
import type { AssistantEditorViewModel } from './types';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';

type AssistantNavigationState = {
  openAssistantId?: string;
  openAssistantEditor?: boolean;
};
const OPEN_ASSISTANT_EDITOR_INTENT_KEY = 'guid.openAssistantEditorIntent';

const AssistantSettings: React.FC = () => {
  const [message, messageContext] = Message.useMessage({ maxCount: 10 });
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationState = (location.state as AssistantNavigationState | null) ?? null;
  const highlightId = searchParams.get('highlight');
  const handleHighlightConsumed = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);
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
    loadAssistants,
    reorderAssistants,
    localeKey,
  } = useAssistantList();
  const builtinAvatarOptions = useMemo(
    () =>
      assistants
        .filter((assistant) => assistant.source === 'builtin' && assistant.avatar?.startsWith('/api/assistants/'))
        .map((assistant) => {
          const src = resolveAvatarImageSrc(assistant.avatar, avatarImageMap);
          if (!src) {
            return null;
          }

          return {
            id: assistant.id,
            label: assistant.name_i18n?.[localeKey] || assistant.name,
            src,
          };
        })
        .filter((option): option is NonNullable<typeof option> => option !== null),
    [assistants, avatarImageMap, localeKey]
  );

  const { availableBackends, refreshAgentDetection } = useDetectedAgents();

  const editor = useAssistantEditor({
    localeKey,
    activeAssistant,
    setActiveAssistantId,
    loadAssistants,
    refreshAgentDetection,
    message,
  });

  const editAvatarImage = editor.editAvatarPreview || resolveAvatarImageSrc(editor.editAvatar, avatarImageMap);
  const hasConsumedNavigationIntentRef = useRef(false);
  const showEditor = editor.editVisible && (editor.isCreating || activeAssistantId !== null);
  const editorViewModel: AssistantEditorViewModel = {
    isCreating: editor.isCreating,
    profile: {
      name: editor.editName,
      setName: editor.setEditName,
      description: editor.editDescription,
      setDescription: editor.setEditDescription,
      avatar: editor.editAvatar,
      setAvatar: editor.setEditAvatar,
      setAvatarPreview: editor.setEditAvatarPreview,
      avatarImage: editAvatarImage,
      builtinAvatarOptions,
    },
    agent: {
      value: editor.editAgent,
      setValue: editor.setEditAgent,
      availableBackends,
    },
    prompts: {
      text: editor.editRecommendedPromptsText,
      setText: editor.setEditRecommendedPromptsText,
    },
    defaults: {
      model: {
        mode: editor.defaultModelMode,
        setMode: editor.setDefaultModelMode,
        value: editor.defaultModelValue,
        setValue: editor.setDefaultModelValue,
      },
      permission: {
        mode: editor.defaultPermissionMode,
        setMode: editor.setDefaultPermissionMode,
        value: editor.defaultPermissionValue,
        setValue: editor.setDefaultPermissionValue,
      },
      skills: {
        mode: editor.defaultSkillsMode,
        setMode: editor.setDefaultSkillsMode,
      },
      mcps: {
        mode: editor.defaultMcpMode,
        setMode: editor.setDefaultMcpMode,
        availableServers: editor.availableMcpServers,
        selectedIds: editor.selectedMcpIds,
        setSelectedIds: editor.setSelectedMcpIds,
      },
    },
    rules: {
      content: editor.editContext,
      setContent: editor.setEditContext,
      viewMode: editor.promptViewMode,
      setViewMode: editor.setPromptViewMode,
    },
    skills: {
      availableSkills: editor.availableSkills,
      selectedSkills: editor.selectedSkills,
      setSelectedSkills: editor.setSelectedSkills,
      pendingSkills: editor.pendingSkills,
      setDeletePendingSkillName: editor.setDeletePendingSkillName,
      setDeleteCustomSkillName: editor.setDeleteCustomSkillName,
      builtinAutoSkills: editor.builtinAutoSkills,
      disabledBuiltinSkills: editor.disabledBuiltinSkills,
      setDisabledBuiltinSkills: editor.setDisabledBuiltinSkills,
    },
    actions: {
      save: editor.handleSave,
      requestDelete: editor.handleDeleteClick,
      duplicate: (assistant) => void editor.handleDuplicate(assistant),
    },
  };

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
    <SettingsPageWrapper className='!h-full !overflow-hidden' contentClassName='!h-full'>
      <div className='flex flex-col h-full w-full'>
        {messageContext}
        <div className='flex-1 min-h-0'>
          {showEditor ? (
            <AssistantEditorPage
              editor={editorViewModel}
              activeAssistant={activeAssistant}
              onBack={() => editor.setEditVisible(false)}
            />
          ) : (
            <AssistantListPanel
              assistants={assistants}
              localeKey={localeKey}
              avatarImageMap={avatarImageMap}
              onEdit={(assistant) => void editor.handleEdit(assistant)}
              onDuplicate={(assistant) => void editor.handleDuplicate(assistant)}
              onDelete={(assistant) => editor.handleDeleteRequest(assistant)}
              onCreate={() => void editor.handleCreate()}
              onToggleEnabled={(assistant, checked) => void editor.handleToggleEnabled(assistant, checked)}
              onReorder={(activeId, overId) => void reorderAssistants(activeId, overId)}
              setActiveAssistantId={setActiveAssistantId}
              highlightId={highlightId}
              onHighlightConsumed={handleHighlightConsumed}
            />
          )}

          <DeleteAssistantModal
            visible={editor.deleteConfirmVisible}
            onCancel={() => editor.setDeleteConfirmVisible(false)}
            onConfirm={editor.handleDeleteConfirm}
            activeAssistant={activeAssistant}
            avatarImageMap={avatarImageMap}
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
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default AssistantSettings;
