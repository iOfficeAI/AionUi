/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const ErrorPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .err-body { animation:err-shake .38s ease-in-out infinite; }
        .err-hat { transform-origin:11px 4px; animation:err-hat-fly .76s ease-in-out infinite; }
        .err-arm-l { transform-origin:3.5px 10.5px; animation:err-arm-l .38s ease-in-out infinite; }
        .err-arm-r { transform-origin:18.5px 10.5px; animation:err-arm-r .38s ease-in-out infinite; }
        .err-shadow { transform-origin:11px 22.5px; animation:err-shadow-shake .38s ease-in-out infinite; }
        @keyframes err-shake { 0%,100%{transform:translateX(0) rotate(0)} 20%{transform:translateX(-2px) rotate(-2.5deg)} 40%{transform:translateX(2px) rotate(2.5deg)} 60%{transform:translateX(-1.5px) rotate(-1.5deg)} 80%{transform:translateX(1.5px) rotate(1.5deg)} }
        @keyframes err-hat-fly { 0%,100%{transform:translateX(0) translateY(0) rotate(0)} 25%{transform:translateX(3px) translateY(-5px) rotate(20deg)} 50%{transform:translateX(1px) translateY(-3px) rotate(10deg)} 75%{transform:translateX(-2px) translateY(-4px) rotate(-12deg)} }
        @keyframes err-arm-l { 0%,100%{transform:rotate(0)} 30%{transform:rotate(-40deg)} 70%{transform:rotate(20deg)} }
        @keyframes err-arm-r { 0%,100%{transform:rotate(0)} 30%{transform:rotate(40deg)} 70%{transform:rotate(-20deg)} }
        @keyframes err-shadow-shake { 0%,100%{opacity:.35} 50%{opacity:.2} }
      `}</style>
    </defs>
    <ellipse className='err-shadow' cx='11' cy='22.5' rx='4' ry='0.6' fill='#c0c0c0' />
    <g className='err-hat'>
      <polygon points='11,1 15,7 7,7' fill='#FF6B35' stroke='rgba(255,255,255,0.4)' strokeWidth='0.5' strokeLinejoin='round' />
      <rect x='10' y='2' width='1' height='1' fill='#e8714a' />
    </g>
    <g className='err-body'>
      <g className='err-arm-l'><rect x='2' y='9' width='3' height='3' rx='0.5' fill='#8891b8' opacity='0.7' transform='rotate(45 3.5 10.5)' /></g>
      <g className='err-arm-r'><rect x='17' y='9' width='3' height='3' rx='0.5' fill='#8891b8' opacity='0.7' transform='rotate(45 18.5 10.5)' /></g>
      <rect x='5' y='6' width='12' height='12' rx='6' fill='#a090b5' />
      <line x1='9' y1='9.5' x2='11' y2='11.5' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' />
      <line x1='11' y1='9.5' x2='9' y2='11.5' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' />
      <line x1='11' y1='9.5' x2='13' y2='11.5' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' />
      <line x1='13' y1='9.5' x2='11' y2='11.5' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' />
      <path d='M8.5 14.5 Q11 12.5 13.5 14.5' stroke='#111827' strokeWidth='1' strokeLinecap='round' fill='none' />
    </g>
  </svg>
);

export default ErrorPet;
