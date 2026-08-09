/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 单目标 CDP 通道：只把「侧边浏览器那一个 webContents」暴露给 Agent。
 *
 * 替代 Chromium 的 remote-debugging-port。那个开关是应用级的，没有 per-target ACL，
 * 一开就把主窗口（连着 preload 桥）暴露给本机任意进程。这里改成：
 *   - 只绑 127.0.0.1，且必须带口令才能连
 *   - 只服务一个目标，Target.* 由 cdpTargetProtocol 本地应答
 *   - 其余命令透传给 webContents.debugger
 *
 * Single-target CDP bridge: exposes only the in-app browser's webContents to the agent.
 * Replaces Chromium's remote-debugging-port, which is application-wide with no
 * per-target ACL and therefore also exposes the main window and its preload bridge.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { webContents, type Debugger, type WebContents } from 'electron';
import {
  SINGLE_SESSION_ID,
  buildListPayload,
  buildTargetInfo,
  buildVersionPayload,
  decideCdpCommand,
  isAcceptableSessionId,
  tokensMatch,
  type CdpRequest,
} from './cdpTargetProtocol';

const HOST = '127.0.0.1';
const WS_PATH = '/aionui-cdp';

export type CdpBridgeHandle = {
  port: number;
  token: string;
  /** 侧边浏览器的 webContents id；未附加时为 null。/ null while nothing is attached. */
  attachedWebContentsId: () => number | null;
  attach: (webContentsId: number) => { ok: true } | { ok: false; reason: string };
  detach: () => void;
  close: () => Promise<void>;
};

type AttachedState = {
  contents: WebContents;
  dbg: Debugger;
  onMessage: (event: unknown, method: string, params: unknown, sessionId: string) => void;
  onDestroyed: () => void;
};

let attached: AttachedState | null = null;
let sockets = new Set<WebSocket>();

const currentTargetInfo = () => {
  if (!attached || attached.contents.isDestroyed()) return buildTargetInfo('', 'about:blank');
  return buildTargetInfo(attached.contents.getTitle(), attached.contents.getURL());
};

const broadcast = (payload: Record<string, unknown>) => {
  const text = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(text);
  }
};

const detachInternal = () => {
  if (!attached) return;
  const { contents, dbg, onMessage, onDestroyed } = attached;
  attached = null;
  try {
    dbg.removeListener('message', onMessage);
    contents.removeListener('destroyed', onDestroyed);
    if (dbg.isAttached()) dbg.detach();
  } catch {
    // 已经销毁/已分离时 Electron 会抛，忽略即可。
    // Electron throws if it is already destroyed or detached; nothing to do.
  }
};

/**
 * 附加到指定 webContents。
 *
 * 两道校验都必须报错而不是「尽力而为」：
 *  - getType() 必须是 webview：防止把主窗口（带 preload 桥）交出去，这正是原方案的漏洞。
 *  - debugger.attach() 会和同一个 webContents 上打开的 DevTools 冲突（Electron 限制），
 *    这时给出可读的原因，而不是抛一个原始异常。
 *
 * Both checks must fail loudly rather than degrade:
 *  - getType() must be 'webview', so the main window (with its preload bridge) can never
 *    be handed over — that is precisely the hole in the process-wide approach.
 *  - debugger.attach() conflicts with DevTools open on the same webContents (an Electron
 *    limitation); surface a readable reason instead of a raw throw.
 */
