import { ipcBridge } from '@/common';
import type { Message } from '@arco-design/web-react';
import type { Assistant, CreateAssistantRequest, UpdateAssistantRequest } from '@/common/types/assistantTypes';
import type {
  AssistantListItem,
  BuiltinAutoSkill,
  PendingSkill,
  SkillInfo,
} from '@/renderer/pages/settings/AssistantSettings/types';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UseAssistantEditorParams = {
  localeKey: string;
  activeAssistant: AssistantListItem | null;
  isExtensionAssistant: (assistant: AssistantListItem | null | undefined) => boolean;
  setActiveAssistantId: (id: string | null) => void;
  loadAssistants: () => Promise<void>;
  refreshAgentDetection: () => Promise<void>;
  message: ReturnType<typeof Message.useMessage>[0];
};

const isBuiltinAssistant = (assistant: Assistant | null | undefined): boolean =>
  assistant?.source === 'builtin';

/**
 * Manages all assistant editing state and handlers:
 * create, edit, duplicate, save, delete, and toggle enabled.
 */
export const useAssistantEditor = ({
  localeKey,
  activeAssistant,
  isExtensionAssistant,
  setActiveAssistantId,
  loadAssistants,
  refreshAgentDetection,
  message,
}: UseAssistantEditorParams) => {
  const { t } = useTranslation();

  // Edit drawer state
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editContext, setEditContext] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  // editAgent holds a backend ID (e.g. "claude", "goose") or an extension adapter ID (e.g. "ext-buddy")
  const [editAgent, setEditAgent] = useState<string>('gemini');
  const [editSkills, setEditSkills] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [promptViewMode, setPromptViewMode] = useState<'edit' | 'preview'>('preview');

  // Skills-related editing state (shared with editor)
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [pendingSkills, setPendingSkills] = useState<PendingSkill[]>([]);
  const [deletePendingSkillName, setDeletePendingSkillName] = useState<string | null>(null);
  const [deleteCustomSkillName, setDeleteCustomSkillName] = useState<string | null>(null);
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);

  // Builtin auto-injected skills state
  const [builtinAutoSkills, setBuiltinAutoSkills] = useState<BuiltinAutoSkill[]>([]);
  const [disabledBuiltinSkills, setDisabledBuiltinSkills] = useState<string[]>([]);

  // Load assistant rule content from file
  const loadAssistantContext = useCallback(
    async (assistantId: string): Promise<string> => {
      try {
        const content = await ipcBridge.fs.readAssistantRule.invoke({ assistantId, locale: localeKey });
        return content || '';
      } catch (error) {
        console.error(`Failed to load rule for ${assistantId}:`, error);
        return '';
      }
    },
    [localeKey]
  );

  // Load assistant skill content from file
  const loadAssistantSkills = useCallback(
    async (assistantId: string): Promise<string> => {
      try {
        const content = await ipcBridge.fs.readAssistantSkill.invoke({ assistantId, locale: localeKey });
        return content || '';
      } catch (error) {
        console.error(`Failed to load skills for ${assistantId}:`, error);
        return '';
      }
    },
    [localeKey]
  );

  const handleEdit = async (assistant: AssistantListItem) => {
    setIsCreating(false);
    setActiveAssistantId(assistant.id);
    setEditName(assistant.name || '');
    setEditDescription(assistant.description || '');
    setEditAvatar(assistant.avatar || '');
    setEditAgent(assistant.preset_agent_type || 'gemini');
    setPendingSkills([]);
    setDeletePendingSkillName(null);
    setDeleteCustomSkillName(null);
    setEditVisible(true);

    // Load builtin auto skills for all assistants
    try {
      const autoSkills = await ipcBridge.fs.listBuiltinAutoSkills.invoke();
      setBuiltinAutoSkills(autoSkills);
    } catch {
      setBuiltinAutoSkills([]);
    }

    // Extension assistants show extension context directly, not local rule files
    if (assistant.source === 'extension') {
      setPromptViewMode('preview');
      setEditContext(assistant.context || '');
      setEditSkills('');
      setAvailableSkills([]);
      setSelectedSkills(assistant.enabled_skills ?? []);
      setCustomSkills([]);
      setDisabledBuiltinSkills(assistant.disabled_builtin_skills ?? []);
      return;
    }

    // Load rules, skills content
    try {
      const [context, skills] = await Promise.all([
        loadAssistantContext(assistant.id),
        loadAssistantSkills(assistant.id),
      ]);
      setEditContext(context);
      setEditSkills(skills);

      // Load skills list for non-builtin assistants (builtin skills are managed by backend bundle)
      if (!isBuiltinAssistant(assistant)) {
        const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
        setAvailableSkills(skillsList);
        setSelectedSkills(assistant.enabled_skills ?? []);
        setCustomSkills(assistant.custom_skill_names ?? []);
      } else {
        setAvailableSkills([]);
        setSelectedSkills(assistant.enabled_skills ?? []);
        setCustomSkills([]);
      }
      setDisabledBuiltinSkills(assistant.disabled_builtin_skills ?? []);
    } catch (error) {
      console.error('Failed to load assistant content:', error);
      setEditContext('');
      setEditSkills('');
      setAvailableSkills([]);
      setSelectedSkills([]);
    }
  };

  // Create assistant function
  const handleCreate = async () => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName('');
    setEditDescription('');
    setEditContext('');
    setEditAvatar('\u{1F916}');
    setEditAgent('gemini');
    setEditSkills('');
    setSelectedSkills([]);
    setCustomSkills([]);
    setDisabledBuiltinSkills([]);
    setPromptViewMode('edit');
    setEditVisible(true);

    // Load available skills list and builtin auto skills
    try {
      const [skillsList, autoSkills] = await Promise.all([
        ipcBridge.fs.listAvailableSkills.invoke(),
        ipcBridge.fs.listBuiltinAutoSkills.invoke(),
      ]);
      setAvailableSkills(skillsList);
      setBuiltinAutoSkills(autoSkills);
    } catch (error) {
      console.error('Failed to load skills:', error);
      setAvailableSkills([]);
      setBuiltinAutoSkills([]);
    }
  };

  // Duplicate assistant function
  const handleDuplicate = async (assistant: AssistantListItem) => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName(`${assistant.name_i18n?.[localeKey] || assistant.name} (Copy)`);
    setEditDescription(assistant.description_i18n?.[localeKey] || assistant.description || '');
    setEditAvatar(assistant.avatar || '\u{1F916}');
    setEditAgent(assistant.preset_agent_type || 'gemini');
    setPromptViewMode('edit');
    setEditVisible(true);

    // Load original assistant's rules and skills
    try {
      const isExt = assistant.source === 'extension';
      const [skillsList, autoSkills, context, skills] = isExt
        ? await Promise.all([
            ipcBridge.fs.listAvailableSkills.invoke(),
            ipcBridge.fs.listBuiltinAutoSkills.invoke(),
            Promise.resolve(assistant.context || ''),
            Promise.resolve(''),
          ])
        : await Promise.all([
            ipcBridge.fs.listAvailableSkills.invoke(),
            ipcBridge.fs.listBuiltinAutoSkills.invoke(),
            loadAssistantContext(assistant.id),
            loadAssistantSkills(assistant.id),
          ]);

      setEditContext(context);
      setEditSkills(skills);
      setAvailableSkills(skillsList);
      setBuiltinAutoSkills(autoSkills);
      setSelectedSkills(assistant.enabled_skills ?? []);
      setCustomSkills(assistant.custom_skill_names ?? []);
      setDisabledBuiltinSkills(assistant.disabled_builtin_skills ?? []);
    } catch (error) {
      console.error('Failed to load assistant content for duplication:', error);
      setEditContext('');
      setEditSkills('');
      setAvailableSkills([]);
      setBuiltinAutoSkills([]);
      setSelectedSkills([]);
      setCustomSkills([]);
      setDisabledBuiltinSkills([]);
    }
  };

  const handleSave = async () => {
    try {
      // Validate required fields
      if (!editName.trim()) {
        message.error(t('settings.assistantNameRequired', { defaultValue: 'Assistant name is required' }));
        return;
      }

      // Import pending skills (skip existing ones)
      if (pendingSkills.length > 0) {
        const skillsToImport = pendingSkills.filter(
          (pending) => !availableSkills.some((available) => available.name === pending.name)
        );

        if (skillsToImport.length > 0) {
          for (const pendingSkill of skillsToImport) {
            try {
              await ipcBridge.fs.importSkillWithSymlink.invoke({ skillPath: pendingSkill.path });
            } catch (error) {
              console.error(`Failed to import skill "${pendingSkill.name}":`, error);
              message.error(`Failed to import skill "${pendingSkill.name}"`);
              return;
            }
          }
          // Reload skills list after successful import
          const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
          setAvailableSkills(skillsList);
        }
      }

      // Calculate final customSkills: merge existing + pending
      const pendingSkillNames = pendingSkills.map((s) => s.name);
      const finalCustomSkills = Array.from(new Set([...customSkills, ...pendingSkillNames]));

      if (isCreating) {
        // Create new assistant via backend
        const createRequest: CreateAssistantRequest = {
          name: editName,
          description: editDescription || undefined,
          avatar: editAvatar || undefined,
          preset_agent_type: editAgent,
          enabled_skills: selectedSkills,
          custom_skill_names: finalCustomSkills,
          disabled_builtin_skills: disabledBuiltinSkills.length > 0 ? disabledBuiltinSkills : undefined,
        };
        const created = await ipcBridge.assistants.create.invoke(createRequest);

        // Save rule file
        if (editContext.trim()) {
          await ipcBridge.fs.writeAssistantRule.invoke({
            assistantId: created.id,
            locale: localeKey,
            content: editContext,
          });
        }

        setActiveAssistantId(created.id);
        await loadAssistants();
        message.success(t('common.createSuccess', { defaultValue: 'Created successfully' }));
      } else {
        // Update existing assistant via backend
        if (!activeAssistant) return;

        const updateRequest: UpdateAssistantRequest = {
          id: activeAssistant.id,
          name: editName,
          description: editDescription || undefined,
          avatar: editAvatar || undefined,
          preset_agent_type: editAgent,
          enabled_skills: selectedSkills,
          custom_skill_names: finalCustomSkills,
          disabled_builtin_skills: disabledBuiltinSkills.length > 0 ? disabledBuiltinSkills : undefined,
        };
        await ipcBridge.assistants.update.invoke(updateRequest);

        // Save rule file (if changed)
        if (editContext.trim()) {
          await ipcBridge.fs.writeAssistantRule.invoke({
            assistantId: activeAssistant.id,
            locale: localeKey,
            content: editContext,
          });
        }

        await loadAssistants();
        message.success(t('common.saveSuccess', { defaultValue: 'Saved successfully' }));
      }

      setEditVisible(false);
      setPendingSkills([]);
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to save assistant:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  };

  const handleDeleteClick = () => {
    if (!activeAssistant) return;
    // Cannot delete builtin assistants
    if (isBuiltinAssistant(activeAssistant)) {
      message.warning(t('settings.cannotDeleteBuiltin', { defaultValue: 'Cannot delete builtin assistants' }));
      return;
    }
    // Extension assistants are read-only
    if (isExtensionAssistant(activeAssistant)) {
      message.warning(
        t('settings.extensionAssistantReadonly', {
          defaultValue: 'Extension assistants are read-only. You can duplicate it and edit the copy.',
        })
      );
      return;
    }
    setDeleteConfirmVisible(true);
  };

  const handleDeleteConfirm = async () => {
    if (!activeAssistant) return;
    try {
      // Delete via backend (clears assistant row + associated override).
      // Backend also removes rule/skill md files when classify returns user
      // (see backend spec §5.4), so explicit fs.deleteAssistant* calls aren't
      // required.
      await ipcBridge.assistants.delete.invoke({ id: activeAssistant.id });

      // Reload assistant list
      await loadAssistants();
      setDeleteConfirmVisible(false);
      setEditVisible(false);
      message.success(t('common.success', { defaultValue: 'Success' }));
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to delete assistant:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  };

  // Toggle assistant enabled state via override (works for all sources except extension)
  const handleToggleEnabled = async (assistant: AssistantListItem, enabled: boolean) => {
    if (isExtensionAssistant(assistant)) {
      message.warning(
        t('settings.extensionAssistantReadonly', {
          defaultValue: 'Extension assistants are read-only. You can duplicate it and edit the copy.',
        })
      );
      return;
    }

    try {
      await ipcBridge.assistants.setState.invoke({ id: assistant.id, enabled });
      await loadAssistants();
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to toggle assistant:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  };

  return {
    // Edit drawer state
    editVisible,
    setEditVisible,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editContext,
    setEditContext,
    editAvatar,
    setEditAvatar,
    editAgent,
    setEditAgent,
    editSkills,
    setEditSkills,
    isCreating,
    deleteConfirmVisible,
    setDeleteConfirmVisible,
    promptViewMode,
    setPromptViewMode,

    // Skills editing state
    availableSkills,
    setAvailableSkills,
    customSkills,
    setCustomSkills,
    selectedSkills,
    setSelectedSkills,
    pendingSkills,
    setPendingSkills,
    deletePendingSkillName,
    setDeletePendingSkillName,
    deleteCustomSkillName,
    setDeleteCustomSkillName,
    skillsModalVisible,
    setSkillsModalVisible,

    // Builtin auto-injected skills state
    builtinAutoSkills,
    disabledBuiltinSkills,
    setDisabledBuiltinSkills,

    // Handlers
    loadAssistantContext,
    loadAssistantSkills,
    handleEdit,
    handleCreate,
    handleDuplicate,
    handleSave,
    handleDeleteClick,
    handleDeleteConfirm,
    handleToggleEnabled,
  };
};
