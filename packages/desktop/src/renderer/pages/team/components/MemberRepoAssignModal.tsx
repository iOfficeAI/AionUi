/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Checkbox, Input, Form, Message, Typography, Space, Alert, Button } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { knowledgeRepo } from '@/common/adapter/ipcBridge';
import type { KnowledgeRepo } from '@/common/types/knowledgeRepo';
import type { TeamAssistant } from '@/common/types/team/teamTypes';

type MemberRepoAssignModalProps = {
  visible: boolean;
  assistant: TeamAssistant;
  onClose: () => void;
  onSave: (assignedRepoIds: string[], whenToUseHint?: string) => void;
};

export const MemberRepoAssignModal: React.FC<MemberRepoAssignModalProps> = ({
  visible,
  assistant,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [allRepos, setAllRepos] = useState<KnowledgeRepo[]>([]);
  const [selectedRepoIds, setSelectedRepoIds] = useState<string[]>(assistant.knowledgeRepoIds || []);
  const [hint, setHint] = useState<string>(assistant.whenToUseHint || '');
  const [trustApprovalRepo, setTrustApprovalRepo] = useState<KnowledgeRepo | null>(null);
  const [previewInstructions, setPreviewInstructions] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<Array<{ ruleA: string; ruleB: string; resolvedInFavorOf: string }>>([]);

  useEffect(() => {
    if (visible) {
      void knowledgeRepo.list().then(setAllRepos);
      setSelectedRepoIds(assistant.knowledgeRepoIds || []);
      setHint(assistant.whenToUseHint || '');
    }
  }, [visible, assistant]);

  // Check for rule conflicts whenever selected repos change
  useEffect(() => {
    if (selectedRepoIds.length > 0) {
      void knowledgeRepo
        .buildInstructions({
          memberName: assistant.assistant_name,
          rolePrompt: '',
          repoIds: selectedRepoIds,
          whenToUseHint: hint,
        })
        .then((res) => {
          setConflicts(res.conflicts || []);
        });
    } else {
      setConflicts([]);
    }
  }, [selectedRepoIds, hint, assistant.assistant_name]);

  const handlePreview = async () => {
    const res = await knowledgeRepo.buildInstructions({
      memberName: assistant.assistant_name,
      rolePrompt: '',
      repoIds: selectedRepoIds,
      whenToUseHint: hint,
    });
    setPreviewInstructions(res.instructions);
  };

  const handleSelectRepos = (vals: string[]) => {
    // Check if any newly selected repo is untrusted (needs first-assignment approval)
    for (const id of vals) {
      if (!selectedRepoIds.includes(id)) {
        const repo = allRepos.find((r) => r.id === id);
        if (repo && repo.trustStatus === 'untrusted') {
          setTrustApprovalRepo(repo);
          return;
        }
      }
    }
    setSelectedRepoIds(vals);
  };

  const handleApproveTrust = async () => {
    if (!trustApprovalRepo) return;
    try {
      await knowledgeRepo.setTrust({ id: trustApprovalRepo.id, trustStatus: 'trusted' });
      trustApprovalRepo.trustStatus = 'trusted';
      setSelectedRepoIds((prev) => [...prev, trustApprovalRepo.id]);
      setTrustApprovalRepo(null);
      Message.success('Repository trusted and attached');
    } catch (err: unknown) {
      Message.error((err as Error).message || 'Failed to trust repository');
    }
  };

  const handleOk = () => {
    onSave(selectedRepoIds, hint);
    Message.success('Knowledge repositories assigned');
    onClose();
  };

  return (
    <>
      <Modal
        title={`${t('team.knowledgeRepos.attachRepos')}: ${assistant.assistant_name}`}
        visible={visible}
        onOk={handleOk}
        onCancel={onClose}
        style={{ width: 620 }}
      >
        <Form layout='vertical'>
          {conflicts.length > 0 && (
            <Alert
              type='warning'
              title={t('team.knowledgeRepos.conflictsWarning')}
              content={
                <ul className='m-0 ps-16px text-12px'>
                  {conflicts.map((c, i) => (
                    <li key={i}>
                      Conflict between <code>{c.ruleA}</code> and <code>{c.ruleB}</code>. Higher-priority repo took
                      precedence ({c.resolvedInFavorOf}).
                    </li>
                  ))}
                </ul>
              }
              className='mb-12px'
            />
          )}

          <Form.Item label={t('team.knowledgeRepos.whenToUseHint')}>
            <Input value={hint} onChange={setHint} placeholder='e.g. video production pipeline or backend coding' />
          </Form.Item>

          <Form.Item label={t('team.knowledgeRepos.title')}>
            {allRepos.length === 0 ? (
              <Typography.Text type='secondary'>{t('team.knowledgeRepos.noRepos')}</Typography.Text>
            ) : (
              <Checkbox.Group
                value={selectedRepoIds}
                onChange={(vals) => handleSelectRepos(vals as string[])}
                direction='vertical'
              >
                <Space direction='vertical'>
                  {allRepos.map((repo) => (
                    <Checkbox key={repo.id} value={repo.id}>
                      <div className='flex flex-col'>
                        <span className='font-medium'>{repo.name}</span>
                        <span className='text-12px text-[color:var(--text-secondary)]'>
                          {repo.manifest.alwaysOnRules.length} rules, {repo.manifest.onDemandSkills.length} skills (
                          {repo.ref})
                        </span>
                      </div>
                    </Checkbox>
                  ))}
                </Space>
              </Checkbox.Group>
            )}
          </Form.Item>

          <div className='flex justify-end pt-8px'>
            <Button size='small' onClick={handlePreview}>
              {t('team.knowledgeRepos.effectiveInstructions')}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Trust Approval Dialog on First Assignment */}
      <Modal
        title='Approve Knowledge Repository'
        visible={Boolean(trustApprovalRepo)}
        onOk={handleApproveTrust}
        onCancel={() => setTrustApprovalRepo(null)}
      >
        {trustApprovalRepo && (
          <div className='flex flex-col gap-10px'>
            <Alert
              type='info'
              content='This repository contains agent instructions, skills, or scripts. Explicit approval is required before attaching it to a teammate.'
            />
            <div>
              <Typography.Text bold>URL:</Typography.Text> <code>{trustApprovalRepo.gitUrl}</code>
            </div>
            <div>
              <Typography.Text bold>Ref:</Typography.Text> <code>{trustApprovalRepo.ref}</code>
            </div>
            <div>
              <Typography.Text bold>Detected Rules:</Typography.Text> {trustApprovalRepo.manifest.alwaysOnRules.length}
            </div>
            <div>
              <Typography.Text bold>Detected Skills/Workflows:</Typography.Text>{' '}
              {trustApprovalRepo.manifest.onDemandSkills.length}
            </div>
            {trustApprovalRepo.manifest.setupFiles.length > 0 && (
              <div>
                <Typography.Text bold type='error'>
                  Detected Setup / Tool Files:
                </Typography.Text>{' '}
                {trustApprovalRepo.manifest.setupFiles.map((f) => f.relativePath).join(', ')}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Effective Instructions Preview Modal */}
      <Modal
        title={t('team.knowledgeRepos.effectiveInstructions')}
        visible={Boolean(previewInstructions)}
        onOk={() => setPreviewInstructions(null)}
        onCancel={() => setPreviewInstructions(null)}
        style={{ width: 720 }}
      >
        <pre className='p-12px bg-[var(--color-bg-2)] rounded text-12px max-h-450px overflow-y-auto whitespace-pre-wrap font-mono'>
          {previewInstructions}
        </pre>
      </Modal>
    </>
  );
};