const attachInternal = (webContentsId: number): { ok: true } | { ok: false; reason: string } => {
  const contents = webContents.fromId(webContentsId);
  if (!contents || contents.isDestroyed()) {
    return { ok: false, reason: `No live webContents with id ${webContentsId}` };
  }

  const type = contents.getType();
  if (type !== 'webview') {
    return {
      ok: false,
      reason: `Refusing to attach to webContents of type "${type}"; only the in-app browser webview may be exposed.`,
    };
  }

  if (attached?.contents.id === webContentsId) return { ok: true };
  detachInternal();

  const dbg = contents.debugger;
  try {
    if (!dbg.isAttached()) dbg.attach('1.3');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `Could not attach debugger (DevTools open on this view will block it): ${message}` };
  }

  const onMessage = (_event: unknown, method: string, params: unknown, _sessionId: string) => {
    /**
     * 统一贴上我们那个固定 sessionId 再转发。
     *
     * puppeteer 用 flatten 模式，它靠 sessionId 把事件路由到对应的页面会话；不贴的话
     * 事件会被当成浏览器级的，Page/Runtime 那些事件就丢了。
     *
     * Stamp our fixed sessionId before forwarding. puppeteer runs in flatten mode and
     * routes events to the page session by sessionId; without it these would look
     * browser-level and Page/Runtime events would be dropped.
     */
    broadcast({ method, params: params ?? {}, sessionId: SINGLE_SESSION_ID });
  };

  const onDestroyed = () => {
    detachInternal();
    broadcast({ method: 'Target.targetDestroyed', params: { targetId: currentTargetInfo().targetId } });
  };

  dbg.on('message', onMessage);
  contents.once('destroyed', onDestroyed);
  attached = { contents, dbg, onMessage, onDestroyed };
  return { ok: true };
};

/**
 * 回包必须带上入站的 sessionId，否则页面级命令会永久挂起。
 *
 * puppeteer 按 sessionId 分发回包（cdp/Connection.js）：带 sessionId 的交给对应
 * CdpSession 的 CallbackRegistry，不带的交给 Connection 自己那一份。而页面级命令是
 * 用 session.send() 发的，callback 只登记在 session 的 registry 里 —— 回包一旦漏掉
 * sessionId 就会被投到 Connection 的 registry，那里查无此 id，
 * CallbackRegistry.resolve/reject 直接静默 return，Promise 永不 settle。
 *
 * 于是一个本该「立刻报错」的命令变成了挂死，最后由 puppeteer 的 protocolTimeout 抛出
 * 「XXX timed out. Increase the 'protocolTimeout' setting」—— 一条把人指向超时设置的
 * 假线索，而真实原因（比如浏览器面板没打开）被彻底吞掉。
 *
 * Replies must echo the inbound sessionId or page-level commands hang forever.
 * puppeteer routes replies by sessionId: with one it goes to that CdpSession's
 * CallbackRegistry, without one to the Connection's own. Page-level commands are sent via
 * session.send(), so the callback lives only in the session registry; a reply missing the
 * sessionId lands in the Connection registry, which has no such id, and
 * CallbackRegistry.resolve/reject silently returns — the promise never settles.
 *
 * An immediate error therefore turns into a hang that surfaces as puppeteer's
 * "... timed out. Increase the 'protocolTimeout' setting", a misleading clue that buries the
 * real cause (e.g. the browser panel was never opened).
 */
const sendError = (ws: WebSocket, id: number | undefined, message: string, sessionId?: string) => {
  ws.send(JSON.stringify({ id: id ?? 0, error: { code: -32601, message }, sessionId }));
};

/**
 * announcedSessions 是**每条连接**的状态，不能提到模块作用域：一条新连接的 puppeteer
 * 手上没有任何会话对象，必须重新收到 attachedToTarget 才能建立；若跨连接共享，第二个
 * 客户端就永远等不到那个事件，browser.pages() 会一直是 0。
 *
 * announcedSessions is PER-CONNECTION state and must not be hoisted to module scope: a freshly
 * connected puppeteer holds no session objects and needs attachedToTarget to build them. Sharing
 * the set across connections would starve the second client of that event, leaving
 * browser.pages() at 0 forever.
 */
