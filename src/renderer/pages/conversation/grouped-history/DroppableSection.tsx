/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useDroppable } from '@dnd-kit/core';
import classNames from 'classnames';
import React from 'react';

type DroppableSectionProps = {
  id: string;
  children: React.ReactNode;
  className?: string;
};

const DroppableSection: React.FC<DroppableSectionProps> = ({ id, children, className }) => {
  const { isOver, setNodeRef } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={classNames(className, {
        'outline-2 outline-dashed outline-[rgba(var(--primary-6),0.4)] rd-8px': isOver,
        'bg-[rgba(var(--primary-6),0.06)]': isOver,
      })}
      style={{ transition: 'background-color 0.2s, outline 0.2s' }}
    >
      {children}
    </div>
  );
};

export default DroppableSection;
