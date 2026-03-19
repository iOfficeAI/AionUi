/**
 * Convert LaTeX-style math delimiters to dollar-sign delimiters
 * that remark-math can process.
 *
 * \[...\] → $$...$$ (block display math)
 * \(...\) → $...$  (inline math)
 *
 * Content inside fenced code blocks (``` or ~~~) and inline code spans (`)
 * is preserved unchanged.
 */
export function convertLatexDelimiters(text: string): string {
  const segments: string[] = [];
  let pos = 0;

  // Match fenced code blocks (``` or ~~~) and inline code spans
  const codeRegex = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g;

  let match;
  while ((match = codeRegex.exec(text)) !== null) {
    // Process text before this code segment
    if (match.index > pos) {
      segments.push(replaceDelimiters(text.slice(pos, match.index)));
    }
    // Keep code segment unchanged
    segments.push(match[0]);
    pos = match.index + match[0].length;
  }

  // Process remaining text after last code segment
  if (pos < text.length) {
    segments.push(replaceDelimiters(text.slice(pos)));
  }

  return segments.join('');
}

function replaceDelimiters(text: string): string {
  // Replace \[...\] with $$...$$ (block display math, supports multiline)
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, content: string) => `$$${content}$$`);
  // Replace \(...\) with $...$ (inline math)
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_match, content: string) => `$${content}$`);
  return text;
}
