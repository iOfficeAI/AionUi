import { ipcBridge } from '@/common';
import type { OfficialSkillDetail, OfficialSkillFile } from '@/common/adapter/ipcBridge';
import { Alert, Button, Descriptions, Empty, Message, Modal, Spin, Table, Tag } from '@arco-design/web-react';
import { ArrowLeft, Download } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import { getSkillRegistryConflictName, getSkillRegistryErrorMessage } from './skillRegistryMessages';

const OfficialOnlineSkillDetail: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { namespace = '', slug = '' } = useParams();
  const [skill, setSkill] = useState<OfficialSkillDetail>();
  const [files, setFiles] = useState<OfficialSkillFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setUnavailable(false);
    try {
      const detail = await ipcBridge.fs.getOfficialSkill.invoke({ namespace, slug });
      if (requestId !== requestSequence.current) return;
      setSkill(detail);
      if (detail.install_status === 'unavailable') {
        setFiles([]);
        return;
      }
      const remoteFiles = await ipcBridge.fs.listOfficialSkillFiles.invoke({
        namespace,
        slug,
        version: detail.published_version.version,
      });
      if (requestId !== requestSequence.current) return;
      setFiles(remoteFiles);
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setUnavailable(true);
      console.error('Failed to load official online skill:', error);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [namespace, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const runOperation = async () => {
    if (!skill) return;
    setOperating(true);
    try {
      const request = { namespace, slug, version: skill.published_version.version };
      if (skill.install_status === 'update_available') {
        await ipcBridge.fs.updateOfficialSkill.invoke(request);
        Message.success(t('settings.skillsHub.officialOnline.updateSuccess'));
      } else {
        await ipcBridge.fs.installOfficialSkill.invoke(request);
        Message.success(t('settings.skillsHub.officialOnline.installSuccess'));
      }
      await load();
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
      setOperating(false);
    }
  };

  const operate = () => {
    if (skill?.install_status !== 'update_available') {
      void runOperation();
      return;
    }
    Modal.confirm({
      title: t('settings.skillsHub.officialOnline.confirmUpdateTitle'),
      content: t('settings.skillsHub.officialOnline.confirmUpdateDescription', {
        current: skill.installed_version,
        latest: skill.published_version.version,
      }),
      okText: t('settings.skillsHub.officialOnline.update'),
      onOk: runOperation,
    });
  };

  return (
    <SettingsPageWrapper>
      <div className='flex flex-col gap-18px'>
        <div>
          <Button
            type='text'
            icon={<ArrowLeft />}
            onClick={() => void navigate('/settings/skills', { state: { skillsTab: 'online' } })}
          >
            {t('settings.skillsHub.officialOnline.back')}
          </Button>
        </div>
        {loading ? (
          <div className='flex min-h-320px items-center justify-center'>
            <Spin />
          </div>
        ) : unavailable || !skill ? (
          <Alert
            type='warning'
            title={t('settings.skillsHub.officialOnline.unavailableTitle')}
            content={t('settings.skillsHub.officialOnline.unavailableDescription')}
          />
        ) : (
          <>
            <div className='flex flex-col gap-14px rounded-12px border border-border-2 bg-2 p-18px sm:flex-row sm:items-start sm:justify-between'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-8px'>
                  <h1 className='m-0 text-24px font-700 text-t-primary'>{skill.display_name}</h1>
                  {skill.install_status === 'update_available' ? (
                    <Tag color='orange'>{t('settings.skillsHub.officialOnline.updateAvailable')}</Tag>
                  ) : skill.install_status === 'installed' ? (
                    <Tag color='green'>{t('settings.skillsHub.officialOnline.installed')}</Tag>
                  ) : skill.install_status === 'unavailable' ? (
                    <Tag color='red'>{t('settings.skillsHub.officialOnline.unavailableSkill')}</Tag>
                  ) : null}
                </div>
                <p className='mb-0 mt-10px max-w-760px text-14px leading-relaxed text-t-secondary'>{skill.summary}</p>
                {skill.install_status === 'unavailable' ? (
                  <p className='mb-0 mt-8px text-13px text-danger-6'>
                    {t('settings.skillsHub.officialOnline.remoteUnavailable')}
                  </p>
                ) : null}
              </div>
              {skill.install_status !== 'installed' && skill.install_status !== 'unavailable' ? (
                <Button type='primary' loading={operating} onClick={operate}>
                  {skill.install_status === 'update_available'
                    ? t('settings.skillsHub.officialOnline.update')
                    : t('settings.skillsHub.officialOnline.install')}
                </Button>
              ) : null}
            </div>

            <Descriptions
              column={1}
              data={[
                { label: t('settings.skillsHub.officialOnline.publisher'), value: skill.owner_display_name || '-' },
                { label: t('settings.skillsHub.officialOnline.latestVersion'), value: skill.published_version.version },
                {
                  label: t('settings.skillsHub.officialOnline.localVersion'),
                  value: skill.installed_version || t('settings.skillsHub.officialOnline.notInstalled'),
                },
                {
                  label: t('settings.skillsHub.officialOnline.updatedAt'),
                  value: skill.updated_at ? new Date(skill.updated_at).toLocaleString() : '-',
                },
                {
                  label: t('settings.skillsHub.officialOnline.downloads'),
                  value: (
                    <span className='inline-flex items-center gap-4px'>
                      <Download size={14} /> {skill.download_count}
                    </span>
                  ),
                },
              ]}
            />

            <div>
              <h2 className='mb-10px mt-0 text-16px font-600 text-t-primary'>
                {t('settings.skillsHub.officialOnline.files')}
              </h2>
              {files.length === 0 ? (
                <Empty />
              ) : (
                <Table
                  pagination={false}
                  rowKey='id'
                  data={files}
                  columns={[
                    { title: t('settings.skillsHub.officialOnline.fileName'), dataIndex: 'file_path' },
                    { title: t('settings.skillsHub.officialOnline.fileSize'), dataIndex: 'file_size' },
                    { title: 'SHA-256', dataIndex: 'sha256', ellipsis: true },
                  ]}
                />
              )}
            </div>
          </>
        )}
      </div>
    </SettingsPageWrapper>
  );
};

export default OfficialOnlineSkillDetail;
