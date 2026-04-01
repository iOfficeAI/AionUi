/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const SleepingPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .sleep-body { transform-origin:11px 18px; animation:sleep-breathe 4.5s ease-in-out infinite; }
        .sleep-shadow { transform-origin:11px 22.5px; animation:sleep-shadow 4.5s ease-in-out infinite; }
        .sleep-z1 { animation:sleep-zzz1 5s ease-in-out infinite; animation-delay:0s; opacity:0; }
        .sleep-z2 { animation:sleep-zzz2 5s ease-in-out infinite; animation-delay:1.6s; opacity:0; }
        .sleep-z3 { animation:sleep-zzz3 5s ease-in-out infinite; animation-delay:3.2s; opacity:0; }
        @keyframes sleep-breathe { 0%,100%{transform:scaleY(1)} 35%,45%{transform:scaleY(1.04)} }
        @keyframes sleep-shadow { 0%,100%{transform:scaleX(1);opacity:.28} 35%,45%{transform:scaleX(1.04);opacity:.35} }
        @keyframes sleep-zzz1 { 0%{opacity:0;transform:translate(12px,6px) scale(.55)} 15%{opacity:.9} 80%{opacity:.5} 100%{opacity:0;transform:translate(17px,-1px) scale(.95)} }
        @keyframes sleep-zzz2 { 0%{opacity:0;transform:translate(14px,4px) scale(.45)} 15%{opacity:.85} 80%{opacity:.45} 100%{opacity:0;transform:translate(20px,-2px) scale(.85)} }
        @keyframes sleep-zzz3 { 0%{opacity:0;transform:translate(10px,8px) scale(.38)} 15%{opacity:.8} 80%{opacity:.4} 100%{opacity:0;transform:translate(15px,2px) scale(.75)} }
      `}</style>
      <g id='sleep-pz'>
        <rect x='0' y='0' width='3' height='0.7' />
        <rect x='1.6' y='0.7' width='0.8' height='0.8' />
        <rect x='0.7' y='1.5' width='0.8' height='0.8' />
        <rect x='0' y='2.3' width='3' height='0.7' />
      </g>
    </defs>
    <use href='#sleep-pz' className='sleep-z1' fill='#8891b8' />
    <use href='#sleep-pz' className='sleep-z2' fill='#a0a8c8' />
    <use href='#sleep-pz' className='sleep-z3' fill='#c0c8e0' />
    <ellipse className='sleep-shadow' cx='11' cy='22.5' rx='4' ry='0.6' fill='#c0c0c0' />
    <g className='sleep-body'>
      <rect x='2' y='11' width='3' height='3' rx='0.5' fill='#8891b8' opacity='0.5' transform='rotate(45 3.5 12.5)' />
      <rect x='17' y='11' width='3' height='3' rx='0.5' fill='#8891b8' opacity='0.5' transform='rotate(45 18.5 12.5)' />
      <rect x='5' y='6' width='12' height='12' rx='6' fill='#8890b5' />
      <polygon points='11,1 15,7 7,7' fill='#b84020' transform='rotate(-15 11 5)' />
      <rect x='10' y='2' width='1' height='1' fill='#c05535' transform='rotate(-15 11 5)' />
      <line x1='9' y1='11' x2='11' y2='11' stroke='#111827' strokeWidth='0.9' strokeLinecap='round' />
      <line x1='11' y1='11' x2='13' y2='11' stroke='#111827' strokeWidth='0.9' strokeLinecap='round' />
      <path d='M9 13.5 Q11 15 13 13.5' stroke='#111827' strokeWidth='0.8' strokeLinecap='round' fill='none' />
    </g>
  </svg>
);

export default SleepingPet;
