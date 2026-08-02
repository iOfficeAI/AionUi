import { ipcBridge } from '@/common';
import type { OfficialSkillSummary } from '@/common/adapter/ipcBridge';
import { WorkMateSearchInput } from '@/renderer/components/base';
import { Alert, Button, Empty, Message, Modal, Pagination, Select, Spin, Tag } from '@arco-design/web-react';
import { Download, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getSkillRegistryConflictName, getSkillRegistryErrorMessage } from './skillRegistryMessages';

type SortMode = 'newest' | 'downloads' | 'stars' | 'relevance';

type OfficialOnlineSkillsProps = {
  onInstalled: () => Promise<void>;
};

const PAGE_SIZE = 12;

const OfficialOnlineSkills: React.FC<OfficialOnlineSkillsProps> = ({ onInstalled }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<OfficialSkillSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [operatingSlug, setOperatingSlug] = useState<string>();
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setUnavailable(false);
    try {
      const [result, attentionItems] = await Promise.all([
        ipcBridge.fs.searchOfficialSkills.invoke({
          q: submittedQuery,
          sort,
          page,
          size: PAGE_SIZE,
        }),
        ipcBridge.fs.listOfficialSkillUpdates.invoke(),
      ]);
      if (requestId !== requestSequence.current) return;
      const attentionBySlug = new Map(attentionItems.map((item) => [`${item.namespace}/${item.slug}`, item]));
      const merged = result.items.map((item) => attentionBySlug.get(`${item.namespace}/${item.slug}`) ?? item);
      const unavailableItems = attentionItems.filter(
        (item) =>
          item.install_status === 'unavailable' &&
          page === 0 &&
          (!submittedQuery ||
            `${item.display_name} ${item.slug}`.toLowerCase().includes(submittedQuery.toLowerCase())) &&
          !merged.some((remote) => remote.namespace === item.namespace && remote.slug === item.slug)
      );
      setItems([...unavailableItems, ...merged]);
      setTotal(result.total + unavailableItems.length);
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setUnavailable(true);
      setItems([]);
      console.error('Failed to load official online skills:', error);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [page, sort, submittedQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0);
      setSubmittedQuery(query.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  const operate = async (skill: OfficialSkillSummary) => {
    setOperatingSlug(skill.slug);
    try {
      const request = {
        namespace: skill.namespace,
        slug: skill.slug,
        version: skill.published_version.version,
      };
      if (skill.install_status === 'update_available') {
        await ipcBridge.fs.updateOfficialSkill.invoke(request);
        Message.success(t('settings.skillsHub.officialOnline.updateSuccess'));
      } else {
        await ipcBridge.fs.installOfficialSkill.invoke(request);
        Message.success(t('settings.skillsHub.officialOnline.installSuccess'));
      }
      await Promise.all([load(), onInstalled()]);
    } catch (error) {
      const skillName = getSkillRegistryConflictName(error);
      if (skillName) {
        Modal.confirm({
          title: t('settings.skillsHub.officialOnline.nameConflictTitle'),
          content: t('settings.skillsHub.officialOnline.nameConflict'),
          okText: t('settings.skillsHub.officialOnline.viewLocal'),
          onOk: () => {
            if (skillName) void navigate(`/settings/skills/detail/${encodeURIComponent(skillName)}`);
          },
        });
      } else {
        Message.error(getSkillRegistryErrorMessage(error, t));
      }
    } finally {
      setOperatingSlug(undefined);
    }
  };

  const confirmOperation = (skill: OfficialSkillSummary) => {
    if (skill.install_status !== 'update_available') {
      void operate(skill);
      return;
    }
    Modal.confirm({
      title: t('settings.skillsHub.officialOnline.confirmUpdateTitle'),
      content: t('settings.skillsHub.officialOnline.confirmUpdateDescription', {
        current: skill.installed_version,
        latest: skill.published_version.version,
      }),
      okText: t('settings.skillsHub.officialOnline.update'),
      onOk: () => operate(skill),
    });
  };

  return (
    <div className='flex flex-col gap-16px' data-testid='official-online-skills'>
      <div className='flex flex-col gap-10px sm:flex-row sm:items-center sm:justify-between'>
        <WorkMateSearchInput
          className='w-full sm:w-[320px]'
          data-testid='official-online-search'
          placeholder={t('settings.skillsHub.officialOnline.searchPlaceholder')}
          value={query}
          onChange={setQuery}
        />
        <Select
          className='w-full sm:w-[180px]'
          value={sort}
          onChange={(value) => {
            setPage(0);
            setSort(value as SortMode);
          }}
        >
          <Select.Option value='newest'>{t('settings.skillsHub.officialOnline.sortNewest')}</Select.Option>
          <Select.Option value='downloads'>{t('settings.skillsHub.officialOnline.sortDownloads')}</Select.Option>
          <Select.Option value='stars'>{t('settings.skillsHub.officialOnline.sortStars')}</Select.Option>
          <Select.Option value='relevance'>{t('settings.skillsHub.officialOnline.sortRelevance')}</Select.Option>
        </Select>
      </div>

      {unavailable ? (
        <Alert
          type='warning'
          title={t('settings.skillsHub.officialOnline.unavailableTitle')}
          content={t('settings.skillsHub.officialOnline.unavailableDescription')}
          action={
            <Button type='text' icon={<Refresh />} onClick={() => void load()}>
              {t('settings.skillsHub.officialOnline.retry')}
            </Button>
          }
        />
      ) : loading ? (
        <div className='flex min-h-240px items-center justify-center'>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description={t('settings.skillsHub.officialOnline.empty')} />
      ) : (
        <>
          <div className='grid grid-cols-1 gap-12px lg:grid-cols-2'>
            {items.map((skill) => (
              <div
                key={`${skill.namespace}/${skill.slug}`}
                className='flex min-w-0 flex-col gap-12px rounded-12px border border-border-2 bg-2 p-16px'
                data-testid={`official-online-skill-${skill.slug}`}
              >
                <div className='flex min-w-0 items-start justify-between gap-12px'>
                  <div className='min-w-0'>
                    <h3 className='m-0 truncate text-15px font-600 text-t-primary'>{skill.display_name}</h3>
                    <p className='m-0 mt-6px line-clamp-2 text-13px leading-relaxed text-t-secondary'>
                      {skill.summary}
                    </p>
                  </div>
                  {skill.install_status === 'update_available' ? (
                    <Tag color='orange'>{t('settings.skillsHub.officialOnline.updateAvailable')}</Tag>
                  ) : skill.install_status === 'installed' ? (
                    <Tag color='green'>{t('settings.skillsHub.officialOnline.installed')}</Tag>
                  ) : skill.install_status === 'unavailable' ? (
                    <Tag color='red'>{t('settings.skillsHub.officialOnline.unavailableSkill')}</Tag>
                  ) : null}
                </div>
                <div className='flex flex-wrap items-center gap-8px text-12px text-t-tertiary'>
                  <span>{skill.owner_display_name}</span>
                  <span>v{skill.published_version.version}</span>
                  <span className='inline-flex items-center gap-4px'>
                    <Download size={13} /> {skill.download_count}
                  </span>
                </div>
                <div className='mt-auto flex items-center justify-end gap-8px'>
                  <Button
                    type='text'
                    onClick={() =>
                      void navigate(
                        `/settings/skills/online/${encodeURIComponent(skill.namespace)}/${encodeURIComponent(skill.slug)}`
                      )
                    }
                  >
                    {t('settings.skillsHub.officialOnline.details')}
                  </Button>
                  {skill.install_status !== 'installed' && skill.install_status !== 'unavailable' ? (
                    <Button
                      type='primary'
                      loading={operatingSlug === skill.slug}
                      onClick={() => confirmOperation(skill)}
                    >
                      {skill.install_status === 'update_available'
                        ? t('settings.skillsHub.officialOnline.update')
                        : t('settings.skillsHub.officialOnline.install')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {total > PAGE_SIZE ? (
            <div className='flex justify-center pt-4px'>
              <Pagination
                current={page + 1}
                total={total}
                pageSize={PAGE_SIZE}
                onChange={(nextPage) => setPage(nextPage - 1)}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default OfficialOnlineSkills;