const handleSocketMessage = async (ws: WebSocket, raw: string, announcedSessions: Set<string>) => {
  let req: CdpRequest;
  try {
    req = JSON.parse(raw) as CdpRequest;
  } catch {
    return; // 非 JSON 直接忽略 / ignore non-JSON frames
  }

  const { id, method, params, sessionId } = req;
  if (!method) return;

  if (!isAcceptableSessionId(sessionId)) {
    sendError(ws, id, `Unknown sessionId: ${sessionId}`, sessionId);
    return;
  }

  const decision = decideCdpCommand(req, currentTargetInfo);

  if (decision.kind === 'error') {
    sendError(ws, id, decision.message, sessionId);
    return;
  }

  if (decision.kind === 'reply' || decision.kind === 'reply-and-emit') {
    ws.send(JSON.stringify({ id, result: decision.payload, sessionId }));
    if (decision.kind === 'reply-and-emit') {
      for (const evt of decision.emit) {
        /**
         * 同一个 sessionId 只宣布一次 attachedToTarget —— 重复宣布会让 puppeteer 换掉
         * 会话对象，把调用方手里的 handle 变成孤儿。
         *
         * puppeteer 的 Connection.onMessage 收到 attachedToTarget 时无条件
         * `new CdpCDPSession(...)` 再 `#sessions.set(sessionId, session)`（cdp/Connection.js）。
         * 它不检查这个 sessionId 是否已经存在，于是第二次宣布会用一个全新对象覆盖旧的，
         * 而新对象带着一份空的 CallbackRegistry。
         *
         * 这正是致命之处：setAutoAttach 已经宣布过一次，attachToTarget 再宣布一次，
         * 调用方（TargetManager / 任何持有 CDPSession 的代码）手上那个 handle 就指向了被
         * 换掉的旧对象。它 send() 出去的命令 id 登记在旧 registry 里，回包却按 sessionId
         * 被路由到新对象的 registry —— 那里查无此 id，resolve/reject 静默 return，
         * Promise 永不 settle，最后以 protocolTimeout 的形式浮现。
         *
         * 真实 Chrome 不会重复宣布已附加的会话，所以这是本伪装层特有的问题。
         *
         * Announce attachedToTarget at most once per sessionId: re-announcing makes puppeteer
         * swap out the session object and orphans handles the caller already holds.
         *
         * On attachedToTarget, puppeteer's Connection.onMessage unconditionally constructs a
         * new CdpCDPSession and does `#sessions.set(sessionId, session)` — it never checks
         * whether that sessionId already exists, so a second announcement replaces the old
         * object with a fresh one carrying an EMPTY CallbackRegistry.
         *
         * That is the fatal part: setAutoAttach already announced once, so announcing again on
         * attachToTarget leaves the caller holding the replaced object. Commands it sends
         * register their id in the old registry, while replies are routed by sessionId into the
         * new object's registry, which has no such id — resolve/reject silently returns and the
         * promise never settles, surfacing later as a protocolTimeout.
         *
         * Real Chrome does not re-announce an already-attached session, so this is specific to
         * this emulation layer.
         */
        if (evt.method === 'Target.attachedToTarget') {
          const announcedId = (evt.params as { sessionId?: string }).sessionId;
          if (typeof announcedId === 'string') {
            if (announcedSessions.has(announcedId)) continue;
            announcedSessions.add(announcedId);
          }
        }
        ws.send(JSON.stringify({ method: evt.method, params: evt.params }));
      }
    }
    return;
  }

  // forward
  if (!attached || attached.contents.isDestroyed()) {
    /**
     * 说清楚「怎么办」，因为 Agent 侧无法自己修复：attach 只由渲染进程在 webview
     * dom-ready 时上报触发（WebviewHost.tsx），Target.createTarget 又是明确拒绝的。
     * 所以这条消息必须告诉用户去开浏览器面板，否则 Agent 只能反复撞同一面墙。
     *
     * Say what to do about it: the agent cannot fix this itself. Attachment is only
     * triggered by the renderer reporting its webContents id on dom-ready
     * (WebviewHost.tsx), and Target.createTarget is explicitly refused — so this message
     * has to point at opening the browser panel, or the agent just retries into the same wall.
     */
    sendError(
      ws,
      id,
      'The in-app browser is not currently attached. Open the browser panel in AionUi so a page is available to control.',
      sessionId
    );
    return;
  }

  try {
    const result = await attached.dbg.sendCommand(method, params ?? {});
    ws.send(JSON.stringify({ id, result: result ?? {}, sessionId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ws.send(JSON.stringify({ id, error: { code: -32000, message }, sessionId }));
  }
};

const writeJson = (res: ServerResponse, body: unknown) => {
  const text = JSON.stringify(body);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
};

/**
 * 启动通道。返回 handle 供主进程在浏览器 tab 切换时改附加目标。
 *
 * 口令只加在 WebSocket 段，不加在 HTTP 发现段 —— 这是被实测逼出来的设计：
 * puppeteer 拿 browserURL 后执行 `new URL('/json/version', browserURL)`，绝对路径会
 * 把 query 整段丢掉，所以口令放在 browserURL 的 ?token= 上根本传不到服务端，
 * 只会让 puppeteer 被自己的 403 挡死。
 *
 * 于是分两层：
 *  - HTTP 发现段（/json/version、/json/list）不校验口令，响应里带着含口令的 ws 地址。
 *  - WebSocket 段强制校验口令，所有实际控制都走这里。
 *
 * ⚠️ 威胁模型要说实话：因为发现段不鉴权且会吐出口令，同机同用户的任意进程扫到这个端口后
 * 一个 GET 就能取回口令再连 WS。所以口令的作用是**阻止盲连**（不知道端口/没读过发现段
 * 的连接一律 403），**不是身份证明** —— 它无法证明对端就是我们 spawn 的那个 MCP。
 * 对本机进程而言，真实屏障只有「listen(0) 随机分配的临时端口」这一层。
 *
 * 这与 Chrome 原生 remote-debugging-port 的 /json/version 是同一水平，不是回归；本方案真正
 * 的收益在别处：只暴露侧边浏览器那一个 webview，绝不暴露主窗口（见 attachInternal 的
 * getType() 校验）。把「同用户本机进程」算作可信边界是这里的显式假设。
 *
 * The token guards only the WebSocket leg, not HTTP discovery — a design forced by testing:
 * puppeteer runs `new URL('/json/version', browserURL)`, and an absolute path discards the
 * entire query string, so a token on browserURL never reaches the server and would only make
 * puppeteer trip over its own 403.
 *
 * Hence two tiers:
 *  - HTTP discovery (/json/version, /json/list) is unauthenticated and its response carries
 *    a tokened ws address.
 *  - The WebSocket enforces the token; all actual control flows there.
 *
 * ⚠️ Be honest about the threat model: because discovery is unauthenticated and hands the
 * token out, any process running as the same user can scan this port and retrieve the token
 * with one GET, then connect. The token therefore **prevents blind connections** (anything
 * that has not read discovery gets a 403); it is **not proof of identity** and cannot show
 * the peer is the MCP we spawned. Against local processes the only real barrier is the
 * ephemeral, OS-assigned listen(0) port.
 *
 * This matches Chrome's own remote-debugging-port /json/version and is not a regression. The
 * real gain of this design lies elsewhere: only the in-app browser webview is exposed and the
 * main window never is (see the getType() check in attachInternal). Treating same-user local
 * processes as inside the trust boundary is an explicit assumption here.
 */
export const startCdpBridge = async (): Promise<CdpBridgeHandle> => {
  const token = randomBytes(24).toString('hex');

  const httpServer: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    const wsUrl = `ws://${HOST}:${port}${WS_PATH}?token=${token}`;
    const info = currentTargetInfo();

    if (url.pathname === '/json/version') {
      writeJson(res, buildVersionPayload(wsUrl, process.versions.chrome ?? '0.0.0.0'));
      return;
    }
    if (url.pathname === '/json/list' || url.pathname === '/json') {
      writeJson(res, buildListPayload(wsUrl, info.title, info.url));
      return;
    }
    res.writeHead(404).end('not found');
  });

  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    if (url.pathname !== WS_PATH || !tokensMatch(token, url.searchParams.get('token') ?? '')) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      const announcedSessions = new Set<string>();
      ws.on('message', (data) => void handleSocketMessage(ws, data.toString(), announcedSessions));
      ws.on('close', () => sockets.delete(ws));
      ws.on('error', () => sockets.delete(ws));
    });
  });

  const port = await new Promise<number>((resolve, reject) => {
    httpServer.once('error', reject);
    // 端口 0 = 让系统分配空闲端口，避免和别的服务撞。
    // Port 0 lets the OS pick a free port so we cannot collide with another service.
    httpServer.listen(0, HOST, () => {
      const addr = httpServer.address();
      if (addr && typeof addr === 'object') resolve(addr.port);
      else reject(new Error('Could not determine bridge port'));
    });
  });

  return {
    port,
    token,
    attachedWebContentsId: () => (attached && !attached.contents.isDestroyed() ? attached.contents.id : null),
    attach: attachInternal,
    detach: detachInternal,
    close: async () => {
      detachInternal();
      for (const ws of sockets) ws.close();
      sockets = new Set();
      await new Promise<void>((resolve) => {
        wss.close(() => httpServer.close(() => resolve()));
      });
    },
  };
};
