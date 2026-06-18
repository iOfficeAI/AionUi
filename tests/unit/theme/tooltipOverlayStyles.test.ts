import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const arcoOverridePath = path.resolve(process.cwd(), 'packages/desktop/src/renderer/styles/arco-override.css');
const presetDir = path.resolve(
  process.cwd(),
  'packages/desktop/src/renderer/pages/settings/AppearanceSettings/presets'
);

describe('arco tooltip and popover overlay styles', () => {
  it('defines shared light and dark overlay tokens for tooltip-like surfaces', () => {
    const css = fs.readFileSync(arcoOverridePath, 'utf8');

    expect(css).toContain('--aion-overlay-bg: #ffffff;');
    expect(css).toContain('--aion-overlay-text: #1d2129;');
    expect(css).toContain("body[arco-theme='dark'] {");
    expect(css).toContain('--aion-overlay-bg: #0e0e0e;');
    expect(css).toContain('--aion-overlay-text: #f2f3f5;');
  });

  it('applies the shared overlay tokens to tooltip, popover, and popconfirm surfaces', () => {
    const css = fs.readFileSync(arcoOverridePath, 'utf8');

    expect(css).toContain('.arco-tooltip-content,');
    expect(css).toContain('.arco-popover-content,');
    expect(css).toContain('.arco-popconfirm-content {');
    expect(css).toContain('background: var(--aion-overlay-bg) !important;');
    expect(css).toContain('color: var(--aion-overlay-text) !important;');
    expect(css).toContain('border: 1px solid var(--aion-overlay-border) !important;');
    expect(css).toContain('.arco-trigger-arrow.arco-tooltip-arrow,');
    expect(css).toContain('.arco-popover-arrow.arco-trigger-arrow,');
    expect(css).toContain('.arco-popconfirm-arrow.arco-trigger-arrow {');
  });

  it('defines a dark-mode override selector that can beat preset-specific tooltip rules', () => {
    const css = fs.readFileSync(arcoOverridePath, 'utf8');

    expect(css).toContain("html[data-theme='dark'] body .arco-tooltip-content,");
    expect(css).toContain("html[data-theme='dark'] body .arco-popover-content,");
    expect(css).toContain("html[data-theme='dark'] body .arco-popconfirm-content,");
    expect(css).toContain("body[arco-theme='dark'] .arco-popconfirm-content {");
  });

  it('does not skin nested popover wrappers as a second surface', () => {
    const css = fs.readFileSync(arcoOverridePath, 'utf8');

    expect(css).not.toContain('.arco-popover-inner,');
    expect(css).not.toContain('.arco-tooltip-inner,');
  });

  it('keeps decorative preset css from re-skinning tooltip surfaces', () => {
    const presetFiles = ['retro-windows.css', 'misaka-mikoto.css', 'discourse-horizon.css', 'hello-kitty.css'];

    for (const file of presetFiles) {
      const css = fs.readFileSync(path.join(presetDir, file), 'utf8');
      expect(css).not.toContain('.arco-tooltip-inner *');
      expect(css).not.toContain('.arco-popover-inner *');
      expect(css).not.toContain('.arco-popover-content *');
      expect(css).not.toContain("[data-theme='dark'] .arco-tooltip-inner");
      expect(css).not.toContain("[data-theme='dark'] .arco-popover-inner");
      expect(css).not.toContain("[data-theme='dark'] .arco-popover-content");
    }

    const retromaNocturne = fs.readFileSync(path.join(presetDir, 'retroma-nocturne-parchment.css'), 'utf8');
    const retromaObsidianDark = fs.readFileSync(path.join(presetDir, 'retroma-obsidian-book-2-1-dark.css'), 'utf8');

    expect(retromaNocturne).not.toContain('.arco-popover-content,');
    expect(retromaObsidianDark).not.toContain("[data-theme='dark'] .arco-popover-content,");
  });
});
