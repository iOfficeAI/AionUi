/**
 * WebSocket client with automatic reconnection, heartbeat keep-alive,
 * and typed event dispatch for aionui-backend communication.
 *
 * Usage:
 *   const ws = createWebSocketClient('ws://127.0.0.1:9123/ws')
 *   const unsub = ws.on('chat:message', (payload) => { ... })
 *   ws.send('chat:send', { text: 'hello' })
 *   // later
 *   unsub()
 *   ws.close()
 */

type WsMessage = {
  event: string
  payload: unknown
}

type EventHandler = (payload: unknown) => void

type WebSocketClient = {
  /** Subscribe to an event. Returns an unsubscribe function. */
  on: (event: string, handler: EventHandler) => () => void
  /** Send a typed event with payload. */
  send: (event: string, payload: unknown) => void
  /** Gracefully close the connection (no reconnect). */
  close: () => void
}

type WebSocketClientOptions = {
  /** Maximum number of reconnect attempts before giving up (default: Infinity). */
  maxReconnectAttempts?: number
  /** Initial reconnect delay in ms (default: 1000). Doubles each attempt. */
  initialReconnectDelayMs?: number
  /** Maximum reconnect delay in ms (default: 30000). */
  maxReconnectDelayMs?: number
  /** Heartbeat ping interval in ms (default: 30000). */
  heartbeatIntervalMs?: number
}

const DEFAULT_OPTIONS: Required<WebSocketClientOptions> = {
  maxReconnectAttempts: Infinity,
  initialReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30_000,
  heartbeatIntervalMs: 30_000,
}

export function createWebSocketClient(
  url: string,
  options?: WebSocketClientOptions,
): WebSocketClient {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const listeners = new Map<string, Set<EventHandler>>()

  let ws: WebSocket | null = null
  let closed = false
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  function connect(): void {
    if (closed) return

    ws = new WebSocket(url)

    ws.addEventListener('open', () => {
      reconnectAttempt = 0
      startHeartbeat()
    })

    ws.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as WsMessage
        const handlers = listeners.get(msg.event)
        if (handlers) {
          for (const handler of handlers) {
            handler(msg.payload)
          }
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.addEventListener('close', () => {
      stopHeartbeat()
      if (!closed) scheduleReconnect()
    })

    ws.addEventListener('error', () => {
      // The 'close' event fires after 'error', which triggers reconnect.
    })
  }

  function scheduleReconnect(): void {
    if (closed) return
    if (reconnectAttempt >= opts.maxReconnectAttempts) return

    const delay = Math.min(
      opts.initialReconnectDelayMs * Math.pow(2, reconnectAttempt),
      opts.maxReconnectDelayMs,
    )
    reconnectAttempt++

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function startHeartbeat(): void {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: 'ping', payload: null }))
      }
    }, opts.heartbeatIntervalMs)
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  // Kick off the initial connection
  connect()

  return {
    on(event: string, handler: EventHandler): () => void {
      let handlers = listeners.get(event)
      if (!handlers) {
        handlers = new Set()
        listeners.set(event, handlers)
      }
      handlers.add(handler)

      return () => {
        handlers!.delete(handler)
        if (handlers!.size === 0) listeners.delete(event)
      }
    },

    send(event: string, payload: unknown): void {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event, payload }))
      }
    },

    close(): void {
      closed = true
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      stopHeartbeat()
      if (ws) {
        ws.close()
        ws = null
      }
      listeners.clear()
    },
  }
}
