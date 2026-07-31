import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { load, save, resetProfile, profileDir } from "../src/config.js";

let home: string;
beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "pb-"));
  process.env.PB_RELAY_HOME = home;
});
afterEach(() => {
  delete process.env.PB_RELAY_HOME;
  rmSync(home, { recursive: true, force: true });
});

describe("relay config on the owner's machine", () => {
  it("round-trips login domains and consent", () => {
    save({ loginDomains: ["reddit.com"], consentedAt: "2026-01-01" });
    const cfg = load();
    expect(cfg.loginDomains).toEqual(["reddit.com"]);
    expect(cfg.consentedAt).toBe("2026-01-01");
  });

  it("returns empty login domains when nothing is saved", () => {
    expect(load().loginDomains).toEqual([]);
  });

  it("writes the config file with owner-only permissions", () => {
    // The dir holds live sessions and the file lists lent domains.
    save({ grants: [] });
    const mode = statSync(path.join(home, "config.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("reset wipes the profile (sessions) but the caller keeps the grants", () => {
    mkdirSync(profileDir(), { recursive: true });
    writeFileSync(path.join(profileDir(), "Cookies"), "secret");
    save({ loginDomains: ["reddit.com"] });
    resetProfile();
    expect(existsSync(profileDir())).toBe(false);
    // reset wipes the login list too — the sessions it referred to are gone.
    expect(load().loginDomains).toEqual([]);
  });
});
