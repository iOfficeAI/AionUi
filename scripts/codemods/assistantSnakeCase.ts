import { Project, SyntaxKind } from 'ts-morph';

const FIELD_MAP: Record<string, string> = {
  nameI18n: 'name_i18n',
  descriptionI18n: 'description_i18n',
  sortOrder: 'sort_order',
  presetAgentType: 'preset_agent_type',
  enabledSkills: 'enabled_skills',
  customSkillNames: 'custom_skill_names',
  disabledBuiltinSkills: 'disabled_builtin_skills',
  contextI18n: 'context_i18n',
  promptsI18n: 'prompts_i18n',
  lastUsedAt: 'last_used_at',
};

const ASSISTANT_TYPES = new Set([
  'Assistant',
  'CreateAssistantRequest',
  'UpdateAssistantRequest',
  'SetAssistantStateRequest',
  'ImportAssistantsRequest',
  'ImportAssistantsResult',
  'ImportError',
]);

function targetIsAssistantShape(type: import('ts-morph').Type): boolean {
  // Walk union + intersection + array element + promise unwrap
  const flat = type.isArray() ? [type.getArrayElementType()!] : [type];
  for (const t of flat) {
    const sym = t.getSymbol() ?? t.getAliasSymbol();
    if (sym && ASSISTANT_TYPES.has(sym.getName())) return true;
    // Also handle Assistant[] passed into functions
    for (const sub of t.getUnionTypes()) {
      const subSym = sub.getSymbol() ?? sub.getAliasSymbol();
      if (subSym && ASSISTANT_TYPES.has(subSym.getName())) return true;
    }
  }
  return false;
}

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
  skipAddingFilesFromTsConfig: false,
});

let propAccessFlipped = 0;
let objectLiteralFlipped = 0;
let destructureFlipped = 0;

for (const sf of project.getSourceFiles()) {
  if (sf.getFilePath().includes('node_modules')) continue;
  if (sf.getFilePath().endsWith('/assistantTypes.ts')) continue; // already done by hand

  // (a) Property access: x.nameI18n where x has Assistant shape
  sf.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.PropertyAccessExpression) {
      const pae = node.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      const propName = pae.getName();
      if (!FIELD_MAP[propName]) return;
      const recvType = pae.getExpression().getType();
      if (targetIsAssistantShape(recvType)) {
        pae.getNameNode().replaceWithText(FIELD_MAP[propName]);
        propAccessFlipped++;
      }
    }
  });

  // (b) Object literal property assignment: { sortOrder: 5 } when contextual type is Assistant
  sf.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.PropertyAssignment) return;
    const pa = node.asKindOrThrow(SyntaxKind.PropertyAssignment);
    const name = pa.getName();
    if (!FIELD_MAP[name]) return;
    const parentType = pa.getParentIfKind(SyntaxKind.ObjectLiteralExpression)?.getContextualType();
    if (parentType && targetIsAssistantShape(parentType)) {
      pa.getNameNode().replaceWithText(FIELD_MAP[name]);
      objectLiteralFlipped++;
    }
  });

  // (c) Destructuring: const { sortOrder } = assistant  →  const { sort_order: sortOrder } = assistant
  sf.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.BindingElement) return;
    const be = node.asKindOrThrow(SyntaxKind.BindingElement);
    if (be.getPropertyNameNode()) return; // already aliased
    const nameNode = be.getNameNode();
    if (nameNode.getKind() !== SyntaxKind.Identifier) return;
    const name = nameNode.getText();
    if (!FIELD_MAP[name]) return;
    // The source of the destructure — walk up until we find VariableDeclaration
    const vd = be.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    if (!vd) return;
    const initType = vd.getInitializer()?.getType();
    if (initType && targetIsAssistantShape(initType)) {
      be.setPropertyName(FIELD_MAP[name]);
      destructureFlipped++;
    }
  });
}

project.saveSync();

console.log(`Flipped property accesses: ${propAccessFlipped}`);
console.log(`Flipped object literals: ${objectLiteralFlipped}`);
console.log(`Flipped destructurings: ${destructureFlipped}`);
