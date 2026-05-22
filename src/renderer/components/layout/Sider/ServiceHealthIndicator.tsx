/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import { useServiceHealth } from '@renderer/hooks/context/ServiceHealthContext';
import type { ServiceStatus } from '@renderer/hooks/context/ServiceHealthContext';

const STATUS_DOT: Record<ServiceStatus, string> = {
  online: 'bg-[rgb(var(--green-6))]',
  offline: 'bg-[rgb(var(--red-6))]',
  degraded: 'bg-[rgb(var(--orange-6))]',
  checking: 'bg-[rgb(var(--gray-6))] animate-pulse',
};

const ServiceHealthIndicator: React.FC = () => {
  const { services, onlineCount, totalCount } = useServiceHealth();

  if (totalCount === 0) return null;

  return (
    <div className='flex items-center gap-4px px-10px h-20px shrink-0'>
      <span className='text-11px text-t-secondary leading-none'>
        {onlineCount}/{totalCount}
      </span>
      <div className='flex items-center gap-2px'>
        {services.map((svc) => {
          const latencyLabel = svc.latencyMs ? ` (${svc.latencyMs}ms)` : '';
          const tooltipContent = `${svc.name}: ${svc.status}${latencyLabel}`;

          return (
            <Tooltip key={svc.id} content={tooltipContent}>
              <span
                className={`inline-block w-6px h-6px rounded-full ${STATUS_DOT[svc.status]}`}
              />
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

export default ServiceHealthIndicator;
