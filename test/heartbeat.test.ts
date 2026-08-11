import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { attachHeartbeat, type HeartbeatSocket } from "../src/heartbeat.js";

function fakeWs() {
  const ee = new EventEmitter();
  const ping = vi.fn();
  const terminate = vi.fn();
  const ws = ee as unknown as HeartbeatSocket & EventEmitter & { ping: typeof ping; terminate: typeof terminate };
  ws.ping = ping;
  ws.terminate = terminate;
  return ws;
}

describe("relay heartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("pings each interval and terminates a link that stops answering", () => {
    const ws = fakeWs();
    attachHeartbeat(ws, 1000);
    vi.advanceTimersByTime(1000); // alive was true → ping, mark not-alive
    expect(ws.ping).toHaveBeenCalledTimes(1);
    expect(ws.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000); // still no pong → dead → terminate (so `close` fires → reconnect)
    expect(ws.terminate).toHaveBeenCalledTimes(1);
  });

  it("stays alive while pongs arrive", () => {
    const ws = fakeWs();
    attachHeartbeat(ws, 1000);
    vi.advanceTimersByTime(1000);
    ws.emit("pong");
    vi.advanceTimersByTime(1000);
    expect(ws.terminate).not.toHaveBeenCalled();
  });

  it("counts any inbound frame as liveness, not just pongs", () => {
    const ws = fakeWs();
    attachHeartbeat(ws, 1000);
    vi.advanceTimersByTime(1000);
    ws.emit("message", "x");
    vi.advanceTimersByTime(1000);
    expect(ws.terminate).not.toHaveBeenCalled();
  });

  it("stops the timer on close", () => {
    const ws = fakeWs();
    attachHeartbeat(ws, 1000);
    ws.emit("close");
    vi.advanceTimersByTime(5000);
    expect(ws.ping).not.toHaveBeenCalled();
    expect(ws.terminate).not.toHaveBeenCalled();
  });
});
