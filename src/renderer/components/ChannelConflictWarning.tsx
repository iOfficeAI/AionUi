/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert, Button, Link, Space, Typography } from '@arco-design/web-react';
import { IconExclamationCircle } from '@arco-design/web-react/icon';
import React from 'react';

const { Paragraph, Text } = Typography;

interface ChannelConflictWarningProps {
  platform: 'lark' | 'telegram';
  openclawConfigPath: string;
  onDisableOpenClaw?: () => void;
  onIgnore?: () => void;
}

/**
 * Warning component when OpenClaw channel conflicts with AionUi Channels
 */
export const ChannelConflictWarning: React.FC<ChannelConflictWarningProps> = ({ platform, openclawConfigPath, onDisableOpenClaw, onIgnore }) => {
  const platformName = platform === 'lark' ? 'Lark/Feishu' : 'Telegram';
  const channelKey = platform === 'lark' ? 'feishu' : 'telegram';

  return (
    <Alert
      type='warning'
      icon={<IconExclamationCircle />}
      title={`${platformName} Channel Conflict Detected`}
      content={
        <Space direction='vertical' size='medium' style={{ width: '100%' }}>
          <Paragraph>
            <Text bold>OpenClaw is handling {platformName} messages, not AionUi.</Text>
          </Paragraph>

          <Paragraph>
            Your {platformName} bot credentials are also configured in OpenClaw. This means:
            <ul>
              <li>
                <Text type='error'>✗ Switching agents in AionUi will have no effect</Text>
              </li>
              <li>
                <Text type='error'>✗ Messages are processed by OpenClaw's agent</Text>
              </li>
              <li>
                <Text type='success'>✓ Messages still work (via OpenClaw)</Text>
              </li>
            </ul>
          </Paragraph>

          <Paragraph>
            <Text bold>To use AionUi Channels and switch agents:</Text>
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>Option 1: Disable OpenClaw {platformName} (Recommended)</Text>
            <br />
            Edit: <Text code>{openclawConfigPath}</Text>
            <br />
            Set: <Text code>{`channels.${channelKey}.enabled = false`}</Text>
            <br />
            Then restart OpenClaw and AionUi.
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>Option 2: Use a different bot</Text>
            <br />
            Create a new {platformName} bot with different credentials for AionUi.
          </Paragraph>

          <Paragraph>
            <Text type='secondary'>Option 3: Keep using OpenClaw</Text>
            <br />
            Disable {platformName} in AionUi Channels and continue using OpenClaw's integration.
          </Paragraph>

          <Space>
            {onDisableOpenClaw && (
              <Button type='primary' onClick={onDisableOpenClaw}>
                Help me disable OpenClaw {platformName}
              </Button>
            )}
            {onIgnore && (
              <Button type='text' onClick={onIgnore}>
                Ignore (I know what I'm doing)
              </Button>
            )}
          </Space>
        </Space>
      }
      closable={false}
      style={{ marginBottom: 16 }}
    />
  );
};

/**
 * Compact warning banner (for settings page)
 */
export const ChannelConflictBanner: React.FC<{ platform: 'lark' | 'telegram'; onLearnMore: () => void }> = ({ platform, onLearnMore }) => {
  const platformName = platform === 'lark' ? 'Lark/Feishu' : 'Telegram';

  return (
    <Alert
      type='warning'
      content={
        <Space>
          <Text>⚠️ OpenClaw {platformName} conflict detected - Agent switching won't work.</Text>
          <Link onClick={onLearnMore}>Learn more</Link>
        </Space>
      }
      closable
      style={{ marginBottom: 12 }}
    />
  );
};
