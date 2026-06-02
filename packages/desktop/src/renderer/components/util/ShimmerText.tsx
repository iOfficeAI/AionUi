/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import classNames from 'classnames';

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Animation duration in seconds
   * @default 3
   */
  duration?: number;
  /**
   * Whether to pause animation on hover
   * @default false
   */
  pauseOnHover?: boolean;
}

const ShimmerText: React.FC<ShimmerTextProps> = ({ children, className, duration = 3, pauseOnHover = false }) => {
  // Inline styles for shimmer effect to avoid global CSS additions
  const shimmerStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, var(--text-secondary) 0%, var(--text-primary) 50%, var(--text-secondary) 100%)',
    backgroundSize: '200% 100%',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    animation: `shimmer-scan ${duration}s linear infinite`,
    ...(pauseOnHover && {
      ':hover': {
        animationPlayState: 'paused',
      },
    }),
  };

  // Define animation keyframes inline
  React.useEffect(() => {
    // Check if keyframes already exist to avoid duplicates
    const existingStyle = document.querySelector('[data-shimmer-keyframes]');
    if (!existingStyle) {
      const styleElement = document.createElement('style');
      styleElement.textContent = `
        @keyframes shimmer-scan {
          0% {
            background-position: 100% 0;
          }
          100% {
            background-position: -100% 0;
          }
        }
      `;
      styleElement.setAttribute('data-shimmer-keyframes', 'true');
      document.head.appendChild(styleElement);
    }
  }, []);

  return (
    <span
      className={className}
      style={shimmerStyle}
      onMouseEnter={
        pauseOnHover
          ? (e) => {
              (e.target as HTMLElement).style.animationPlayState = 'paused';
            }
          : undefined
      }
      onMouseLeave={
        pauseOnHover
          ? (e) => {
              (e.target as HTMLElement).style.animationPlayState = 'running';
            }
          : undefined
      }
    >
      {children}
    </span>
  );
};

export default ShimmerText;
