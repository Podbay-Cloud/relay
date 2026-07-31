import type { FetchJob, FetchOutput, Fetcher } from "./relay-client.js";

/**
 * Fetch a page on the OWNER's machine, choosing the session per the login policy.
 *
 *  - A host the owner explicitly signed into (`isSessionDomain`) is fetched in the
 *    PERSISTENT profile — as them, with their cookies. That is the deliberate,
 *    opt-in "fetch as me".
 *  - Every other host is fetched in a fresh EPHEMERAL context with no cookies — the
 *    residential IP, but not the owner's accounts. So a prompt-injected pod fetching
 *    gmail.com gets a logged-out page, not the owner's inbox.
 *
 * Both contexts: one page per request, always closed; warm and recycled after N pages;
 * scrape and return bytes, never an eval channel or a live handle.
 */
export interface BrowserOptions {
  profileDir: string;
  channel?: string;
  navTimeoutMs?: number;
  recycleAfter?: number;
  headless?: boolean;
  /** Does this host use the owner's signed-in session? Read from config per fetch. */
  isSessionDomain: (host: string) => boolean;
}

interface Page {
  goto(url: string, o: { waitUntil: string; timeout: number }): Promise<{ status(): number } | null>;
  content(): Promise<string>;
  url(): string;
  waitForTimeout(ms: number): Promise<void>;
  close(): Promise<void>;
}
interface Context {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export class BrowserFetcher {
  private browser: { newContext(o?: Record<string, unknown>): Promise<Context> } | null = null;
  private session: Context | null = null; // persistent profile (login domains)
  private served = 0;

  constructor(private readonly opts: BrowserOptions) {}

  private async pw() {
    return (await import("playwright").catch(() => {
      throw new Error("Playwright missing. The relay bundles it; reinstall: npx @podbay/pb@latest");
    })) as typeof import("playwright");
  }

  /**
   * Launch, preferring the owner's installed Chrome (no download) and falling back to
   * Playwright's bundled Chromium. A missing browser entirely is a clear, actionable
   * error, not a stack trace.
   */
  private async launch<T>(fn: (o: Record<string, unknown>) => Promise<T>): Promise<T> {
    const base = { headless: this.opts.headless ?? true, viewport: { width: 1440, height: 900 } };
    try {
      return await fn({ ...base, channel: this.opts.channel ?? "chrome" });
    } catch {
      try {
        return await fn(base); // bundled chromium
      } catch (e) {
        throw new Error(
          `no browser found. Install one for the relay: npx playwright install chromium  (${String(e).slice(0, 80)})`,
        );
      }
    }
  }

  private async sessionCtx(): Promise<Context> {
    if (this.session) return this.session;
    const pw = await this.pw();
    this.session = (await this.launch((o) =>
      pw.chromium.launchPersistentContext(this.opts.profileDir, o),
    )) as unknown as Context;
    return this.session;
  }

  private async cleanCtx(): Promise<Context> {
    if (!this.browser) {
      const pw = await this.pw();
      this.browser = (await this.launch((o) => pw.chromium.launch(o))) as unknown as {
        newContext(o?: Record<string, unknown>): Promise<Context>;
      };
    }
    return this.browser.newContext({ viewport: { width: 1440, height: 900 } });
  }

  readonly fetch: Fetcher = async (job: FetchJob): Promise<FetchOutput> => {
    const host = hostOf(job.url);
    const useSession = this.opts.isSessionDomain(host);
    const ctx = useSession ? await this.sessionCtx() : await this.cleanCtx();
    const page = await ctx.newPage();
    try {
      const res = await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: this.opts.navTimeoutMs ?? 35_000 });
      await page.waitForTimeout(1500);
      const out: FetchOutput = { status: res?.status() ?? 0, body: await page.content(), finalUrl: page.url(), session: useSession };
      this.served++;
      return out;
    } finally {
      await page.close().catch(() => undefined);
      // Ephemeral contexts are closed immediately (each is single-use); the persistent
      // session stays warm. Recycle the shared clean browser after N pages.
      if (!useSession) await ctx.close().catch(() => undefined);
      if (this.served >= (this.opts.recycleAfter ?? 200) && this.browser) {
        const b = this.browser as unknown as { close(): Promise<void> };
        this.browser = null;
        this.served = 0;
        await b.close().catch(() => undefined);
      }
    }
  };

  async close(): Promise<void> {
    await this.session?.close().catch(() => undefined);
    await (this.browser as unknown as { close?(): Promise<void> })?.close?.().catch(() => undefined);
  }
}
