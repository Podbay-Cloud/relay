import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * The relay's state on the owner's machine. Disk IS the shared state between the
 * background daemon and the `login`/`dashboard`/`stop` commands — no IPC needed: login
 * writes here and the daemon re-reads it per fetch; dashboard reads the audit log; stop
 * reads the pidfile. Simpler and more robust than a socket.
 */
export interface RelayConfig {
  gatewayUrl?: string;
  /** Domains the owner explicitly signed into — these, and only these, are fetched
   * with their session. Everything else is a clean, cookieless fetch. */
  loginDomains: string[];
  consentedAt?: string;
}

const dir = () => process.env.PB_RELAY_HOME ?? path.join(homedir(), ".podbay", "relay");
const file = () => path.join(dir(), "config.json");
export const profileDir = () => path.join(dir(), "profile");
export const pidFile = () => path.join(dir(), "relay.pid");
export const auditFile = () => path.join(dir(), "fetch-audit.jsonl");

export function load(): RelayConfig {
  try {
    return { loginDomains: [], ...(JSON.parse(readFileSync(file(), "utf8")) as Partial<RelayConfig>) } as RelayConfig;
  } catch {
    return { loginDomains: [] };
  }
}

export function save(cfg: RelayConfig): void {
  mkdirSync(dir(), { recursive: true, mode: 0o700 });
  writeFileSync(file(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

export function addLoginDomain(domain: string): void {
  const cfg = load();
  if (!cfg.loginDomains.includes(domain)) cfg.loginDomains.push(domain);
  save(cfg);
}

export function resetProfile(): void {
  if (existsSync(profileDir())) rmSync(profileDir(), { recursive: true, force: true });
  const cfg = load();
  cfg.loginDomains = [];
  save(cfg);
}
