# Changelog

All notable changes to `pb` (the Podbay relay CLI). This mirrors the package published to
npm as [`@podbay/pb`](https://www.npmjs.com/package/@podbay/pb).

## 0.1.7

- **Relay concurrency ceiling is now legible.** `pb relay check` reports live capacity
  (e.g. "N of 32 streams in use"), and refusals are classified — capacity, rate limit, or
  no-relay — so a client can size its concurrency to the cap and back off on the right signal
  instead of guessing.
- **Tunnel guard fails closed on an undeterminable peer.** If a connection's remote address
  cannot be resolved, it is refused rather than allowed through.

## 0.1.6

- **Owner command center.** The local relay dashboard: chronological activity, per-pod and
  per-site summaries, live in-flight fetches and tunnel connections, and owner controls
  (stop the relay, pause a pod, block a site, revoke signed-in use).
- Dashboard accounting fix.

## 0.1.5

- **Relay egress tunnel, end to end.** A pod can drive a real browser whose connection comes
  from *your* IP (gateway routing + owner-side dialing) — the answer to sites that block
  datacenter ranges at the edge. Exposed to pods as `$PODBAY_RELAY_PROXY`, and it fails closed.
- Tighter cookie-export guard.

## 0.1.4

- Relay watchdog and a login-hang fix; sign-in verification.

## 0.1.3

- Relay login quits the browser itself when you close the window.

## 0.1.2

- Durable reconnect token — the relay survives restarts and connection blips; coloured CLI output.

## 0.1.1

- Fixed help/disclosure text that referenced a removed command.
