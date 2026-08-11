/**
 * Detect a DEAD gateway link and force it closed so the relay's reconnect fires.
 *
 * The relay already reconnects with backoff on `ws.on("close")` — but a slept laptop
 * or a network change leaves the WebSocket HALF-OPEN: no FIN/RST arrives, so `close`
 * never fires and the socket still reads as OPEN. The relay then sits on a zombie link,
 * reporting "connected" while all egress silently fails, until the owner manually
 * restarts it (reported by the afisha crawler, 2026-08-11).
 *
 * A ping/pong heartbeat closes that gap: every `intervalMs` we ping; if a full interval
 * passes with no pong and no other inbound traffic, the link is dead → `terminate()` →
 * the existing `close` handler runs its backoff reconnect. Also covers network changes.
 */
export interface HeartbeatSocket {
  on(event: "pong" | "message" | "close", listener: (...args: unknown[]) => void): unknown;
  off?(event: "pong" | "message" | "close", listener: (...args: unknown[]) => void): unknown;
  ping(): void;
  terminate(): void;
}

/**
 * Attach a liveness heartbeat to an OPEN socket. Returns a cleanup function; it also
 * self-clears on `close`, so callers can usually just call it and forget it.
 */
export function attachHeartbeat(ws: HeartbeatSocket, intervalMs = 20_000): () => void {
  let alive = true;
  // A pong OR any inbound frame proves the link is live — a busy relay may never sit
  // idle long enough to need a ping, and that's fine.
  const markAlive = (): void => {
    alive = true;
  };
  ws.on("pong", markAlive);
  ws.on("message", markAlive);
  const timer = setInterval(() => {
    if (!alive) {
      // No pong/traffic since the last tick → the link is a zombie. Force it closed so
      // the reconnect fires; a healthy link would have answered the previous ping.
      try {
        ws.terminate();
      } catch {
        /* already gone */
      }
      return;
    }
    alive = false;
    try {
      ws.ping();
    } catch {
      /* socket closing between ticks */
    }
  }, intervalMs);
  // Never let the heartbeat alone keep the process alive.
  (timer as { unref?: () => void }).unref?.();
  const clear = (): void => {
    clearInterval(timer);
    ws.off?.("pong", markAlive);
    ws.off?.("message", markAlive);
  };
  ws.on("close", clear);
  return clear;
}
