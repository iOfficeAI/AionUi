import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ShadowView from '@/renderer/components/Markdown/ShadowView';

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue(''),
  },
}));

describe('ShadowView markdown spacing styles', () => {
  it('keeps heading reset while restoring paragraph and pre spacing', async () => {
    const { container } = render(
      <ShadowView>
        <div className='markdown-shadow-body'>
          <p>first paragraph</p>
          <p>second paragraph</p>
          <pre>code</pre>
        </div>
      </ShadowView>
    );

    const host = container.querySelector('.markdown-shadow') as HTMLDivElement;
    expect(host).toBeTruthy();

    await waitFor(() => {
      expect(host.shadowRoot).toBeTruthy();
      expect(host.shadowRoot?.querySelector('style')).toBeTruthy();
    });

    const styleText = host.shadowRoot?.querySelector('style')?.textContent ?? '';

    expect(styleText).toContain('h1,h2,h3,h4,h5,h6{');
    expect(styleText).not.toContain('h1,h2,h3,h4,h5,h6,p,pre{');
    expect(styleText).toContain('.markdown-shadow-body p {');
    expect(styleText).toContain('margin-block-start: 10px;');
    expect(styleText).toContain('margin-block-end: 10px;');
    expect(styleText).toContain('pre {');
    expect(styleText).toContain('margin-block-start: 8px;');
    expect(styleText).toContain('margin-block-end: 8px;');
  });
});
