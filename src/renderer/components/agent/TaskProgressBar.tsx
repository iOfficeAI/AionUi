/**
 * @license
 * Copyright 2026 Solid Solutions
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

type TaskProgressBarProps = {
  progress: number; // 0-100
  taskName?: string;
  status?: 'active' | 'completed' | 'error';
  showLabel?: boolean;
};

const statusColors = {
  active: 'bg-blue-500',
  completed: 'bg-green-500',
  error: 'bg-red-500',
};

const TaskProgressBar: React.FC<TaskProgressBarProps> = ({
  progress,
  taskName,
  status = 'active',
  showLabel = true,
}) => {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const colorClass = statusColors[status];

  return (
    <div className="w-full space-y-1">
      {showLabel && taskName && (
        <div className="flex justify-between text-sm text-gray-600">
          <span>{taskName}</span>
          <span>{clampedProgress}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass} transition-all duration-300`}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
};

export default TaskProgressBar;
