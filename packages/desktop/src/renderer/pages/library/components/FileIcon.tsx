/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Finder-style soft-outline file type icon rendered as SVG.
 * Each file type has a unique internal visual pattern for instant recognition.
 */

import React from 'react';

interface FileIconProps {
  ext: string;
  /** px size of the rendered SVG (square bounding box). Default 48. */
  size?: number;
}

// Per-type palette: [bodyFill, foldFill, strokeColor, badgeColor]
const TYPE_PALETTE: Record<string, [string, string, string, string]> = {
  slide: ['#fff5f2', '#ffd6cc', '#f4a492', '#f0866c'],
  doc: ['#f0f6ff', '#c8ddf8', '#84b8f0', '#5a9de0'],
  sheet: ['#f0fbf4', '#b8e8c8', '#6ec494', '#4cb87c'],
  pdf: ['#fff8f0', '#fcd8b0', '#f0a060', '#e8844c'],
  image: ['#f8f3ff', '#dcc8f4', '#b898e4', '#9870d4'],
  code: ['#f0f5ff', '#c0d4f4', '#7098d8', '#4a7cc8'],
  html: ['#f0faff', '#b8e4f8', '#68c0e8', '#3ab0e0'],
  py: ['#fffbf0', '#f0e0a0', '#d4aa30', '#c89c20'],
  js: ['#fffef0', '#f0e870', '#d4c820', '#c8a810'],
  md: ['#f8f8f9', '#e0e0e6', '#b8b8c4', '#8888a0'],
  csv: ['#f0fff8', '#a8ecc8', '#60c890', '#3aac74'],
};

function paletteFor(ext: string): [string, string, string, string] {
  const e = ext.toLowerCase();
  if (['pptx', 'ppt'].includes(e)) return TYPE_PALETTE.slide;
  if (['docx', 'doc', 'txt'].includes(e)) return TYPE_PALETTE.doc;
  if (['xlsx', 'xls'].includes(e)) return TYPE_PALETTE.sheet;
  if (e === 'pdf') return TYPE_PALETTE.pdf;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) return TYPE_PALETTE.image;
  if (e === 'html') return TYPE_PALETTE.html;
  if (e === 'py') return TYPE_PALETTE.py;
  if (['js', 'jsx'].includes(e)) return TYPE_PALETTE.js;
  if (['ts', 'tsx'].includes(e)) return TYPE_PALETTE.code;
  if (['md', 'mmd', 'mermaid', 'mindmap'].includes(e)) return TYPE_PALETTE.md;
  if (e === 'csv') return TYPE_PALETTE.csv;
  return TYPE_PALETTE.doc;
}

function extLabel(ext: string): string {
  return ext.toUpperCase().slice(0, 4);
}

