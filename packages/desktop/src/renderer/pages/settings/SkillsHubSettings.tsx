import { ipcBridge } from '@/common';
import { Message, Modal } from '@arco-design/web-react';
import { Delete, Lightning, Puzzle, Search, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import TalkToButlerButton from '@/renderer/components/base/TalkToButlerButton';
import { buildSkillImportNotice, getSkillImportErrorMessage } from './skillImportMessages';

// Skill 信息类型 / Skill info type
interface SkillInfo {
  name: string;
  description: string;
  location: string;
  /**
   * Relative location under the builtin-skills corpus (e.g.
   * `auto-inject/cron/SKILL.md`). Present only for built-in sources; the
   * export-to-external-source flow still uses absolute `location` paths.
   */
  relative_location?: string;
  is_auto_inject: boolean;
  is_custom: boolean;
  source?: 'builtin' | 'custom' | 'cron' | 'extension';
}

const isAutoInjectedBuiltinSkill = (skill: SkillInfo) => skill.source === 'builtin' && skill.is_auto_inject;

interface SkillImportRecord {
  id: string;
  operation_id: string;
  source_label: string;
  source_path?: string;
  source_name: string;
  skill_name?: string;
  status: 'imported' | 'failed' | 'overwritten' | string;
  error_code?: string;
  error_path?: string;
  actual_bytes?: number;
  limit_bytes?: number;
  line?: number;
  column?: number;
  created_at: number;
}

interface SkillImportLimits {
  max_file_bytes: number;
  max_total_bytes: number;
}

interface SkillImportHistoryGroup {
  operationId: string;
  sourceLabel: string;
  createdAt: number;
  importedCount: number;
  failedCount: number;
  records: SkillImportRecord[];
}

// Normalize skill name for data-testid usage
const normalizeTestId = (name: string): string => {
  return name.replace(/[:/\s<>"'|?*]/g, '-');
};

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

const formatBytes = (bytes?: number): string | null => {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
};

const buildImportHistoryGroups = (records: SkillImportRecord[]): SkillImportHistoryGroup[] => {
  const byOperation = new Map<string, SkillImportHistoryGroup>();
  for (const record of records) {
    const existing = byOperation.get(record.operation_id);
    const group =
      existing ??
      ({
        operationId: record.operation_id,
        sourceLabel: record.source_label,
        createdAt: record.created_at,
        importedCount: 0,
        failedCount: 0,
        records: [],
      } satisfies SkillImportHistoryGroup);
    group.records.push(record);
    group.createdAt = Math.max(group.createdAt, record.created_at);
    if (record.status === 'failed') {
      group.failedCount += 1;
    } else {
      group.importedCount += 1;
    }
    byOperation.set(record.operation_id, group);
  }
  return Array.from(byOperation.values()).sort((a, b) => b.createdAt - a.createdAt);
};

const hasImportedRecords = (group: SkillImportHistoryGroup): boolean =>
  group.records.some((r) => r.status !== 'failed');

interface SkillsHubSettingsProps {
  /** When false, renders without SettingsPageWrapper — useful for embedding in a tab */
  withWrapper?: boolean;
}

const SkillsHubSettings: React.FC<SkillsHubSettingsProps> = ({ withWrapper = true }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightName = searchParams.get('highlight');
  const isImportHistoryView =
    location.pathname === '/settings/capabilities/skills/import-history' ||
    searchParams.get('view') === 'import-history';
  const [highlightedSkill, setHighlightedSkill] = useState<string | null>(null);
  const skillRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [loading, setLoading] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [search_query, setSearchQuery] = useState('');
  const [importHistory, setImportHistory] = useState<SkillImportRecord[]>([]);
  const [importLimits, setImportLimits] = useState<SkillImportLimits | null>(null);

  const mySkills = useMemo(
    () =>
      availableSkills.filter((s) => s.source !== 'extension' && s.source !== 'cron' && !isAutoInjectedBuiltinSkill(s)),
    [availableSkills]
  );
  const builtinAutoSkills = useMemo(() => availableSkills.filter(isAutoInjectedBuiltinSkill), [availableSkills]);
  const extensionSkills = useMemo(() => availableSkills.filter((s) => s.source === 'extension'), [availableSkills]);
  const importHistoryGroups = useMemo(() => buildImportHistoryGroups(importHistory), [importHistory]);

  const filteredSkills = useMemo(() => {
    if (!search_query.trim()) return mySkills;
    const lowerQuery = search_query.toLowerCase();
    return mySkills.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) || (s.description && s.description.toLowerCase().includes(lowerQuery))
    );
  }, [mySkills, search_query]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const skills = await ipcBridge.fs.listAvailableSkills.invoke();
      setAvailableSkills(skills);

      const history = await ipcBridge.fs.listSkillImportHistory.invoke();
      setImportHistory(history as SkillImportRecord[]);

      const limits = await ipcBridge.fs.getSkillImportLimits.invoke();
      setImportLimits(limits);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      Message.error(t('settings.skillsHub.fetchError', { defaultValue: 'Failed to fetch skills' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Scroll to and highlight a skill when navigated with ?highlight=skillName
  useEffect(() => {
    if (!highlightName || loading) return;
    const el = skillRefs.current[highlightName];
    if (el) {
      // Small delay to ensure layout is settled
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedSkill(highlightName);
        // Clear highlight after animation
        const timer = setTimeout(() => setHighlightedSkill(null), 2000);
        // Clean up the search param so refreshing won't re-highlight
        setSearchParams({}, { replace: true });
        return () => clearTimeout(timer);
      });
    }
  }, [highlightName, loading, availableSkills, setSearchParams]);

  const showImportHistory = useCallback(() => {
    void navigate('/settings/capabilities/skills/import-history');
  }, [navigate]);

  const showSkillList = useCallback(() => {
    void navigate('/settings/capabilities?tab=skills');
  }, [navigate]);

  const handleImport = async (skillPath: string) => {
    try {
      const result = await ipcBridge.fs.importSkills.invoke({ skill_path: skillPath });
      const notice = buildSkillImportNotice(result, t);
      if (notice.type === 'error') {
        Message.error(notice.message);
      } else if (notice.type === 'warning') {
        Message.warning(notice.message);
      } else {
        Message.success(notice.message);
      }
      if (notice.importedNames.length > 0) {
        setSearchQuery('');
        void fetchData();
      } else if (notice.type !== 'success') {
        void fetchData();
      }
    } catch (error) {
      console.error('Failed to import skill:', error);
      Message.error(getSkillImportErrorMessage(error, t));
    }
  };

  const handleDelete = async (skillName: string) => {
    try {
      await ipcBridge.fs.deleteSkill.invoke({ skill_name: skillName });
      Message.success(t('settings.skillsHub.deleteSuccess', { defaultValue: 'Skill deleted' }));
      void fetchData();
    } catch (error) {
      console.error('Failed to delete skill:', error);
      Message.error(t('settings.skillsHub.deleteError', { defaultValue: 'Error deleting skill' }));
    }
  };

  const handleManualImport = async () => {
    try {
      const result = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openFile', 'openDirectory'],
        filters: [{ name: 'Skill folders or zip archives', extensions: ['zip'] }],
      });
      if (result && result.length > 0) {
        await handleImport(result[0]);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };

  const getImportHistoryStatusLabel = (group: SkillImportHistoryGroup) => {
    if (group.failedCount > 0 && hasImportedRecords(group)) {
      return t('settings.skillsHub.importHistoryStatusPartial', { defaultValue: 'Partial' });
    }
    if (group.failedCount > 0) {
      return t('settings.skillsHub.importHistoryStatusFailed', { defaultValue: 'Failed' });
    }
    if (group.records.some((record) => record.status === 'overwritten')) {
      return t('settings.skillsHub.importHistoryStatusOverwritten', { defaultValue: 'Overwritten' });
    }
    return t('settings.skillsHub.importHistoryStatusSuccess', { defaultValue: 'Success' });
  };

  const getImportHistoryStatusClass = (group: SkillImportHistoryGroup) => {
    if (group.failedCount > 0) {
      return 'bg-[rgba(var(--warning-6),0.10)] text-warning-6 border-[rgba(var(--warning-6),0.20)]';
    }
    if (group.records.some((record) => record.status === 'overwritten')) {
      return 'bg-[rgba(var(--warning-6),0.10)] text-warning-6 border-[rgba(var(--warning-6),0.20)]';
    }
    return 'bg-[rgba(var(--success-6),0.10)] text-[rgb(var(--success-6))] border-[rgba(var(--success-6),0.20)]';
  };

  const getFailedImportRepairTitle = (record: SkillImportRecord) => {
    switch (record.error_code) {
      case 'SKILL_IMPORT_FILE_TOO_LARGE':
        return t('settings.skillsHub.importHistoryRepairFileTooLarge', {
          defaultValue: 'Repair: remove the oversized file and import again',
        });
      case 'SKILL_IMPORT_TOTAL_TOO_LARGE':
        return t('settings.skillsHub.importHistoryRepairTotalTooLarge', {
          defaultValue: 'Repair: remove unrelated large files and import again',
        });
      case 'SKILL_INVALID_FRONTMATTER':
        return t('settings.skillsHub.importHistoryRepairFrontmatter', {
          defaultValue: 'Repair: update the SKILL.md header and import again',
        });
      case 'SKILL_IMPORT_NO_SKILL_FOUND':
        return t('settings.skillsHub.importHistoryRepairNoSkillFound', {
          defaultValue: 'Repair: choose a folder or zip that contains SKILL.md',
        });
      case 'SKILL_IMPORT_INVALID_SOURCE':
        return t('settings.skillsHub.importHistoryRepairInvalidSource', {
          defaultValue: 'Repair: choose a skill folder, parent folder, or zip file',
        });
      case 'SKILL_IMPORT_INVALID_ZIP':
        return t('settings.skillsHub.importHistoryRepairInvalidZip', {
          defaultValue: 'Repair: create the zip again and import it',
        });
      case 'SKILL_IMPORT_SYMLINK_ENTRY':
        return t('settings.skillsHub.importHistoryRepairSymlinkEntry', {
          defaultValue: 'Repair: replace linked files with real files and import again',
        });
      case 'SKILL_IMPORT_INVALID_NAME':
        return t('settings.skillsHub.importHistoryRepairInvalidName', {
          defaultValue: 'Repair: rename the skill using lowercase letters, numbers, and hyphens',
        });
      default:
        return t('settings.skillsHub.importHistoryRepairFailed', {
          defaultValue: 'Repair: check this skill package and import again',
        });
    }
  };

  const getFailedImportDescription = (record: SkillImportRecord) => {
    const actual = formatBytes(record.actual_bytes);
    const limit = formatBytes(record.limit_bytes);
    switch (record.error_code) {
      case 'SKILL_IMPORT_FILE_TOO_LARGE':
        if (record.error_path && actual && limit) {
          return t('settings.skillsHub.importHistoryFileTooLargeDescription', {
            path: record.error_path,
            actual,
            limit,
            defaultValue: `${record.error_path} is ${actual}, over the ${limit} per-file limit. This file will not be copied into the skill directory.`,
          });
        }
        break;
      case 'SKILL_IMPORT_TOTAL_TOO_LARGE':
        if (actual && limit) {
          return t('settings.skillsHub.importHistoryTotalTooLargeDescription', {
            actual,
            limit,
            defaultValue: `This skill is ${actual}, over the ${limit} total size limit.`,
          });
        }
        break;
      case 'SKILL_INVALID_FRONTMATTER':
        return t('settings.skillsHub.importHistoryFrontmatterDescription', {
          defaultValue: 'The SKILL.md header could not be parsed, so the skill description could not be read.',
        });
      case 'SKILL_IMPORT_NO_SKILL_FOUND':
        return t('settings.skillsHub.importHistoryNoSkillFoundDescription', {
          defaultValue: 'The selected location does not contain a valid SKILL.md file.',
        });
      case 'SKILL_IMPORT_INVALID_SOURCE':
        return t('settings.skillsHub.importHistoryInvalidSourceDescription', {
          defaultValue: 'The selected item is not a folder or zip file that can be imported as a skill.',
        });
      case 'SKILL_IMPORT_INVALID_ZIP':
        return t('settings.skillsHub.importHistoryInvalidZipDescription', {
          defaultValue: 'The zip file could not be opened or extracted.',
        });
      case 'SKILL_IMPORT_SYMLINK_ENTRY':
        return t('settings.skillsHub.importHistorySymlinkEntryDescription', {
          defaultValue: 'This package contains linked files, which are not copied during import.',
        });
      case 'SKILL_IMPORT_INVALID_NAME':
        return t('settings.skillsHub.importHistoryInvalidNameDescription', {
          defaultValue: 'The skill name cannot be used as a folder name.',
        });
      default:
        break;
    }
    return t('settings.skillsHub.importHistoryFailedDescription', {
      defaultValue: 'This skill package could not be imported.',
    });
  };

  const renderFailedImportDetails = (record: SkillImportRecord) => {
    const actual = formatBytes(record.actual_bytes);
    const limit = formatBytes(record.limit_bytes);
    const detailLines: string[] = [];
    if (record.error_path) {
      detailLines.push(
        t('settings.skillsHub.importHistoryFileLine', {
          path: record.error_path,
          defaultValue: `File: ${record.error_path}`,
        })
      );
    }
    if (actual && limit) {
      detailLines.push(
        t('settings.skillsHub.importHistorySizeLine', {
          actual,
          limit,
          defaultValue: `Size: ${actual}, limit: ${limit}`,
        })
      );
    }
    if (typeof record.line === 'number' && typeof record.column === 'number') {
      detailLines.push(
        t('settings.skillsHub.importHistoryLocationLine', {
          line: record.line,
          column: record.column,
          defaultValue: `Location: line ${record.line}, column ${record.column}`,
        })
      );
    }
    const source = record.source_path || record.source_name;
    if (source) {
      detailLines.push(
        t('settings.skillsHub.importHistorySourceLine', {
          source,
          defaultValue: `Source: ${source}`,
        })
      );
    }

    return (
      <div className='mt-10px border border-[rgba(var(--warning-6),0.24)] bg-[rgba(var(--warning-6),0.08)] rd-10px px-12px py-10px'>
        <div className='flex items-start gap-8px'>
          <span className='shrink-0 mt-1px text-warning-6 text-13px'>!</span>
          <div className='min-w-0 text-12px leading-relaxed text-warning-6'>
            <div className='font-semibold text-warning-6'>{getFailedImportRepairTitle(record)}</div>
            <div className='mt-2px'>{getFailedImportDescription(record)}</div>
            {detailLines.length > 0 && (
              <ul className='mt-6px m-0 p-0 list-none flex flex-col gap-2px'>
                {detailLines.map((line) => (
                  <li key={line} className='truncate' title={line}>
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  };

  const importHistoryContent = (
    <div data-testid='skill-import-history-page' className='flex flex-col h-full w-full'>
      <div className='space-y-16px pb-24px'>
        <div className='px-[16px] md:px-[32px] py-20px bg-base rd-16px md:rd-24px shadow-sm border border-b-base'>
          <div className='flex flex-col sm:flex-row sm:items-start justify-between gap-12px'>
            <div>
              <div className='flex items-center gap-10px'>
                <span className='text-16px md:text-18px text-t-primary font-bold tracking-tight'>
                  {t('settings.skillsHub.importHistoryTitle', { defaultValue: 'Import history' })}
                </span>
              </div>
              <p className='mt-6px text-12px text-t-tertiary leading-relaxed'>
                {t('settings.skillsHub.importHistoryDescription', {
                  defaultValue: 'If an import fails, follow the note in the record and import again.',
                })}
              </p>
            </div>
            <button
              data-testid='btn-back-to-skills'
              className='flex items-center justify-center px-14px py-7px bg-base border border-border-1 hover:border-border-2 hover:bg-fill-1 text-t-primary rd-8px shadow-sm transition-all focus:outline-none shrink-0 cursor-pointer whitespace-nowrap text-13px font-medium'
              onClick={showSkillList}
            >
              {t('settings.skillsHub.backToSkills', { defaultValue: 'Back to skills' })}
            </button>
          </div>
        </div>

        <div className='px-[16px] md:px-[32px] py-16px bg-base rd-16px md:rd-24px shadow-sm border border-b-base'>
          {importHistoryGroups.length === 0 ? (
            <div className='border border-dashed border-border-1 bg-fill-1 rd-10px px-12px py-14px text-12px text-t-tertiary'>
              {t('settings.skillsHub.importHistoryEmpty', { defaultValue: 'No import records yet.' })}
            </div>
          ) : (
            <div className='flex flex-col gap-8px'>
              {importHistoryGroups.map((group) => {
                const failedRecords = group.records.filter((record) => record.status === 'failed');
                const importedNames = group.records
                  .filter((record) => record.status !== 'failed')
                  .map((record) => record.skill_name || record.source_name)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div
                    key={group.operationId}
                    data-testid={`skill-import-history-record-${normalizeTestId(group.sourceLabel)}`}
                    className={`border rd-12px px-12px py-10px ${
                      failedRecords.length > 0
                        ? 'border-[rgba(var(--warning-6),0.28)] bg-[rgba(var(--warning-6),0.03)]'
                        : 'border-border-1 bg-fill-1'
                    }`}
                  >
                    <div className='flex flex-col sm:flex-row sm:items-start justify-between gap-8px'>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-8px min-w-0'>
                          <span className='text-13px font-semibold text-t-primary truncate' title={group.sourceLabel}>
                            {group.sourceLabel}
                          </span>
                          <span
                            className={`shrink-0 border text-11px px-6px py-1px rd-4px font-medium ${getImportHistoryStatusClass(group)}`}
                          >
                            {getImportHistoryStatusLabel(group)}
                          </span>
                        </div>
                        <div className='mt-5px flex flex-wrap gap-x-8px gap-y-2px text-12px text-t-tertiary'>
                          <span>{new Date(group.createdAt).toLocaleString()}</span>
                          {importedNames && <span>{importedNames}</span>}
                        </div>
                      </div>
                    </div>

                    {failedRecords.map((record) => (
                      <div key={record.id}>{renderFailedImportDetails(record)}</div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const mainContent = isImportHistoryView ? (
    importHistoryContent
  ) : (
    <div className='flex flex-col h-full w-full'>
      <div className='space-y-16px pb-24px'>
        {/* ======== 我的技能 / My Skills ======== */}
        <div
          data-testid='my-skills-section'
          className='px-[16px] md:px-[32px] py-32px bg-base rd-16px md:rd-24px shadow-sm border border-b-base relative overflow-hidden transition-all'
        >
          {/* Toolbar for My Skills */}
          <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-16px mb-24px relative z-10'>
            <div className='flex items-center gap-10px shrink-0'>
              <span className='text-16px md:text-18px text-t-primary font-bold tracking-tight'>
                {t('settings.skillsHub.mySkillsTitle', { defaultValue: 'My Skills' })}
              </span>
              <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 text-12px px-10px py-2px rd-[100px] font-medium ml-4px'>
                {mySkills.length}
              </span>
              <button
                data-testid='btn-refresh-my-skills'
                className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2 ml-4px'
                onClick={async () => {
                  await fetchData();
                  Message.success(t('common.refreshSuccess', { defaultValue: 'Refreshed' }));
                }}
                title={t('common.refresh', { defaultValue: 'Refresh' })}
              >
                <Refresh theme='outline' size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-12px w-full lg:w-auto shrink-0'>
              <button
                data-testid='btn-open-import-history'
                className='flex items-center justify-center gap-6px px-8px py-6px bg-transparent border-none text-t-secondary hover:text-t-primary transition-colors focus:outline-none shrink-0 cursor-pointer whitespace-nowrap'
                onClick={showImportHistory}
              >
                <span className='text-13px font-medium'>
                  {t('settings.skillsHub.importHistoryTitle', { defaultValue: 'Import history' })}
                </span>
              </button>

              <div className='relative group shrink-0 w-full sm:w-[200px] lg:w-[240px]'>
                <div className='absolute left-12px top-0 bottom-0 text-t-tertiary group-focus-within:text-primary-6 flex items-center pointer-events-none transition-colors'>
                  <Search size={15} />
                </div>
                <input
                  data-testid='input-search-my-skills'
                  type='text'
                  className='w-full h-36px bg-fill-1 hover:bg-fill-2 border border-border-1 focus:border-primary-5 focus:bg-base outline-none rd-8px py-0 pl-36px pr-12px text-13px leading-36px text-t-primary placeholder:text-t-tertiary transition-all shadow-sm box-border m-0'
                  placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
                  value={search_query}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <TalkToButlerButton
                label={t('settings.skillsHub.addSkill', { defaultValue: 'Add Skill' })}
                chatLabel={t('settings.talkToButler.addViaChat', { defaultValue: 'Add via chat' })}
                onManual={handleManualImport}
                manualLabel={t('settings.skillsHub.manualImport', { defaultValue: 'Import Skills' })}
                prompt={t('settings.talkToButler.prompt.addSkill', {
                  defaultValue: 'Help me import a skill and attach it to an assistant.',
                })}
                data-testid='btn-add-skill'
              />
            </div>
          </div>

          <div className='flex items-center gap-8px min-h-36px mb-12px px-10px py-8px border border-border-1 bg-fill-1 rd-10px text-12px text-t-tertiary leading-relaxed relative z-10'>
            <span className='font-medium text-t-secondary shrink-0'>
              {t('settings.skillsHub.importHelpCompactLabel', { defaultValue: 'Import rules' })}:
            </span>
            <span>
              {t('settings.skillsHub.importHelpCompactText', {
                maxFileSize:
                  formatBytes(importLimits?.max_file_bytes) ??
                  t('settings.skillsHub.importHelpConfiguredLimit', { defaultValue: 'configured limit' }),
                maxTotalSize:
                  formatBytes(importLimits?.max_total_bytes) ??
                  t('settings.skillsHub.importHelpConfiguredLimit', { defaultValue: 'configured limit' }),
                defaultValue:
                  'Skill folder, parent folder, or zip; {{maxFileSize}} per file, {{maxTotalSize}} per skill; same-name imports replace existing skills.',
              })}
            </span>
          </div>

          {mySkills.length > 0 ? (
            <div className='w-full flex flex-col gap-6px relative z-10'>
              {filteredSkills.map((skill) => (
                <div
                  key={skill.name}
                  data-testid={`my-skill-card-${normalizeTestId(skill.name)}`}
                  ref={(el) => {
                    skillRefs.current[skill.name] = el;
                  }}
                  className={`group flex flex-col sm:flex-row gap-16px p-16px bg-base border hover:border-border-1 hover:bg-fill-1 hover:shadow-sm rd-12px transition-all duration-200 ${highlightedSkill === skill.name ? 'border-primary-5 bg-primary-1' : 'border-transparent'}`}
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
                      {skill.source === 'custom' ? (
                        <span className='bg-[rgba(var(--orange-6),0.08)] text-orange-6 border border-[rgba(var(--orange-6),0.2)] text-11px px-6px py-1px rd-4px font-medium'>
                          {t('settings.skillsHub.custom', { defaultValue: 'Custom' })}
                        </span>
                      ) : (
                        <span className='bg-[rgba(var(--blue-6),0.08)] text-blue-6 border border-[rgba(var(--blue-6),0.2)] text-11px px-6px py-1px rd-4px font-medium'>
                          {t('settings.skillsHub.builtin', { defaultValue: 'Built-in' })}
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
                    {skill.source === 'custom' && (
                      <button
                        data-testid={`btn-delete-${normalizeTestId(skill.name)}`}
                        className='p-8px hover:bg-danger-1 hover:text-danger-6 text-t-tertiary rd-6px outline-none flex items-center justify-center border border-transparent cursor-pointer transition-colors shadow-sm bg-base sm:bg-transparent sm:shadow-none'
                        onClick={() => {
                          Modal.confirm({
                            title: t('settings.skillsHub.deleteConfirmTitle', { defaultValue: 'Delete Skill' }),
                            content: t('settings.skillsHub.deleteConfirmContent', {
                              name: skill.name,
                              defaultValue: `Are you sure you want to delete "${skill.name}"?`,
                            }),
                            okButtonProps: { status: 'danger' },
                            okText: t('common.delete', { defaultValue: 'Delete' }),
                            onOk: () => void handleDelete(skill.name),
                            wrapClassName: 'modal-delete-skill',
                          });
                        }}
                        title={t('common.delete', { defaultValue: 'Delete' })}
                      >
                        <Delete size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className='text-center text-t-secondary text-13px py-40px bg-fill-1 rd-12px border border-b-base border-dashed relative z-10'>
              {loading
                ? t('common.loading', { defaultValue: 'Please wait...' })
                : t('settings.skillsHub.noSkills', {
                    defaultValue: 'No skills found. Import some to get started.',
                  })}
            </div>
          )}
        </div>

        {/* ======== Extension Skills ======== */}
        {extensionSkills.length > 0 && (
          <div
            data-testid='extension-skills-section'
            className='px-[16px] md:px-[32px] py-32px bg-base rd-16px md:rd-24px shadow-sm border border-b-base relative overflow-hidden transition-all'
          >
            <div className='flex items-center gap-10px mb-24px'>
              <Puzzle theme='filled' size={20} fill='var(--color-primary-6)' />
              <span className='text-16px md:text-18px text-t-primary font-bold tracking-tight'>
                {t('settings.extensionSkills', { defaultValue: 'Extension Skills' })}
              </span>
              <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 text-12px px-10px py-2px rd-[100px] font-medium ml-4px'>
                {extensionSkills.length}
              </span>
            </div>
            <div className='w-full flex flex-col gap-6px'>
              {extensionSkills.map((skill) => (
                <div
                  key={skill.name}
                  ref={(el) => {
                    skillRefs.current[skill.name] = el;
                  }}
                  className={`flex flex-col sm:flex-row gap-16px p-16px bg-base border hover:border-border-1 hover:bg-fill-1 rd-12px transition-all duration-200 ${highlightedSkill === skill.name ? 'border-primary-5 bg-primary-1' : 'border-transparent'}`}
                >
                  <div className='shrink-0 flex items-start sm:mt-2px'>
                    <div className='w-40px h-40px rd-10px bg-[rgba(var(--primary-6),0.08)] flex items-center justify-center shadow-sm'>
                      <Puzzle theme='filled' size={20} fill='rgb(var(--primary-6))' />
                    </div>
                  </div>
                  <div className='flex-1 min-w-0 flex flex-col justify-center gap-4px'>
                    <div className='flex items-center gap-10px'>
                      <h3 className='text-14px font-semibold text-t-primary/90 truncate m-0'>{skill.name}</h3>
                      <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 border border-[rgba(var(--primary-6),0.2)] text-10px px-6px py-1px rd-4px font-medium uppercase'>
                        {t('settings.extensionSkillsBadge', { defaultValue: 'Extension' })}
                      </span>
                    </div>
                    {skill.description && (
                      <p className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0'>{skill.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======== Builtin Auto-injected Skills ======== */}
        {builtinAutoSkills.length > 0 && (
          <div
            data-testid='auto-skills-section'
            className='px-[16px] md:px-[32px] py-32px bg-base rd-16px md:rd-24px shadow-sm border border-b-base relative overflow-hidden transition-all'
          >
            <div className='flex items-center gap-10px mb-24px'>
              <Lightning theme='filled' size={20} fill='var(--color-primary-6)' />
              <span className='text-16px md:text-18px text-t-primary font-bold tracking-tight'>
                {t('settings.autoInjectedSkills')}
              </span>
              <span className='bg-[rgba(var(--success-6),0.08)] text-[rgb(var(--success-6))] text-12px px-10px py-2px rd-[100px] font-medium ml-4px'>
                {builtinAutoSkills.length}
              </span>
            </div>
            <div className='w-full flex flex-col gap-6px'>
              {builtinAutoSkills.map((skill) => (
                <div
                  key={skill.name}
                  ref={(el) => {
                    skillRefs.current[skill.name] = el;
                  }}
                  className={`flex flex-col sm:flex-row gap-16px p-16px bg-base border hover:border-border-1 hover:bg-fill-1 rd-12px transition-all duration-200 ${highlightedSkill === skill.name ? 'border-primary-5 bg-primary-1' : 'border-transparent'}`}
                >
                  <div className='shrink-0 flex items-start sm:mt-2px'>
                    <div className='w-40px h-40px rd-10px bg-[rgba(var(--success-6),0.08)] flex items-center justify-center shadow-sm'>
                      <Lightning theme='filled' size={20} fill='rgb(var(--success-6))' />
                    </div>
                  </div>
                  <div className='flex-1 min-w-0 flex flex-col justify-center gap-4px'>
                    <div className='flex items-center gap-10px'>
                      <h3 className='text-14px font-semibold text-t-primary/90 truncate m-0'>{skill.name}</h3>
                      <span className='bg-[rgba(var(--success-6),0.08)] text-[rgb(var(--success-6))] border border-[rgba(var(--success-6),0.2)] text-10px px-6px py-1px rd-4px font-medium uppercase'>
                        {t('settings.autoInjectedSkillsBadge')}
                      </span>
                    </div>
                    {skill.description && (
                      <p className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0'>{skill.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return withWrapper ? <SettingsPageWrapper>{mainContent}</SettingsPageWrapper> : mainContent;
};

export default SkillsHubSettings;
