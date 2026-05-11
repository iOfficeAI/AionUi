const http = require('http');

const backend = (process.env.AIONUI_LIVE_BACKEND || 'claude').toLowerCase();
const backendLabel = backend === 'codex' ? 'Codex' : 'Claude Code';
const marker = `AIONUI_FRESH_${backend.toUpperCase()}_${Date.now()}_OK`;

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(JSON.parse(data)));
      })
      .on('error', reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect() {
  const pages = await getJson('http://127.0.0.1:9230/json/list');
  const page = pages.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
  if (!page) throw new Error('No AionUI CDP page target');

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  return { ws, cdp };
}

async function main() {
  const { ws, cdp } = await connect();
  await cdp('Runtime.enable');
  await cdp('Page.bringToFront');
  await cdp('Runtime.evaluate', { expression: "location.hash = '#/guid'; true", awaitPromise: true });
  await sleep(1500);

  const selected = await cdp('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (() => {
        const wanted = ${JSON.stringify(backendLabel)};
        const items = [...document.querySelectorAll('button, [role=button], div, span')].filter(e => e.offsetParent);
        const el = items.find(e => (e.innerText || e.textContent || '').trim() === wanted)
          || items.find(e => (e.innerText || e.textContent || '').includes(wanted));
        if (!el) return false;
        el.click();
        return true;
      })()
    `,
  });
  if (!selected.result.value) throw new Error(`Could not select ${backendLabel}`);
  await sleep(1500);

  const prompt = `Reply exactly ${marker} and nothing else.`;
  const filled = await cdp('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (() => {
        const ta = [...document.querySelectorAll('.sendbox-panel textarea, textarea')].find(t => t.offsetParent);
        if (!ta) return false;
        ta.focus();
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        setter ? setter.call(ta, ${JSON.stringify(prompt)}) : (ta.value = ${JSON.stringify(prompt)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()
    `,
  });
  if (!filled.result.value) throw new Error('Could not fill prompt textarea');
  await sleep(500);

  const sent = await cdp('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (() => {
        const buttons = [...document.querySelectorAll('button.send-button-custom')].filter(b => b.offsetParent && !b.disabled);
        const button = buttons[buttons.length - 1];
        if (!button) return false;
        button.click();
        return true;
      })()
    `,
  });
  if (!sent.result.value) throw new Error('Could not click send button');

  const deadline = Date.now() + 120000;
  let last = '';
  while (Date.now() < deadline) {
    await sleep(3000);
    const result = await cdp('Runtime.evaluate', {
      returnByValue: true,
      awaitPromise: true,
      expression: `
        (() => {
          const texts = [document.body.innerText || ''];
          for (const host of document.querySelectorAll('.markdown-shadow')) {
            if (host.shadowRoot) texts.push(host.shadowRoot.textContent || '');
          }
          return texts.join('\\n');
        })()
      `,
    });
    const text = result.result.value || '';
    if (text.includes(marker)) {
      console.log(JSON.stringify({ ok: true, backend, marker }, null, 2));
      ws.close();
      return;
    }
    last = text.slice(-1500);
  }
  throw new Error(`fresh marker not found; tail=${last}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
