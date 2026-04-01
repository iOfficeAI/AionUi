/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const NotificationPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .notif-body { transform-origin:11px 18px; animation:notif-jump 3.5s ease-in-out infinite; }
        .notif-shadow { transform-origin:11px 22.5px; animation:notif-shadow 3.5s ease-in-out infinite; }
        .notif-arm-l { transform-origin:3.5px 10.5px; animation:notif-arm-l 3.5s ease-in-out infinite; }
        .notif-arm-r { transform-origin:18.5px 10.5px; animation:notif-arm-r 3.5s ease-in-out infinite; }
        .notif-eye { transform-origin:11px 11px; animation:notif-eye 3.5s ease-in-out infinite; }
        .notif-alert { transform-origin:18px 2px; animation:notif-alert 3.5s ease-in-out infinite; opacity:0; }
        @keyframes notif-jump { 0%,100%{transform:translateY(0) scaleY(1)} 8%{transform:translateY(0) scaleY(.9)} 18%{transform:translateY(-10px) scaleY(1.06)} 26%{transform:translateY(0) scaleY(.91)} 34%{transform:translateY(-6px) scaleY(1.03)} 40%{transform:translateY(0) scaleY(.94)} 47%{transform:translateY(-3px) scaleY(1.02)} 53%{transform:translateY(0) scaleY(.97)} 58%{transform:translateY(-1px) scaleY(1.01)} 63%,100%{transform:translateY(0) scaleY(1)} }
        @keyframes notif-shadow { 0%,100%{transform:scaleX(1);opacity:.35} 18%{transform:scaleX(.4);opacity:.08} 26%{transform:scaleX(1.06);opacity:.42} 34%{transform:scaleX(.58);opacity:.16} 40%{transform:scaleX(1);opacity:.35} 47%{transform:scaleX(.75);opacity:.24} }
        @keyframes notif-arm-l { 0%,100%{transform:rotate(0)} 18%{transform:rotate(130deg)} 34%{transform:rotate(90deg)} 47%{transform:rotate(50deg)} 63%{transform:rotate(0)} }
        @keyframes notif-arm-r { 0%,100%{transform:rotate(0)} 18%{transform:rotate(-130deg)} 34%{transform:rotate(-90deg)} 47%{transform:rotate(-50deg)} 63%{transform:rotate(0)} }
        @keyframes notif-eye { 0%,6%,100%{transform:translate(0,0) scaleY(1)} 3%{transform:translate(2px,0) scaleY(.1)} 9%{transform:translate(2px,0) scaleY(1)} 63%{transform:translate(0,0) scaleY(1)} }
        @keyframes notif-alert { 0%{opacity:0;transform:scale(.2)} 5%{opacity:1;transform:scale(1.4)} 10%{opacity:1;transform:scale(1)} 55%{opacity:1;transform:scale(1)} 63%{opacity:0;transform:scale(.4)} 100%{opacity:0} }
      `}</style>
    </defs>
    <g className='notif-alert' fill='#FF6B35'>
      <rect x='17' y='-9' width='2' height='5.5' rx='1' />
      <rect x='17' y='-2' width='2' height='2' rx='1' />
    </g>
    <ellipse className='notif-shadow' cx='11' cy='22.5' rx='4' ry='0.6' fill='#c0c0c0' />
    <g className='notif-body'>
      <g className='notif-arm-l'><rect x='2' y='9' width='3' height='3' rx='0.5' fill='#8891b8' opacity='0.8' transform='rotate(45 3.5 10.5)' /></g>
      <g className='notif-arm-r'><rect x='17' y='9' width='3' height='3' rx='0.5' fill='#8891b8' opacity='0.8' transform='rotate(45 18.5 10.5)' /></g>
      <rect x='5' y='6' width='12' height='12' rx='6' fill='#97A0C5' />
      <polygon points='11,1 15,7 7,7' fill='#FF6B35' stroke='rgba(255,255,255,0.4)' strokeWidth='0.5' strokeLinejoin='round' />
      <rect x='10' y='2' width='1' height='1' fill='#e8714a' />
      <g className='notif-eye'><rect x='10' y='10' width='2' height='2' fill='#111827' /></g>
      <path d='M8 13.5 Q11 16.5 14 13.5' stroke='#111827' strokeWidth='1' strokeLinecap='round' fill='none' />
    </g>
  </svg>
);

export default NotificationPet;
