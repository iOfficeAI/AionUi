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
import { ipcBridge } from '@/common';
import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import { ConfigStorage } from '@/common/storage';
import { resolveLocaleKey } from '@/common/utils';
import coworkSvg from '@/renderer/assets/cowork.svg';
import EmojiPicker from '@/renderer/components/EmojiPicker';
import MarkdownView from '@/renderer/components/Markdown';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { AcpBackendConfig } from '@/types/acpTypes';
import type { Message } from '@arco-design/web-react';
import {
  Avatar,
  Button,
  Checkbox,
  Collapse,
  Drawer,
  Input,
  Modal,
  Select,
  Switch,
  Tag,
  Typography,
} from '@arco-design/web-react';
import { Close, Delete, FolderOpen, Plus, Refresh, Robot, Search, SettingOne } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { mutate } from 'swr';

// Skill 信息类型 / Skill info type
interface SkillInfo {
  name: string;
  description: string;
  location: string;
  isCustom: boolean;
}

// 外部来源类型 / External source type
interface ExternalSource {
  name: string;
  path: string;
  source: string;
  skills: Array<{ name: string; description: string; path: string }>;
}

// 检查内置助手是否有 skills 配置（defaultEnabledSkills 或 skillFiles）
// Check if builtin assistant has skills config (defaultEnabledSkills or skillFiles)
const hasBuiltinSkills = (assistantId: string): boolean => {
  if (!assistantId.startsWith('builtin-')) return false;
  const presetId = assistantId.replace('builtin-', '');
  const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return false;
  // 有 defaultEnabledSkills 或 skillFiles 配置即可
  const hasDefaultSkills = preset.defaultEnabledSkills && preset.defaultEnabledSkills.length > 0;
  const hasSkillFiles = preset.skillFiles && Object.keys(preset.skillFiles).length > 0;
  return hasDefaultSkills || hasSkillFiles;
};

// 待导入的 Skill / Pending skill to import
interface PendingSkill {
  path: string; // 原始路径
  name: string;
  description: string;
}

interface AssistantManagementProps {
  message: ReturnType<typeof Message.useMessage>[0];
}

type AssistantListItem = AcpBackendConfig & {
  _source?: string;
  _extensionName?: string;
  _kind?: string;
};

