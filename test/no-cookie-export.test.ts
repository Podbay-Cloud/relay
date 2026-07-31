import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

/**
 * Credentials do not move machines. The relay returns page CONTENT to a pod, never the
 * session that fetched it — exporting storageState/cookies to a pod would put a live
 * credential on a volume an agent controls, and undo the whole reason the relay exists.
 * This guards the boundary against a well-meaning future "optimisation".
 */
describe("the relay never exports its session to a pod", () => {
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts")).map((f) => readFileSync(path.join(srcDir, f), "utf8"));

  it("uses no storageState / cookie export API", () => {
    for (const src of files) {
      expect(src).not.toMatch(/storageState|context\.cookies\(\)|exportCookies/);
    }
  });

  it("no source path EXPORTS cookies or storage state", () => {
    // The `session: boolean` flag on a result is metadata (was this fetched as the
    // owner?), not a credential. The boundary is that no cookie/storageState is ever
    // read out and sent — that is what these APIs would be.
    for (const src of files) {
      expect(src).not.toMatch(/storageState|\.cookies\(|exportCookies|context\.cookies/);
    }
  });
});
