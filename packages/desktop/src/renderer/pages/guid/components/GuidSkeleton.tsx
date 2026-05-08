/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import styles from '../index.module.css';

/**
 * Skeleton placeholder for the AgentPillBar while agents are loading.
 * Mimics the pill bar container with 5 circular shimmer elements.
 */
export const AgentPillBarSkeleton: React.FC = () => {
  return (
    <div className='w-full flex justify-center'>
      <div
        className='inline-flex items-center bg-fill-2'
        style={{
          marginBottom: 16,
          padding: '4px',
          borderRadius: '30px',
          gap: 12,
        }}
      >
        {/* First pill is wider to mimic the selected state */}
        <div className={styles.skeleton} style={{ width: 48, height: 28, borderRadius: 20 }} />
        {[28, 28, 28, 28].map((size, i) => (
          <div key={i} className={styles.skeleton} style={{ width: size, height: size, borderRadius: '50%' }} />
        ))}
      </div>
    </div>
  );
};

/**
 * Skeleton placeholder for the AssistantSelectionArea while custom agents load.
 * Shows 3 pill-shaped shimmer elements with varying widths.
 */
export const AssistantsSkeleton: React.FC = () => {
  const widths = [80, 100, 90];
  return (
    <div className='mt-16px w-full'>
      <div className='flex flex-wrap gap-8px justify-center'>
        {widths.map((w, i) => (
          <div key={i} className={styles.skeletonPill} style={{ width: w, height: 28 }} />
        ))}
      </div>
    </div>
  );
};