const AssistantManagement: React.FC<AssistantManagementProps> = ({ message }) => {
  const { t, i18n } = useTranslation();
  const [assistants, setAssistants] = useState<AssistantListItem[]>([]);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
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
  const [drawerWidth, setDrawerWidth] = useState(500);
  // Skills 选择模式相关 state / Skills selection mode states
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [customSkills, setCustomSkills] = useState<string[]>([]); // 通过 Add Skills 添加到此助手的 skills 名称 / Skill names added via Add Skills
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]); // 启用的 skills（勾选状态）/ Enabled skills
  const [skillsModalVisible, setSkillsModalVisible] = useState(false);
  const [skillPath, setSkillPath] = useState(''); // Skill folder path input
  const [commonPaths, setCommonPaths] = useState<Array<{ name: string; path: string }>>([]); // Common skill paths detected
  const [availableBackends, setAvailableBackends] = useState<Set<string>>(new Set(['gemini']));
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [activeSourceTab, setActiveSourceTab] = useState<string>('');
  const [searchExternalQuery, setSearchExternalQuery] = useState('');
  const [externalSkillsLoading, setExternalSkillsLoading] = useState(false);
  const [showAddPathModal, setShowAddPathModal] = useState(false);
  const [customPathName, setCustomPathName] = useState('');
  const [customPathValue, setCustomPathValue] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [pendingSkills, setPendingSkills] = useState<PendingSkill[]>([]); // 待导入的 skills / Pending skills to import
  const [deletePendingSkillName, setDeletePendingSkillName] = useState<string | null>(null); // 待删除的 pending skill 名称 / Pending skill name to delete
  const [deleteCustomSkillName, setDeleteCustomSkillName] = useState<string | null>(null); // 待从助手移除的 custom skill 名称 / Custom skill to remove from assistant
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const localeKey = resolveLocaleKey(i18n.language);
  const avatarImageMap: Record<string, string> = {
    'cowork.svg': coworkSvg,
    '🛠️': coworkSvg,
  };

  // Load extension-contributed ACP adapters so they appear in the main agent dropdown
  const { data: extensionAcpAdapters } = useSWR('extensions.acpAdapters', () =>
    ipcBridge.extensions.getAcpAdapters.invoke().catch(() => [] as Record<string, unknown>[])
  );

  // Load extension-contributed assistants for Settings > Assistants list
  const { data: extensionAssistants } = useSWR('extensions.assistants', () =>
    ipcBridge.extensions.getAssistants.invoke().catch(() => [] as Record<string, unknown>[])
  );

  const normalizedExtensionAssistants = React.useMemo<AssistantListItem[]>(() => {
    if (!Array.isArray(extensionAssistants) || extensionAssistants.length === 0) return [];

    return extensionAssistants
      .map((ext) => {
        const id = typeof ext.id === 'string' ? ext.id : '';
        const name = typeof ext.name === 'string' ? ext.name : '';
        if (!id || !name) return null;

        return {
          id,
          name,
          nameI18n: ext.nameI18n as Record<string, string> | undefined,
          description: typeof ext.description === 'string' ? ext.description : undefined,
          descriptionI18n: ext.descriptionI18n as Record<string, string> | undefined,
          avatar: typeof ext.avatar === 'string' ? ext.avatar : undefined,
          presetAgentType: typeof ext.presetAgentType === 'string' ? ext.presetAgentType : undefined,
          context: typeof ext.context === 'string' ? ext.context : undefined,
          contextI18n: ext.contextI18n as Record<string, string> | undefined,
          models: Array.isArray(ext.models) ? (ext.models as string[]) : undefined,
          enabledSkills: Array.isArray(ext.enabledSkills) ? (ext.enabledSkills as string[]) : undefined,
          prompts: Array.isArray(ext.prompts) ? (ext.prompts as string[]) : undefined,
          promptsI18n: ext.promptsI18n as Record<string, string[]> | undefined,
          isPreset: true,
          isBuiltin: false,
          enabled: true,
          _source: 'extension',
          _extensionName: typeof ext._extensionName === 'string' ? ext._extensionName : undefined,
          _kind: typeof ext._kind === 'string' ? ext._kind : undefined,
        } as AssistantListItem;
      })
      .filter((item): item is AssistantListItem => item !== null);
  }, [extensionAssistants]);

  const isExtensionAssistant = useCallback((assistant: AssistantListItem | null | undefined) => {
    if (!assistant) return false;
    return assistant._source === 'extension' || assistant.id.startsWith('ext-');
  }, []);

  // Auto focus textarea when drawer opens
  useEffect(() => {
    if (editVisible && promptViewMode === 'edit') {
      // Small delay to ensure the drawer animation is complete
      const timer = setTimeout(() => {
        const textarea = textareaWrapperRef.current?.querySelector('textarea');
        textarea?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [editVisible, promptViewMode]);

  useEffect(() => {
    const updateDrawerWidth = () => {
      if (typeof window === 'undefined') return;
      const nextWidth = Math.min(500, Math.max(320, Math.floor(window.innerWidth - 32)));
      setDrawerWidth(nextWidth);
    };

    updateDrawerWidth();
    window.addEventListener('resize', updateDrawerWidth);
    return () => window.removeEventListener('resize', updateDrawerWidth);
  }, []);

  // Load available agent backends from ACP detector
  useEffect(() => {
    void (async () => {
      try {
        const resp = await ipcBridge.acpConversation.getAvailableAgents.invoke();
        if (resp.success && resp.data) {
          setAvailableBackends(new Set(resp.data.map((a) => a.backend)));
        }
      } catch {
        // fallback to default
      }
    })();
  }, []);

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
    } catch (error) {
      message.error('Failed to add custom path');
    }
  }, [customPathName, customPathValue, handleRefreshExternal, message, t]);

  const refreshAgentDetection = useCallback(async () => {
    try {
      await ipcBridge.acpConversation.refreshCustomAgents.invoke();
      await mutate('acp.agents.available');
    } catch {
      // ignore
    }
  }, []);

  // 从文件加载助手规则内容 / Load assistant rule content from file
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

  // 从文件加载助手技能内容 / Load assistant skill content from file
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

  // Helper function to sort assistants according to ASSISTANT_PRESETS order
  // 根据 ASSISTANT_PRESETS 顺序排序助手的辅助函数
  const sortAssistants = useCallback((agents: AssistantListItem[]) => {
    const presetOrder = ASSISTANT_PRESETS.map((preset) => `builtin-${preset.id}`);
    return agents
      .filter((agent) => agent.isPreset)
      .sort((a, b) => {
        const indexA = presetOrder.indexOf(a.id);
        const indexB = presetOrder.indexOf(b.id);
        if (indexA !== -1 || indexB !== -1) {
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        }
        return 0;
      });
  }, []);

  const loadAssistants = useCallback(async () => {
    try {
      // 从配置中读取已存储的助手（包含内置助手和用户自定义助手）
      // Read stored assistants from config (includes builtin and user-defined)
      const localAgents: AssistantListItem[] = (await ConfigStorage.get('acp.customAgents')) || [];

      const mergedAgents = [...localAgents];
      for (const extAssistant of normalizedExtensionAssistants) {
        if (!mergedAgents.some((agent) => agent.id === extAssistant.id)) {
          mergedAgents.push(extAssistant);
        }
      }

      const sortedAssistants = sortAssistants(mergedAgents);

      setAssistants(sortedAssistants);
      setActiveAssistantId((prev) => {
        if (prev && sortedAssistants.some((assistant) => assistant.id === prev)) return prev;
        return sortedAssistants[0]?.id || null;
      });
    } catch (error) {
      console.error('Failed to load assistant presets:', error);
    }
  }, [normalizedExtensionAssistants, sortAssistants]);

  useEffect(() => {
    void loadAssistants();
  }, [loadAssistants]);

  const activeAssistant = assistants.find((assistant) => assistant.id === activeAssistantId) || null;
  const isReadonlyAssistant = Boolean(activeAssistant && isExtensionAssistant(activeAssistant));

  // Check if string is an emoji (simple check for common emoji patterns)
  const isEmoji = useCallback((str: string) => {
    if (!str) return false;
    // Check if it's a single emoji or emoji sequence
    const emojiRegex =
      /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;
    return emojiRegex.test(str);
  }, []);

  const resolveAvatarImageSrc = useCallback(
    (avatar: string | undefined): string | undefined => {
      const value = avatar?.trim();
      if (!value) return undefined;

      const mapped = avatarImageMap[value];
      if (mapped) return mapped;

      const resolved = resolveExtensionAssetUrl(value) || value;
      const isImage =
        /\.(svg|png|jpe?g|webp|gif)$/i.test(resolved) || /^(https?:|aion-asset:\/\/|file:\/\/|data:)/i.test(resolved);
      return isImage ? resolved : undefined;
    },
    [avatarImageMap]
  );

  const renderAvatarGroup = useCallback(
    (assistant: AssistantListItem, size = 32) => {
      const resolvedAvatar = assistant.avatar?.trim();
      const hasEmojiAvatar = Boolean(resolvedAvatar && isEmoji(resolvedAvatar));
      const avatarImage = resolveAvatarImageSrc(resolvedAvatar);
      const iconSize = Math.floor(size * 0.5);
      const emojiSize = Math.floor(size * 0.6);

      return (
        <Avatar.Group size={size}>
          <Avatar
            className='border-none'
            shape='square'
            style={{ backgroundColor: 'var(--color-fill-2)', border: 'none' }}
          >
            {avatarImage ? (
              <img src={avatarImage} alt='' width={emojiSize} height={emojiSize} style={{ objectFit: 'contain' }} />
            ) : hasEmojiAvatar ? (
              <span style={{ fontSize: emojiSize }}>{resolvedAvatar}</span>
            ) : (
              <Robot theme='outline' size={iconSize} />
            )}
          </Avatar>
        </Avatar.Group>
      );
    },
    [isEmoji, resolveAvatarImageSrc]
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

    // 扩展助手直接展示扩展内 context，不走本地规则文件
    if (isExtensionAssistant(assistant)) {
      setPromptViewMode('preview');
      setEditContext(assistant.context || '');
      setEditSkills('');
      setAvailableSkills([]);
      setSelectedSkills(Array.isArray(assistant.enabledSkills) ? assistant.enabledSkills : []);
      setCustomSkills([]);
      return;
    }

    // 先加载规则、技能内容 / Load rules, skills content
    try {
      const [context, skills] = await Promise.all([
        loadAssistantContext(assistant.id),
        loadAssistantSkills(assistant.id),
      ]);
      setEditContext(context);
      setEditSkills(skills);

      // 对于有 skillFiles 配置的内置助手和所有自定义助手，加载技能列表 / Load skills list for builtin assistants with skillFiles and all custom assistants
      if (hasBuiltinSkills(assistant.id) || !assistant.isBuiltin) {
        const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
        setAvailableSkills(skillsList);
        // selectedSkills: 启用的 skills / Enabled skills
        setSelectedSkills(assistant.enabledSkills || []);
        // customSkills: 通过 Add Skills 添加的 skills 名称 / Skills added via Add Skills
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

  // 创建助手功能 / Create assistant function
  const handleCreate = async () => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName('');
    setEditDescription('');
    setEditContext('');
    setEditAvatar('🤖');
    setEditAgent('gemini');
    setEditSkills('');
    setSelectedSkills([]); // 没有启用的 skills
    setCustomSkills([]); // 没有通过 Add Skills 添加的 skills
    setPromptViewMode('edit'); // 创建助手时，规则默认处于编辑状态 / Default to edit mode when creating
    setEditVisible(true);

    // 加载可用的skills列表 / Load available skills list
    try {
      const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
      setAvailableSkills(skillsList);
    } catch (error) {
      console.error('Failed to load skills:', error);
      setAvailableSkills([]);
    }
  };

  // 复制新建助手功能 / Duplicate assistant function
  const handleDuplicate = async (assistant: AssistantListItem) => {
    setIsCreating(true);
    setActiveAssistantId(null);
    setEditName(`${assistant.nameI18n?.[localeKey] || assistant.name} (Copy)`);
    setEditDescription(assistant.descriptionI18n?.[localeKey] || assistant.description || '');
    setEditAvatar(assistant.avatar || '🤖');
    setEditAgent(assistant.presetAgentType || 'gemini');
    setPromptViewMode('edit');
    setEditVisible(true);

    // 加载原助手的规则和技能内容 / Load original assistant's rules and skills
    try {
      const [skillsList, context, skills] = isExtensionAssistant(assistant)
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
      // 验证必填字段 / Validate required fields
      if (!editName.trim()) {
        message.error(t('settings.assistantNameRequired', { defaultValue: 'Assistant name is required' }));
        return;
      }

      // 扩展助手为只读配置，不能直接保存覆盖
      if (!isCreating && activeAssistant && isExtensionAssistant(activeAssistant)) {
        message.warning(
          t('settings.extensionAssistantReadonly', {
            defaultValue: 'Extension assistants are read-only. You can duplicate it and edit the copy.',
          })
        );
        return;
      }

      // 先导入所有待导入的 skills（跳过已存在的）/ Import pending skills (skip existing ones)
      if (pendingSkills.length > 0) {
        // 过滤出真正需要导入的 skills（不在 availableSkills 中的）
        const skillsToImport = pendingSkills.filter(
          (pending) => !availableSkills.some((available) => available.name === pending.name)
        );

        if (skillsToImport.length > 0) {
          for (const pendingSkill of skillsToImport) {
            try {
              // 使用 importSkillWithSymlink 保持与技能中心一致 / Use importSkillWithSymlink to align with Skills Hub
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
          // 导入成功后重新加载 skills 列表 / Reload skills list after successful import
          const skillsList = await ipcBridge.fs.listAvailableSkills.invoke();
          setAvailableSkills(skillsList);
        }
      }

      const agents = (await ConfigStorage.get('acp.customAgents')) || [];

      // 计算最终的 customSkills：合并现有的 + 待导入的 / Calculate final customSkills: merge existing + pending
      const pendingSkillNames = pendingSkills.map((s) => s.name);
      const finalCustomSkills = Array.from(new Set([...customSkills, ...pendingSkillNames]));

      if (isCreating) {
        // 创建新助手 / Create new assistant
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

        // 保存规则文件 / Save rule file
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
        // 更新现有助手 / Update existing assistant
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

        // 保存规则文件（如果有更改）/ Save rule file (if changed)
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
      setPendingSkills([]); // 清空待导入列表 / Clear pending skills list
      await refreshAgentDetection();
    } catch (error) {
      console.error('Failed to save assistant:', error);
      message.error(t('common.failed', { defaultValue: 'Failed' }));
    }
  };

  const handleDeleteClick = () => {
    if (!activeAssistant) return;
    // 不能删除内置助手 / Cannot delete builtin assistants
    if (activeAssistant.isBuiltin) {
      message.warning(t('settings.cannotDeleteBuiltin', { defaultValue: 'Cannot delete builtin assistants' }));
      return;
    }
    // 扩展助手是扩展贡献，不允许在此处删除
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
      // 1. 删除规则和技能文件 / Delete rule and skill files
      await Promise.all([
        ipcBridge.fs.deleteAssistantRule.invoke({ assistantId: activeAssistant.id }),
        ipcBridge.fs.deleteAssistantSkill.invoke({ assistantId: activeAssistant.id }),
      ]);

      // 2. 从配置中移除助手 / Remove assistant from config
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

  // Toggle assistant enabled state / 切换助手启用状态
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

  const handleAddFoundSkills = (skillsToAdd: Array<{ name: string; description: string; path: string }>) => {
    let addedCount = 0;
    let skippedCount = 0;
    const newPendingSkills: PendingSkill[] = [];
    const newCustomSkillNames: string[] = [];
    const newSelectedSkills: string[] = [];

    for (const skill of skillsToAdd) {
      const { name, description, path: sPath } = skill;

      // 检查是否已经在此助手的列表中 / Check if already in this assistant's list
      const alreadyInAssistant = customSkills.includes(name) || newCustomSkillNames.includes(name);

      if (alreadyInAssistant) {
        skippedCount++;
        continue;
      }

      // 检查是否系统已存在 / Check if already exists in system
      const existsInAvailable = availableSkills.some((s) => s.name === name);
      const existsInPending = pendingSkills.some((s) => s.name === name);

      if (!existsInAvailable && !existsInPending) {
        // 只有系统不存在时才添加到待导入列表 / Only add to pending if not in system
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

  const editAvatarImage = resolveAvatarImageSrc(editAvatar);

  return (
    <div>
      <Collapse.Item
        header={
          <div className='flex items-center justify-between w-full'>
            <span>{t('settings.assistants', { defaultValue: 'Assistants' })}</span>
          </div>
        }
        name='smart-assistants'
        extra={
          <Button
            type='text'
            size='small'
            style={{ color: 'var(--text-primary)' }}
            icon={<Plus size={14} fill='currentColor' />}
            onClick={(e) => {
              e.stopPropagation();
              void handleCreate();
            }}
          >
            {t('settings.createAssistant', { defaultValue: 'Create' })}
          </Button>
        }
      >
        <div className='py-2'>
          <div className='bg-fill-2 rounded-2xl p-20px'>
            <div className='text-14px text-t-secondary mb-12px'>
              {t('settings.assistantsList', { defaultValue: 'Available assistants' })}
            </div>
            {assistants.length > 0 ? (
              <div className='space-y-12px'>
                {assistants.map((assistant) => {
                  const assistantIsExtension = isExtensionAssistant(assistant);
                  return (
                    <div
                      key={assistant.id}
                      className='group bg-fill-0 rounded-lg px-16px py-12px flex items-center justify-between cursor-pointer hover:bg-fill-1 transition-colors'
                      onClick={() => {
                        setActiveAssistantId(assistant.id);
                        void handleEdit(assistant);
                      }}
                    >
                      <div className='flex items-center gap-12px min-w-0'>
                        {renderAvatarGroup(assistant, 28)}
                        <div className='min-w-0'>
                          <div className='font-medium text-t-primary truncate flex items-center gap-6px'>
                            <span className='truncate'>{assistant.nameI18n?.[localeKey] || assistant.name}</span>
                          </div>
                          <div className='text-12px text-t-secondary truncate'>
                            {assistant.descriptionI18n?.[localeKey] || assistant.description || ''}
                          </div>
                        </div>
                      </div>
                      <div className='flex items-center gap-12px text-t-secondary'>
                        <span
                          className='invisible group-hover:visible text-12px text-primary cursor-pointer hover:underline transition-all'
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDuplicate(assistant);
                          }}
                        >
                          {t('settings.duplicateAssistant', { defaultValue: 'Duplicate' })}
                        </span>
                        <Switch
                          size='small'
                          checked={assistantIsExtension ? true : assistant.enabled !== false}
                          disabled={assistantIsExtension}
                          onChange={(checked) => {
                            void handleToggleEnabled(assistant, checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <Button
                          type='text'
                          size='small'
                          icon={<SettingOne size={16} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleEdit(assistant);
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className='text-center text-t-secondary py-12px'>
                {t('settings.assistantsEmpty', { defaultValue: 'No assistants configured.' })}
              </div>
            )}
          </div>
        </div>
      </Collapse.Item>

      <Drawer
        title={
          <>
            <span>
              {isCreating
                ? t('settings.createAssistant', { defaultValue: 'Create Assistant' })
                : t('settings.editAssistant', { defaultValue: 'Assistant Details' })}
            </span>
            <div
              onClick={(e) => {
                e.stopPropagation();
                setEditVisible(false);
              }}
              className='absolute right-4 top-2 cursor-pointer text-t-secondary hover:text-t-primary transition-colors p-1'
              style={{ zIndex: 10, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <Close size={18} />
            </div>
          </>
        }
        closable={false}
        visible={editVisible}
        placement='right'
        width={drawerWidth}
        zIndex={1200}
        autoFocus={false}
        onCancel={() => {
          setEditVisible(false);
        }}
        headerStyle={{ background: 'var(--color-bg-1)' }}
        bodyStyle={{ background: 'var(--color-bg-1)' }}
        footer={
          <div className='flex items-center justify-between w-full'>
            <div className='flex items-center gap-8px'>
              <Button
                type='primary'
                onClick={handleSave}
                disabled={!isCreating && isReadonlyAssistant}
                className='w-[100px] rounded-[100px]'
              >
                {isCreating
                  ? t('common.create', { defaultValue: 'Create' })
                  : t('common.save', { defaultValue: 'Save' })}
              </Button>
              <Button
                onClick={() => {
                  setEditVisible(false);
                }}
                className='w-[100px] rounded-[100px] bg-fill-2'
              >
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </div>
            {!isCreating && !activeAssistant?.isBuiltin && !isExtensionAssistant(activeAssistant) && (
              <Button
                status='danger'
                onClick={handleDeleteClick}
                className='rounded-[100px]'
                style={{ backgroundColor: 'rgb(var(--danger-1))' }}
              >
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
            )}
          </div>
        }
      >
        <div className='flex flex-col h-full overflow-hidden'>
          <div className='flex flex-col flex-1 gap-16px bg-fill-2 rounded-16px p-20px overflow-y-auto'>
            <div className='flex-shrink-0'>
              <Typography.Text bold>
                <span className='text-red-500'>*</span>{' '}
                {t('settings.assistantNameAvatar', { defaultValue: 'Name & Avatar' })}
              </Typography.Text>
              <div className='mt-10px flex items-center gap-12px'>
                {activeAssistant?.isBuiltin || isReadonlyAssistant ? (
                  <Avatar shape='square' size={40} className='bg-bg-1 rounded-4px'>
                    {editAvatarImage ? (
                      <img src={editAvatarImage} alt='' width={24} height={24} style={{ objectFit: 'contain' }} />
                    ) : editAvatar ? (
                      <span className='text-24px'>{editAvatar}</span>
                    ) : (
                      <Robot theme='outline' size={20} />
                    )}
                  </Avatar>
                ) : (
                  <EmojiPicker value={editAvatar} onChange={(emoji) => setEditAvatar(emoji)} placement='br'>
                    <div className='cursor-pointer'>
                      <Avatar
                        shape='square'
                        size={40}
                        className='bg-bg-1 rounded-4px hover:bg-fill-2 transition-colors'
                      >
                        {editAvatarImage ? (
                          <img src={editAvatarImage} alt='' width={24} height={24} style={{ objectFit: 'contain' }} />
                        ) : editAvatar ? (
                          <span className='text-24px'>{editAvatar}</span>
                        ) : (
                          <Robot theme='outline' size={20} />
                        )}
                      </Avatar>
                    </div>
                  </EmojiPicker>
                )}
                <Input
                  value={editName}
                  onChange={(value) => setEditName(value)}
                  disabled={activeAssistant?.isBuiltin || isReadonlyAssistant}
                  placeholder={t('settings.agentNamePlaceholder', { defaultValue: 'Enter a name for this agent' })}
                  className='flex-1 rounded-4px bg-bg-1'
                />
              </div>
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold>
                {t('settings.assistantDescription', { defaultValue: 'Assistant Description' })}
              </Typography.Text>
              <Input
                className='mt-10px rounded-4px bg-bg-1'
                value={editDescription}
                onChange={(value) => setEditDescription(value)}
                disabled={activeAssistant?.isBuiltin || isReadonlyAssistant}
                placeholder={t('settings.assistantDescriptionPlaceholder', {
                  defaultValue: 'What can this assistant help with?',
                })}
              />
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold>{t('settings.assistantMainAgent', { defaultValue: 'Main Agent' })}</Typography.Text>
              <Select
                className='mt-10px w-full rounded-4px'
                value={editAgent}
                onChange={(value) => setEditAgent(value as string)}
                disabled={isReadonlyAssistant}
              >
                {[
                  { value: 'gemini', label: 'Gemini CLI' },
                  { value: 'claude', label: 'Claude Code' },
                  { value: 'qwen', label: 'Qwen Code' },
                  { value: 'codex', label: 'Codex' },
                  { value: 'codebuddy', label: 'CodeBuddy' },
                  { value: 'opencode', label: 'OpenCode' },
                ]
                  .filter((opt) => availableBackends.has(opt.value))
                  .map((opt) => (
                    <Select.Option key={opt.value} value={opt.value}>
                      {opt.label}
                    </Select.Option>
                  ))}
                {/* Extension-contributed ACP adapters */}
                {extensionAcpAdapters?.map((adapter) => {
                  const id = adapter.id as string;
                  const name = (adapter.name as string) || id;
                  return (
                    <Select.Option key={id} value={id}>
                      <span className='flex items-center gap-6px'>
                        {name}
                        <Tag size='small' color='arcoblue'>
                          ext
                        </Tag>
                      </span>
                    </Select.Option>
                  );
                })}
              </Select>
            </div>
            <div className='flex-shrink-0'>
              <Typography.Text bold className='flex-shrink-0'>
                {t('settings.assistantRules', { defaultValue: 'Rules' })}
              </Typography.Text>
              {/* Prompt Edit/Preview Tabs */}
              <div className='mt-10px border border-border-2 overflow-hidden rounded-4px' style={{ height: '300px' }}>
                {!activeAssistant?.isBuiltin && !isReadonlyAssistant && (
                  <div className='flex items-center h-36px bg-fill-2 border-b border-border-2 flex-shrink-0'>
                    <div
                      className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'edit' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`}
                      onClick={() => setPromptViewMode('edit')}
                    >
                      {t('settings.promptEdit', { defaultValue: 'Edit' })}
                    </div>
                    <div
                      className={`flex items-center h-full px-16px cursor-pointer transition-all text-13px font-medium ${promptViewMode === 'preview' ? 'text-primary border-b-2 border-primary bg-bg-1' : 'text-t-secondary hover:text-t-primary'}`}
                      onClick={() => setPromptViewMode('preview')}
                    >
                      {t('settings.promptPreview', { defaultValue: 'Preview' })}
                    </div>
                  </div>
                )}
                <div
                  className='bg-fill-2'
                  style={{
                    height: activeAssistant?.isBuiltin || isReadonlyAssistant ? '100%' : 'calc(100% - 36px)',
                    overflow: 'auto',
                  }}
                >
                  {promptViewMode === 'edit' && !activeAssistant?.isBuiltin && !isReadonlyAssistant ? (
                    <div ref={textareaWrapperRef} className='h-full'>
                      <Input.TextArea
                        value={editContext}
                        onChange={(value) => setEditContext(value)}
                        placeholder={t('settings.assistantRulesPlaceholder', {
                          defaultValue: 'Enter rules in Markdown format...',
                        })}
                        autoSize={false}
                        className='border-none rounded-none bg-transparent h-full resize-none'
                      />
                    </div>
                  ) : (
                    <div className='p-16px'>
                      {editContext ? (
                        <MarkdownView hiddenCodeCopyButton>{editContext}</MarkdownView>
                      ) : (
                        <div className='text-t-secondary text-center py-32px'>
                          {t('settings.promptPreviewEmpty', { defaultValue: 'No content to preview' })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* 创建助手或编辑有 skillFiles 配置的内置助手/自定义助手时显示技能选择 / Show skills selection when creating or editing builtin assistants with skillFiles/custom assistants */}
            {(isCreating ||
              (activeAssistantId && hasBuiltinSkills(activeAssistantId)) ||
              (activeAssistant && !activeAssistant.isBuiltin && !isExtensionAssistant(activeAssistant))) && (
              <div className='flex-shrink-0 mt-16px'>
                <div className='flex items-center justify-between mb-12px'>
                  <Typography.Text bold>{t('settings.assistantSkills', { defaultValue: 'Skills' })}</Typography.Text>
                  <Button
                    size='small'
                    type='outline'
                    icon={<Plus size={14} />}
                    onClick={() => setSkillsModalVisible(true)}
                    className='rounded-[100px]'
                  >
                    {t('settings.addSkills', { defaultValue: 'Add Skills' })}
                  </Button>
                </div>

                {/* Skills 折叠面板 / Skills Collapse */}
                <Collapse defaultActiveKey={['custom-skills']}>
                  {/* 通过 Add Skills 添加的 Skills / Custom Skills (Pending + Imported) */}
                  <Collapse.Item
                    header={
                      <span className='text-13px font-medium'>
                        {t('settings.customSkills', { defaultValue: 'Imported Skills (Library)' })}
                      </span>
                    }
                    name='custom-skills'
                    className='mb-8px'
                    extra={
                      <span className='text-12px text-t-secondary'>
                        {pendingSkills.length + availableSkills.filter((skill) => skill.isCustom).length}
                      </span>
                    }
                  >
                    <div className='space-y-4px'>
                      {/* 待导入的 skills (Pending) / Pending skills (not yet imported) */}
                      {pendingSkills.map((skill) => (
                        <div
                          key={`pending-${skill.name}`}
                          className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'
                        >
                          <Checkbox
                            checked={selectedSkills.includes(skill.name)}
                            className='mt-2px cursor-pointer'
                            onChange={() => {
                              if (selectedSkills.includes(skill.name)) {
                                setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                              } else {
                                setSelectedSkills([...selectedSkills, skill.name]);
                              }
                            }}
                          />
                          <div className='flex-1 min-w-0'>
                            <div className='flex items-center gap-6px'>
                              <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                              <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 border border-[rgba(var(--primary-6),0.2)] text-10px px-4px py-1px rd-4px font-medium uppercase'>
                                Pending
                              </span>
                            </div>
                            {skill.description && (
                              <div className='text-12px text-t-secondary mt-2px line-clamp-2'>{skill.description}</div>
                            )}
                          </div>
                          <button
                            className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletePendingSkillName(skill.name);
                            }}
                            title='Remove'
                          >
                            <Delete size={16} fill='var(--color-text-3)' />
                          </button>
                        </div>
                      ))}
                      {/* 所有已导入的 custom skills / All imported custom skills */}
                      {availableSkills
                        .filter((skill) => skill.isCustom)
                        .map((skill) => (
                          <div
                            key={`custom-${skill.name}`}
                            className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px group'
                          >
                            <Checkbox
                              checked={selectedSkills.includes(skill.name)}
                              className='mt-2px cursor-pointer'
                              onChange={() => {
                                if (selectedSkills.includes(skill.name)) {
                                  setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                                } else {
                                  setSelectedSkills([...selectedSkills, skill.name]);
                                }
                              }}
                            />
                            <div className='flex-1 min-w-0'>
                              <div className='flex items-center gap-6px'>
                                <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                                <span className='bg-[rgba(242,156,27,0.08)] text-[rgb(242,156,27)] border border-[rgba(242,156,27,0.2)] text-10px px-4px py-1px rd-4px font-medium uppercase'>
                                  {t('settings.skillsHub.custom', { defaultValue: 'Custom' })}
                                </span>
                              </div>
                              {skill.description && (
                                <div className='text-12px text-t-secondary mt-2px line-clamp-2'>
                                  {skill.description}
                                </div>
                              )}
                            </div>
                            <button
                              className='opacity-0 group-hover:opacity-100 transition-opacity p-4px hover:bg-fill-2 rounded-4px'
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteCustomSkillName(skill.name);
                              }}
                              title={t('settings.removeFromAssistant', { defaultValue: 'Remove from assistant' })}
                            >
                              <Delete size={16} fill='var(--color-text-3)' />
                            </button>
                          </div>
                        ))}
                      {pendingSkills.length === 0 && availableSkills.filter((skill) => skill.isCustom).length === 0 && (
                        <div className='text-center text-t-secondary text-12px py-16px'>
                          {t('settings.noCustomSkills', { defaultValue: 'No custom skills added' })}
                        </div>
                      )}
                    </div>
                  </Collapse.Item>

                  {/* 内置 Skills / Builtin Skills */}
                  <Collapse.Item
                    header={
                      <span className='text-13px font-medium'>
                        {t('settings.builtinSkills', { defaultValue: 'Builtin Skills' })}
                      </span>
                    }
                    name='builtin-skills'
                    extra={
                      <span className='text-12px text-t-secondary'>
                        {availableSkills.filter((skill) => !skill.isCustom).length}
                      </span>
                    }
                  >
                    {availableSkills.filter((skill) => !skill.isCustom).length > 0 ? (
                      <div className='space-y-4px'>
                        {availableSkills
                          .filter((skill) => !skill.isCustom)
                          .map((skill) => (
                            <div
                              key={skill.name}
                              className='flex items-start gap-8px p-8px hover:bg-fill-1 rounded-4px'
                            >
                              <Checkbox
                                checked={selectedSkills.includes(skill.name)}
                                className='mt-2px cursor-pointer'
                                onChange={() => {
                                  if (selectedSkills.includes(skill.name)) {
                                    setSelectedSkills(selectedSkills.filter((s) => s !== skill.name));
                                  } else {
                                    setSelectedSkills([...selectedSkills, skill.name]);
                                  }
                                }}
                              />
                              <div className='flex-1 min-w-0'>
                                <div className='text-13px font-medium text-t-primary'>{skill.name}</div>
                                {skill.description && (
                                  <div className='text-12px text-t-secondary mt-2px line-clamp-2'>
                                    {skill.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className='text-center text-t-secondary text-12px py-16px'>
                        {t('settings.noBuiltinSkills', { defaultValue: 'No builtin skills available' })}
                      </div>
                    )}
                  </Collapse.Item>
                </Collapse>
              </div>
            )}
          </div>
        </div>
      </Drawer>

      {/* Delete Confirmation Modal */}
      <Modal
        title={t('settings.deleteAssistantTitle', { defaultValue: 'Delete Assistant' })}
        visible={deleteConfirmVisible}
        onCancel={() => setDeleteConfirmVisible(false)}
        onOk={handleDeleteConfirm}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.delete', { defaultValue: 'Delete' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        className='w-[90vw] md:w-[400px]'
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <p>
          {t('settings.deleteAssistantConfirm', {
            defaultValue: 'Are you sure you want to delete this assistant? This action cannot be undone.',
          })}
        </p>
        {activeAssistant && (
          <div className='mt-12px p-12px bg-fill-2 rounded-lg flex items-center gap-12px'>
            {renderAvatarGroup(activeAssistant, 32)}
            <div>
              <div className='font-medium'>{activeAssistant.name}</div>
              <div className='text-12px text-t-secondary'>{activeAssistant.description}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Skills Modal - Aligned with Skills Hub */}
      <Modal
        visible={skillsModalVisible}
        onCancel={() => {
          setSkillsModalVisible(false);
          setSearchExternalQuery('');
        }}
        footer={null}
        title={t('settings.addSkillsTitle', { defaultValue: 'Add Skills' })}
        className='w-[90vw] md:w-[600px]'
        wrapStyle={{ zIndex: 2500 }}
        maskStyle={{ zIndex: 2490 }}
        autoFocus={false}
      >
        <div className='flex flex-col h-[500px]'>
          <div className='flex items-center justify-between mb-16px shrink-0 gap-16px'>
            <div className='flex-1 overflow-x-auto custom-scrollbar pb-4px'>
              <div className='flex items-center gap-8px min-w-max'>
                {externalSources.map((source) => {
                  const isActive = activeSourceTab === source.source;
                  return (
                    <button
                      key={source.source}
                      type='button'
                      className={`outline-none cursor-pointer px-12px py-6px text-12px rd-[100px] transition-all duration-300 flex items-center gap-6px border ${isActive ? 'bg-primary-6 border-primary-6 text-white shadow-sm font-medium' : 'bg-fill-2 border-transparent text-t-secondary hover:bg-fill-3 hover:text-t-primary'}`}
                      onClick={() => setActiveSourceTab(source.source)}
                    >
                      {source.name}
                      <span
                        className={`px-6px py-1px rd-[100px] text-10px flex items-center justify-center transition-colors ${isActive ? 'bg-white/20 text-white' : 'bg-fill-3 text-t-tertiary border border-border-1'}`}
                      >
                        {source.skills.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className='flex items-center gap-4px shrink-0 ml-4px'>
              <button
                type='button'
                className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2'
                onClick={() => void handleRefreshExternal()}
                title={t('common.refresh', { defaultValue: 'Refresh' })}
              >
                <Refresh theme='outline' size={16} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                type='button'
                className='outline-none border border-dashed border-border-1 hover:border-primary-4 cursor-pointer w-28px h-28px text-t-tertiary hover:text-primary-6 hover:bg-primary-1 rd-full transition-all duration-300 flex items-center justify-center bg-transparent shrink-0'
                onClick={() => setShowAddPathModal(true)}
                title={t('common.add', { defaultValue: 'Add Custom Path' })}
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <Input
            prefix={<Search />}
            placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
            value={searchExternalQuery}
            onChange={(val) => setSearchExternalQuery(val)}
            className='mb-12px shrink-0 rounded-[8px] bg-fill-2'
          />

          <div className='flex-1 overflow-y-auto custom-scrollbar bg-fill-1 rounded-8px p-12px'>
            {externalSkillsLoading ? (
              <div className='h-full flex items-center justify-center text-t-tertiary'>
                {t('common.loading', { defaultValue: 'Loading...' })}
              </div>
            ) : activeSource ? (
              filteredExternalSkills.length > 0 ? (
                <div className='flex flex-col gap-8px'>
                  {filteredExternalSkills.map((skill) => {
                    const isAdded = customSkills.includes(skill.name);
                    return (
                      <div
                        key={skill.path}
                        className='flex items-start gap-12px p-12px bg-base border border-transparent hover:border-border-2 rounded-8px transition-colors shadow-sm'
                      >
                        <div className='w-32px h-32px rounded-8px bg-fill-2 border border-border-1 flex items-center justify-center font-bold text-14px text-t-secondary uppercase shrink-0 mt-2px'>
                          {skill.name.charAt(0)}
                        </div>
                        <div className='flex-1 min-w-0'>
                          <div className='text-14px font-medium text-t-primary truncate'>{skill.name}</div>
                          {skill.description && (
                            <div className='text-12px text-t-secondary line-clamp-2 mt-4px' title={skill.description}>
                              {skill.description}
                            </div>
                          )}
                        </div>
                        <div className='shrink-0 flex items-center h-full self-center'>
                          {isAdded ? (
                            <Button
                              size='small'
                              disabled
                              className='rounded-[100px] bg-fill-2 text-t-tertiary border-none'
                            >
                              {t('common.added', { defaultValue: 'Added' })}
                            </Button>
                          ) : (
                            <Button
                              size='small'
                              type='primary'
                              className='rounded-[100px]'
                              onClick={() => {
                                handleAddFoundSkills([skill]);
                              }}
                            >
                              <Plus size={14} className='mr-4px' />
                              {t('common.add', { defaultValue: 'Add' })}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className='h-full flex items-center justify-center text-t-tertiary'>
                  {t('settings.skillsHub.noSearchResults', { defaultValue: 'No skills found' })}
                </div>
              )
            ) : (
              <div className='h-full flex items-center justify-center text-t-tertiary'>
                {t('settings.noExternalSources', { defaultValue: 'No external skill sources discovered' })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Pending Skill Confirmation Modal */}
      <Modal
        visible={deletePendingSkillName !== null}
        onCancel={() => setDeletePendingSkillName(null)}
        title={t('settings.deletePendingSkillTitle', { defaultValue: 'Delete Pending Skill' })}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.delete', { defaultValue: 'Delete' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        onOk={() => {
          if (deletePendingSkillName) {
            // 从 pendingSkills 和 customSkills 中删除 / Remove from pendingSkills and customSkills
            setPendingSkills(pendingSkills.filter((s) => s.name !== deletePendingSkillName));
            setCustomSkills(customSkills.filter((s) => s !== deletePendingSkillName));
            // 如果该 skill 被选中，也从选中列表移除 / Also remove from selectedSkills if selected
            setSelectedSkills(selectedSkills.filter((s) => s !== deletePendingSkillName));
            setDeletePendingSkillName(null);
            message.success(t('settings.skillDeleted', { defaultValue: 'Skill removed from pending list' }));
          }
        }}
        className='w-[90vw] md:w-[400px]'
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <p>
          {t('settings.deletePendingSkillConfirm', {
            defaultValue: `Are you sure you want to remove "${deletePendingSkillName}"? This skill has not been imported yet.`,
          })}
        </p>
        <div className='mt-12px text-12px text-t-secondary bg-fill-2 p-12px rounded-lg'>
          {t('settings.deletePendingSkillNote', {
            defaultValue:
              'This will only remove the skill from the pending list. If you want to add it again later, you can use "Add Skills".',
          })}
        </div>
      </Modal>

      {/* Remove Custom Skill from Assistant Modal */}
      <Modal
        visible={deleteCustomSkillName !== null}
        onCancel={() => setDeleteCustomSkillName(null)}
        title={t('settings.removeCustomSkillTitle', { defaultValue: 'Remove Skill from Assistant' })}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.remove', { defaultValue: 'Remove' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        onOk={() => {
          if (deleteCustomSkillName) {
            // 从 customSkills 中移除 / Remove from customSkills
            setCustomSkills(customSkills.filter((s) => s !== deleteCustomSkillName));
            // 如果该 skill 被选中，也从选中列表移除 / Also remove from selectedSkills if selected
            setSelectedSkills(selectedSkills.filter((s) => s !== deleteCustomSkillName));
            setDeleteCustomSkillName(null);
            message.success(
              t('settings.skillRemovedFromAssistant', { defaultValue: 'Skill removed from this assistant' })
            );
          }
        }}
        className='w-[90vw] md:w-[400px]'
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <p>
          {t('settings.removeCustomSkillConfirm', {
            defaultValue: `Are you sure you want to remove "${deleteCustomSkillName}" from this assistant?`,
          })}
        </p>
        <div className='mt-12px text-12px text-t-secondary bg-fill-2 p-12px rounded-lg'>
          {t('settings.removeCustomSkillNote', {
            defaultValue:
              'This will only remove the skill from this assistant. The skill will remain in Builtin Skills and can be re-added later.',
          })}
        </div>
      </Modal>

      {/* Add Custom External Path Modal */}
      <Modal
        title={t('settings.skillsHub.addCustomPath', { defaultValue: '添加自定义技能路径' })}
        visible={showAddPathModal}
        onCancel={() => {
          setShowAddPathModal(false);
          setCustomPathName('');
          setCustomPathValue('');
        }}
        onOk={() => void handleAddCustomPath()}
        okText={t('common.confirm', { defaultValue: '确认' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
        okButtonProps={{ disabled: !customPathName.trim() || !customPathValue.trim() }}
        autoFocus={false}
        focusLock
        wrapStyle={{ zIndex: 10000 }}
        maskStyle={{ zIndex: 9999 }}
      >
        <div className='flex flex-col gap-16px'>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>
              {t('common.name', { defaultValue: '名称' })}
            </div>
            <Input
              placeholder={t('settings.skillsHub.customPathNamePlaceholder', { defaultValue: '例：我的自定义技能' })}
              value={customPathName}
              onChange={(v) => setCustomPathName(v)}
              className='rd-6px'
            />
          </div>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>
              {t('settings.skillsHub.customPathLabel', { defaultValue: '技能目录路径' })}
            </div>
            <div className='flex gap-8px'>
              <Input
                placeholder={t('settings.skillsHub.customPathPlaceholder', {
                  defaultValue: '例：C:\\Users\\me\\.mytools\\skills',
                })}
                value={customPathValue}
                onChange={(v) => setCustomPathValue(v)}
                className='flex-1 rd-6px'
              />
              <Button
                className='rd-6px'
                onClick={async () => {
                  try {
                    const result = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
                    if (result && result.length > 0) {
                      setCustomPathValue(result[0]);
                    }
                  } catch (e) {
                    console.error('Failed to select directory', e);
                  }
                }}
              >
                <FolderOpen size={16} />
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AssistantManagement;
