import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { generateApiDocs } from './index';

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: process.cwd() },
    out: { type: 'string' },
    serve: { type: 'boolean', default: false },
    port: { type: 'string', default: '0' },
  },
  strict: true,
});
const root = path.resolve(values.root);
const out = path.resolve(values.out ?? path.join(root, '.workspace/api-docs'));
const report = await generateApiDocs({ root, out });
console.log(
  JSON.stringify({
    out,
    files: report.files,
    candidates: report.candidates,
    candidateStatus: report.candidateStatus,
    endpoints: report.http.length,
    unknownEndpoints: report.http.filter((e) => e.status === 'unknown').length,
    webSocket: report.webSocket.length,
  })
);
if (values.serve) {
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const allowed = new Set(
    (await readdir(out)).filter((name) =>
      /^(?:index\.html|scalar\.js|reference\.js|openapi(?:-\d+)?\.json|documents\.json|inventory\.(?:json|md)|websocket\.(?:json|md)|export-diagnostics\.json)$/.test(
        name
      )
    )
  );
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
  };
  const server = createServer(async (req, res) => {
    const name = (req.url ?? '/').split('?')[0].slice(1) || 'index.html';
    if (!['GET', 'HEAD'].includes(req.method ?? '') || !allowed.has(name)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const data = await readFile(path.join(out, name));
      res.writeHead(200, {
        'Content-Type': types[path.extname(name)],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404).end();
    }
  });
  server.listen(port, '127.0.0.1', () => {
    const addr = server.address();
    if (addr && typeof addr !== 'string') console.log(`http://127.0.0.1:${addr.port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => server.close());
}
