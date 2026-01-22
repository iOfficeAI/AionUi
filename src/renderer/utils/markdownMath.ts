/**
 * Normalize common LaTeX math delimiters emitted by LLMs.
 *
 * We keep this intentionally conservative:
 * - Converts \(...\) to $...$ and \[...\] to $$...$$.
 * - Avoids touching inline/code-fence content.
 */

const CODE_PLACEHOLDER_PREFIX = '__AIONUI_MD_CODE__';

const extractCodeSegments = (input: string) => {
  const segments: string[] = [];

  // 1) Fenced code blocks
  let working = input.replace(/```[\s\S]*?```/g, (match) => {
    const key = `${CODE_PLACEHOLDER_PREFIX}${segments.length}__`;
    segments.push(match);
    return key;
  });

  // 2) Inline code
  working = working.replace(/`[^`\n]*`/g, (match) => {
    const key = `${CODE_PLACEHOLDER_PREFIX}${segments.length}__`;
    segments.push(match);
    return key;
  });

  return { working, segments };
};

const restoreCodeSegments = (input: string, segments: string[]) => {
  return input.replace(new RegExp(`${CODE_PLACEHOLDER_PREFIX}(\\d+)__`, 'g'), (_m, idx) => {
    const i = Number(idx);
    return Number.isFinite(i) && segments[i] !== undefined ? segments[i] : _m;
  });
};

export const normalizeLatexDelimiters = (markdown: string): string => {
  if (!markdown) return markdown;

  const { working, segments } = extractCodeSegments(markdown);

  // Convert display math \[ ... \] => $$ ... $$
  let result = working.replace(/\\\[([\s\S]*?)\\\]/g, (_m, equation) => {
    return `$$${equation}$$`;
  });

  // Convert inline math \( ... \) => $ ... $
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_m, equation) => {
    return `$${equation}$`;
  });

  return restoreCodeSegments(result, segments);
};
