import { createServer } from "node:http";
import { readSummary } from "./audit.js";

/**
 * A local web view of what the relay has fetched — served on the owner's own machine,
 * never exposed anywhere. This is the oversight that replaces per-request approval:
 * the owner can see, at any time, which sites were read, which used their session, and
 * what was refused.
 */
const PAGE = `<!doctype html><meta charset=utf8><title>podbay relay</title>
<style>
 :root{color-scheme:light dark}
 body{font:14px/1.5 system-ui,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem}
 h1{font-size:18px} .sub{color:#888;margin:-.3rem 0 1.2rem}
 .row{display:flex;gap:1.5rem;margin:.6rem 0 1.2rem}
 .stat b{font-size:22px;display:block} .stat span{color:#888;font-size:12px}
 table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
 th,td{text-align:left;padding:.4rem .6rem;border-bottom:1px solid #8883}
 th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#888}
 .tag{font-size:11px;padding:.1rem .4rem;border-radius:4px;background:#e0af6822;color:#e0af68}
 .err{color:#e5484d} td.n{text-align:right}
</style>
<h1>podbay relay</h1>
<p class=sub>What this machine has fetched for your pods. Local only.</p>
<div class=row id=stats></div>
<table><thead><tr><th>site<th class=n>fetches<th class=n>failed<th>session</tr></thead><tbody id=rows></tbody></table>
<script>
async function tick(){
 const s = await (await fetch('/data')).json();
 stats.innerHTML = [['fetches',s.total],['ok',s.ok],['refused',s.refused],['as you',s.sessionFetches]]
   .map(([k,v])=>'<div class=stat><b>'+v+'</b><span>'+k+'</span></div>').join('');
 rows.innerHTML = s.byHost.map(h=>'<tr><td>'+h.host+'<td class=n>'+h.count+
   '<td class="n '+(h.errors?'err':'')+'">'+(h.errors||'')+'<td>'+(h.session?'<span class=tag>as you</span>':'')+'</tr>').join('')
   || '<tr><td colspan=4 style=color:#888>nothing fetched yet</tr>';
}
tick(); setInterval(tick, 2000);
</script>`;

export function serveDashboard(port = 7373): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === "/data") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(readSummary()));
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
    });
    // Bind to loopback ONLY — the dashboard shows the owner's fetch history and must
    // not be reachable from the network.
    server.listen(port, "127.0.0.1", () => {
      resolve({ url: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}
