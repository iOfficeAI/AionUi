/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const WorkingPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .wk-all { transform-origin:12px 15px; animation:wk-bob .6s cubic-bezier(.36,.07,.19,.97) infinite; }
        .wk-hand-r { transform-origin:14px 22px; animation:wk-tap-r .3s ease-in-out infinite alternate; }
        .wk-hand-l { transform-origin:7px 22px; animation:wk-tap-l .3s ease-in-out infinite alternate; }
        .wk-shadow { transform-origin:10px 23.5px; animation:wk-shadow 2.4s ease-in-out infinite; }
        .wk-hat { transform-origin:15px 8px; animation:wk-hat-shake .3s ease-in-out infinite alternate; }
        .wk-dot1 { animation:wk-dot-flash .9s ease-in-out infinite; animation-delay:0s; }
        .wk-dot2 { animation:wk-dot-flash .9s ease-in-out infinite; animation-delay:.3s; }
        .wk-dot3 { animation:wk-dot-flash .9s ease-in-out infinite; animation-delay:.6s; }
        .wk-dot4 { animation:wk-dot-flash .9s ease-in-out infinite; animation-delay:.15s; }
        @keyframes wk-bob { 0%,100%{transform:translateY(0) scaleY(1)} 30%{transform:translateY(-2px) scaleY(1.04)} 60%{transform:translateY(1px) scaleY(.97)} }
        @keyframes wk-tap-r { from{transform:translateY(0)} to{transform:translateY(-3px)} }
        @keyframes wk-tap-l { from{transform:translateY(-3px)} to{transform:translateY(0)} }
        @keyframes wk-shadow { 0%,100%{transform:scaleX(1);opacity:.32} 50%{transform:scaleX(.9);opacity:.2} }
        @keyframes wk-hat-shake { from{transform:rotate(-6deg) translateY(0)} to{transform:rotate(4deg) translateY(-.5px)} }
        @keyframes wk-dot-flash { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.1;transform:scale(.6)} }
      `}</style>
    </defs>
    <ellipse className='wk-shadow' cx='10' cy='23.5' rx='7' ry='0.75' fill='#c0c0c0' />
    <g className='wk-all'>
      <rect className='wk-dot1' x='4' y='9' width='1.2' height='1.2' rx='0.3' fill='#4AFF3D' />
      <rect className='wk-dot2' x='21' y='4' width='1.2' height='1.2' rx='0.3' fill='#4AFF3D' />
      <rect className='wk-dot3' x='21' y='11' width='1.2' height='1.2' rx='0.3' fill='#4AFF3D' />
      <rect className='wk-dot4' x='22' y='15' width='1.2' height='1.2' rx='0.3' fill='#4AFF3D' />
      <rect className='wk-dot2' x='7' y='5' width='1' height='1' rx='0.2' fill='#4AFF3D' />
      <rect x='8' y='7' width='12' height='12' rx='6' fill='#97A0C5' />
      <g className='wk-hat'>
        <path d='M16.4681 2.77162L18.7097 9.32717L11.9116 7.99068L16.4681 2.77162Z' fill='#FF6B35' stroke='rgba(255,255,255,0.35)' strokeWidth='0.4' />
      </g>
      <rect x='12' y='11' width='2' height='2' rx='1' fill='#111827' />
      <rect x='3.5' y='15.5' width='10' height='6' rx='0.4' fill='#D9D9D9' stroke='#E5E7F0' strokeWidth='0.5' />
      <rect x='4.5' y='17' width='4' height='0.7' rx='0.25' fill='#9098b8' opacity='0.7' />
      <rect x='4.5' y='18.5' width='6' height='0.7' rx='0.25' fill='#9098b8' opacity='0.5' />
      <rect x='4.5' y='20' width='3' height='0.7' rx='0.25' fill='#9098b8' opacity='0.6' />
      <rect x='10' y='21' width='8' height='1' rx='0.2' fill='white' />
      <rect x='3' y='22' width='15' height='1' rx='0.3' fill='#D9D9D9' />
      <rect x='8' y='22.1' width='1' height='0.7' rx='0.2' fill='#736B6B' opacity='0.7' />
      <g className='wk-hand-l'><circle cx='7' cy='22' r='1.6' fill='#97A0C5' fillOpacity='0.9' /></g>
      <g className='wk-hand-r'><circle cx='14' cy='22' r='1.6' fill='#B9C3EB' /></g>
    </g>
  </svg>
);

export default WorkingPet;
