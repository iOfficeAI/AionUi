// Probe the actual packaged Core with an isolated, unauthenticated data directory.
// A healthy process is insufficient: old releases start but lack business routes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function checkCore(binary) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aionui-core-capabilities-'));
  const env = { HOME: directory, USERPROFILE: directory };
  for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const child = spawn(
    path.resolve(binary),
    ['--port', '0', '--local', '--data-dir', directory, '--work-dir', directory, '--log-dir', directory],
    { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
  );
  const closed = once(child, 'close').catch(() => {});
  let timer;
  try {
    const port = await new Promise((resolve, reject) => {
      let buffer = '';
      const receive = (chunk) => {
        buffer = (buffer + chunk.toString()).slice(-16384);
        const match = buffer.match(/AIONCORE_LISTENING\s+(\{[^\r\n]+\})/);
        if (match) {
          try {
            const address = JSON.parse(match[1]);
            assert.equal(address.host, '127.0.0.1');
            assert.ok(Number.isInteger(address.port) && address.port > 0 && address.port < 65536);
            resolve(address.port);
          } catch (error) {
            reject(error);
          }
        }
      };
      child.stdout.on('data', receive);
      child.stderr.on('data', receive);
      child.once('error', reject);
      child.once('exit', (code) => reject(new Error(`Core exited before readiness: ${code}`)));
      timer = setTimeout(() => reject(new Error('Core readiness timed out')), 30000);
    });
    clearTimeout(timer);
    return await checkRoute(port);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    const force = setTimeout(() => child.kill('SIGKILL'), 5000);
    await closed;
    clearTimeout(force);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function checkRoute(port) {
  const route = '/api/gea/sales-plan/periods?pageNo=1&pageSize=1';
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { signal: AbortSignal.timeout(10000) });
  const body = await response.json();
  assert.equal(response.status, 401, `Core business route unavailable: HTTP ${response.status}, code=${body.code}`);
  assert.equal(body.code, 'GEA_AUTH_REQUIRED', 'Expected the sales-plan handler to require GEA authentication');
  return { status: 'passed', route, httpStatus: response.status, code: body.code };
}

if (require.main === module) {
  checkCore(process.argv[2])
    .then((receipt) => {
      if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(receipt, null, 2));
      console.log(JSON.stringify(receipt));
    })
    .catch((error) => {
      console.error(`Core capability check failed: ${error.message}`);
      process.exitCode = 1;
    });
}
module.exports = { checkCore, checkRoute };
