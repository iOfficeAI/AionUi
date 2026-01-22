const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const WIDTH = 1080;
const HEIGHT = 1440;
const PADDING = 80;

// Colors (Systemic Flux Palette)
const COLORS = {
  bg: '#0D0E12', // Deep Charcoal/Black
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A0',
  accent1: '#00FF94', // Neon Green (Success/Active)
  accent2: '#5E5CE6', // Indigo (Processing)
  grid: '#2A2A2A',
  surface: '#1A1B20',
};

// Font Paths - Try multiple locations with fallback
// Priority: 1) AIONUI_FONTS_DIR env var, 2) skills/canvas-design relative path, 3) system fonts
function getFontDir() {
  const candidates = [process.env.AIONUI_FONTS_DIR, path.join(__dirname, '../../canvas-design/canvas-fonts'), path.join(process.env.HOME || '', 'Library/Application Support/AionUi/config/skills/canvas-design/canvas-fonts'), path.join(process.env.APPDATA || '', 'AionUi/config/skills/canvas-design/canvas-fonts')].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

const FONT_DIR = getFontDir();
const FONTS = FONT_DIR
  ? {
      monoBold: path.join(FONT_DIR, 'JetBrainsMono-Bold.ttf'),
      monoReg: path.join(FONT_DIR, 'JetBrainsMono-Regular.ttf'),
      sansReg: path.join(FONT_DIR, 'InstrumentSans-Regular.ttf'),
      sansBold: path.join(FONT_DIR, 'InstrumentSans-Bold.ttf'),
    }
  : null;

// Register Fonts (skip if fonts not found - will use system defaults)
if (FONTS) {
  try {
    registerFont(FONTS.monoBold, { family: 'Mono', weight: 'bold' });
    registerFont(FONTS.monoReg, { family: 'Mono', weight: 'normal' });
    registerFont(FONTS.sansReg, { family: 'Sans', weight: 'normal' });
    registerFont(FONTS.sansBold, { family: 'Sans', weight: 'bold' });
  } catch (e) {
    console.warn('Custom fonts not available, using system defaults:', e.message);
  }
} else {
  console.warn('Font directory not found, using system default fonts');
}

// --- Helpers ---

function drawGrid(ctx, w, h, step = 60) {
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Add some "data points" - crosses at intersections
  ctx.fillStyle = COLORS.textSecondary;
  for (let x = step; x < w; x += step * 4) {
    for (let y = step; y < h; y += step * 4) {
      ctx.fillRect(x - 2, y - 1, 4, 2);
      ctx.fillRect(x - 1, y - 2, 2, 4);
    }
  }
}

function drawParagraph(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = text.split('');
  let line = '';
  let currentY = y;

  for (let i = 0; i < chars.length; i++) {
    let char = chars[i];
    if (/[a-zA-Z0-9@]/.test(char)) {
      let word = char;
      while (i + 1 < chars.length && /[a-zA-Z0-9@.]/.test(chars[i + 1])) {
        word += chars[++i];
      }
      char = word;
    }

    const testLine = line + char;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line !== '') {
      ctx.fillText(line, x, currentY);
      line = char;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY + lineHeight;
}

function drawTechDecoration(ctx) {
  ctx.fillStyle = COLORS.surface;
  ctx.strokeStyle = COLORS.textSecondary;
  ctx.lineWidth = 1;
  ctx.strokeRect(WIDTH - 250, 40, 210, 60);

  ctx.font = 'bold 16px Mono';
  ctx.fillStyle = COLORS.accent1;
  ctx.fillText('STATUS: ONLINE', WIDTH - 230, 75);
  ctx.fillStyle = COLORS.accent1;
  ctx.beginPath();
  ctx.arc(WIDTH - 60, 70, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.accent2;
  ctx.fillRect(40, HEIGHT - 50, 40, 40);
  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = '14px Mono';
  ctx.fillText('SYS.VER.2026.01', 90, HEIGHT - 25);
}

// --- Image 1: Cover ---
function generateCover(title1, title2, slogan1, slogan2) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGrid(ctx, WIDTH, HEIGHT);
  drawTechDecoration(ctx);

  ctx.fillStyle = COLORS.accent1;
  ctx.font = 'bold 24px Mono';
  ctx.fillText('// WE ARE HIRING', PADDING, 300);

  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 100px Mono';
  ctx.fillText(title1 || 'AGENT', PADDING, 420);
  ctx.fillText(title2 || 'DESIGNER', PADDING, 520);

  const cx = WIDTH / 2;
  const cy = HEIGHT / 2 + 150;

  ctx.strokeStyle = COLORS.accent2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 150, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = COLORS.accent1;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.arc(cx, cy, 170, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = COLORS.textSecondary;
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * 150, cy + Math.sin(angle) * 150);
    ctx.lineTo(cx + Math.cos(angle) * 300, cy + Math.sin(angle) * 300);
    ctx.stroke();

    ctx.fillStyle = COLORS.surface;
    ctx.fillRect(cx + Math.cos(angle) * 300 - 10, cy + Math.sin(angle) * 300 - 10, 20, 20);
    ctx.strokeRect(cx + Math.cos(angle) * 300 - 10, cy + Math.sin(angle) * 300 - 10, 20, 20);
  }

  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'normal 48px Sans';
  ctx.fillText(slogan1 || '寻找未来的定义者', PADDING, HEIGHT - 200);

  ctx.fillStyle = COLORS.textSecondary;
  ctx.font = 'normal 32px Sans';
  ctx.fillText(slogan2 || 'Redefine the Human-AI Interaction', PADDING, HEIGHT - 150);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('cover.png', buffer);
  console.log('Created cover.png');
}

// --- Image 2: JD ---
function generateJD(roleTitle, roleDesc, responsibilities, requirements, email) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.globalAlpha = 0.3;
  drawGrid(ctx, WIDTH, HEIGHT);
  ctx.globalAlpha = 1.0;

  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(0, 0, WIDTH, 200);

  ctx.fillStyle = COLORS.accent1;
  ctx.font = 'bold 20px Mono';
  ctx.fillText('// OPEN POSITION', PADDING, 60);

  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 60px Mono';
  ctx.fillText(roleTitle || 'AGENT DESIGNER', PADDING, 140);

  let cursorY = 260;
  const contentWidth = WIDTH - PADDING * 2;

  // 1. Role Description
  ctx.fillStyle = COLORS.accent2;
  ctx.font = 'bold 32px Mono';
  ctx.fillText('< ROLE >', PADDING, cursorY);
  cursorY += 50;

  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'normal 30px Sans';
  cursorY = drawParagraph(ctx, roleDesc, PADDING, cursorY, contentWidth, 45);
  cursorY += 40;

  // 2. Responsibilities
  ctx.fillStyle = COLORS.accent2;
  ctx.font = 'bold 32px Mono';
  ctx.fillText('< RESPONSIBILITIES >', PADDING, cursorY);
  cursorY += 50;

  ctx.font = 'normal 28px Sans';
  (responsibilities || []).forEach((duty) => {
    ctx.fillStyle = COLORS.textPrimary;
    cursorY = drawParagraph(ctx, duty, PADDING, cursorY, contentWidth, 40);
    cursorY += 10;
  });
  cursorY += 30;

  // 3. Requirements
  ctx.fillStyle = COLORS.accent2;
  ctx.font = 'bold 32px Mono';
  ctx.fillText('< REQUIREMENTS >', PADDING, cursorY);
  cursorY += 50;

  (requirements || []).forEach((req) => {
    ctx.fillStyle = COLORS.textPrimary;
    cursorY = drawParagraph(ctx, req, PADDING, cursorY, contentWidth, 40);
    cursorY += 10;
  });
  cursorY += 30;

  // 4. Contact Box
  const boxY = HEIGHT - 250;
  ctx.strokeStyle = COLORS.accent1;
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.strokeRect(PADDING, boxY, contentWidth, 150);
  ctx.setLineDash([]);

  ctx.fillStyle = COLORS.surface;
  ctx.fillRect(PADDING, boxY, contentWidth, 150);

  ctx.fillStyle = COLORS.accent1;
  ctx.font = 'bold 24px Mono';
  ctx.fillText('APPLY NOW >>', PADDING + 30, boxY + 50);

  ctx.fillStyle = COLORS.textPrimary;
  ctx.font = 'bold 40px Sans';
  ctx.fillText(email || 'contact@example.com', PADDING + 30, boxY + 110);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('jd_details.png', buffer);
  console.log('Created jd_details.png');
}

// --- Main execution ---
// Defaults
const defaults = {};

// You could parse process.argv here to override defaults if needed
// For now, we'll use the hardcoded structure or let the user edit this file.

generateCover(defaults.title1, defaults.title2, defaults.slogan1, defaults.slogan2);
generateJD(defaults.roleTitle, defaults.roleDesc, defaults.responsibilities, defaults.requirements, defaults.email);
