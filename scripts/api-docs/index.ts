import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { validate } from '@scalar/openapi-parser';
import { scanClient, type HttpEntry, type Schema } from './scan';
import { t } from './locales';

const require = createRequire(import.meta.url);
const json = (data: unknown) => JSON.stringify(data, null, 2) + '\n';
const cell = (value: string) =>
  value.replaceAll('|', '\\|').replaceAll('\n', ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function documentFor(entries: HttpEntry[], target: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  const schemas: Record<string, Schema> = {};
  for (const [i, entry] of entries.entries()) {
    const model = `ClientResponse${i + 1}`;
    if (entry.response) schemas[model] = entry.response;
    const pathParameters = [...entry.path!.matchAll(/\{([^}]+)\}/g)].map((m) => ({
      in: 'path',
      name: m[1],
      required: true,
      schema: { type: 'string' },
    }));
    const operation = {
      operationId: `clientCall${i + 1}`,
      summary: `${entry.method} ${entry.path}`,
      tags: [
        entry
          .path!.split('/')
          .filter(Boolean)
          .find((part) => part !== 'api') ?? 'root',
      ],
      description: `${t('evidence')}\n\n${entry.sources.map((s) => `${s.file}:${s.line}`).join('\n')}`,
      parameters: [
        ...pathParameters,
        ...entry.query.map((name) => ({
          in: 'query',
          name,
          schema: {},
          description: t('query'),
        })),
      ],
      ...(entry.body && entry.bodyContentType
        ? {
            requestBody: {
              description: t('body'),
              content: { [entry.bodyContentType]: { schema: entry.body } },
            },
          }
        : {}),
      responses: {
        default: {
          description: t('response', { type: entry.responseType ?? 'unknown' }),
        },
      },
      ...(entry.response ? { 'x-client-response-schema': { $ref: `#/components/schemas/${model}` } } : {}),
      'x-client-sources': entry.sources,
      'x-scan-status': entry.status,
      'x-scan-diagnostics': entry.diagnostics,
    };
    (paths[entry.path!] ??= {})[entry.method!.toLowerCase()] = operation;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: t('title', { target }),
      version: '1',
      description: t('perspective'),
    },
    'x-client-target': target,
    paths,
    components: { schemas },
  };
}
export async function generateApiDocs({ root, out }: { root: string; out: string }) {
  const report = scanClient(path.resolve(root));
  const targets = new Map<string, HttpEntry[]>([['aioncore', []]]);
  const skipped: unknown[] = [];
  for (const entry of report.http) {
    if (!entry.method || !entry.path || !entry.target || entry.diagnostics.includes('conflicting-client-types')) {
      skipped.push({ sources: entry.sources, reason: entry.diagnostics });
      continue;
    }
    if (!targets.has(entry.target)) targets.set(entry.target, []);
    targets.get(entry.target)!.push(entry);
  }
  const documents = await Promise.all(
    [...targets].map(async ([target, entries], i) => {
      const spec = documentFor(entries, target);
      const result = await validate(spec);
      if (!result.valid) throw new Error(`Invalid generated OpenAPI: ${JSON.stringify(result.errors)}`);
      return { title: target, file: i === 0 ? 'openapi.json' : `openapi-${i}.json`, spec };
    })
  );
  const sources = documents.map((d) => ({ title: d.title, url: `./${d.file}` }));
  let previousFiles: string[] = [];
  try {
    const previous: unknown = JSON.parse(await readFile(path.join(out, 'documents.json'), 'utf8'));
    if (Array.isArray(previous))
      previousFiles = previous.flatMap((d) =>
        typeof d?.url === 'string' && /^\.\/openapi-\d+\.json$/.test(d.url) ? [d.url.slice(2)] : []
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(out, { recursive: true });
  const markdown =
    `# ${t('inventoryTitle')}\n\n${t('perspective')}\n\n` +
    t('scope', {
      scope: report.scope.join(', '),
      files: report.files,
      candidates: report.candidates,
      ...report.candidateStatus,
      endpoints: report.http.length,
    }) +
    '\n\n' +
    t('httpHeader') +
    '\n| --- | --- | --- | --- | --- | --- | --- | --- |\n' +
    report.http
      .map(
        (e) =>
          `| ${cell(e.target ?? '?')} | ${e.method ?? '?'} | ${cell(e.path ?? e.expression)} | ${cell(e.query.join(', '))} | ${cell(e.body ? JSON.stringify(e.body) : 'unknown')} | ${cell(e.responseType ?? 'unknown')} | ${e.status}: ${e.diagnostics.join(', ')} | ${e.sources.map((s) => `${s.file}:${s.line}`).join(', ')} |`
      )
      .join('\n') +
    '\n';
  await Promise.all([
    ...documents.map((d) => writeFile(path.join(out, d.file), json(d.spec))),
    writeFile(path.join(out, 'websocket.json'), json(report.webSocket)),
    writeFile(
      path.join(out, 'websocket.md'),
      `# ${t('websocketTitle')}\n\n${t('websocketHeader')}\n| --- | --- | --- | --- | --- | --- |\n` +
        report.webSocket
          .map(
            (e) =>
              `| ${e.direction} | ${cell(e.event ?? e.expression)} | ${cell(e.url ?? 'unknown')} | ${cell(e.payload ? JSON.stringify(e.payload) : 'unknown')} | ${e.status}: ${e.diagnostics.join(', ')} | ${e.sources.map((s) => `${s.file}:${s.line}`).join(', ')} |`
          )
          .join('\n') +
        '\n'
    ),
    writeFile(path.join(out, 'inventory.json'), json(report)),
    writeFile(path.join(out, 'inventory.md'), markdown),
    writeFile(path.join(out, 'export-diagnostics.json'), json(skipped)),
    writeFile(path.join(out, 'documents.json'), json(sources)),
    copyFile(
      path.join(path.dirname(require.resolve('@scalar/api-reference')), 'browser/standalone.js'),
      path.join(out, 'scalar.js')
    ),
    writeFile(
      path.join(out, 'index.html'),
      `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('pageTitle')}</title><div id="app"></div><script src="./scalar.js"></script><script src="./reference.js"></script></html>`
    ),
    writeFile(
      path.join(out, 'reference.js'),
      `Scalar.createApiReference('#app', ${JSON.stringify({ sources, hideClientButton: true, hideTestRequestButton: true, withDefaultFonts: false, telemetry: false, persistAuth: false, agent: { disabled: true }, showDeveloperTools: 'never' })});\n`
    ),
  ]);
  await Promise.all(
    previousFiles
      .filter((file) => !documents.some((d) => d.file === file))
      .map((file) =>
        unlink(path.join(out, file)).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        })
      )
  );
  return report;
}
