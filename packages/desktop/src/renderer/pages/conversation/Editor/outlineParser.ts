/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lightweight regex-based outline extractor for the active buffer. Monaco
 * doesn't expose `DocumentSymbolProvider` results via public API, so we
 * scan the source ourselves for the common language families. Per-language
 * rules are intentionally simple — this is a fast "feels like an IDE
 * outline" win, not a parser. False positives are fine; the line numbers
 * are what matter (clicking jumps to that line).
 */

export type OutlineKind = 'function' | 'class' | 'interface' | 'type' | 'const' | 'method' | 'struct' | 'enum' | 'rule';

export type OutlineSymbol = {
  kind: OutlineKind;
  name: string;
  /** 1-based line number in the source. */
  line: number;
};

type Rule = { kind: OutlineKind; re: RegExp };

const TS_RULES: Rule[] = [
  { kind: 'class', re: /^\s*(?:export\s+(?:default\s+)?|abstract\s+)*class\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'interface', re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'type', re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/ },
  { kind: 'enum', re: /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/ },
  { kind: 'function', re: /^\s*(?:export\s+(?:default\s+)?|async\s+)*function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { kind: 'const', re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/ },
  { kind: 'const', re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/ },
  { kind: 'method', re: /^\s{2,}(?:public|private|protected|static|async|readonly|\*)?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[{:]/ },
];

const PY_RULES: Rule[] = [
  { kind: 'class', re: /^\s*class\s+([A-Za-z_][\w]*)/ },
  { kind: 'function', re: /^\s*(?:async\s+)?def\s+([A-Za-z_][\w]*)/ },
];

const RS_RULES: Rule[] = [
  { kind: 'struct', re: /^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?struct\s+([A-Za-z_][\w]*)/ },
  { kind: 'enum', re: /^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?enum\s+([A-Za-z_][\w]*)/ },
  { kind: 'interface', re: /^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?trait\s+([A-Za-z_][\w]*)/ },
  { kind: 'class', re: /^\s*impl(?:\s*<[^>]+>)?\s+(?:[A-Za-z_:][\w:<>'\s,]*\s+for\s+)?([A-Za-z_][\w]*)/ },
  { kind: 'function', re: /^\s*(?:pub\s+(?:\([^)]*\)\s+)?)?(?:async\s+)?fn\s+([A-Za-z_][\w]*)/ },
  { kind: 'type', re: /^\s*(?:pub\s+)?type\s+([A-Za-z_][\w]*)/ },
];

const GO_RULES: Rule[] = [
  { kind: 'function', re: /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_][\w]*)/ },
  { kind: 'struct', re: /^\s*type\s+([A-Za-z_][\w]*)\s+struct\b/ },
  { kind: 'interface', re: /^\s*type\s+([A-Za-z_][\w]*)\s+interface\b/ },
  { kind: 'type', re: /^\s*type\s+([A-Za-z_][\w]*)\s+/ },
];

const JAVA_RULES: Rule[] = [
  { kind: 'class', re: /^\s*(?:public|private|protected|abstract|final|static|\s)*class\s+([A-Za-z_][\w]*)/ },
  { kind: 'interface', re: /^\s*(?:public|private|protected|abstract|\s)*interface\s+([A-Za-z_][\w]*)/ },
  { kind: 'enum', re: /^\s*(?:public|private|protected|\s)*enum\s+([A-Za-z_][\w]*)/ },
  { kind: 'method', re: /^\s+(?:public|private|protected|static|final|abstract|synchronized|\s)+[\w<>,?[\]\s]+\s+([A-Za-z_][\w]*)\s*\(/ },
];

const CSS_RULES: Rule[] = [
  { kind: 'rule', re: /^\s*(\.[\w-]+|#[\w-]+|@[\w-]+|:\w+(?:-\w+)*|[a-z]+)[^{]*\{/ },
];

const JSON_RULES: Rule[] = [
  { kind: 'const', re: /^\s*"([^"]+)"\s*:\s*[[{]/ },
];

const RULES_BY_LANG: Record<string, Rule[]> = {
  typescript: TS_RULES,
  javascript: TS_RULES,
  tsx: TS_RULES,
  jsx: TS_RULES,
  python: PY_RULES,
  rust: RS_RULES,
  go: GO_RULES,
  java: JAVA_RULES,
  kotlin: JAVA_RULES,
  csharp: JAVA_RULES,
  cpp: JAVA_RULES,
  c: JAVA_RULES,
  css: CSS_RULES,
  scss: CSS_RULES,
  less: CSS_RULES,
  json: JSON_RULES,
};

const MAX_LINES = 5000;
const MAX_SYMBOLS = 500;

export function extractOutline(language: string, source: string): OutlineSymbol[] {
  const rules = RULES_BY_LANG[language];
  if (!rules || !source) return [];

  const lines = source.split(/\r?\n/);
  const scan = Math.min(lines.length, MAX_LINES);
  const out: OutlineSymbol[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < scan && out.length < MAX_SYMBOLS; i += 1) {
    const line = lines[i];
    // Skip obvious comment-only lines so we don't outline `// function foo`.
    if (/^\s*(?:\/\/|#|\/\*|\*)/.test(line)) continue;
    for (const rule of rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const name = m[1];
      if (!name) continue;
      const key = `${name}@${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: rule.kind, name, line: i + 1 });
      break;
    }
  }
  return out;
}

/** Single-char glyph used in the outline list to visually distinguish kinds. */
export function glyphFor(kind: OutlineKind): string {
  switch (kind) {
    case 'function':
    case 'method':
      return 'ƒ';
    case 'class':
      return 'C';
    case 'interface':
      return 'I';
    case 'type':
      return 'T';
    case 'enum':
      return 'E';
    case 'struct':
      return 'S';
    case 'const':
      return '◆';
    case 'rule':
      return '§';
  }
}
