/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const WakingPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .wake-body { transform-origin:11px 18px; animation:wake-stretch 4s ease-in-out infinite; }
        .wake-eye { transform-origin:11px 11px; animation:wake-eye 4s ease-in-out infinite; }
        .wake-hat { transform-origin:11px 5px; animation:wake-hat 4s ease-in-out infinite; }
        .wake-arm-l { transform-origin:5px 12px; animation:wake-arm-l 4s ease-in-out infinite; }
        .wake-arm-r { transform-origin:17px 12px; animation:wake-arm-r 4s ease-in-out infinite; }
        .wake-z1 { animation:wake-z 4s ease-in-out infinite; animation-delay:0s; }
        .wake-z2 { animation:wake-z 4s ease-in-out infinite; animation-delay:.3s; }
        .wake-z3 { animation:wake-z 4s ease-in-out infinite; animation-delay:.6s; }
        .wake-shadow { transform-origin:11px 23px; animation:wake-shadow 4s ease-in-out infinite; }
        .wake-star { opacity:0; }
        .wake-star1 { animation:wake-star-pop 4s ease-out infinite; animation-delay:1.8s; }
        .wake-star2 { animation:wake-star-pop 4s ease-out infinite; animation-delay:2.0s; }
        .wake-star3 { animation:wake-star-pop 4s ease-out infinite; animation-delay:2.2s; }
        .wake-star4 { animation:wake-star-pop 4s ease-out infinite; animation-delay:2.1s; }
        @keyframes wake-stretch { 0%,18%{transform:translateY(4px) scaleY(.75) scaleX(1.18)} 40%{transform:translateY(-6px) scaleY(1.28) scaleX(.86)} 55%{transform:translateY(-10px) scaleY(1.05) scaleX(.97)} 68%{transform:translateY(1px) scaleY(.93) scaleX(1.06)} 78%{transform:translateY(-3px) scaleY(1.04) scaleX(.98)} 88%,100%{transform:translateY(0) scaleY(1) scaleX(1)} }
        @keyframes wake-eye { 0%,20%{transform:scaleY(.06)} 32%{transform:scaleY(1.5)} 50%,100%{transform:scaleY(1)} }
        @keyframes wake-hat { 0%,18%{transform:rotate(-20deg) translateY(2px)} 42%{transform:rotate(10deg) translateY(-4px)} 58%{transform:rotate(-5deg) translateY(-2px)} 75%,100%{transform:rotate(0)} }
        @keyframes wake-arm-l { 0%,20%{transform:rotate(35deg) translateY(3px)} 42%{transform:rotate(-145deg) translateY(-3px)} 58%{transform:rotate(-160deg) translateY(-4px)} 72%,100%{transform:rotate(0)} }
        @keyframes wake-arm-r { 0%,20%{transform:rotate(-35deg) translateY(3px)} 42%{transform:rotate(145deg) translateY(-3px)} 58%{transform:rotate(160deg) translateY(-4px)} 72%,100%{transform:rotate(0)} }
        @keyframes wake-shadow { 0%,18%{transform:scaleX(1.22);opacity:.4} 55%{transform:scaleX(.65);opacity:.12} 68%{transform:scaleX(1.12);opacity:.35} 88%,100%{transform:scaleX(1);opacity:.3} }
        @keyframes wake-z { 0%,8%{transform:translate(0,0) scale(.5);opacity:.9} 18%{transform:translate(3px,-8px) scale(1.1);opacity:.7} 28%{transform:translate(6px,-16px) scale(.5);opacity:0} 29%,100%{transform:translate(0,0) scale(0);opacity:0} }
        @keyframes wake-star-pop { 0%{transform:translate(0,0) scale(0);opacity:0} 15%{transform:translate(var(--tx),var(--ty)) scale(1.2);opacity:1} 40%{transform:translate(var(--tx2),var(--ty2)) scale(.8);opacity:.7} 70%{opacity:0} 100%{opacity:0} }
      `}</style>
    </defs>
    <ellipse className='wake-shadow' cx='11' cy='23' rx='5' ry='0.65' fill='#c0c0c0' />
    <text className='wake-z1' x='16' y='8' fontSize='3' fill='#94BDFF' fontFamily='system-ui' fontWeight='bold'>z</text>
    <text className='wake-z2' x='18' y='4' fontSize='2.5' fill='#94BDFF' fontFamily='system-ui' fontWeight='bold'>z</text>
    <text className='wake-z3' x='20' y='1' fontSize='2' fill='#94BDFF' fontFamily='system-ui' fontWeight='bold'>Z</text>
    <g className='wake-body'>
      <g className='wake-arm-l'><rect x='2' y='10' width='3.5' height='3.5' rx='1.75' fill='#8891b8' opacity='0.75' /></g>
      <g className='wake-arm-r'><rect x='16.5' y='10' width='3.5' height='3.5' rx='1.75' fill='#8891b8' opacity='0.75' /></g>
      <rect x='5' y='6' width='12' height='12' rx='6' fill='#97A0C5' />
      <g className='wake-hat'><polygon points='11,1 15,7 7,7' fill='#FF6B35' stroke='rgba(255,255,255,0.4)' strokeWidth='0.5' strokeLinejoin='round' /></g>
      <g className='wake-eye'><rect x='10' y='10' width='2' height='2' rx='1' fill='#111827' /></g>
      <path d='M8 13.5 Q11 17 14 13.5' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' fill='none' />
    </g>
    <g>
      <rect className='wake-star wake-star1' x='11' y='11' width='1.5' height='1.5' rx='0.4' fill='#FFD700' style={{ '--tx': '-8px', '--ty': '-10px', '--tx2': '-10px', '--ty2': '-14px' } as React.CSSProperties} />
      <rect className='wake-star wake-star2' x='11' y='11' width='1.2' height='1.2' rx='0.3' fill='#FF6B35' style={{ '--tx': '8px', '--ty': '-12px', '--tx2': '11px', '--ty2': '-16px' } as React.CSSProperties} />
      <rect className='wake-star wake-star3' x='11' y='11' width='1' height='1' rx='0.25' fill='#94BDFF' style={{ '--tx': '-5px', '--ty': '-14px', '--tx2': '-7px', '--ty2': '-18px' } as React.CSSProperties} />
      <rect className='wake-star wake-star4' x='11' y='11' width='1.2' height='1.2' rx='0.3' fill='#4AFF3D' style={{ '--tx': '10px', '--ty': '-8px', '--tx2': '13px', '--ty2': '-12px' } as React.CSSProperties} />
    </g>
  </svg>
);

export default WakingPet;
