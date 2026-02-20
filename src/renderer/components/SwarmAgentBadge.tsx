/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import classNames from 'classnames';

type SwarmAgentBadgeProps = {
  avatar: string;
  name: string;
  role: string;
};

const ROLE_COLORS: Record<string, string> = {
  driver: 'bg-blue-100 text-blue-700 border-blue-200',
  navigator: 'bg-green-100 text-green-700 border-green-200',
};

const SwarmAgentBadge: React.FC<SwarmAgentBadgeProps> = ({ avatar, name, role }) => (
  <div className='flex flex-col items-center mr-2 min-w-8'>
    <span className='text-lg'>{avatar}</span>
    <span className={classNames('text-xs px-1 rounded border mt-0.5', ROLE_COLORS[role] || 'bg-gray-100 text-gray-600 border-gray-200')}>{name}</span>
  </div>
);

export default SwarmAgentBadge;
