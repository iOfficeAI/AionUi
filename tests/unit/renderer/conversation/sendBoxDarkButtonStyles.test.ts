import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = resolve(__dirname, '../../../../packages/desktop/src/renderer/components/chat/SendBox/sendbox.css');
const tsxPath = resolve(__dirname, '../../../../packages/desktop/src/renderer/components/chat/SendBox/index.tsx');
const css = readFileSync(cssPath, 'utf8');
const tsx = readFileSync(tsxPath, 'utf8');

const getRuleBodyContainingSelector = (selector: string): string => {
  const rules = css.match(/[^{}]+\{[^}]+\}/g) ?? [];
  const rule = rules.find((candidate) => candidate.slice(0, candidate.indexOf('{')).includes(selector));
  return rule?.slice(rule.indexOf('{') + 1, -1) ?? '';
};

describe('SendBox action button styles', () => {
  it('keeps disabled send and draft buttons synchronized in dark mode', () => {
    const sendBody = getRuleBodyContainingSelector(
      "html[data-theme='dark'] body .sendbox-panel .send-button-custom--disabled.arco-btn:disabled"
    );
    const draftBody = getRuleBodyContainingSelector(
      "html[data-theme='dark'] body .sendbox-panel .sendbox-draft-tool-action--disabled.arco-btn-secondary:disabled"
    );

    expect(sendBody).toContain('background-color: var(--bg-4)');
    expect(sendBody).toContain('color: var(--text-disabled)');
    expect(draftBody).toContain('background-color: var(--bg-4)');
    expect(draftBody).toContain('color: var(--text-disabled)');
  });

  it('keeps active send and draft buttons synchronized', () => {
    const sendBody = getRuleBodyContainingSelector('.send-button-custom--enabled.arco-btn');
    const draftBody = getRuleBodyContainingSelector('.sendbox-draft-tool-action--enabled.arco-btn-secondary');

    expect(sendBody).toContain('background-color: rgb(var(--primary-6))');
    expect(sendBody).toContain('color: var(--text-white)');
    expect(draftBody).toContain('background-color: rgb(var(--primary-6))');
    expect(draftBody).toContain('color: var(--text-white)');
  });

  it('prevents the send button from drawing a square primary background', () => {
    const layoutBody = getRuleBodyContainingSelector('.send-button-custom.arco-btn');

    expect(layoutBody).toContain('border-radius: 50%');
    expect(layoutBody).toContain('clip-path: circle(50% at 50% 50%)');
    expect(tsx).toContain("type='text'");
    expect(tsx).not.toContain('<ArrowUp');
  });
});
