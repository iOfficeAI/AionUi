/**
 * AddSkillsModal — Modal for browsing and adding skills from external sources.
 * Includes tabs for sources, search, and skill cards.
 */
import type { ExternalSource } from './types';
import { Button, Input, Modal } from '@arco-design/web-react';
import { Plus, Refresh, Search } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type AddSkillsModalProps = {
  visible: boolean;
  onCancel: () => void;

  // External sources
  externalSources: ExternalSource[];
  activeSourceTab: string;
  setActiveSourceTab: (v: string) => void;
  activeSource: ExternalSource | undefined;
  filteredExternalSkills: Array<{ name: string; description: string; path: string }>;
  externalSkillsLoading: boolean;

  // Search
  searchExternalQuery: string;
  setSearchExternalQuery: (v: string) => void;

  // Refresh
  refreshing: boolean;
  handleRefreshExternal: () => Promise<void>;

  // Add path
  setShowAddPathModal: (v: boolean) => void;

  // Already added skills
  customSkills: string[];

  // Add handler
  handleAddFoundSkills: (skills: Array<{ name: string; description: string; path: string }>) => void;
};

const AddSkillsModal: React.FC<AddSkillsModalProps> = ({
  visible,
  onCancel,
  externalSources,
  activeSourceTab,
  setActiveSourceTab,
  activeSource,
  filteredExternalSkills,
  externalSkillsLoading,
  searchExternalQuery,
  setSearchExternalQuery,
  refreshing,
  handleRefreshExternal,
  setShowAddPathModal,
  customSkills,
  handleAddFoundSkills,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      onCancel={onCancel}
      footer={null}
      title={t('settings.addSkillsTitle', { defaultValue: 'Add Skills' })}
      className='w-[90vw] md:w-[600px]'
      wrapStyle={{ zIndex: 2500 }}
      maskStyle={{ zIndex: 2490 }}
      autoFocus={false}
    >
      <div className='flex flex-col h-[500px]'>
        {/* Source tabs + actions */}
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

        {/* Search */}
        <Input
          prefix={<Search />}
          placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
          value={searchExternalQuery}
          onChange={(val) => setSearchExternalQuery(val)}
          className='mb-12px shrink-0 rounded-[8px] bg-fill-2'
        />

        {/* Skill list */}
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
  );
};

export default AddSkillsModal;
