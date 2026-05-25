const http = require('http');
const fs = require('fs');

const backend = (process.env.AIONUI_LIVE_BACKEND || 'claude').toLowerCase();
const backendLabel = backend === 'codex' ? 'Codex' : 'Claude Code';
const marker = `AIONUI_1924_VISIBLE_${backend.toUpperCase()}_${Date.now()}_OK`;
const prompt = `Reply exactly ${marker} and nothing else.`;

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connect() {
  const registry = JSON.parse(fs.readFileSync('C:/Users/Administrator/.aionui-cdp-registry.json', 'utf8'));
  let port;
  for (const entry of registry) {
    try {
      await getJson(`http://127.0.0.1:${entry.port}/json/version`);
      port = entry.port;
      break;
    } catch {}
  }
  if (!port) throw new Error('No reachable CDP registry port');
  const pages = await getJson(`http://127.0.0.1:${port}/json/list`);
  const page =
    pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl && /localhost|127\.0\.0\.1/.test(p.url)) ||
    pages.find((p) => p.webSocketDebuggerUrl);
  if (!page) throw new Error('No page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
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
  return { port, page, ws, cdp };
}

async function main() {
  const { port, page, ws, cdp } = await connect();
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Page.bringToFront');

  // Use app UI routes instead of only mutating textarea state. Start from the Guid page.
  await cdp('Runtime.evaluate', { expression: `location.hash = '#/guid'; true`, awaitPromise: true });
  await sleep(2500);

  const selected = await cdp('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
    (() => {
      const wanted = ${JSON.stringify(backendLabel)};
      const candidates = [...document.querySelectorAll('button, [role=button], .arco-tag, .arco-btn, div, span')]
        .filter(e => e.offsetParent !== null);
      const exact = candidates.find(e => (e.innerText || e.textContent || '').trim() === wanted);
      const fuzzy = candidates.find(e => (e.innerText || e.textContent || '').includes(wanted));
      const el = exact || fuzzy;
      if (!el) return { ok:false, text: document.body.innerText.slice(0,1000) };
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, view:window }));
      el.click();
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, cancelable:true, view:window }));
      return { ok:true, label: (el.innerText || el.textContent || '').trim().slice(0,100) };
    })()
  `,
  });
  if (!selected.result.value.ok) throw new Error('backend selection failed: ' + JSON.stringify(selected.result.value));
  await sleep(1200);

  const focus = await cdp('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
    (() => {
      const ta = [...document.querySelectorAll('.sendbox-panel textarea, textarea')].find(t => t.offsetParent !== null);
      if (!ta) return null;
      ta.scrollIntoView({ block: 'center' });
      ta.focus();
      const r = ta.getBoundingClientRect();
      return { x: r.left + Math.min(30, Math.max(5, r.width / 2)), y: r.top + Math.min(20, Math.max(5, r.height / 2)) };
    })()
  `,
  });
  const pt = focus.result.value;
  if (!pt) throw new Error('no visible textarea');
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await cdp('Input.insertText', { text: prompt });

  let state;
  for (let i = 0; i < 30; i++) {
    state = await cdp('Runtime.evaluate', {
      returnByValue: true,
      awaitPromise: true,
      expression: `
      (() => {
        const btns = [...document.querySelectorAll('button.send-button-custom')].filter(b => b.offsetParent !== null);
        const btn = btns[btns.length - 1];
        const ta = [...document.querySelectorAll('.sendbox-panel textarea, textarea')].find(t => t.offsetParent !== null);
        return { hasButton: !!btn, disabled: btn ? btn.disabled : null, textarea: ta ? ta.value : null, body: document.body.innerText.slice(0,500) };
      })()
    `,
    });
    if (state.result.value.hasButton && state.result.value.disabled === false) break;
    await sleep(300);
  }
  if (!state.result.value.hasButton || state.result.value.disabled)
    throw new Error('send button not enabled: ' + JSON.stringify(state.result.value));

  await cdp('Runtime.evaluate', {
    awaitPromise: true,
    expression: `
    (() => {
      const btns = [...document.querySelectorAll('button.send-button-custom')].filter(b => b.offsetParent !== null && !b.disabled);
      const btn = btns[btns.length - 1];
      btn.scrollIntoView({ block: 'center' });
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, view:window }));
      btn.click();
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, cancelable:true, view:window }));
      return true;
    })()
  `,
  });

  const deadline = Date.now() + 210000;
  let last = '';
  while (Date.now() < deadline) {
    const found = await cdp('Runtime.evaluate', {
      returnByValue: true,
      awaitPromise: true,
      expression: `
      (() => {
        const texts = [document.body.innerText || ''];
        for (const host of document.querySelectorAll('.markdown-shadow')) {
          if (host.shadowRoot) texts.push(host.shadowRoot.textContent || '');
        }
        const text = texts.join('\\n');
        const btns = [...document.querySelectorAll('button.send-button-custom')].filter(b => b.offsetParent !== null);
        const btn = btns[btns.length - 1];
        return {
          found: text.includes(${JSON.stringify(marker)}),
          inputReady: btn ? btn.disabled === false : false,
          status: text.slice(-1200),
          url: location.href,
        };
      })()
    `,
    });
    const value = found?.result?.value;
    if (!value) {
      throw new Error('Runtime marker poll failed: ' + JSON.stringify(found));
    }
    if (value.found && value.inputReady) {
      console.log(JSON.stringify({ ok: true, backend, marker, port, url: value.url }, null, 2));
      ws.close();
      return;
    }
    last = value.status;
    await sleep(2500);
  }
  throw new Error('marker not found; tail=' + last);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
