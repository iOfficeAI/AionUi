/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const BuildingPet = () => (
  <svg viewBox='-18 -18 58 58' fill='none' xmlns='http://www.w3.org/2000/svg' style={{ width: '100%', height: '100%' }}>
    <defs>
      <style>{`
        .bd-all { transform-origin:11px 17px; animation:bd-bounce .55s cubic-bezier(.36,.07,.19,.97) infinite; }
        .bd-gear { transform-origin:19px 8px; animation:bd-spin 2s linear infinite; }
        .bd-block-l { transform-origin:4px 16px; animation:bd-wobble-l .55s ease-in-out infinite alternate; }
        .bd-block-r { transform-origin:18px 16px; animation:bd-wobble-r .55s ease-in-out infinite alternate; }
        .bd-spark1 { animation:bd-spark 1s ease-out infinite; animation-delay:0s; }
        .bd-spark2 { animation:bd-spark 1s ease-out infinite; animation-delay:.33s; }
        .bd-spark3 { animation:bd-spark 1s ease-out infinite; animation-delay:.66s; }
        .bd-shadow { transform-origin:11px 25px; animation:bd-shadow .55s cubic-bezier(.36,.07,.19,.97) infinite; }
        @keyframes bd-bounce { 0%,100%{transform:translateY(0) scaleY(1) scaleX(1)} 30%{transform:translateY(-3px) scaleY(1.06) scaleX(.95)} 60%{transform:translateY(1.5px) scaleY(.94) scaleX(1.05)} }
        @keyframes bd-spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes bd-wobble-l { from{transform:rotate(-10deg) translateY(0)} to{transform:rotate(5deg) translateY(-2px)} }
        @keyframes bd-wobble-r { from{transform:rotate(10deg) translateY(-2px)} to{transform:rotate(-5deg) translateY(0)} }
        @keyframes bd-spark { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(3px,-6px) scale(.2);opacity:0} }
        @keyframes bd-shadow { 0%,100%{transform:scaleX(1);opacity:.3} 30%{transform:scaleX(.8);opacity:.15} 60%{transform:scaleX(1.1);opacity:.35} }
      `}</style>
    </defs>
    <ellipse className='bd-shadow' cx='11' cy='25' rx='7' ry='0.75' fill='#c0c0c0' />
    <g className='bd-all'>
      <g className='bd-gear'>
        <circle cx='19' cy='8' r='3' fill='none' stroke='#ffc94d' strokeWidth='1.2' />
        <circle cx='19' cy='8' r='1.2' fill='#ffc94d' />
        <rect x='18.3' y='4.5' width='1.4' height='1.2' rx='0.3' fill='#ffc94d' />
        <rect x='18.3' y='10.3' width='1.4' height='1.2' rx='0.3' fill='#ffc94d' />
        <rect x='15.5' y='7.3' width='1.2' height='1.4' rx='0.3' fill='#ffc94d' />
        <rect x='21.3' y='7.3' width='1.2' height='1.4' rx='0.3' fill='#ffc94d' />
      </g>
      <rect className='bd-spark1' x='17' y='12' width='1' height='1' rx='0.3' fill='#FFD700' />
      <rect className='bd-spark2' x='19' y='14' width='0.8' height='0.8' rx='0.2' fill='#FF9500' />
      <rect className='bd-spark3' x='15' y='13' width='0.7' height='0.7' rx='0.2' fill='#FFD700' />
      <g className='bd-block-l'>
        <rect x='1' y='13' width='4' height='4' rx='0.8' fill='#7c91e8' />
        <rect x='2.5' y='11.8' width='1' height='1.5' rx='0.4' fill='#7c91e8' />
      </g>
      <g className='bd-block-r'>
        <rect x='17' y='13' width='4' height='4' rx='0.8' fill='#e87c7c' />
        <rect x='18.5' y='11.8' width='1' height='1.5' rx='0.4' fill='#e87c7c' />
      </g>
      <rect x='5' y='6' width='12' height='12' rx='6' fill='#97A0C5' />
      <polygon points='11,1 15,7 7,7' fill='#FF6B35' stroke='rgba(255,255,255,0.4)' strokeWidth='0.5' strokeLinejoin='round' />
      <path d='M9 11 Q11 9.5 13 11' stroke='#111827' strokeWidth='1.2' strokeLinecap='round' fill='none' />
      <path d='M9 14 Q11 16 13 14' stroke='#111827' strokeWidth='0.9' strokeLinecap='round' fill='none' />
    </g>
  </svg>
);

export default BuildingPet;
