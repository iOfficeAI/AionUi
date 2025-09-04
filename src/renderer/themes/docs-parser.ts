// Parse design variable markdown tables to extract CSS variable keys.
// Expected table columns: | 名称键 | 显示值 | CSS变量 | 说明 |

export function parseDesignVariablesFromMarkdown(md: string): string[] {
  const lines = md.split(/\r?\n/);
  const vars: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    // Split by | and trim
    const parts = line
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    // Skip header/separator rows
    if (parts.length < 3) continue;
    if (/^-+$/.test(parts[0])) continue;
    // Try find a token that looks like a CSS variable (e.g., --primary-6)
    const cssVar = parts.find((p) => /--[a-zA-Z0-9_-]+/.test(p));
    if (cssVar) {
      const m = cssVar.match(/--[a-zA-Z0-9_-]+/);
      if (m) vars.push(m[0]);
    }
  }
  // Unique
  return Array.from(new Set(vars));
}

// Normalize keys from dark doc: dark-xxx -> --xxx
export function normalizeDarkKeys(keys: string[]): string[] {
  return keys.map((k) => (k.startsWith('--dark-') ? `--${k.slice(7)}` : k));
}
