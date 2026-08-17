export type SkillType = 'security' | 'implementation' | 'planning' | 'productivity' | 'other';

export type SkillGroup = {
  id: string;
  name: string;
  skillNames: string[];
};

export type SkillOrganization = {
  groups: SkillGroup[];
};

type SearchableSkill = {
  name: string;
  description: string;
};

const TYPE_PATTERNS: Record<Exclude<SkillType, 'other'>, RegExp> = {
  security:
    /\b(security|secure|auth(?:entication|orization)?|credential|crypt|vulnerab|penetration|owasp|xss|csrf|sqli)\b/i,
  implementation: /\b(implement|implementation|build|coding?|develop|api|integration|database|deploy|debug)\b/i,
  planning: /\b(plan(?:ning)?|architect(?:ure)?|design|roadmap|project|requirement|review)\b/i,
  productivity: /\b(productivity|office|document|spreadsheet|presentation|email|calendar|meeting|task)\b/i,
};

const normalizeName = (name: string): string => name.trim();

export const classifySkill = (skill: SearchableSkill): SkillType => {
  const text = `${skill.name} ${skill.description}`;
  for (const [type, pattern] of Object.entries(TYPE_PATTERNS) as Array<[Exclude<SkillType, 'other'>, RegExp]>) {
    if (pattern.test(text)) return type;
  }
  return 'other';
};

export const filterAndSortSkills = <TSkill extends SearchableSkill>(
  skills: TSkill[],
  query: string,
  type?: SkillType
): TSkill[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return skills
    .filter((skill) => {
      const matchesQuery =
        !normalizedQuery ||
        skill.name.toLocaleLowerCase().includes(normalizedQuery) ||
        skill.description.toLocaleLowerCase().includes(normalizedQuery);
      return matchesQuery && (!type || classifySkill(skill) === type);
    })
    .toSorted((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
};

export const parseSkillOrganization = (value: unknown): SkillOrganization => {
  if (!value || typeof value !== 'object' || !Array.isArray((value as SkillOrganization).groups)) return { groups: [] };

  const ids = new Set<string>();
  const groups: SkillGroup[] = [];
  for (const group of (value as SkillOrganization).groups) {
    if (!group || typeof group !== 'object' || typeof group.id !== 'string' || typeof group.name !== 'string') continue;
    const id = group.id.trim();
    const name = normalizeName(group.name);
    if (!id || !name || ids.has(id)) continue;
    ids.add(id);
    const skillNames = Array.isArray(group.skillNames)
      ? Array.from(
          new Set(
            group.skillNames.filter(
              (skillName): skillName is string => typeof skillName === 'string' && !!skillName.trim()
            )
          )
        )
      : [];
    groups.push({ id, name, skillNames });
  }
  return { groups };
};

export const createSkillGroup = (name: string, id: string): SkillGroup => ({
  id,
  name: normalizeName(name),
  skillNames: [],
});