/** Internal content pattern — the visual that makes each type instantly recognizable */
function InternalPattern({ ext }: { ext: string }) {
  const e = ext.toLowerCase();

  if (['pptx', 'ppt'].includes(e)) {
    // Slide thumbnail: rect + title bar + image placeholder
    return (
      <>
        <rect x={8} y={16} width={44} height={30} rx='2.5' fill='white' stroke='#f4a492' strokeWidth='0.8' />
        <rect x={11} y={19} width={20} height={3} rx='1' fill='#ffd6cc' />
        <rect x={11} y={25} width={28} height={2} rx='1' fill='#fde8e3' />
        <rect x={11} y={29} width={22} height={2} rx='1' fill='#fde8e3' />
        <rect x={36} y={22} width={12} height={9} rx='1.5' fill='#fde8e3' stroke='#f4a492' strokeWidth='0.6' />
        <path
          d={`M${36} ${29} L${40} ${25} L${44} ${28} L${48} ${24} L${48} ${31} L${36} ${31}z`}
          fill='#f4a492'
          fillOpacity='0.4'
        />
      </>
    );
  }

  if (['docx', 'doc', 'txt'].includes(e)) {
    // Document: title bar + paragraph lines
    return (
      <>
        <rect x={10} y={17} width={32} height={3.5} rx='1.5' fill='#c8ddf8' />
        <rect x={10} y={24} width={40} height={2} rx='1' fill='#daeaf8' />
        <rect x={10} y={28} width={38} height={2} rx='1' fill='#daeaf8' />
        <rect x={10} y={32} width={28} height={2} rx='1' fill='#daeaf8' />
        <rect x={10} y={38} width={40} height={2} rx='1' fill='#daeaf8' />
        <rect x={10} y={42} width={34} height={2} rx='1' fill='#daeaf8' />
      </>
    );
  }

  if (['xlsx', 'xls'].includes(e)) {
    // Spreadsheet: header row + grid
    return (
      <>
        <rect x={9} y={16} width={44} height={7} rx='1' fill='#c8ecd4' />
        <rect x={9} y={16} width={44} height={30} rx='1' fill='none' stroke='#8ed4a8' strokeWidth='0.8' />
        <line x1={24} y1={16} x2={24} y2={46} stroke='#8ed4a8' strokeWidth='0.7' />
        <line x1={38} y1={16} x2={38} y2={46} stroke='#8ed4a8' strokeWidth='0.7' />
        <line x1={9} y1={23} x2={53} y2={23} stroke='#8ed4a8' strokeWidth='0.7' />
        <line x1={9} y1={30} x2={53} y2={30} stroke='#8ed4a8' strokeWidth='0.7' />
        <line x1={9} y1={37} x2={53} y2={37} stroke='#8ed4a8' strokeWidth='0.7' />
        <rect x={11} y={25} width={10} height={2} rx='1' fill='#a8d8b8' />
        <rect x={25} y={25} width={10} height={2} rx='1' fill='#a8d8b8' />
        <rect x={11} y={32} width={8} height={2} rx='1' fill='#a8d8b8' />
        <rect x={25} y={32} width={12} height={2} rx='1' fill='#a8d8b8' />
      </>
    );
  }

  if (e === 'csv') {
    // CSV: header row + comma-separated data
    return (
      <>
        <rect x={9} y={16} width={44} height={5} rx='1' fill='#c0ecd8' />
        <rect x={11} y={18} width={8} height={2} rx='1' fill='#80d4a8' />
        <rect x={21} y={18} width={8} height={2} rx='1' fill='#80d4a8' />
        <rect x={31} y={18} width={8} height={2} rx='1' fill='#80d4a8' />
        <rect x={11} y={25} width={6} height={1.5} rx='0.75' fill='#b0e4c8' />
        <rect x={21} y={25} width={10} height={1.5} rx='0.75' fill='#b0e4c8' />
        <rect x={31} y={25} width={7} height={1.5} rx='0.75' fill='#b0e4c8' />
        <rect x={11} y={30} width={9} height={1.5} rx='0.75' fill='#b0e4c8' />
        <rect x={21} y={30} width={6} height={1.5} rx='0.75' fill='#b0e4c8' />
        <rect x={31} y={30} width={10} height={1.5} rx='0.75' fill='#b0e4c8' />
        <rect x={11} y={35} width={7} height={1.5} rx='0.75' fill='#b0e4c8' />
        <rect x={21} y={35} width={9} height={1.5} rx='0.75' fill='#b0e4c8' />
        <rect x={31} y={35} width={8} height={1.5} rx='0.75' fill='#b0e4c8' />
      </>
    );
  }

  if (e === 'pdf') {
    // PDF: two-column layout with image placeholder
    return (
      <>
        <rect x={9} y={17} width={20} height={2.5} rx='1' fill='#fcd8b0' />
        <rect x={9} y={22} width={20} height={1.8} rx='0.9' fill='#fde8cc' />
        <rect x={9} y={26} width={18} height={1.8} rx='0.9' fill='#fde8cc' />
        <rect x={9} y={30} width={20} height={1.8} rx='0.9' fill='#fde8cc' />
        <rect x={9} y={34} width={14} height={1.8} rx='0.9' fill='#fde8cc' />
        <rect x={33} y={17} width={20} height={14} rx='2' fill='#fde8cc' stroke='#f0c090' strokeWidth='0.7' />
        <circle cx={37} cy={21} r='2.5' fill='#f0c090' />
        <path
          d={`M${33} ${28} L${38} ${23} L${43} ${27} L${47} ${22} L${53} ${27} L${53} ${31} L${33} ${31}z`}
          fill='#f0c090'
          fillOpacity='0.5'
        />
        <line x1={31} y1={17} x2={31} y2={42} stroke='#fcd8b0' strokeWidth='0.8' />
      </>
    );
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(e)) {
    // Image: mountain + sun landscape
    return (
      <>
        <rect x={9} y={16} width={44} height={30} rx='2.5' fill='white' stroke='#c8aef0' strokeWidth='0.8' />
        <rect x={9} y={16} width={44} height={10} rx='2' fill='#eef5ff' fillOpacity='0.9' />
        <circle cx={20} cy={25} r='5' fill='#fde8a0' stroke='#e8c860' strokeWidth='0.7' />
        <path d={`M${9} ${42} L${20} ${28} L${30} ${38} L${38} ${28} L${53} ${42}z`} fill='#dcc8f0' />
        <path d={`M${9} ${42} L${20} ${28} L${30} ${38}z`} fill='#c8aee0' />
      </>
    );
  }

  if (e === 'html') {
    // HTML: browser window with traffic lights
    return (
      <>
        <rect x={9} y={16} width={44} height={30} rx='2.5' fill='white' stroke='#90d0f0' strokeWidth='0.8' />
        <rect x={9} y={16} width={44} height={7} rx='2.5' fill='#d8f0fc' />
        <circle cx={14} cy={19.5} r='1.5' fill='#f4a8a0' />
        <circle cx={19} cy={19.5} r='1.5' fill='#f8d898' />
        <circle cx={24} cy={19.5} r='1.5' fill='#98e0b0' />
        <rect x={28} y={17.5} width={22} height={4} rx='2' fill='white' fillOpacity='0.7' />
        <rect x={11} y={25} width={40} height={3} rx='1' fill='#b8e4f8' />
        <rect x={11} y={30} width={24} height={8} rx='1' fill='#d8f0fc' />
        <rect x={38} y={30} width={13} height={8} rx='1' fill='#e8f8fe' />
        <rect x={11} y={40} width={28} height={1.5} rx='0.75' fill='#c8e8f8' />
        <rect x={11} y={43} width={22} height={1.5} rx='0.75' fill='#c8e8f8' />
      </>
    );
  }

  if (e === 'py') {
    // Python: simplified snake icon
    return (
      <>
        <path
          d='M18 22 C18 19 22 17 26 17 L32 17 C36 17 38 19 38 22 L38 26 C38 28 36 29 34 29 L22 29 C18 29 16 31 16 34 L16 38 C16 41 18 43 22 43 L28 43 C32 43 34 41 34 38'
          stroke='#d4aa30'
          strokeWidth='2'
          fill='none'
          strokeLinecap='round'
        />
        <circle cx='34' cy='20' r='1.5' fill='#d4aa30' />
        <circle cx='18' cy='40' r='1.5' fill='#4584d4' />
        <path
          d='M34 22 C34 19 30 17 26 17'
          stroke='#4584d4'
          strokeWidth='2'
          fill='none'
          strokeLinecap='round'
          opacity='0.6'
        />
        <path
          d='M18 38 C18 41 22 43 26 43'
          stroke='#4584d4'
          strokeWidth='2'
          fill='none'
          strokeLinecap='round'
          opacity='0.6'
        />
      </>
    );
  }

  if (['js', 'jsx'].includes(e)) {
    // JS: logo color block
    return (
      <>
        <rect x={11} y={16} width={40} height={30} rx='3' fill='#f8f0a0' />
        <text
          x='31'
          y='39'
          textAnchor='middle'
          fontSize='22'
          fontWeight='800'
          fill='#b8a010'
          fontFamily='-apple-system,sans-serif'
          opacity='0.8'
        >
          JS
        </text>
      </>
    );
  }

  if (['ts', 'tsx'].includes(e)) {
    // TS: logo color block
    return (
      <>
        <rect x={11} y={16} width={40} height={30} rx='3' fill='#dce8fc' />
        <text
          x='31'
          y='39'
          textAnchor='middle'
          fontSize='22'
          fontWeight='800'
          fill='#5584d0'
          fontFamily='-apple-system,sans-serif'
          opacity='0.7'
        >
          TS
        </text>
      </>
    );
  }

  if (['md', 'mmd', 'mermaid', 'mindmap'].includes(e)) {
    // Markdown: # heading + lines
    return (
      <>
        <rect x={9} y={16} width={5} height={4.5} rx='1' fill='#c8c8d4' />
        <rect x={16} y={17} width={22} height={3} rx='1' fill='#c8c8d4' />
        <rect x={9} y={25} width={8} height={2.5} rx='1' fill='#d8d8e0' />
        <rect x={19} y={25.5} width={16} height={2} rx='1' fill='#d8d8e0' />
        <rect x={9} y={31} width={42} height={1.8} rx='0.9' fill='#e0e0e8' />
        <rect x={9} y={35} width={36} height={1.8} rx='0.9' fill='#e0e0e8' />
        <rect x={9} y={39} width={40} height={1.8} rx='0.9' fill='#e0e0e8' />
        <rect x={9} y={43} width={28} height={1.8} rx='0.9' fill='#e0e0e8' />
      </>
    );
  }

  // fallback: generic doc lines
  return (
    <>
      <rect x={10} y={20} width={36} height={2} rx='1' fill='#daeaf8' />
      <rect x={10} y={26} width={40} height={2} rx='1' fill='#daeaf8' />
      <rect x={10} y={32} width={30} height={2} rx='1' fill='#daeaf8' />
      <rect x={10} y={38} width={36} height={2} rx='1' fill='#daeaf8' />
    </>
  );
}

