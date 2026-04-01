/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const JugglingPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .jg-body { transform-origin:11px 17px; animation:jg-lean .8s ease-in-out infinite; }
        .jg-arm-l { transform-origin:5px 14px; animation:jg-arm-l .8s ease-in-out infinite; }
        .jg-arm-r { transform-origin:17px 14px; animation:jg-arm-r .8s ease-in-out infinite; }
        .jg-ba { animation:jg-casc 2.4s ease-in-out infinite; animation-delay:0s; }
        .jg-bb { animation:jg-casc 2.4s ease-in-out infinite; animation-delay:-.8s; }
        .jg-bc { animation:jg-casc 2.4s ease-in-out infinite; animation-delay:-1.6s; }
        .jg-shadow { transform-origin:11px 25px; animation:jg-shadow .8s ease-in-out infinite; }
        @keyframes jg-casc {
          0%{transform:translate(3px,21px) scale(1.15)}
          12%{transform:translate(5px,8px) scale(.95)}
          25%{transform:translate(8px,-4px) scale(.75)}
          50%{transform:translate(11px,-12px) scale(.6)}
          75%{transform:translate(15px,-2px) scale(.8)}
          88%{transform:translate(18px,12px) scale(1)}
          100%{transform:translate(19px,21px) scale(1.15)}
        }
        @keyframes jg-lean { 0%{transform:rotate(-5deg) translateY(0) scaleX(1.02)} 50%{transform:rotate(5deg) translateY(-1px) scaleX(.98)} 100%{transform:rotate(-5deg) translateY(0) scaleX(1.02)} }
        @keyframes jg-arm-l { 0%{transform:rotate(-55deg) translateY(-1px)} 25%{transform:rotate(-20deg)} 50%{transform:rotate(15deg)} 75%{transform:rotate(-10deg)} 100%{transform:rotate(-55deg) translateY(-1px)} }
        @keyframes jg-arm-r { 0%{transform:rotate(15deg)} 25%{transform:rotate(-10deg)} 50%{transform:rotate(-55deg) translateY(-1px)} 75%{transform:rotate(-20deg)} 100%{transform:rotate(15deg)} }
        @keyframes jg-shadow { 0%,100%{transform:scaleX(1.05);opacity:.3} 50%{transform:scaleX(.9);opacity:.2} }
      `}</style>
    </defs>
    <ellipse className='jg-shadow' cx='11' cy='25' rx='7' ry='0.75' fill='#c0c0c0' />
    <circle className='jg-ba' cx='0' cy='0' r='2.3' fill='#FF6B35' />
    <circle className='jg-bb' cx='0' cy='0' r='2.3' fill='#7c91e8' />
    <g className='jg-body'>
      <g className='jg-arm-l'><rect x='1.5' y='12' width='4' height='4' rx='2' fill='#8891b8' opacity='0.9' /></g>
      <g className='jg-arm-r'><rect x='16.5' y='12' width='4' height='4' rx='2' fill='#8891b8' opacity='0.9' /></g>
      <rect x='5' y='6' width='12' height='12' rx='6' fill='#97A0C5' />
      <polygon points='11,1 15,7 7,7' fill='#FF6B35' stroke='rgba(255,255,255,0.4)' strokeWidth='0.5' strokeLinejoin='round' />
      <path d='M9 11 Q10 9.2 11 11' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' fill='none' />
      <path d='M11 11 Q12 9.2 13 11' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' fill='none' />
      <path d='M8 13.5 Q11 17.5 14 13.5' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' fill='none' />
    </g>
    <circle className='jg-bc' cx='0' cy='0' r='2.3' fill='#4AFF3D' />
  </svg>
);

export default JugglingPet;
