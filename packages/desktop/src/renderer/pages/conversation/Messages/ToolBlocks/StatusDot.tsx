/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { UnifiedToolStatus } from '@/common/chat/unifiedToolBlock';

const StatusDot: React.FC<{ status: UnifiedToolStatus; small?: boolean }> = ({ status, small }) => (
  <span className={`tool-block__dot tool-block__dot--${status}`} style={small ? { width: 6, height: 6 } : undefined} />
);

export default StatusDot;
