/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Card,
  Typography,
  Space,
  Button,
  Tag,
  Switch,
  InputNumber,
  Modal,
  Form,
  Input,
  Select,
  Popconfirm,
  Message,
} from '@arco-design/web-react';
import { BrowserChrome, Delete, Plus, Shield, FolderDownload, ShareSys, Refresh } from '@icon-park/react';
import { useBrowserProfiles } from '@/renderer/pages/conversation/hooks/useBrowserProfiles';
import type { SafetyActionType } from '@/common/browser/safetyTypes';

const { Text, Paragraph } = Typography;
const FormItem = Form.Item;

export const BrowserAutomationSettings: React.FC = () => {
  const { profiles, activeProfile, switchProfile, createProfile, deleteProfile, clearProfileData } =
    useBrowserProfiles();

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [form] = Form.useForm();

  // Safety Gate settings state
  const [autoApprovePublish, setAutoApprovePublish] = useState(false);
  const [autoApproveSend, setAutoApproveSend] = useState(false);
  const [autoApproveDelete, setAutoApproveDelete] = useState(false);
  const [autoApproveSpend, setAutoApproveSpend] = useState(false);

  // Social Rate Limiting state
  const [dailyCap, setDailyCap] = useState(10);
  const [todayIgCount, setTodayIgCount] = useState(0);
  const [todayFbCount, setTodayFbCount] = useState(0);

  useEffect(() => {
    // Load safety auto-approve settings from bridge
    const loadSettings = async () => {
      if (window.electronAPI?.browserGetSafetyAutoApprove) {
        const pub = await window.electronAPI.browserGetSafetyAutoApprove('publish');
        if (pub.success) setAutoApprovePublish(Boolean(pub.data));

        const snd = await window.electronAPI.browserGetSafetyAutoApprove('send');
        if (snd.success) setAutoApproveSend(Boolean(snd.data));

        const del = await window.electronAPI.browserGetSafetyAutoApprove('delete');
        if (del.success) setAutoApproveDelete(Boolean(del.data));

        const spd = await window.electronAPI.browserGetSafetyAutoApprove('spend');
        if (spd.success) setAutoApproveSpend(Boolean(spd.data));
      }

      if (window.electronAPI?.browserGetSocialDailyCap) {
        const cap = await window.electronAPI.browserGetSocialDailyCap();
        if (cap.success && typeof cap.data === 'number') {
          setDailyCap(cap.data);
        }
      }

      if (window.electronAPI?.browserGetSocialDailyCount) {
        const ig = await window.electronAPI.browserGetSocialDailyCount('instagram');
        if (ig.success && typeof ig.data === 'number') setTodayIgCount(ig.data);

        const fb = await window.electronAPI.browserGetSocialDailyCount('facebook');
        if (fb.success && typeof fb.data === 'number') setTodayFbCount(fb.data);
      }
    };

    void loadSettings();
  }, []);

  const handleToggleAutoApprove = async (actionType: SafetyActionType, enabled: boolean) => {
    if (window.electronAPI?.browserSetSafetyAutoApprove) {
      await window.electronAPI.browserSetSafetyAutoApprove({ actionType, enabled });
      switch (actionType) {
        case 'publish':
          setAutoApprovePublish(enabled);
          break;
        case 'send':
          setAutoApproveSend(enabled);
          break;
        case 'delete':
          setAutoApproveDelete(enabled);
          break;
        case 'spend':
          setAutoApproveSpend(enabled);
          break;
      }
      Message.success(`Updated auto-approval for ${actionType}`);
    }
  };

  const handleUpdateDailyCap = async (cap: number) => {
    setDailyCap(cap);
    if (window.electronAPI?.browserSetSocialDailyCap) {
      await window.electronAPI.browserSetSocialDailyCap(cap);
      Message.success('Updated daily post cap');
    }
  };

  const handleCreateProfileSubmit = async () => {
    try {
      const values = await form.validate();
      await createProfile({
        name: values.name,
        backend: values.backend,
        externalChrome: {
          port: values.port ? Number(values.port) : 9222,
        },
      });
      setIsAddModalVisible(false);
      form.resetFields();
      Message.success('Profile created successfully');
    } catch (err) {
      Message.error(err instanceof Error ? err.message : 'Failed to create profile');
    }
  };

  return (
    <div className='flex flex-col gap-6 py-2'>
      {/* 1. Persistent Profiles */}
      <Card
        title={
          <Space>
            <BrowserChrome size='18' />
            <Text bold>Browser Profiles & Persistent Sessions</Text>
          </Space>
        }
        extra={
          <Button type='primary' size='small' icon={<Plus />} onClick={() => setIsAddModalVisible(true)}>
            Add Profile
          </Button>
        }
      >
        <div className='flex flex-col gap-3'>
          <Paragraph type='secondary' className='text-xs mb-1'>
            Profiles keep login cookies, storage, and sessions across app restarts. Use External Chrome for sites that
            restrict embedded webviews (e.g. Google Flow).
          </Paragraph>

          <div className='flex flex-col gap-2'>
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className='p-3 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)] flex items-center justify-between'
              >
                <div className='flex items-center gap-3'>
                  <Text bold className='text-sm'>
                    {profile.name}
                  </Text>
                  <Tag color={profile.backend === 'embedded' ? 'arcoblue' : 'purple'} size='small'>
                    {profile.backend === 'embedded'
                      ? 'Embedded Session'
                      : `Chrome CDP :${profile.externalChrome?.port || 9222}`}
                  </Tag>
                  {profile.id === activeProfile.id && (
                    <Tag color='green' size='small'>
                      Active
                    </Tag>
                  )}
                </div>

                <Space>
                  {profile.id !== activeProfile.id && (
                    <Button size='mini' type='secondary' onClick={() => switchProfile(profile.id)}>
                      Make Active
                    </Button>
                  )}
                  <Popconfirm
                    title='Clear all session cookies and stored data for this profile?'
                    onOk={() => clearProfileData(profile.id)}
                  >
                    <Button size='mini' type='text' status='warning'>
                      Clear Data
                    </Button>
                  </Popconfirm>
                  {profile.id !== 'default' && (
                    <Popconfirm title='Delete this browser profile?' onOk={() => deleteProfile(profile.id)}>
                      <Button size='mini' type='text' status='danger' icon={<Delete />} />
                    </Popconfirm>
                  )}
                </Space>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* 2. Download Routing */}
      <Card
        title={
          <Space>
            <FolderDownload size='18' />
            <Text bold>Download Storage</Text>
          </Space>
        }
      >
        <div className='flex flex-col gap-2'>
          <Text type='secondary' className='text-xs'>
            Downloads intercepted during browser workflows are routed automatically into workspace date folders:
          </Text>
          <Text code className='text-xs'>
            {'<workspace>/browser-downloads/<profile>/<YYYY-MM-DD>/<filename>'}
          </Text>
        </div>
      </Card>

      {/* 3. Safety Approval Gates */}
      <Card
        title={
          <Space>
            <Shield size='18' />
            <Text bold>Safety Gates & Approval Requirements</Text>
          </Space>
        }
      >
        <div className='flex flex-col gap-4'>
          <Paragraph type='secondary' className='text-xs mb-1'>
            Actions that publish live content, send messages, delete data, or spend money require an explicit prompt
            before executing.
          </Paragraph>

          <div className='grid grid-cols-2 gap-4'>
            <div className='flex items-center justify-between p-3 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)]'>
              <div>
                <Text bold className='text-xs block'>
                  Auto-Approve Publish
                </Text>
                <Text type='secondary' className='text-[10px]'>
                  Bypass approval modal when posting to social accounts
                </Text>
              </div>
              <Switch checked={autoApprovePublish} onChange={(v) => handleToggleAutoApprove('publish', v)} />
            </div>

            <div className='flex items-center justify-between p-3 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)]'>
              <div>
                <Text bold className='text-xs block'>
                  Auto-Approve Send
                </Text>
                <Text type='secondary' className='text-[10px]'>
                  Bypass approval modal when sending messages
                </Text>
              </div>
              <Switch checked={autoApproveSend} onChange={(v) => handleToggleAutoApprove('send', v)} />
            </div>

            <div className='flex items-center justify-between p-3 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)]'>
              <div>
                <Text bold className='text-xs block'>
                  Auto-Approve Delete
                </Text>
                <Text type='secondary' className='text-[10px]'>
                  Bypass approval modal when deleting records
                </Text>
              </div>
              <Switch checked={autoApproveDelete} onChange={(v) => handleToggleAutoApprove('delete', v)} />
            </div>

            <div className='flex items-center justify-between p-3 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)]'>
              <div>
                <Text bold className='text-xs block'>
                  Auto-Approve Spend
                </Text>
                <Text type='secondary' className='text-[10px]'>
                  Bypass approval modal when spending funds
                </Text>
              </div>
              <Switch checked={autoApproveSpend} onChange={(v) => handleToggleAutoApprove('spend', v)} />
            </div>
          </div>
        </div>
      </Card>

      {/* 4. Social Posting Protection */}
      <Card
        title={
          <Space>
            <ShareSys size='18' />
            <Text bold>Social Posting Protection & Rate Limits</Text>
          </Space>
        }
      >
        <div className='flex flex-col gap-4'>
          <div className='flex items-center justify-between p-3 bg-[var(--color-fill-2)] rounded border border-[var(--color-border-2)]'>
            <div>
              <Text bold className='text-xs block'>
                Daily Post Cap
              </Text>
              <Text type='secondary' className='text-[10px]'>
                Maximum allowed posts per platform per day to prevent account flags
              </Text>
            </div>
            <InputNumber
              min={1}
              max={100}
              value={dailyCap}
              onChange={(val) => handleUpdateDailyCap(val || 10)}
              style={{ width: 100 }}
            />
          </div>

          <div className='flex items-center gap-6 px-3'>
            <div className='flex items-center gap-2'>
              <Text type='secondary' className='text-xs'>
                Today's Instagram Posts:
              </Text>
              <Tag size='small'>
                {todayIgCount} / {dailyCap}
              </Tag>
            </div>
            <div className='flex items-center gap-2'>
              <Text type='secondary' className='text-xs'>
                Today's Facebook Posts:
              </Text>
              <Tag size='small'>
                {todayFbCount} / {dailyCap}
              </Tag>
            </div>
          </div>
        </div>
      </Card>

      {/* Add Profile Modal */}
      <Modal
        title='Create Browser Profile'
        visible={isAddModalVisible}
        onOk={handleCreateProfileSubmit}
        onCancel={() => setIsAddModalVisible(false)}
      >
        <Form form={form} layout='vertical'>
          <FormItem
            label='Profile Name'
            field='name'
            rules={[{ required: true, message: 'Please enter a profile name' }]}
          >
            <Input placeholder='e.g. instagram-brand, work-account' />
          </FormItem>

          <FormItem label='Backend Type' field='backend' initialValue='embedded'>
            <Select>
              <Select.Option value='embedded'>Embedded (In-App Partition)</Select.Option>
              <Select.Option value='external-chrome'>External Chrome (CDP Port)</Select.Option>
            </Select>
          </FormItem>

          <FormItem
            label='Chrome Remote Debugging Port'
            field='port'
            initialValue={9222}
            extra='Required when using External Chrome'
          >
            <InputNumber min={1024} max={65535} />
          </FormItem>
        </Form>
      </Modal>
    </div>
  );
};
