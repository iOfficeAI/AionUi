import zhCN from '@/renderer/i18n/locales/zh-CN.json';

export type FlatDict = Record<string, string | number | boolean | object | null>;

function isObject(val: any): val is Record<string, any> {
  return val && typeof val === 'object' && !Array.isArray(val);
}

export function flattenKeys(obj: Record<string, any>, prefix = ''): string[] {
  const out: string[] = [];
  Object.keys(obj || {}).forEach((k) => {
    const full = prefix ? `${prefix}.${k}` : k;
    const v = (obj as any)[k];
    if (isObject(v)) out.push(...flattenKeys(v, full));
    else out.push(full);
  });
  return out;
}

// Use zh-CN as canonical key source
export function getAllI18nKeys(): string[] {
  try {
    return flattenKeys(zhCN as any);
  } catch {
    return [];
  }
}
