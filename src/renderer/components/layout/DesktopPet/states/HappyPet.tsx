/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const HappyPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .happy-body { transform-origin:11px 18px; animation:happy-jump 1s ease-in-out infinite; }
        .happy-shadow { transform-origin:11px 22.5px; animation:happy-shadow 1s ease-in-out infinite; }
        .happy-arm-l { transform-origin:3.5px 10.5px; animation:happy-arm-l .5s ease-in-out infinite alternate; }
        .happy-arm-r { transform-origin:18.5px 10.5px; animation:happy-arm-r .5s ease-in-out infinite alternate; }
        .happy-spark { opacity:0; }
        .happy-sp1 { animation:happy-spark-flash 1.5s step-end infinite; animation-delay:0s; }
        .happy-sp2 { animation:happy-spark-flash 1.5s step-end infinite; animation-delay:.5s; }
        .happy-sp3 { animation:happy-spark-flash 1.5s step-end infinite; animation-delay:1s; }
        .happy-sp4 { animation:happy-spark-flash 1.5s step-end infinite; animation-delay:.75s; }
        @keyframes happy-jump { 0%,100%{transform:translateY(0) scaleY(1)} 12%{transform:translateY(0) scaleY(.86)} 30%{transform:translateY(-7px) scaleY(1.07)} 50%{transform:translateY(-8px) scaleY(1)} 70%{transform:translateY(-7px) scaleY(1.07)} 88%{transform:translateY(0) scaleY(.86)} }
        @keyframes happy-shadow { 0%,100%{transform:scaleX(1);opacity:.35} 30%,70%{transform:scaleX(.4);opacity:.07} }
        @keyframes happy-arm-l { from{transform:rotate(-55deg)} to{transform:rotate(-65deg)} }
        @keyframes happy-arm-r { from{transform:rotate(55deg)} to{transform:rotate(65deg)} }
        @keyframes happy-spark-flash { 0%{opacity:0} 10%{opacity:1} 30%{opacity:0} 100%{opacity:0} }
      `}</style>
    </defs>
    <g className='happy-spark happy-sp1' fill='#FFD700'><rect x='1' y='4' width='1' height='1' /><rect x='0' y='5' width='3' height='0.5' /><rect x='1' y='6' width='1' height='1' /></g>
    <g className='happy-spark happy-sp2' fill='#FF9F3F'><rect x='19' y='2' width='1' height='1' /><rect x='18' y='3' width='3' height='0.5' /><rect x='19' y='4' width='1' height='1' /></g>
    <g className='happy-spark happy-sp3' fill='#FFF59D'><rect x='20' y='11' width='1' height='1' /><rect x='19' y='12' width='3' height='0.5' /><rect x='20' y='13' width='1' height='1' /></g>
    <g className='happy-spark happy-sp4' fill='#FFB3C6'><rect x='-2' y='10' width='1' height='1' /><rect x='-3' y='11' width='3' height='0.5' /><rect x='-2' y='12' width='1' height='1' /></g>
    <ellipse className='happy-shadow' cx='11' cy='22.5' rx='4' ry='0.6' fill='#c0c0c0' />
    <g className='happy-body'>
      <g className='happy-arm-l'><rect x='2' y='9' width='3' height='3' rx='0.5' fill='#8891b8' opacity='0.8' transform='rotate(45 3.5 10.5)' /></g>
      <g className='happy-arm-r'><rect x='17' y='9' width='3' height='3' rx='0.5' fill='#8891b8' opacity='0.8' transform='rotate(45 18.5 10.5)' /></g>
      <rect x='5' y='6' width='12' height='12' rx='6' fill='#97A0C5' />
      <polygon points='11,1 15,7 7,7' fill='#FF6B35' stroke='rgba(255,255,255,0.4)' strokeWidth='0.5' strokeLinejoin='round' />
      <rect x='10' y='2' width='1' height='1' fill='#e8714a' />
      <path d='M9 10.5 Q10 9.2 11 10.5' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' fill='none' />
      <path d='M11 10.5 Q12 9.2 13 10.5' stroke='#111827' strokeWidth='1.1' strokeLinecap='round' fill='none' />
      <ellipse cx='8' cy='12.5' rx='1.2' ry='0.7' fill='#e08090' opacity='0.5' />
      <ellipse cx='14' cy='12.5' rx='1.2' ry='0.7' fill='#e08090' opacity='0.5' />
      <path d='M8 13 Q11 17.5 14 13' stroke='#111827' strokeWidth='1.2' strokeLinecap='round' fill='none' />
    </g>
  </svg>
);

export default HappyPet;
