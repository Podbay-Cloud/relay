import { describe, it, expect } from "vitest";
import { summarize } from "../src/audit.js";

describe("fetch audit — the owner's window into what the relay did", () => {
  it("summarises hosts, session use, and failures", () => {
    const log = [
      { host: "reddit.com", status: 200, session: true },
      { host: "reddit.com", status: 200, session: true },
      { host: "example.com", status: 200, session: false },
      { host: "blocked.com", status: 0, session: false, error: "refused" },
    ].map((r) => JSON.stringify(r)).join("\n");
    const s = summarize(log);
    expect(s.total).toBe(4);
    expect(s.ok).toBe(3);
    expect(s.refused).toBe(1);
    expect(s.sessionFetches).toBe(2);
    expect(s.byHost[0]).toMatchObject({ host: "reddit.com", count: 2, session: true });
  });

  it("tolerates a garbage line", () => {
    expect(summarize('{"host":"a.com","status":200}\nnot json\n').total).toBe(1);
  });
});
