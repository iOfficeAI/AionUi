import { Node, SyntaxKind, type CallExpression } from 'ts-morph';

export type Bindings = Map<Node, Node>;
export type TextValue = { text: string; dynamic: boolean };
export function declaration(node: Node | undefined): Node | undefined {
  const symbol = node?.getSymbol();
  return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations()[0];
}
export function functionOf(node: Node | undefined) {
  if (!node) return undefined;
  if (
    Node.isFunctionDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node) ||
    Node.isMethodDeclaration(node)
  )
    return node;
  if (Node.isVariableDeclaration(node) || Node.isPropertyAssignment(node)) return functionOf(node.getInitializer());
  return undefined;
}
export function resultOf(node: Node): Node | undefined {
  const fn = functionOf(node);
  const body = fn?.getBody();
  if (!body) return undefined;
  if (!Node.isBlock(body)) return body;
  // Only straight-line functions with one return can be evaluated safely.
  if (body.getStatements().some((s) => Node.isIfStatement(s) || Node.isSwitchStatement(s) || Node.isTryStatement(s)))
    return undefined;
  const returns = body.getStatements().filter(Node.isReturnStatement);
  return returns.length === 1 ? returns[0].getExpression() : undefined;
}
export function bindCall(
  call: CallExpression,
  parent: Bindings
): { fn: NonNullable<ReturnType<typeof functionOf>>; bindings: Bindings } | undefined {
  const fn = functionOf(declaration(call.getExpression()));
  if (!fn) return undefined;
  const bindings = new Map(parent);
  fn.getParameters().forEach((p, i) => {
    const value = call.getArguments()[i] ?? p.getInitializer();
    if (value) bindings.set(p, value);
  });
  return { fn, bindings };
}
export function property(node: Node | undefined, name: string, bindings: Bindings, depth = 0): Node | undefined {
  if (!node || depth > 12) return undefined;
  if (Node.isObjectLiteralExpression(node)) {
    if (node.getProperties().some(Node.isSpreadAssignment)) return undefined;
    const prop = node.getProperty(name);
    if (prop && Node.isPropertyAssignment(prop)) return prop.getInitializer();
    if (prop && Node.isShorthandPropertyAssignment(prop)) return prop.getNameNode();
    return undefined;
  }
  const decl = declaration(node);
  const value = decl && bindings.get(decl);
  if (value && value !== node) return property(value, name, bindings, depth + 1);
  if (decl && Node.isVariableDeclaration(decl)) {
    const unsafe = decl.findReferencesAsNodes().some((ref) => {
      if (ref === node) return false;
      const access = ref.getParent();
      // Aliases, element access, argument passing and other escapes can mutate the
      // object without a direct assignment through this binding. Do not use its initializer.
      if (!access || !Node.isPropertyAccessExpression(access) || access.getExpression() !== ref) return true;
      const assignment = access?.getParent();
      return (
        !assignment ||
        Node.isCallExpression(assignment) ||
        Node.isDeleteExpression(assignment) ||
        Node.isPrefixUnaryExpression(assignment) ||
        Node.isPostfixUnaryExpression(assignment) ||
        Node.isPropertyAccessExpression(assignment) ||
        Node.isElementAccessExpression(assignment) ||
        (Node.isBinaryExpression(assignment) && assignment.getLeft() === access)
      );
    });
    if (unsafe || decl.getVariableStatement()?.getDeclarationKind() !== 'const') return undefined;
    return property(decl.getInitializer(), name, bindings, depth + 1);
  }
  return undefined;
}
export function textValue(node: Node | undefined, bindings: Bindings = new Map(), depth = 0): TextValue | undefined {
  if (!node || depth > 12) return undefined;
  if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))
    return { text: node.getLiteralText(), dynamic: false };
  if (Node.isNumericLiteral(node)) return { text: node.getText(), dynamic: false };
  if (Node.isParenthesizedExpression(node) || Node.isAsExpression(node) || Node.isNonNullExpression(node))
    return textValue(node.getExpression(), bindings, depth + 1);
  const fn = functionOf(node);
  if (fn) return textValue(resultOf(fn), bindings, depth + 1);
  if (Node.isIdentifier(node)) {
    const decl = declaration(node);
    const value = decl && bindings.get(decl);
    if (value && value !== node) return textValue(value, bindings, depth + 1);
    if (decl && Node.isVariableDeclaration(decl)) {
      // Mutable bindings can be reassigned; their initializer is not the final value.
      if (decl.getVariableStatement()?.getDeclarationKind() !== 'const') return undefined;
      return textValue(decl.getInitializer(), bindings, depth + 1);
    }
    if (decl && Node.isParameterDeclaration(decl)) return { text: `{${node.getText()}}`, dynamic: true };
    if (decl && Node.isBindingElement(decl)) {
      const parameter = decl.getFirstAncestorByKind(SyntaxKind.Parameter);
      if (parameter) {
        const input = bindings.get(parameter);
        const key = decl.getPropertyNameNode()?.getText() ?? decl.getName();
        if (input) return textValue(property(input, key, bindings), bindings, depth + 1);
        return { text: `{${decl.getName()}}`, dynamic: true };
      }
    }
    return undefined;
  }
  if (Node.isPropertyAccessExpression(node)) {
    const value = property(node.getExpression(), node.getName(), bindings, depth + 1);
    if (value) return textValue(value, bindings, depth + 1);
    const base = declaration(node.getExpression());
    if (base && Node.isParameterDeclaration(base)) return { text: `{${node.getName()}}`, dynamic: true };
    return undefined;
  }
  if (Node.isTemplateExpression(node)) {
    let text = node.getHead().getLiteralText();
    let dynamic = false;
    for (const span of node.getTemplateSpans()) {
      const value = textValue(span.getExpression(), bindings, depth + 1);
      if (!value) return undefined;
      text += value.text + span.getLiteral().getLiteralText();
      dynamic ||= value.dynamic;
    }
    return { text, dynamic };
  }
  if (Node.isBinaryExpression(node) && node.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    const left = textValue(node.getLeft(), bindings, depth + 1);
    const right = textValue(node.getRight(), bindings, depth + 1);
    if (!left || !right) return undefined;
    const type = node.getType();
    if (type.isNumber() || type.isNumberLiteral()) {
      if (left.dynamic || right.dynamic) return undefined;
      const sum = Number(left.text) + Number(right.text);
      return Number.isFinite(sum) ? { text: String(sum), dynamic: false } : undefined;
    }
    if (!type.isString() && !type.isStringLiteral()) return undefined;
    return { text: left.text + right.text, dynamic: left.dynamic || right.dynamic };
  }
  if (Node.isCallExpression(node)) {
    if (node.getExpression().getText() === 'encodeURIComponent') {
      const value = textValue(node.getArguments()[0], bindings, depth + 1);
      return value ? { ...value, text: value.dynamic ? value.text : encodeURIComponent(value.text) } : undefined;
    }
    const decl = declaration(node.getExpression());
    if (
      decl?.getSourceFile().getFilePath().endsWith('/common/adapter/httpBridge.ts') &&
      Node.isFunctionDeclaration(decl) &&
      decl.getName() === 'getBaseUrl'
    )
      return { text: 'aioncore://origin', dynamic: false };
    const bound = bindCall(node, bindings);
    if (bound) return textValue(resultOf(bound.fn), bound.bindings, depth + 1);
  }
  return undefined;
}
