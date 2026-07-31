# pb — the Podbay relay

`pb relay` runs a small **fetch relay** on your own machine so a Podbay pod can read
web pages **from your network** instead of from a datacenter. Many sites block cloud
IPs at the edge; the relay lets your pod's research agent read them from your home
address — and, only where you choose, using sites you're signed into.

```bash
# your pod will print the exact command, pinned to a version and pairing code:
npx @podbay/pb@<version> relay start --code <code> --accept
```

That's it — it runs in the background and serves fetches for your pods.

## What it does, and doesn't

- **Open by default, clean by default.** Once running, your pod can fetch the public
  web through it. Every fetch uses a **fresh, cookie-less browser** — your residential
  IP, but none of your accounts.
- **Fetch a site *as you* only when you say so.** `pb relay login <site>` opens a
  browser, you sign in once, and from then on **that site** is fetched with your
  session. Everything else stays clean. A pod can never read an account you didn't
  explicitly lend.
- **Never your private network.** It refuses localhost, your LAN, and private IPs — a
  pod cannot make your machine reach your own router or internal services.
- **Never your session, only pages.** It returns page content to the pod, never a
  cookie or a login.
- **You can watch it.** `pb relay dashboard` opens a local page of everything it has
  fetched.

## Commands

| command | what |
|---|---|
| `pb relay start --code <c> --gateway <url> --accept` | run the relay in the background |
| `pb relay login <domain>` | let one site be fetched as you |
| `pb relay dashboard` | local page of what it has fetched |
| `pb relay status` | is it running, and what's lent |
| `pb relay stop` | stop it |
| `pb relay reset` | wipe its saved sessions |

## Trust

This program holds the browser sessions you sign into and fetches on your behalf, so
it is **open source (Apache-2.0)** — read exactly what it does before you run it. It
uses a **separate browser profile it owns**; your everyday browser, history and
cookies are never touched. Automating a signed-in session may breach a site's terms,
and the account at risk is yours.
