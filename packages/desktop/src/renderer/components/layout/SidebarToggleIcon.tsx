import React from 'react';

type SidebarToggleIconProps = {
  size?: number | string;
  strokeWidth?: number;
};

const SidebarToggleIcon: React.FC<SidebarToggleIconProps> = ({ size = 18, strokeWidth = 2.5 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 48 48'
    fill='none'
    stroke='currentColor'
    strokeWidth={strokeWidth}
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-hidden='true'
    focusable='false'
  >
    <rect x='9' y='8' width='30' height='32' rx='5.5' />
    <path d='M18 16V32' />
  </svg>
);

export default SidebarToggleIcon;
