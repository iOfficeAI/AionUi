import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import type { Message } from '@arco-design/web-react';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import {
  hasBuiltinSkills,
  isExtensionAssistant as isExtensionAssistantUtil,
} from '@/renderer/pages/settings/AgentSettings/AssistantManagement/assistantUtils';
import type {
  AssistantListItem,
  PendingSkill,
  SkillInfo,
} from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

type UseAssistantEditorParams = {
  localeKey: string;
  activeAssistant: AssistantListItem | null;
  isReadonlyAssistant: boolean;
  isExtensionAssistant: (assistant: AssistantListItem | null | undefined) => boolean;
  setActiveAssistantId: (id: string | null) => void;
  loadAssistants: () => Promise<void>;
  refreshAgentDetection: () => Promise<void>;
  message: ReturnType<typeof Message.useMessage>[0];
};

/**
 * Manages all assistant editing state and handlers:
 * create, edit, duplicate, save, delete, and toggle enabled.
 */
export const useAssistantEditor = ({
  localeKey,
  activeAssistant,
  isReadonlyAssistant,
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
  // editAgent holds either a built-in PresetAgentType or an extension adapter ID (e.g. "ext-buddy")
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
    setEditAgent(assistant.presetAgentType || 'gemini');
    setPendingSkills([]);
    setDeletePendingSkillName(null);
    setDeleteCustomSkillName(null);
    setEditVisible(true);

    // Extension assistants show extension context directly, not local rule files
    if (isExtensionAssistantUtil(assistant)) {
      setPromptViewMode('preview');
      setEditContext(assistant.context || '');
      setEditSkills('');
      setAvailableSkills([]);
      setSelectedSkills(Array.isArray(assistant.enabledSkills) ? assistant.enabledSkills : []);
      setCustomSkills([]);
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

      // Load skills list for builtin assistants with skillFiles and all custom assistants
      if (hasBuiltinSkills(assistant.id) || !assistant.isBuiltin) {
        const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
        setAvailableSkills(skillsList);
        setSelectedSkills(assistant.enabledSkills || []);
        setCustomSkills(assistant.customSkillNames || []);
      } else {
        setAvailableSkills([]);
        setSelectedSkills([]);
        setCustomSkills([]);
      }
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
    setPromptViewMode('edit');
    setEditVisible(true);

    // Load available skills list
    try {
      const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
      setAvailableSkills(skillsList);
    } catch (error) {
      console.error('Failed to load skills:', error);
      setAvailableSkills([]);
    }
  };

  // Duplicate assistant function
  const handleDuplicate = async (assistant: AssistantListItem) => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName(`${assistant.nameI18n?.[localeKey] || assistant.name} (Copy)`);
    setEditDescription(assistant.descriptionI18n?.[localeKey] || assistant.description || '');
    setEditAvatar(assistant.avatar || '\u{1F916}');
    setEditAgent(assistant.presetAgentType || 'gemini');
    setPromptViewMode('edit');
    setEditVisible(true);

    // Load original assistant's rules and skills
    try {
      const [skillsList, context, skills] = isExtensionAssistantUtil(assistant)
        ? await Promise.all([
            ipcBridge.fs.listAvailableSkills.invoke(),
            Promise.resolve(assistant.context || ''),
            Promise.resolve(''),
          ])
        : await Promise.all([
            ipcBridge.fs.listAvailableSkills.invoke(),
            loadAssistantContext(assistant.id),
            loadAssistantSkills(assistant.id),
          ]);

      setEditContext(context);
      setEditSkills(skills);
      setAvailableSkills(skillsList);
      setSelectedSkills(assistant.enabledSkills || []);
      setCustomSkills(assistant.customSkillNames || []);
    } catch (error) {
      console.error('Failed to load assistant content for duplication:', error);
      setEditContext('');
      setEditSkills('');
      setAvailableSkills([]);
      setSelectedSkills([]);
      setCustomSkills([]);
    }
  };

  const handleSave = async () => {
    try {
      // Validate required fields
      if (!editName.trim()) {
        message.error(t('settings.assistantNameRequired', { defaultValue: 'Assistant name is required' }));
        return;
      }

      // Extension assistants are read-only, cannot save over them
      if (!isCreating && activeAssistant && isExtensionAssistant(activeAssistant)) {
        message.warning(
          t('settings.extensionAssistantReadonly', {
            defaultValue: 'Extension assistants are read-only. You can duplicate it and edit the copy.',
          })
        );
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
              const response = await ipcBridge.fs.importSkillWithSymlink.invoke({ skillPath: pendingSkill.path });
              if (!response.success) {
                message.error(`Failed to import skill "${pendingSkill.name}": ${response.msg}`);
                return;
              }
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

      const agents = (await ConfigStorage.get('acp.customAgents')) || [];

      // Calculate final customSkills: merge existing + pending
      const pendingSkillNames = pendingSkills.map((s) => s.name);
      const finalCustomSkills = Array.from(new Set([...customSkills, ...pendingSkillNames]));

      if (isCreating) {
        // Create new assistant
        const newId = `custom-${Date.now()}`;
        const newAssistant: AcpBackendConfig = {
          id: newId,
          name: editName,
          description: editDescription,
          avatar: editAvatar,
          isPreset: true,
          isBuiltin: false,
          presetAgentType: editAgent,
          enabled: true,
          enabledSkills: selectedSkills,
          customSkillNames: finalCustomSkills,
        };

        // Save rule file
        if (editContext.trim()) {
          await ipcBridge.fs.writeAssistantRule.invoke({
            assistantId: newId,
            locale: localeKey,
            content: editContext,
          });
        }

        const updatedAgents = [...agents, newAssistant];
        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setActiveAssistantId(newId);
        await loadAssistants();
        message.success(t('common.createSuccess', { defaultValue: 'Created successfully' }));
      } else {
        // Update existing assistant
        if (!activeAssistant) return;

        const updatedAgent: AcpBackendConfig = {
          ...activeAssistant,
          name: editName,
          description: editDescription,
          avatar: editAvatar,
          presetAgentType: editAgent,
          enabledSkills: selectedSkills,
          customSkillNames: finalCustomSkills,
        };

        // Save rule file (if changed)
        if (editContext.trim()) {
          await ipcBridge.fs.writeAssistantRule.invoke({
            assistantId: activeAssistant.id,
            locale: localeKey,
            content: editContext,
          });
        }

        const updatedAgents = agents.map((agent) => (agent.id === activeAssistant.id ? updatedAgent : agent));
        await ConfigStorage.set('acp.customAgents', updatedAgents);
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
    if (activeAssistant.isBuiltin) {
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
      // Delete rule and skill files
      await Promise.all([
        ipcBridge.fs.deleteAssistantRule.invoke({ assistantId: activeAssistant.id }),
        ipcBridge.fs.deleteAssistantSkill.invoke({ assistantId: activeAssistant.id }),
      ]);

      // Remove assistant from config
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = agents.filter((agent) => agent.id !== activeAssistant.id);
      await ConfigStorage.set('acp.customAgents', updatedAgents);

      // Reload merged assistant list (local + extensions)
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

  // Toggle assistant enabled state
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
      const agents = (await ConfigStorage.get('acp.customAgents')) || [];
      const updatedAgents = agents.map((agent) => (agent.id === assistant.id ? { ...agent, enabled } : agent));
      await ConfigStorage.set('acp.customAgents', updatedAgents);

      // Reload merged assistant list (local + extensions)
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
