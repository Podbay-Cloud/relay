import { appendFileSync, readFileSync } from "node:fs";
import { auditFile } from "./config.js";

/** Append one fetch to the local audit — the owner's window into what their relay did.
 * Best-effort: a failed write must never fail a fetch. */
export function record(entry: { host: string; status: number; ms: number; session: boolean; error?: string }): void {
  try {
    appendFileSync(auditFile(), JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n");
  } catch {
    /* best-effort */
  }
}

export interface AuditSummary {
  total: number;
  ok: number;
  refused: number;
  sessionFetches: number;
  byHost: { host: string; count: number; errors: number; session: boolean }[];
}

/** Summarise the audit for `pb relay stats`. Pure over the log's text so it is testable. */
export function summarize(text: string): AuditSummary {
  const rows = text.split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l) as { host: string; status: number; session: boolean; error?: string }]; } catch { return []; }
  });
  const byHost = new Map<string, { count: number; errors: number; session: boolean }>();
  let ok = 0, refused = 0, sessionFetches = 0;
  for (const r of rows) {
    const h = byHost.get(r.host) ?? { count: 0, errors: 0, session: false };
    h.count++;
    if (r.error) h.errors++;
    if (r.session) { h.session = true; sessionFetches++; }
    byHost.set(r.host, h);
    if (r.error) refused++;
    else if (r.status >= 200 && r.status < 400) ok++;
  }
  return {
    total: rows.length,
    ok,
    refused,
    sessionFetches,
    byHost: [...byHost.entries()].map(([host, v]) => ({ host, ...v })).sort((a, b) => b.count - a.count),
  };
}

export function readSummary(): AuditSummary {
  try { return summarize(readFileSync(auditFile(), "utf8")); } catch { return summarize(""); }
}
