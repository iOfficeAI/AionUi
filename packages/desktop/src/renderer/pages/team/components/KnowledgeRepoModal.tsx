/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Button,
  Table,
  Tag,
  Switch,
  Input,
  Form,
  Message,
  Space,
  Typography,
  Tooltip,
  Alert,
} from '@arco-design/web-react';
import { Github, Refresh, Delete, CheckOne, Attention, Close, Play, SettingConfig } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { knowledgeRepo } from '@/common/adapter/ipcBridge';
import type { KnowledgeRepo } from '@/common/types/knowledgeRepo';

type KnowledgeRepoModalProps = {
  visible: boolean;
  onClose: () => void;
};

export const KnowledgeRepoModal: React.FC<KnowledgeRepoModalProps> = ({ visible, onClose }) => {
  const { t } = useTranslation();
  const [repos, setRepos] = useState<KnowledgeRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedChangesRepo, setSelectedChangesRepo] = useState<KnowledgeRepo | null>(null);
  const [selectedSetupRepo, setSelectedSetupRepo] = useState<KnowledgeRepo | null>(null);
  const [setupCommand, setSetupCommand] = useState<string>('');
  const [setupOutput, setSetupOutput] = useState<string>('');
  const [runningSetup, setRunningSetup] = useState(false);
  const [envCheckResults, setEnvCheckResults] = useState<Array<{ binary: string; present: boolean }>>([]);
  const [selectedEnvRepo, setSelectedEnvRepo] = useState<KnowledgeRepo | null>(null);
  const [envKeyValues, setEnvKeyValues] = useState<Record<string, string>>({});
  const [form] = Form.useForm();

  const loadRepos = useCallback(async () => {
    setLoading(true);
    try {
      const list = await knowledgeRepo.list();
      setRepos(list);
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Failed to load repos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadRepos();
    }
  }, [visible, loadRepos]);

  const handleAddRepo = async (values: {
    name: string;
    gitUrl: string;
    ref?: string;
    subpath?: string;
    authToken?: string;
  }) => {
    try {
      setLoading(true);
      await knowledgeRepo.add(values);
      Message.success('Repository added and synced successfully');
      setIsAdding(false);
      form.resetFields();
      await loadRepos();
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Failed to add repository');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      setLoading(true);
      const updated = await knowledgeRepo.update(id);
      Message.success(`Updated ${updated.name}`);
      await loadRepos();
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Update failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (id: string) => {
    try {
      setLoading(true);
      const res = await knowledgeRepo.rollback(id);
      Message.success(`Rolled back ${res.name} to ${res.currentCommitSha?.slice(0, 7)}`);
      await loadRepos();
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Rollback failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePin = async (id: string, pin: boolean) => {
    try {
      await knowledgeRepo.pin({ id, pin });
      await loadRepos();
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Failed to update pin policy');
    }
  };

  const handleRemove = async (id: string) => {
    try {
      setLoading(true);
      await knowledgeRepo.remove(id);
      Message.success('Repository removed');
      await loadRepos();
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Remove failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveSetup = async (id: string) => {
    try {
      await knowledgeRepo.setTrust({ id, trustStatus: 'trusted' });
      Message.success('Setup changes approved');
      await loadRepos();
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Approval failed');
    }
  };

  const openSetupModal = async (repo: KnowledgeRepo) => {
    setSelectedSetupRepo(repo);
    setSetupOutput('');
    const defaultCmd = repo.manifest.setupFiles.find((f) => f.type === 'makefile')
      ? 'make setup'
      : repo.manifest.setupFiles.find((f) => f.type === 'script')
        ? 'bash setup.sh'
        : 'pip install -r requirements.txt';
    setSetupCommand(defaultCmd);

    try {
      const checks = await knowledgeRepo.checkEnvironment(repo.id);
      setEnvCheckResults(checks);
    } catch {
      setEnvCheckResults([]);
    }
  };

  const executeSetupCommand = async () => {
    if (!selectedSetupRepo) return;
    setRunningSetup(true);
    setSetupOutput('Starting setup execution...\n');
    try {
      const res = await knowledgeRepo.runSetup({
        repoId: selectedSetupRepo.id,
        command: setupCommand,
      });
      setSetupOutput(res.output || (res.success ? 'Setup completed successfully.' : 'Setup failed.'));
      if (res.success) {
        Message.success('Setup executed successfully');
      } else {
        Message.error('Setup failed');
      }
    } catch (err: unknown) {
      setSetupOutput(`Error: ${(err as Error).message}`);
      Message.error((err as Error).message);
    } finally {
      setRunningSetup(false);
    }
  };

  const openEnvModal = (repo: KnowledgeRepo) => {
    setSelectedEnvRepo(repo);
    const initial: Record<string, string> = {};
    for (const v of repo.manifest.envExampleVars || []) {
      initial[v] = '';
    }
    setEnvKeyValues(initial);
  };

  const saveEnvVars = async () => {
    if (!selectedEnvRepo) return;
    try {
      await knowledgeRepo.setEnvVars({ id: selectedEnvRepo.id, envVars: envKeyValues });
      Message.success('Environment variables saved securely');
      setSelectedEnvRepo(null);
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Failed saving env vars');
    }
  };

  const columns = [
    {
      title: t('team.knowledgeRepos.repoName'),
      dataIndex: 'name',
      render: (name: string, record: KnowledgeRepo) => (
        <div>
          <div className='flex items-center gap-6px font-medium'>
            <Github theme='outline' size='14' />
            <span>{name}</span>
            {record.whatChangedSummary && (
              <Tag color='blue' size='small' className='cursor-pointer' onClick={() => setSelectedChangesRepo(record)}>
                {t('team.knowledgeRepos.updatedRecently')}
              </Tag>
            )}
          </div>
          <Typography.Text type='secondary' className='text-12px'>
            {record.gitUrl} ({record.ref})
          </Typography.Text>
        </div>
      ),
    },
    {
      title: t('team.knowledgeRepos.commit'),
      dataIndex: 'currentCommitSha',
      render: (sha?: string) => (sha ? <code>{sha.slice(0, 7)}</code> : '-'),
    },
    {
      title: t('team.knowledgeRepos.autoUpdate'),
      render: (_: unknown, record: KnowledgeRepo) => (
        <Space>
          <Switch
            checked={record.updatePolicy === 'auto'}
            onChange={(checked) => handleTogglePin(record.id, !checked)}
            size='small'
          />
          {record.updatePolicy === 'pinned' && (
            <Tag color='orange' size='small'>
              {t('team.knowledgeRepos.pinned')}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: 'Status',
      render: (_: unknown, record: KnowledgeRepo) => {
        if (record.trustStatus === 'reapproval_required') {
          return (
            <Tooltip content='Executable scripts or setup files were altered in the latest update.'>
              <Tag color='red' icon={<Attention />}>
                {t('team.knowledgeRepos.trust.reapprovalRequired')}
              </Tag>
            </Tooltip>
          );
        }
        if (record.syncStatus === 'needs_attention') {
          return (
            <Tag color='gold' icon={<Attention />}>
              {record.syncError || t('team.knowledgeRepos.status.needsAttention')}
            </Tag>
          );
        }
        if (record.syncStatus === 'error') {
          return (
            <Tag color='red' icon={<Close />}>
              {record.syncError || t('team.knowledgeRepos.status.error')}
            </Tag>
          );
        }
        return (
          <Tag color='green' icon={<CheckOne />}>
            {t('team.knowledgeRepos.status.idle')}
          </Tag>
        );
      },
    },
    {
      title: 'Actions',
      render: (_: unknown, record: KnowledgeRepo) => (
        <Space>
          {record.trustStatus === 'reapproval_required' && (
            <Button type='primary' status='warning' size='mini' onClick={() => handleApproveSetup(record.id)}>
              {t('team.knowledgeRepos.reapproveSetup')}
            </Button>
          )}
          <Button size='mini' icon={<Play />} onClick={() => openSetupModal(record)}>
            {t('team.knowledgeRepos.runSetup')}
          </Button>
          <Button size='mini' icon={<SettingConfig />} onClick={() => openEnvModal(record)}>
            {t('team.knowledgeRepos.envVars')}
          </Button>
          <Button size='mini' icon={<Refresh />} onClick={() => handleUpdate(record.id)}>
            {t('team.knowledgeRepos.updateNow')}
          </Button>
          {record.previousCommitSha && (
            <Button size='mini' onClick={() => handleRollback(record.id)}>
              {t('team.knowledgeRepos.rollback')}
            </Button>
          )}
          <Button size='mini' status='danger' icon={<Delete />} onClick={() => handleRemove(record.id)} />
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={t('team.knowledgeRepos.title')}
        visible={visible}
        onOk={onClose}
        onCancel={onClose}
        footer={
          <div className='flex justify-between w-full'>
            <Button type='primary' onClick={() => setIsAdding(true)}>
              {t('team.knowledgeRepos.addRepo')}
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        }
        style={{ width: 920 }}
      >
        <Table
          rowKey='id'
          loading={loading}
          columns={columns}
          data={repos}
          pagination={false}
          noDataElement={<div>{t('team.knowledgeRepos.noRepos')}</div>}
        />
      </Modal>

      {/* Add Repository Modal */}
      <Modal
        title={t('team.knowledgeRepos.addRepo')}
        visible={isAdding}
        onCancel={() => setIsAdding(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout='vertical' onSubmit={handleAddRepo}>
          <Form.Item label={t('team.knowledgeRepos.repoName')} field='name' rules={[{ required: true }]}>
            <Input placeholder='e.g. My Knowledge Repo' />
          </Form.Item>
          <Form.Item label={t('team.knowledgeRepos.gitUrl')} field='gitUrl' rules={[{ required: true }]}>
            <Input placeholder='https://github.com/owner/repository' />
          </Form.Item>
          <Form.Item label={t('team.knowledgeRepos.ref')} field='ref' initialValue='main'>
            <Input placeholder='main' />
          </Form.Item>
          <Form.Item label={t('team.knowledgeRepos.subpath')} field='subpath'>
            <Input placeholder='Optional relative subpath' />
          </Form.Item>
          <Form.Item label={t('team.knowledgeRepos.token')} field='authToken'>
            <Input.Password placeholder={t('team.knowledgeRepos.tokenPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Run Setup & Environment Check Modal */}
      <Modal
        title={`Setup & Environment: ${selectedSetupRepo?.name}`}
        visible={Boolean(selectedSetupRepo)}
        onCancel={() => setSelectedSetupRepo(null)}
        footer={
          <Space>
            <Button onClick={() => setSelectedSetupRepo(null)}>Close</Button>
            <Button
              type='primary'
              loading={runningSetup}
              disabled={selectedSetupRepo?.trustStatus === 'reapproval_required'}
              onClick={executeSetupCommand}
            >
              Run Confirmed Command
            </Button>
          </Space>
        }
        style={{ width: 680 }}
      >
        {selectedSetupRepo && (
          <div className='flex flex-col gap-12px'>
            {selectedSetupRepo.trustStatus === 'reapproval_required' && (
              <Alert
                type='error'
                content='Setup execution is BLOCKED: Latest update modified setup scripts or dependency manifests. Approve changes first.'
              />
            )}

            <div>
              <Typography.Text bold>Environment Binaries Check:</Typography.Text>
              <div className='flex gap-8px mt-4px'>
                {envCheckResults.length === 0 ? (
                  <span className='text-12px text-secondary'>No required binaries specified</span>
                ) : (
                  envCheckResults.map((c, i) => (
                    <Tag key={i} color={c.present ? 'green' : 'red'}>
                      {c.binary}: {c.present ? 'Present' : 'Missing'}
                    </Tag>
                  ))
                )}
              </div>
            </div>

            <div>
              <Typography.Text bold>Setup Command to Execute:</Typography.Text>
              <Input
                value={setupCommand}
                onChange={setSetupCommand}
                className='mt-4px font-mono'
                placeholder='e.g. pip install -r requirements.txt'
              />
            </div>

            {setupOutput && (
              <div>
                <Typography.Text bold>Output:</Typography.Text>
                <pre className='p-8px bg-[var(--color-bg-2)] rounded font-mono text-12px max-h-200px overflow-y-auto whitespace-pre-wrap mt-4px'>
                  {setupOutput}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Per-Repo Environment Variable Editor Modal */}
      <Modal
        title={`Environment Variables: ${selectedEnvRepo?.name}`}
        visible={Boolean(selectedEnvRepo)}
        onOk={saveEnvVars}
        onCancel={() => setSelectedEnvRepo(null)}
      >
        {selectedEnvRepo && (
          <div className='flex flex-col gap-12px'>
            <Alert
              type='info'
              content='Values are encrypted via safeStorage and passed only to this repo agent process. Never logged or exposed in prompts.'
            />
            {Object.keys(envKeyValues).length === 0 ? (
              <Typography.Text type='secondary'>No variables detected in .env.example</Typography.Text>
            ) : (
              Object.keys(envKeyValues).map((k) => (
                <div key={k} className='flex items-center gap-8px'>
                  <span className='w-140px font-mono text-12px font-medium'>{k}:</span>
                  <Input.Password
                    value={envKeyValues[k]}
                    onChange={(val) => setEnvKeyValues((prev) => ({ ...prev, [k]: val }))}
                    placeholder={`Enter value for ${k}`}
                  />
                </div>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* What Changed Summary Modal */}
      <Modal
        title={`What Changed: ${selectedChangesRepo?.name}`}
        visible={Boolean(selectedChangesRepo)}
        onOk={() => setSelectedChangesRepo(null)}
        onCancel={() => setSelectedChangesRepo(null)}
      >
        {selectedChangesRepo?.whatChangedSummary && (
          <div className='flex flex-col gap-12px'>
            <div>
              <Typography.Text bold>Commits:</Typography.Text>
              <ul className='list-disc ps-20px m-0'>
                {selectedChangesRepo.whatChangedSummary.commitMessages.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
            {selectedChangesRepo.whatChangedSummary.modifiedRules.length > 0 && (
              <div>
                <Typography.Text bold>Modified Rules:</Typography.Text>
                <div>{selectedChangesRepo.whatChangedSummary.modifiedRules.join(', ')}</div>
              </div>
            )}
            {selectedChangesRepo.whatChangedSummary.setupFilesChanged.length > 0 && (
              <div>
                <Typography.Text bold type='error'>
                  Setup & Executable Diffs:
                </Typography.Text>
                <div>{selectedChangesRepo.whatChangedSummary.setupFilesChanged.join(', ')}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};
