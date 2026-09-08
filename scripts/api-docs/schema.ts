import type { Node, Type } from 'ts-morph';
export type Schema = Record<string, unknown>;

export function schema(type: Type, at: Node, depth = 0): Schema | undefined {
  if (depth > 5 || type.isAny() || type.isUnknown() || type.isTypeParameter()) return undefined;
  if (type.isStringLiteral()) return { type: 'string', enum: [type.getLiteralValue()] };
  if (type.isNumberLiteral()) return { type: 'number', enum: [type.getLiteralValue()] };
  if (type.isString()) return { type: 'string' };
  if (type.isNumber()) return { type: 'number' };
  if (type.isBoolean() || type.isBooleanLiteral()) return { type: 'boolean' };
  if (type.isNull()) return { type: 'null' };
  if (type.isUnion()) {
    const parts = type.getUnionTypes().filter((t) => !t.isUndefined());
    const mapped = parts.map((t) => schema(t, at, depth + 1));
    if (mapped.some((s) => !s)) return undefined;
    return mapped.length === 1 ? mapped[0] : { anyOf: mapped };
  }
  if (type.isArray()) {
    const items = schema(type.getArrayElementTypeOrThrow(), at, depth + 1);
    return items ? { type: 'array', items } : undefined;
  }
  if (type.isObject() && !type.getCallSignatures().length) {
    const properties: Record<string, Schema> = {};
    const required: string[] = [];
    for (const prop of type.getProperties()) {
      const value = schema(prop.getTypeAtLocation(at), at, depth + 1);
      if (!value) return undefined;
      properties[prop.getName()] = value;
      if (!prop.isOptional()) required.push(prop.getName());
    }
    const index = type.getStringIndexType();
    const additional = index ? schema(index, at, depth + 1) : undefined;
    if (index && !additional) return undefined;
    return {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      ...(additional ? { additionalProperties: additional } : {}),
    };
  }
  return undefined;
}