const FileIcon: React.FC<FileIconProps> = ({ ext, size = 48 }) => {
  const e = ext.toLowerCase();
  const [bodyFill, foldFill, strokeColor, badgeColor] = paletteFor(e);
  const label = extLabel(e);

  // Badge font size scales with icon size (viewBox is 64×76)
  const badgeFontSize = 8;

  return (
    <svg
      width={size}
      height={Math.round((size * 76) / 64)}
      viewBox='0 0 64 76'
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      {/* file body */}
      <path d='M5 0h40l15 15v57a4 4 0 01-4 4H5a4 4 0 01-4-4V4a4 4 0 014-4z' fill={bodyFill} />
      {/* fold fill */}
      <path d='M45 0l15 15H49a4 4 0 01-4-4V0z' fill={foldFill} />
      {/* file border */}
      <path
        d='M5 0h40l15 15v57a4 4 0 01-4 4H5a4 4 0 01-4-4V4a4 4 0 014-4z'
        stroke={strokeColor}
        strokeWidth='0.9'
        fill='none'
      />
      {/* fold border */}
      <path d='M45 0l15 15H49a4 4 0 01-4-4V0z' stroke={strokeColor} strokeWidth='0.9' fill='none' />

      {/* internal content pattern */}
      <InternalPattern ext={e} />

      {/* ext badge */}
      <rect x='8' y='54' width='34' height='13' rx='3.5' fill={badgeColor} />
      <text
        x='25'
        y='64'
        textAnchor='middle'
        fontSize={badgeFontSize}
        fontWeight='700'
        fill='white'
        fontFamily='-apple-system,BlinkMacSystemFont,sans-serif'
        letterSpacing='0.5'
      >
        {label}
      </text>
    </svg>
  );
};

export default FileIcon;
