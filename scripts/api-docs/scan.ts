import path from 'node:path';
import { existsSync } from 'node:fs';
import { Node, Project, SyntaxKind, type CallExpression } from 'ts-morph';
import { bindCall, declaration, functionOf, property, resultOf, textValue, type Bindings } from './expressions';
import { schema, type Schema } from './schema';
import { scanWebSocket, type WebSocketEntry } from './websocket';
import { loadProductionSources, sourceLocation, type Source } from './source';
export type { Schema } from './schema';
export type { Source } from './source';
export type HttpEntry = {
  method?: string;
  path?: string;
  target?: string;
  expression: string;
  query: string[];
  body?: Schema;
  bodyContentType?: string;
  response?: Schema;
  responseType?: string;
  status: 'resolved' | 'partial' | 'unknown';
  diagnostics: string[];
  sources: Source[];
};
export type ScanReport = {
  version: 1;
  scope: string[];
  exclusions: string[];
  files: number;
  candidates: number;
  candidateStatus: Record<HttpEntry['status'], number>;
  http: HttpEntry[];
  webSocket: WebSocketEntry[];
};
const sourceRoots = ['packages/desktop/src', 'packages/web-host/src', 'packages/web-cli/src', 'mobile/src'];
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function terminal(call: CallExpression): { kind: 'bridge' | 'fetch'; name: string } | undefined {
  const expr = call.getExpression();
  const decl = declaration(expr);
  const symbol = expr.getSymbol();
  const name = (symbol?.getAliasedSymbol() ?? symbol)?.getName() ?? expr.getText();
  if (
    decl?.getSourceFile().getFilePath().endsWith('/common/adapter/httpBridge.ts') &&
    /^http(Request|Get|Post|Put|Patch|Delete)$/.test(name)
  )
    return { kind: 'bridge', name };
  if (Node.isIdentifier(expr) && expr.getText() === 'fetch' && (!decl || decl.getSourceFile().isDeclarationFile()))
    return { kind: 'fetch', name: 'fetch' };
  if (Node.isPropertyAccessExpression(expr) && expr.getName() === 'fetch') {
    // Keep the import declaration: resolving its alias first yields electron's
    // exported VariableDeclaration and loses the module provenance.
    const base = expr.getExpression().getSymbol()?.getDeclarations()[0];
    let requiredElectron = false;
    if (base && Node.isBindingElement(base) && (base.getPropertyNameNode()?.getText() ?? base.getName()) === 'net') {
      let value = base.getFirstAncestorByKind(SyntaxKind.VariableDeclaration)?.getInitializer();
      while (value && (Node.isAsExpression(value) || Node.isParenthesizedExpression(value)))
        value = value.getExpression();
      requiredElectron = !!(
        value &&
        Node.isCallExpression(value) &&
        value.getExpression().getText() === 'require' &&
        textValue(value.getArguments()[0])?.text === 'electron'
      );
    }
    if (
      (base &&
        Node.isImportSpecifier(base) &&
        base.getName() === 'net' &&
        base.getImportDeclaration().getModuleSpecifierValue() === 'electron') ||
      requiredElectron ||
      ['window', 'globalThis'].includes(expr.getExpression().getText())
    )
      return { kind: 'fetch', name: 'fetch' };
  }
  // An injected transport is evidence of a fetch-shaped contract, not proof of
  // network execution. Only accept declarations without an implementation and
  // URL-like input / native Response output; ordinary local helpers stay out.
  if (decl && (Node.isParameterDeclaration(decl) || Node.isPropertySignature(decl) || Node.isBindingElement(decl))) {
    const fetchContract = expr
      .getType()
      .getCallSignatures()
      .some((signature) => {
        const input = signature.getParameters()[0]?.getTypeAtLocation(expr);
        const inputs = input?.isUnion() ? input.getUnionTypes() : input ? [input] : [];
        const urlInput = inputs.some(
          (type) =>
            type.isString() ||
            type.isStringLiteral() ||
            (['URL', 'Request'].includes(type.getSymbol()?.getName() ?? '') &&
              type
                .getSymbol()
                ?.getDeclarations()
                .some((d) => d.getSourceFile().isDeclarationFile()))
        );
        const output = signature.getReturnType();
        const response = output.getSymbol()?.getName() === 'Promise' ? output.getTypeArguments()[0] : undefined;
        return (
          urlInput &&
          response?.getSymbol()?.getName() === 'Response' &&
          response
            .getSymbol()
            ?.getDeclarations()
            .some((d) => d.getSourceFile().isDeclarationFile())
        );
      });
    if (fetchContract) return { kind: 'fetch', name: 'injected-fetch' };
  }
  return undefined;
}
function resolveRoute(value: ReturnType<typeof textValue>, kind: 'bridge' | 'fetch') {
  if (!value) return undefined;
  let text = value.text;
  let target: string | undefined;
  if (text.startsWith('aioncore://origin/')) {
    target = 'aioncore';
    text = text.slice('aioncore://origin'.length);
  } else if (/^https?:\/\/[^/{}]+\//.test(text)) {
    const match = text.match(/^(https?:\/\/[^/]+)(.*)$/)!;
    target = match[1];
    text = match[2];
  } else if (text.startsWith('/')) target = kind === 'bridge' ? 'aioncore' : 'same-origin';
  if (!target || !text.startsWith('/') || text.includes('#')) return undefined;
  const [route, query = ''] = text.split('?');
  // A parameter must occupy a path segment; an entire dynamic URL is never an endpoint.
  if (route.split('/').some((segment) => segment.includes('{') && !/^\{[\w-]+\}$/.test(segment))) return undefined;
  return { path: route, target, query: [...new Set(new URLSearchParams(query).keys())].toSorted() };
}
function parseCall(
  call: CallExpression,
  root: string,
  bindings: Bindings,
  origin: CallExpression
): HttpEntry | undefined {
  const transport = terminal(call);
  if (!transport) return undefined;
  const args = call.getArguments();
  let methodNode: Node | undefined;
  let pathNode: Node | undefined;
  let body: Node | undefined;
  let method: string | undefined;
  if (transport.kind === 'bridge') {
    if (transport.name === 'httpRequest') [methodNode, pathNode, body] = args;
    else {
      method = transport.name.slice(4).toUpperCase();
      pathNode = args[0];
      body = ['POST', 'PUT', 'PATCH'].includes(method) ? args[1] : undefined;
    }
  } else {
    pathNode = args[0];
    methodNode = property(args[1], 'method', bindings);
    body = property(args[1], 'body', bindings);
    if (!args[1]) method = 'GET';
    else if (
      Node.isObjectLiteralExpression(args[1]) &&
      !args[1].getProperties().some(Node.isSpreadAssignment) &&
      !args[1].getProperty('method')
    )
      method = 'GET';
  }
  method ??= textValue(methodNode, bindings)?.text;
  if (!method || !methods.has(method.toUpperCase())) method = undefined;
  else method = method.toUpperCase();
  const route = resolveRoute(textValue(pathNode, bindings), transport.kind);
  const responseNode = transport.kind === 'bridge' ? call.getTypeArguments()[0] : undefined;
  const response = responseNode ? schema(responseNode.getType(), call) : undefined;
  const bodyContentType =
    transport.kind === 'bridge'
      ? 'application/json'
      : textValue(property(property(args[1], 'headers', bindings), 'Content-Type', bindings), bindings)?.text;
  const bodyValue =
    body && functionOf(body)
      ? resultOf(body)
      : body && Node.isCallExpression(body) && body.getExpression().getText() === 'JSON.stringify'
        ? body.getArguments()[0]
        : body;
  const paramsType = call.getTypeArguments()[1];
  const bodySchema = bodyValue
    ? schema(bodyValue.getType(), call)
    : transport.kind === 'bridge' && ['POST', 'PUT', 'PATCH'].includes(method ?? '') && paramsType
      ? schema(paramsType.getType(), call)
      : undefined;
  const diagnostics: string[] = [];
  if (transport.name === 'injected-fetch') diagnostics.push('injected-fetch-contract');
  if (!method) diagnostics.push('unresolved-method');
  if (!route) diagnostics.push('unresolved-target-or-path');
  if (!responseNode) diagnostics.push('untyped-client-response');
  if (responseNode && !response && !responseNode.getType().isVoid())
    diagnostics.push('unsupported-client-response-type');
  if (
    (body ||
      (paramsType &&
        !paramsType.getType().isUndefined() &&
        !paramsType.getType().isVoid() &&
        ['POST', 'PUT', 'PATCH'].includes(method ?? ''))) &&
    !bodySchema
  )
    diagnostics.push('unsupported-request-body');
  if (body && !bodyContentType) diagnostics.push('unknown-request-content-type');
  return {
    method,
    ...route,
    expression: pathNode?.getText() ?? '',
    query: route?.query ?? [],
    body: bodySchema,
    bodyContentType: bodySchema ? bodyContentType : undefined,
    response,
    responseType: responseNode?.getText(),
    status: !method || !route ? 'unknown' : diagnostics.length ? 'partial' : 'resolved',
    diagnostics,
    sources: [sourceLocation(origin, root), ...(origin !== call ? [sourceLocation(call, root)] : [])],
  };
}
function trace(call: CallExpression, root: string, bindings: Bindings, origin: CallExpression, depth = 0): HttpEntry[] {
  const direct = parseCall(call, root, bindings, origin);
  if (direct) return [direct];
  if (depth >= 3) return [];
  const bound = bindCall(call, bindings);
  if (!bound || bound.fn.getSourceFile().isDeclarationFile()) return [];
  const result = resultOf(bound.fn);
  if (!result) return [];
  // Follow calls in the returned expression, not unrelated side effects in a function body.
  const calls = Node.isCallExpression(result) ? [result] : result.getDescendantsOfKind(SyntaxKind.CallExpression);
  return calls.flatMap((inner) => trace(inner, root, bound.bindings, origin, depth + 1));
}
export function scanClient(root: string): ScanReport {
  const config = path.join(root, 'tsconfig.json');
  const project = new Project({
    ...(existsSync(config) ? { tsConfigFilePath: config } : {}),
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { strictNullChecks: true },
  });
  const scope = sourceRoots.filter((dir) => existsSync(path.join(root, dir)));
  const files = loadProductionSources(
    project,
    scope.map((dir) => path.join(root, dir))
  );
  const entries: HttpEntry[] = [];
  for (const file of files) {
    if (file.getFilePath().endsWith('/common/adapter/httpBridge.ts')) continue;
    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression))
      entries.push(...trace(call, root, new Map(), call));
  }
  const candidateStatus = { resolved: 0, partial: 0, unknown: 0 };
  for (const entry of entries) candidateStatus[entry.status]++;
  const groups = new Map<string, HttpEntry>();
  for (const e of entries) {
    const key = e.path && e.method ? `${e.target} ${e.method} ${e.path}` : JSON.stringify(e.sources);
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, e);
      continue;
    }
    if (
      JSON.stringify([previous.body, previous.bodyContentType, previous.response]) !==
      JSON.stringify([e.body, e.bodyContentType, e.response])
    ) {
      previous.diagnostics.push('conflicting-client-types');
      previous.body = undefined;
      previous.response = undefined;
    }
    previous.query = [...new Set([...previous.query, ...e.query])].toSorted();
    for (const s of e.sources)
      if (!previous.sources.some((p) => p.file === s.file && p.line === s.line && p.caller === s.caller))
        previous.sources.push(s);
    previous.diagnostics = [...new Set([...previous.diagnostics, ...e.diagnostics])].toSorted();
    previous.status =
      !previous.method || !previous.path || !previous.target
        ? 'unknown'
        : previous.diagnostics.length
          ? 'partial'
          : 'resolved';
  }
  return {
    version: 1,
    scope,
    exclusions: [
      'declarations',
      'tests',
      'fixtures',
      'dependencies',
      'generated output',
      'HTTP transport implementation',
    ],
    files: files.length,
    candidates: entries.length,
    candidateStatus,
    webSocket: scanWebSocket(files, root),
    http: [...groups.values()].toSorted((a, b) =>
      `${a.target} ${a.path} ${a.method} ${a.sources[0].file}:${a.sources[0].line}`.localeCompare(
        `${b.target} ${b.path} ${b.method} ${b.sources[0].file}:${b.sources[0].line}`
      )
    ),
  };
}
