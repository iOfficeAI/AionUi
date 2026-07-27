/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Robot } from '@icon-park/react';
import React from 'react';
import type { OnboardingAssistant } from '../hooks/useOnboardingData';
import styles from '../index.module.css';

/** Renders a real tool logo tile; falls back to a neutral dot when absent. */
export const ToolLogo: React.FC<{ src: string | null; className?: string }> = ({ src, className }) => (
  <span className={`${styles.toollogo} ${className ?? ''}`}>{src ? <img src={src} alt='' /> : null}</span>
);

/** Renders a real assistant avatar (image / emoji / robot fallback). */
export const AssistantAvatar: React.FC<{ avatar: OnboardingAssistant['avatar']; className?: string }> = ({
  avatar,
  className,
}) => (
  <span className={`${styles.avatar} ${className ?? ''}`}>
    {avatar.kind === 'image' && avatar.value ? (
      <img src={avatar.value} alt='' />
    ) : avatar.kind === 'emoji' && avatar.value ? (
      <span className={styles.avatarEmoji}>{avatar.value}</span>
    ) : (
      <Robot theme='outline' size={16} />
    )}
  </span>
);
