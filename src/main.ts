#!/usr/bin/env node
import WebSocket from "ws";
import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load, save, addLoginDomain, resetProfile, profileDir, pidFile, RelayConfig } from "./config.js";
import { RelayClient } from "./relay-client.js";
import { BrowserFetcher } from "./browser-fetcher.js";
import { record } from "./audit.js";
import { serveDashboard } from "./dashboard.js";
import { DISCLOSURE } from "./disclosure.js";
import { normalizeDomain } from "./domain.js";

/**
 * `pb relay` — one command starts a background relay; login/dashboard/stop modify it
 * through disk state (config, audit log, pidfile). No per-request approval: once
 * running, the pod fetches the public web freely; the owner watches via the dashboard.
 */
process.stdout.on("error", (e: NodeJS.ErrnoException) => { if (e.code === "EPIPE") process.exit(0); });
const log = (s = ""): void => { try { process.stdout.write(s + "\n"); } catch { /* EPIPE */ } };
const die = (s: string): never => { process.stderr.write(`pb: ${s}\n`); process.exit(1); };
const arg = (a: string[], f: string) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };

function isRunning(): number | null {
  try {
    const pid = Number(readFileSync(pidFile(), "utf8").trim());
    process.kill(pid, 0); // throws if not alive
    return pid;
  } catch {
    return null;
  }
}

async function cmdStart(a: string[]): Promise<void> {
  if (a.includes("__daemon")) return runDaemon(a);
  if (isRunning()) die("a relay is already running (pb relay stop to stop it).");

  const cfg = load();
  const gateway = arg(a, "--gateway") ?? cfg.gatewayUrl ?? die("need --gateway wss://…");
  const code = arg(a, "--code") ?? die("need --code (from your dashboard)");

  if (!cfg.consentedAt) {
    log(DISCLOSURE);
    if (!a.includes("--accept")) die("\nre-run with --accept to agree and start the relay.");
    cfg.consentedAt = new Date().toISOString();
  }
  cfg.gatewayUrl = gateway;
  save(cfg);

  // Spawn ourselves detached: one command, then it runs in the background.
  mkdirSync(profileDir().replace(/\/profile$/, ""), { recursive: true });
  const self = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, [self, "relay", "start", "__daemon", "--gateway", gateway, "--code", code], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  writeFileSync(pidFile(), String(child.pid));
  log(`relay started in the background (pid ${child.pid}).`);
  log("  pb relay dashboard  see what it has fetched");
  log("  pb relay login X  let site X be fetched as you");
  log("  pb relay stop     stop it");
}

async function runDaemon(a: string[]): Promise<void> {
  const gateway = arg(a, "--gateway")!;
  const code = arg(a, "--code")!;
  const browser = new BrowserFetcher({
    profileDir: profileDir(),
    // Re-read config each fetch: `pb relay login` writes there and we pick it up live.
    isSessionDomain: (host) => load().loginDomains.some((d) => host === d || host.endsWith(`.${d}`)),
  });
  let stopping = false;
  let backoff = 1000;

  const connect = () => {
    const ws = new WebSocket(`${gateway.replace(/\/$/, "")}/relay?code=${encodeURIComponent(code)}`);
    const client = new RelayClient({ send: (j) => { try { ws.send(j); } catch { /* closing */ } } }, browser.fetch, { audit: record });
    ws.on("open", () => { backoff = 1000; });
    ws.on("message", (d) => void client.onMessage(String(d)));
    ws.on("error", () => {});
    ws.on("close", (c) => {
      if (stopping) return;
      // 4401 = the pairing code was rejected; retrying is pointless, so exit.
      if (c === 4401) return void stop();
      // Otherwise a blip or a slept laptop — reconnect with backoff so the relay
      // survives without the owner restarting it.
      setTimeout(connect, Math.min(backoff, 30_000));
      backoff *= 2;
    });
  };

  const stop = async () => { stopping = true; await browser.close(); try { unlinkSync(pidFile()); } catch {} process.exit(0); };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
  connect();
}

async function cmdLogin(a: string[]): Promise<void> {
  const domain = normalizeDomain(a[0] ?? die("usage: pb relay login <domain>"));
  const pw = (await import("playwright").catch(() =>
    die("Playwright missing — reinstall: npx @podbay/pb@latest"),
  )) as typeof import("playwright");
  log(`opening a browser so you can sign in to ${domain}. This is the relay's OWN profile.`);
  const ctx = await pw.chromium.launchPersistentContext(profileDir(), { headless: false, channel: "chrome" });
  await ctx.newPage().then((p) => p.goto(`https://${domain}`, { waitUntil: "domcontentloaded" })).catch(() => undefined);
  log("sign in (2FA included), then close the window to save.");
  await new Promise<void>((r) => ctx.on("close", () => r()));
  addLoginDomain(domain);
  log(`saved. ${domain} will now be fetched as you; every other site stays a clean, cookieless fetch.`);
}

async function cmdDashboard(a: string[]): Promise<void> {
  const port = Number(arg(a, "--port") ?? 7373);
  const { url } = await serveDashboard(port);
  log(`relay dashboard: ${url}`);
  log("(local only — shows what your relay has fetched. Ctrl-C to close.)");
  // Best-effort open in the browser.
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).unref();
  await new Promise(() => {}); // stay up until Ctrl-C
}

function cmdStatus(): void {
  const pid = isRunning();
  const cfg = load();
  log(`relay:    ${pid ? `running (pid ${pid})` : "not running"}`);
  log(`gateway:  ${cfg.gatewayUrl ?? "(unset)"}`);
  log(`as-you:   ${cfg.loginDomains.length ? cfg.loginDomains.join(", ") : "no sites signed in — all fetches are clean"}`);
}

function cmdStop(): void {
  const pid = isRunning();
  if (!pid) return log("no relay running.");
  process.kill(pid, "SIGTERM");
  try { unlinkSync(pidFile()); } catch {}
  log("relay stopped.");
}

async function relay(a: string[]): Promise<void> {
  switch (a[0]) {
    case "start": return cmdStart(a.slice(1));
    case "login": return cmdLogin(a.slice(1));
    case "dashboard": return cmdDashboard(a.slice(1));
    case "status": return cmdStatus();
    case "stop": return cmdStop();
    case "reset": resetProfile(); return log("wiped the relay's sessions and login list.");
    default:
      log("usage: pb relay <start|login|dashboard|status|stop|reset>");
      log("  start --gateway <url> --code <code> [--accept]   run the relay in the background");
      log("  login <domain>    let one site be fetched as you (everything else stays clean)");
      log("  dashboard         open a local page of what it has fetched");
      log("  status | stop | reset");
  }
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "relay") return relay(rest);
  log("usage: pb relay <start|login|dashboard|status|stop|reset>");
}
void main();
