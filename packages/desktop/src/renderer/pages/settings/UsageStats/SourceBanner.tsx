/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { UsageSourceStatus } from '@/common/types/agentUsage';

const SourceBanner: React.FC<{ sources: UsageSourceStatus[] }> = ({ sources }) => {
  const { t } = useTranslation();
  const msgs: string[] = [];
  for (const s of sources) {
    if (!s.available) msgs.push(t('usageStats.source.missing', { agent: s.agent }));
    else if (s.filesSkipped > 0) msgs.push(t('usageStats.source.skipped', { agent: s.agent, count: s.filesSkipped }));
  }
  if (msgs.length === 0) return null;
  return <Alert type='warning' content={msgs.join(' · ')} style={{ marginBottom: 16 }} />;
};

export default SourceBanner;
