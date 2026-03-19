import { ipcBridge } from '@/common';
import MarkdownView from '@/renderer/components/Markdown';
import { Button, Drawer, Message, Modal, Typography, Input, Dropdown, Menu } from '@arco-design/web-react';
import { Delete, FolderOpen, Info, Search, Plus, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

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

const getAvatarColorClass = (name: string) => {
  if (!name) return 'bg-[#165DFF] text-white';
  const colors = [
    'bg-[#165DFF] text-white', // Blue
    'bg-[#00B42A] text-white', // Green
    'bg-[#722ED1] text-white', // Purple
    'bg-[#F5319D] text-white', // Pink
    'bg-[#F77234] text-white', // Orange
    'bg-[#14C9C9] text-white', // Cyan
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const SkillsHubSettings: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [skillPaths, setSkillPaths] = useState<{ userSkillsDir: string; builtinSkillsDir: string } | null>(null);
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([]);
  const [activeSourceTab, setActiveSourceTab] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExternalQuery, setSearchExternalQuery] = useState('');
  const [showAddPathModal, setShowAddPathModal] = useState(false);
  const [customPathName, setCustomPathName] = useState('');
  const [customPathValue, setCustomPathValue] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Skill detail drawer state
  const [selectedSkill, setSelectedSkill] = useState<{
    name: string;
    description: string;
    path: string;
    isImported?: boolean;
    isCustom?: boolean;
  } | null>(null);
  const [skillContent, setSkillContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return availableSkills;
    const lowerQuery = searchQuery.toLowerCase();
    return availableSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) || (s.description && s.description.toLowerCase().includes(lowerQuery))
    );
  }, [availableSkills, searchQuery]);

  const loadSkillContent = useCallback(
    async (skillPath: string) => {
      setLoadingContent(true);
      setSkillContent('');
      try {
        // skillPath may be the SKILL.md path (for installed skills) or directory path (for external)
        const mdPath = skillPath.endsWith('SKILL.md') ? skillPath : `${skillPath}/SKILL.md`;
        const content = await ipcBridge.fs.readFile.invoke({ path: mdPath });
        // Strip YAML frontmatter for cleaner display
        const stripped = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
        setSkillContent(stripped.trim());
      } catch (error) {
        console.error('Failed to load skill content:', error);
        setSkillContent(t('settings.skillsHub.loadFailed'));
      } finally {
        setLoadingContent(false);
      }
    },
    [t]
  );

  const openSkillDetail = useCallback(
    (skill: { name: string; description: string; path: string; isImported?: boolean; isCustom?: boolean }) => {
      setSelectedSkill(skill);
      void loadSkillContent(skill.path);
    },
    [loadSkillContent]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const skills = await ipcBridge.fs.listAvailableSkills.invoke();
      setAvailableSkills(skills);

      const external = await ipcBridge.fs.detectAndCountExternalSkills.invoke();
      if (external.success && external.data) {
        setExternalSources(external.data);
        if (external.data.length > 0 && !activeSourceTab) {
          setActiveSourceTab(external.data[0].source);
        }
      }

      const paths = await ipcBridge.fs.getSkillPaths.invoke();
      setSkillPaths(paths);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      Message.error(t('settings.skillsHub.fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t, activeSourceTab]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleImport = async (skillPath: string) => {
    try {
      const result = await ipcBridge.fs.importSkillWithSymlink.invoke({ skillPath });
      if (result.success) {
        Message.success(result.msg || t('settings.skillsHub.importSuccess'));
        void fetchData();
      } else {
        Message.error(result.msg || t('settings.skillsHub.importFailed'));
      }
    } catch (error) {
      console.error('Failed to import skill:', error);
      Message.error(t('settings.skillsHub.importError'));
    }
  };

  const handleImportAll = async (skills: Array<{ name: string; path: string }>) => {
    let successCount = 0;
    for (const skill of skills) {
      try {
        const result = await ipcBridge.fs.importSkillWithSymlink.invoke({ skillPath: skill.path });
        if (result.success) successCount++;
      } catch {
        // continue
      }
    }
    if (successCount > 0) {
      Message.success(
        t('settings.skillsHub.importAllSuccess', {
          count: successCount,
        })
      );
      void fetchData();
    }
  };

  const handleDelete = async (skillName: string) => {
    try {
      const result = await ipcBridge.fs.deleteSkill.invoke({ skillName });
      if (result.success) {
        Message.success(result.msg || t('settings.skillsHub.deleteSuccess'));
        void fetchData();
      } else {
        Message.error(result.msg || t('settings.skillsHub.deleteFailed'));
      }
    } catch (error) {
      console.error('Failed to delete skill:', error);
      Message.error(t('settings.skillsHub.deleteError'));
    }
  };

  const handleManualImport = async () => {
    try {
      const result = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openDirectory'],
      });
      if (result && result.length > 0) {
        await handleImport(result[0]);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };

  const handleRefreshExternal = useCallback(async () => {
    setRefreshing(true);
    try {
      const external = await ipcBridge.fs.detectAndCountExternalSkills.invoke();
      if (external.success && external.data) {
        setExternalSources(external.data);
        if (external.data.length > 0 && !external.data.find((s) => s.source === activeSourceTab)) {
          setActiveSourceTab(external.data[0].source);
        }
      }
      Message.success(t('common.refreshSuccess'));
    } catch (error) {
      console.error('Failed to refresh external skills:', error);
    } finally {
      setRefreshing(false);
    }
  }, [t, activeSourceTab]);

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
        void handleRefreshExternal();
      } else {
        Message.error(result.msg || 'Failed to add path');
      }
    } catch (error) {
      Message.error('Failed to add custom path');
    }
  }, [customPathName, customPathValue, handleRefreshExternal]);

  const totalExternal = externalSources.reduce((sum, src) => sum + src.skills.length, 0);
  const activeSource = externalSources.find((s) => s.source === activeSourceTab);

  const filteredExternalSkills = useMemo(() => {
    if (!activeSource) return [];
    if (!searchExternalQuery.trim()) return activeSource.skills;
    const lowerQuery = searchExternalQuery.toLowerCase();
    return activeSource.skills.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) || (s.description && s.description.toLowerCase().includes(lowerQuery))
    );
  }, [activeSource, searchExternalQuery]);

  return (
    <>
      <SettingsPageWrapper>
        <div className='flex flex-col h-full w-full'>
          <div className='space-y-16px pb-24px'>
            {/* ======== 发现外部技能 / Discovered External Skills ======== */}
            {totalExternal > 0 && (
              <div className='px-[16px] md:px-[32px] py-32px bg-fill-1 rd-16px md:rd-24px mb-16px shadow-sm border border-line relative overflow-hidden transition-all'>
                {/* Section Header with Search Bar */}
                <div className='flex flex-col lg:flex-row lg:items-start justify-between gap-16px mb-24px relative z-10 w-full'>
                  <div className='flex flex-col'>
                    <div className='flex items-center gap-10px mb-8px'>
                      <span className='text-16px md:text-18px text-t-primary font-bold tracking-tight'>
                        {t('settings.skillsHub.discoveredTitle')}
                      </span>
                      <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 text-12px px-10px py-2px rd-[100px] font-medium ml-4px'>
                        {totalExternal}
                      </span>
                      <button
                        className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2 ml-4px'
                        onClick={() => void handleRefreshExternal()}
                        title={t('common.refresh')}
                      >
                        <Refresh theme='outline' size={16} className={refreshing ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    <Typography.Text className='text-13px text-t-secondary block max-w-xl leading-relaxed'>
                      {t('settings.skillsHub.discoveryAlert')}
                    </Typography.Text>
                  </div>

                  {/* Search Bar Outputted inline with Header description in desktop */}
                  <div className='relative group shrink-0 w-full lg:w-[240px]'>
                    <div className='absolute left-12px top-1/2 -translate-y-1/2 text-t-tertiary group-focus-within:text-primary-6 flex pointer-events-none transition-colors'>
                      <Search size={15} />
                    </div>
                    <input
                      type='text'
                      className='w-full bg-fill-1 hover:bg-fill-2 border border-border-1 focus:border-primary-5 focus:bg-base outline-none rd-8px py-6px pl-36px pr-12px text-13px text-t-primary placeholder:text-t-tertiary transition-all shadow-sm box-border m-0'
                      placeholder={t('settings.skillsHub.searchPlaceholder')}
                      value={searchExternalQuery}
                      onChange={(e) => setSearchExternalQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Toolbar (Tabs) */}
                <div className='flex flex-wrap items-center gap-8px mb-20px relative z-10 w-full'>
                  {externalSources.map((source) => {
                    const isActive = activeSourceTab === source.source;
                    return (
                      <button
                        key={source.source}
                        type='button'
                        className={`outline-none cursor-pointer px-16px py-6px text-13px rd-[100px] transition-all duration-300 flex items-center gap-6px border ${isActive ? 'bg-primary-6 border-primary-6 text-white shadow-md font-medium' : 'bg-transparent border-border-1 text-t-secondary hover:bg-fill-2 hover:text-t-primary'}`}
                        onClick={() => setActiveSourceTab(source.source)}
                      >
                        {source.name}
                        <span
                          className={`px-6px py-1px rd-[100px] text-11px flex items-center justify-center transition-colors ${isActive ? 'bg-white/20 text-white font-medium' : 'bg-fill-2 text-t-secondary border border-transparent'}`}
                        >
                          {source.skills.length}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type='button'
                    className='outline-none border border-dashed border-border-1 hover:border-primary-4 cursor-pointer w-28px h-28px ml-4px text-t-tertiary hover:text-primary-6 hover:bg-primary-1 rd-full transition-all duration-300 flex items-center justify-center bg-transparent shrink-0'
                    onClick={() => setShowAddPathModal(true)}
                    title={t('common.add')}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {/* Active tab content */}
                {activeSource && (
                  <div className='flex flex-col'>
                    <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-12px py-8px mb-4px'>
                      <div className='flex items-center gap-8px text-12px text-t-tertiary font-mono min-w-0 bg-transparent py-4px'>
                        <FolderOpen size={16} className='shrink-0' />
                        <span className='truncate' title={activeSource.path}>
                          {activeSource.path}
                        </span>
                      </div>
                      <button
                        className='flex items-center gap-6px text-13px font-medium text-primary-6 hover:text-primary-5 transition-colors bg-transparent border-none outline-none cursor-pointer whitespace-nowrap'
                        onClick={() => void handleImportAll(activeSource.skills)}
                      >
                        {t('settings.skillsHub.importAll')}
                      </button>
                    </div>

                    <div className='max-h-[360px] overflow-y-auto custom-scrollbar flex flex-col gap-6px pr-4px'>
                      {filteredExternalSkills.map((skill) => (
                        <div
                          key={skill.path}
                          className='group flex flex-col sm:flex-row gap-16px p-16px bg-transparent border border-transparent hover:border-border-1 hover:bg-fill-2 hover:shadow-sm rd-12px transition-all duration-200 cursor-pointer'
                          onClick={() =>
                            openSkillDetail({ name: skill.name, description: skill.description, path: skill.path })
                          }
                        >
                          <div className='shrink-0 flex items-start sm:mt-2px'>
                            <div className='w-40px h-40px rd-full bg-fill-2 border border-border-1 flex items-center justify-center font-bold text-16px text-t-primary shadow-sm transition-all text-transform-uppercase'>
                              {skill.name.charAt(0)}
                            </div>
                          </div>
                          <div className='flex-1 min-w-0 flex flex-col justify-center'>
                            <h3 className='text-14px font-semibold text-t-primary/90 mb-6px truncate m-0'>
                              {skill.name}
                            </h3>
                            {skill.description && (
                              <p
                                className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0'
                                title={skill.description}
                              >
                                {skill.description}
                              </p>
                            )}
                          </div>
                          <div className='shrink-0 sm:self-center flex items-center mt-8px sm:mt-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity'>
                            <Button
                              size='small'
                              type='primary'
                              status='default'
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleImport(skill.path);
                              }}
                              className='rd-[100px] shadow-sm px-16px'
                            >
                              {t('common.import')}
                            </Button>
                          </div>
                        </div>
                      ))}
                      {filteredExternalSkills.length === 0 && (
                        <div className='text-center text-t-secondary text-13px py-40px bg-fill-1 rd-12px border border-line border-dashed'>
                          {t('settings.skillsHub.noSearchResults')}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ======== 我的技能 / My Skills ======== */}
            <div className='px-[16px] md:px-[32px] py-32px bg-fill-1 rd-16px md:rd-24px shadow-sm border border-line relative overflow-hidden transition-all'>
              {/* Toolbar for My Skills */}
              <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-16px mb-24px relative z-10'>
                <div className='flex items-center gap-10px shrink-0'>
                  <span className='text-16px md:text-18px text-t-primary font-bold tracking-tight'>
                    {t('settings.skillsHub.mySkillsTitle')}
                  </span>
                  <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 text-12px px-10px py-2px rd-[100px] font-medium ml-4px'>
                    {availableSkills.length}
                  </span>
                  <button
                    className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2 ml-4px'
                    onClick={async () => {
                      await fetchData();
                      Message.success(t('common.refreshSuccess'));
                    }}
                    title={t('common.refresh')}
                  >
                    <Refresh theme='outline' size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-12px w-full lg:w-auto shrink-0'>
                  <div className='relative group shrink-0 w-full sm:w-[200px] lg:w-[240px]'>
                    <div className='absolute left-12px top-1/2 -translate-y-1/2 text-t-tertiary group-focus-within:text-primary-6 flex pointer-events-none transition-colors'>
                      <Search size={15} />
                    </div>
                    <input
                      type='text'
                      className='w-full bg-fill-1 hover:bg-fill-2 border border-border-1 focus:border-primary-5 focus:bg-base outline-none rd-8px py-6px pl-36px pr-12px text-13px text-t-primary placeholder:text-t-tertiary transition-all shadow-sm box-border m-0'
                      placeholder={t('settings.skillsHub.searchPlaceholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <button
                    className='flex items-center justify-center gap-6px px-16px py-6px bg-transparent border border-border-1 hover:border-border-2 hover:bg-fill-2 text-t-primary rd-8px shadow-sm transition-all focus:outline-none shrink-0 cursor-pointer whitespace-nowrap'
                    onClick={handleManualImport}
                  >
                    <FolderOpen size={15} className='text-t-secondary' />
                    <span className='text-13px font-medium'>{t('settings.skillsHub.manualImport')}</span>
                  </button>
                </div>
              </div>

              {/* Path Display moved below the toolbar */}
              {skillPaths && (
                <div className='flex items-center gap-8px text-12px text-t-tertiary font-mono bg-transparent py-4px mb-16px relative z-10 pt-4px border-t border-t-transparent'>
                  <FolderOpen size={16} className='shrink-0' />
                  <span className='truncate' title={skillPaths.userSkillsDir}>
                    {skillPaths.userSkillsDir}
                  </span>
                </div>
              )}

              {availableSkills.length > 0 ? (
                <div className='w-full flex flex-col gap-6px relative z-10'>
                  {filteredSkills.map((skill) => (
                    <div
                      key={skill.name}
                      className='group flex flex-col sm:flex-row gap-16px p-16px bg-transparent border border-transparent hover:border-border-1 hover:bg-fill-2 hover:shadow-sm rd-12px transition-all duration-200 cursor-pointer'
                      onClick={() =>
                        openSkillDetail({
                          name: skill.name,
                          description: skill.description,
                          path: skill.location,
                          isImported: true,
                          isCustom: skill.isCustom,
                        })
                      }
                    >
                      <div className='shrink-0 flex items-start sm:mt-2px'>
                        <div
                          className={`w-40px h-40px rd-10px flex items-center justify-center font-bold text-16px shadow-sm text-transform-uppercase ${getAvatarColorClass(skill.name)}`}
                        >
                          {skill.name.charAt(0).toUpperCase()}
                        </div>
                      </div>

                      <div className='flex-1 min-w-0 flex flex-col justify-center gap-6px'>
                        <div className='flex items-center gap-10px flex-wrap'>
                          <h3 className='text-14px font-semibold text-t-primary/90 truncate m-0'>{skill.name}</h3>
                          {skill.isCustom ? (
                            <span className='bg-[rgba(var(--orange-6),0.08)] text-orange-6 border border-[rgba(var(--orange-6),0.2)] text-11px px-6px py-1px rd-4px font-medium'>
                              {t('settings.skillsHub.custom')}
                            </span>
                          ) : (
                            <span className='bg-[rgba(var(--blue-6),0.08)] text-blue-6 border border-[rgba(var(--blue-6),0.2)] text-11px px-6px py-1px rd-4px font-medium'>
                              {t('settings.skillsHub.builtin')}
                            </span>
                          )}
                        </div>
                        {skill.description && (
                          <p
                            className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0'
                            title={skill.description}
                          >
                            {skill.description}
                          </p>
                        )}
                      </div>

                      <div className='shrink-0 sm:self-center flex items-center justify-end gap-6px mt-12px sm:mt-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity pl-4px'>
                        {externalSources.length > 0 && (
                          <Dropdown
                            trigger='click'
                            position='bl'
                            droplist={
                              <Menu>
                                {externalSources.map((source) => (
                                  <Menu.Item
                                    key={source.source}
                                    onClick={async (e) => {
                                      e.stopPropagation();

                                      const hide = Message.loading({
                                        content: t('common.processing'),
                                        duration: 0,
                                      });
                                      try {
                                        const skillPath = skill.location.replace(/[\\/]SKILL\.md$/, '');

                                        const result = await Promise.race([
                                          ipcBridge.fs.exportSkillWithSymlink.invoke({
                                            skillPath,
                                            targetDir: source.path,
                                          }),
                                          new Promise<{ success: boolean; msg: string }>((_, reject) =>
                                            setTimeout(() => reject(new Error('Export timed out.')), 8000)
                                          ),
                                        ]);

                                        hide();
                                        if (result.success) {
                                          Message.success(t('settings.skillsHub.exportSuccess'));
                                        } else {
                                          Message.error(result.msg || t('settings.skillsHub.exportFailed'));
                                        }
                                      } catch (error) {
                                        hide();
                                        console.error('[SkillsHub] Export error:', error);
                                        const errMsg = error instanceof Error ? error.message : String(error);
                                        Message.error(errMsg);
                                      }
                                    }}
                                  >
                                    {source.name}
                                  </Menu.Item>
                                ))}
                              </Menu>
                            }
                          >
                            <button
                              className='p-8px hover:bg-fill-2 text-t-tertiary hover:text-t-secondary rd-6px outline-none flex items-center justify-center border border-transparent cursor-pointer transition-colors shadow-sm bg-fill-2 sm:bg-transparent sm:shadow-none'
                              title={t('settings.skillsHub.exportTo')}
                            >
                              <span className='text-12px font-medium'>{t('settings.skillsHub.exportTo')}</span>
                            </button>
                          </Dropdown>
                        )}
                        {skill.isCustom && (
                          <button
                            className='p-8px hover:bg-danger-1 hover:text-danger-6 text-t-tertiary rd-6px outline-none flex items-center justify-center border border-transparent cursor-pointer transition-colors shadow-sm bg-fill-2 sm:bg-transparent sm:shadow-none'
                            onClick={() => {
                              Modal.confirm({
                                title: t('settings.skillsHub.deleteConfirmTitle'),
                                content: t('settings.skillsHub.deleteConfirmContent', {
                                  name: skill.name,
                                }),
                                okButtonProps: { status: 'danger' },
                                onOk: () => void handleDelete(skill.name),
                              });
                            }}
                            title={t('common.delete')}
                          >
                            <Delete size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='text-center text-t-secondary text-13px py-40px bg-fill-1 rd-12px border border-line border-dashed relative z-10'>
                  {loading ? t('common.loading') : t('settings.skillsHub.noSkills')}
                </div>
              )}
            </div>

            {/* ======== Usage Tip ======== */}
            <div className='px-16px md:px-[24px] py-20px bg-fill-1 border border-line shadow-sm rd-16px flex items-start gap-12px text-t-secondary'>
              <Info size={18} className='text-primary-6 mt-2px shrink-0' />
              <div className='flex flex-col gap-4px'>
                <span className='font-bold text-t-primary text-14px'>{t('settings.skillsHub.tipTitle')}</span>
                <span className='text-13px leading-relaxed'>{t('settings.skillsHub.tipContent')}</span>
              </div>
            </div>
          </div>
        </div>
      </SettingsPageWrapper>

      {/* Add Custom External Path Modal */}
      <Modal
        title={t('settings.skillsHub.addCustomPath')}
        visible={showAddPathModal}
        onCancel={() => {
          setShowAddPathModal(false);
          setCustomPathName('');
          setCustomPathValue('');
        }}
        onOk={() => void handleAddCustomPath()}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        okButtonProps={{ disabled: !customPathName.trim() || !customPathValue.trim() }}
        autoFocus={false}
        focusLock
      >
        <div className='flex flex-col gap-16px'>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>{t('common.name')}</div>
            <Input
              placeholder={t('settings.skillsHub.customPathNamePlaceholder')}
              value={customPathName}
              onChange={(v) => setCustomPathName(v)}
              className='rd-6px'
            />
          </div>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>{t('settings.skillsHub.customPathLabel')}</div>
            <div className='flex gap-8px'>
              <Input
                placeholder={t('settings.skillsHub.customPathPlaceholder')}
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

      {/* Skill Detail Drawer */}
      <Drawer
        title={
          <div className='flex items-center gap-10px'>
            <span className='text-16px font-bold'>{selectedSkill?.name || t('settings.skillsHub.skillDetail')}</span>
            {selectedSkill?.isImported && (
              <span
                className={`text-11px px-6px py-1px rd-4px font-medium ${
                  selectedSkill.isCustom
                    ? 'bg-[rgba(var(--orange-6),0.08)] text-orange-6 border border-[rgba(var(--orange-6),0.2)]'
                    : 'bg-[rgba(var(--blue-6),0.08)] text-blue-6 border border-[rgba(var(--blue-6),0.2)]'
                }`}
              >
                {selectedSkill.isCustom ? t('settings.skillsHub.custom') : t('settings.skillsHub.builtin')}
              </span>
            )}
          </div>
        }
        width={560}
        visible={!!selectedSkill}
        placement='right'
        onCancel={() => setSelectedSkill(null)}
        footer={
          <div className='flex items-center justify-between w-full'>
            <div className='flex items-center gap-6px text-12px text-t-tertiary truncate max-w-[60%]'>
              <FolderOpen size={14} className='shrink-0' />
              <span className='truncate' title={selectedSkill?.path}>
                {selectedSkill?.path}
              </span>
            </div>
            <div className='flex gap-8px'>
              <Button onClick={() => setSelectedSkill(null)}>{t('common.close')}</Button>
              {selectedSkill && !selectedSkill.isImported && (
                <Button
                  type='primary'
                  onClick={() => {
                    void handleImport(selectedSkill.path);
                    setSelectedSkill(null);
                  }}
                >
                  {t('common.import')}
                </Button>
              )}
            </div>
          </div>
        }
        autoFocus={false}
      >
        <div className='flex flex-col gap-16px'>
          {selectedSkill?.description && (
            <Typography.Text className='text-13px text-t-secondary leading-relaxed'>
              {selectedSkill.description}
            </Typography.Text>
          )}
          {loadingContent ? (
            <div className='flex items-center justify-center py-40px text-t-secondary text-13px'>
              {t('settings.skillsHub.loadingContent')}
            </div>
          ) : (
            skillContent && <MarkdownView codeDefaultExpanded>{skillContent}</MarkdownView>
          )}
        </div>
      </Drawer>
    </>
  );
};

export default SkillsHubSettings;
