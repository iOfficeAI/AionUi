/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Form, Input, Modal, Select } from '@arco-design/web-react';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitHubRepoInfo } from './types';

export type GitHubRepoConfigModalProps = {
  visible: boolean;
  repoInfo: GitHubRepoInfo | null;
  onCancel: () => void;
  onSave: (owner: string, repo: string, token?: string) => Promise<void>;
};

export const GitHubRepoConfigModal: React.FC<GitHubRepoConfigModalProps> = ({
  visible,
  repoInfo,
  onCancel,
  onSave,
}) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [saving, setSaving] = React.useState(false);

  useEffect(() => {
    if (visible && repoInfo) {
      form.setFieldsValue({
        repository: repoInfo.owner && repoInfo.repo ? `${repoInfo.owner}/${repoInfo.repo}` : '',
        token: '',
      });
    }
  }, [visible, repoInfo, form]);

  const handleOk = async () => {
    try {
      const values = await form.validate();
      const rawRepo = (values.repository as string).trim();
      const [owner, repo] = rawRepo.split('/').map((s) => s.trim());

      if (!owner || !repo) {
        form.setFields({
          repository: {
            error: {
              message: t('conversation.github.invalidRepoFormat', {
                defaultValue: 'Must be in owner/repo format',
              }),
            },
          },
        });
        return;
      }

      setSaving(true);
      await onSave(owner, repo, values.token ? (values.token as string).trim() : undefined);
      onCancel();
    } catch {
      // validation or save error
    } finally {
      setSaving(false);
    }
  };

  const detectedOptions =
    repoInfo?.detectedRemotes?.map((r) => ({
      label: `${r.owner}/${r.repo} (${r.remoteName || 'git'})`,
      value: `${r.owner}/${r.repo}`,
    })) || [];

  return (
    <Modal
      title={t('conversation.github.configureRepo', { defaultValue: 'Configure GitHub Repository' })}
      visible={visible}
      onCancel={onCancel}
      onOk={handleOk}
      confirmLoading={saving}
      okText={t('common.save', { defaultValue: 'Save' })}
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      data-testid='github-repo-config-modal'
    >
      <div className='flex flex-col gap-12px mb-16px'>
        {repoInfo?.hasGhCli ? (
          <Alert
            type='success'
            content={t('conversation.github.ghCliDetected', {
              defaultValue: 'GitHub CLI (gh) detected. Authentication and operations will use your local gh login.',
            })}
          />
        ) : (
          <Alert
            type='info'
            content={t('conversation.github.ghCliMissing', {
              defaultValue:
                'GitHub CLI not found. You can browse public repositories or provide a Personal Access Token below.',
            })}
          />
        )}
      </div>

      <Form form={form} layout='vertical'>
        <Form.Item
          label={t('conversation.github.targetRepo', { defaultValue: 'Target Repository (owner/repo)' })}
          field='repository'
          rules={[
            {
              required: true,
              message: t('conversation.github.repoRequired', { defaultValue: 'Repository is required' }),
            },
          ]}
        >
          {detectedOptions.length > 0 ? (
            <Select allowCreate placeholder='owner/repo' options={detectedOptions} />
          ) : (
            <Input placeholder='owner/repo (e.g. iOfficeAI/AionUi)' />
          )}
        </Form.Item>

        <Form.Item
          label={t('conversation.github.personalAccessToken', {
            defaultValue: 'Personal Access Token (optional for public repos)',
          })}
          field='token'
          extra={t('conversation.github.patHelp', {
            defaultValue: 'Leave blank to use existing environment GITHUB_TOKEN or gh CLI credentials.',
          })}
        >
          <Input.Password placeholder='ghp_...' />
        </Form.Item>
      </Form>
    </Modal>
  );
};
