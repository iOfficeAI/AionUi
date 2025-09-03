// 轻量 YAML 工具：为 ThemePack 提供最小的自动识别导入与导出能力
// 说明：为避免额外依赖，这里实现了极简 YAML 解析/序列化，
// 适用于本项目中 ThemePack 的常见结构（不支持复杂数组/多文档/锚点等高级语法）。

export function toYAML(obj: any, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (obj === null) return 'null';
  if (obj === undefined) return 'null';
  if (typeof obj === 'string') {
    // 简单处理：若包含特殊字符，用引号包裹
    if (/[:#\-\n]/.test(obj)) return JSON.stringify(obj);
    return obj;
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map((item) => `${spaces}- ${toYAML(item, indent + 1).replace(/^\s+/g, '')}`).join('\n');
  }
  // object
  const entries = Object.entries(obj);
  if (entries.length === 0) return '{}';
  return entries
    .map(([k, v]) => {
      const key = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) ? k : JSON.stringify(k);
      const val = v !== null && typeof v === 'object' && !Array.isArray(v) ? `\n${'  '.repeat(indent + 1)}${toYAML(v, indent + 1).replace(/^/gm, '  '.repeat(indent + 1))}`.replace(new RegExp(`^${'  '.repeat(indent + 1)}`), '') : toYAML(v, indent + 1);
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) return `${spaces}${key}:\n${'  '.repeat(indent + 1)}${toYAML(v, indent + 1).replace(/^/gm, '  '.repeat(indent + 1))}`.replace(new RegExp(`^${'  '.repeat(indent + 1)}`), '');
      return `${spaces}${key}: ${val}`;
    })
    .join('\n');
}

// 极简 YAML -> Object 解析（仅支持缩进映射、标量、简单数组）
export function fromYAML(yaml: string): any {
  const lines = yaml
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, '  '))
    .filter((l) => l.trim().length > 0 && !l.trim().startsWith('#'));

  type Node = { indent: number; key?: string; value: any; parent?: Node };
  const root: Node = { indent: -1, value: {} };
  let current: Node = root;

  const parseScalar = (s: string) => {
    const trimmed = s.trim();
    if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
    return trimmed;
  };

  const setValue = (parent: Node, key: string, val: any) => {
    if (typeof parent.value !== 'object' || parent.value === null || Array.isArray(parent.value)) parent.value = {};
    parent.value[key] = val;
  };

  for (const raw of lines) {
    const indent = raw.match(/^\s*/)?.[0].length || 0;
    const line = raw.trim();

    while (current && indent <= current.indent) current = current.parent || root;

    if (line.startsWith('- ')) {
      const content = line.slice(2);
      if (!Array.isArray(current.value)) current.value = [];
      if (content.includes(':')) {
        // 映射项
        const [k, ...rest] = content.split(':');
        const v = rest.join(':').trim();
        const obj: any = {};
        if (v) obj[k.trim()] = parseScalar(v);
        (current.value as any[]).push(obj);
      } else {
        (current.value as any[]).push(parseScalar(content));
      }
      continue;
    }

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    const rest = line.slice(idx + 1).trim();

    if (rest === '' || rest === '|' || rest === '>') {
      // 起一段块，后续行会作为子节点加入
      const node: Node = { indent, key, value: {}, parent: current };
      setValue(current, key, node.value);
      current = node;
    } else {
      setValue(current, key, parseScalar(rest));
    }
  }

  return root.value;
}

// 自动识别 JSON/YAML 输入
export function parseAuto(input: string): any {
  try {
    return JSON.parse(input);
  } catch (_err) {
    void 0;
  }
  try {
    return fromYAML(input);
  } catch (_err) {
    void 0;
  }
  return null;
}
