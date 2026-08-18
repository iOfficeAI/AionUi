import {
  MARKDOWN_REMARK_PLUGINS,
  SANITIZED_HTML_REHYPE_PLUGINS,
} from '@/renderer/components/Markdown/markdownComponents';
import { render } from '@testing-library/react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';

// Exercises the EXACT plugin pipeline the preview panel (MarkdownViewer) uses,
// imported from the shared module so removing rehype-sanitize or breaking the
// plugin order fails this test. Guards the two things PR #4079 got wrong:
// (1) math must render, (2) raw HTML must be sanitized.
function renderPreviewMarkdown(md: string) {
  const { container } = render(
    <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} rehypePlugins={SANITIZED_HTML_REHYPE_PLUGINS}>
      {md}
    </ReactMarkdown>
  );
  return container;
}

describe('preview markdown pipeline — math rendering', () => {
  it('renders inline math as a single KaTeX node', () => {
    const c = renderPreviewMarkdown('inline $x + y = z$ here');
    expect(c.querySelectorAll('.katex')).toHaveLength(1);
    // No raw remark-math marker nodes should be left behind (would mean KaTeX did not run).
    expect(c.querySelectorAll('code.math-inline, code.math-display')).toHaveLength(0);
  });

  it('renders a multi-line $$ block as a single KaTeX node (the core PR fix)', () => {
    const c = renderPreviewMarkdown('$$\n\\begin{aligned}\nf(x) &= a \\\\\ng(x) &= b\n\\end{aligned}\n$$');
    expect(c.querySelectorAll('.katex')).toHaveLength(1);
  });

  it('renders inline and block math together without duplication', () => {
    const c = renderPreviewMarkdown('inline $a^2$ and\n\n$$b^2 + c^2$$');
    expect(c.querySelectorAll('.katex')).toHaveLength(2);
  });
});

describe('preview markdown pipeline — raw HTML sanitization', () => {
  it('strips <script> tags', () => {
    const c = renderPreviewMarkdown('before<script>window.__xss = 1</script>after');
    expect(c.querySelectorAll('script')).toHaveLength(0);
  });

  it('strips external <iframe> and srcdoc <iframe>', () => {
    const c = renderPreviewMarkdown(
      ['<iframe src="https://evil.example/x"></iframe>', '', '<iframe srcdoc="<b>x</b>"></iframe>'].join('\n')
    );
    expect(c.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('strips inline event-handler attributes but keeps the element', () => {
    const c = renderPreviewMarkdown('<img src="y" onerror="window.__xss = 1">');
    const img = c.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('onerror')).toBeNull();
  });

  it('drops javascript: URLs from links', () => {
    const c = renderPreviewMarkdown('[click](javascript:alert(1)) and <a href="javascript:alert(2)">raw</a>');
    for (const a of c.querySelectorAll('a')) {
      expect(a.getAttribute('href')).toBeNull();
    }
  });

  it('keeps benign inline HTML', () => {
    const c = renderPreviewMarkdown('<b>bold</b> and <em>emph</em>');
    expect(c.querySelector('b')?.textContent).toBe('bold');
    expect(c.querySelector('em')?.textContent).toBe('emph');
  });

  it('preserves language-* class on code fences for highlighting', () => {
    const c = renderPreviewMarkdown('```ts\nconst a = 1;\n```');
    expect(c.querySelector('code')?.className).toContain('language-ts');
  });
});
