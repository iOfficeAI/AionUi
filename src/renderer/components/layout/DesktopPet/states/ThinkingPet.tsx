/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const ThinkingPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .think-body   { transform-origin:11px 12px; animation:think-breathe 3.2s ease-in-out infinite; }
        .think-bubble { animation:think-bubble-float 3s ease-in-out infinite; }
        .tpx1 { animation:think-dot 1.8s infinite 0s; }
        .tpx2 { animation:think-dot 1.8s infinite 0.35s; }
        .tpx3 { animation:think-dot 1.8s infinite 0.7s; }
        .tgl1 { animation:think-glow 2.5s ease-out infinite 0s;   opacity:0; }
        .tgl2 { animation:think-glow 2.5s ease-out infinite 0.8s; opacity:0; }
        .tgl3 { animation:think-glow 2.5s ease-out infinite 1.6s; opacity:0; }
        @keyframes think-breathe      { 0%,100%{transform:translateY(0)} 50%{transform:translateY(0.5px)} }
        @keyframes think-bubble-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-0.6px)} }
        @keyframes think-dot { 0%,10%{opacity:0;transform:scale(0.5)} 35%,70%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0.5)} }
        @keyframes think-glow { 0%{opacity:0;transform:translate(0,0) scale(1)} 25%{opacity:.9;transform:translate(0.5px,-1px) scale(1)} 100%{opacity:0;transform:translate(2px,-7px) scale(1.4)} }
      `}</style>
    </defs>
    <rect className='tgl1' x='21' y='12' width='1.5' height='1.5' rx='0.3' fill='#94BDFF' />
    <rect className='tgl2' x='20' y='8'  width='1.2' height='1.2' rx='0.2' fill='#94BDFF' />
    <rect className='tgl3' x='5'  y='12' width='1.2' height='1.2' rx='0.2' fill='#94BDFF' />
    <ellipse cx='14' cy='26.5' rx='4' ry='0.6' fill='#c0c0c0' opacity='0.35' />
    <g className='think-body'>
      <path d='M8.9418 18.0631C8.35737 17.476 7.40762 17.4738 6.82048 18.0582C6.23334 18.6426 6.23115 19.5924 6.81558 20.1795C7.40001 20.7667 8.34975 20.7689 8.93689 20.1844C9.52403 19.6 9.52623 18.6502 8.9418 18.0631Z' fill='#97A0C5' fillOpacity='0.7' />
      <rect width='12' height='12' rx='6' transform='matrix(-1 0 0 1 20 11)' fill='#97A0C5' />
      <rect width='3' height='3' rx='1.5' transform='matrix(4.37114e-08 1 1 -4.37114e-08 18 19)' fill='#B6BDD6' />
      <path d='M13.0713 11.6884L18.9585 14.2193L18.2068 7.85522L13.0713 11.6884Z' fill='#FF6B35' stroke='rgba(255,255,255,0.4)' strokeWidth='0.4' strokeLinejoin='round' />
      <rect x='8' y='8' width='2' height='3' fill='white' />
      <rect x='13' y='15' width='2' height='2' rx='1' fill='black' />
      <path d='M13 18.5C12.1198 18.72 11.8162 19.8162 12.4577 20.4577L12.5 20.5' stroke='black' strokeLinecap='round' />
    </g>
    <g className='think-bubble'>
      <path d='M12.083 2.91602H13V8.41602H12.083V9.33301H2.91699V8.41602H2V2.91602H2.91699V2H12.083V2.91602Z' fill='white' />
      <rect className='tpx1' x='4' y='5.33301' width='1' height='1' fill='#605AFF' />
      <rect className='tpx2' x='7' y='5.33301' width='1' height='1' fill='#605AFF' />
      <rect className='tpx3' x='10' y='5.33301' width='1' height='1' fill='#605AFF' />
    </g>
  </svg>
);

export default ThinkingPet;
