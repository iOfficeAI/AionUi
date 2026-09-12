/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Form, Input, Modal } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitHubCreateIssueInput } from './types';

export type NewIssueModalProps = {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (input: GitHubCreateIssueInput) => Promise<void>;
  repoLabel?: string;
};

export const NewIssueModal: React.FC<NewIssueModalProps> = ({ visible, onCancel, onSubmit, repoLabel }) => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validate();
      setSubmitting(true);
      const labels = values.labels
        ? (values.labels as string)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      await onSubmit({
        title: values.title.trim(),
        body: values.body ? values.body.trim() : '',
        labels: labels.length > 0 ? labels : undefined,
      });

      form.resetFields();
      onCancel();
    } catch {
      // Form validation error or submission failure
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        repoLabel
          ? t('conversation.github.newIssueInRepo', {
              repo: repoLabel,
              defaultValue: `New Issue in ${repoLabel}`,
            })
          : t('conversation.github.newIssue', { defaultValue: 'New Issue' })
      }
      visible={visible}
      onCancel={() => {
        form.resetFields();
        onCancel();
      }}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={t('conversation.github.submitIssue', { defaultValue: 'Create Issue' })}
      cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
      autoFocus
      focusLock
      data-testid='new-github-issue-modal'
    >
      <Form form={form} layout='vertical'>
        <Form.Item
          label={t('conversation.github.issueTitle', { defaultValue: 'Title' })}
          field='title'
          rules={[
            {
              required: true,
              message: t('conversation.github.titleRequired', { defaultValue: 'Title is required' }),
            },
          ]}
        >
          <Input
            placeholder={t('conversation.github.titlePlaceholder', {
              defaultValue: 'Brief summary of the issue or bug',
            })}
            autoFocus
          />
        </Form.Item>

        <Form.Item label={t('conversation.github.issueBody', { defaultValue: 'Description' })} field='body'>
          <Input.TextArea
            rows={5}
            placeholder={t('conversation.github.bodyPlaceholder', {
              defaultValue: 'Describe the issue, steps to reproduce, or expected behavior...',
            })}
          />
        </Form.Item>

        <Form.Item
          label={t('conversation.github.issueLabels', { defaultValue: 'Labels (comma-separated)' })}
          field='labels'
        >
          <Input placeholder='bug, documentation, enhancement' />
        </Form.Item>
      </Form>
    </Modal>
  );
};
