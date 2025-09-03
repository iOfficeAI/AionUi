import { parseAuto } from '../../themes/yaml-utils';
import type { ThemePack } from '../types';

export async function loadYamlPreset(text: string): Promise<ThemePack | null> {
  const data = parseAuto(text);
  if (!data) return null;
  if (!data.id || !data.light || !data.dark) return null;
  return data as ThemePack;
}
