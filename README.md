# Squeek Relay

A playable hamster relay powered by Squeektoshi’s real wheel. One motor changes everyone’s track: running brings speed and boost energy; sleeping turns the track to ice.

The production website is in **[dist/](dist/)**. It is a static Vite / React / TypeScript export with relative assets, suitable for an IPFS gateway subpath and an eth.limo site. The publishing plane can serve this directory as-is. No deployment command, private service, environment file, or API key is needed.

## Install, run, and rebuild

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Create and preview the export:

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

Open the preview address printed by Vite. Serve the site over HTTP(S); opening `index.html` directly with `file://` does not support ES modules correctly. Vite’s `base: './'` keeps the built URLs relative. Source, package manifest, lockfile, local runtime assets, and the finished export are included.

## Play

- Select **Play as guest**. The local nickname is editable; no wallet is needed.
- Use **Left / Right**, **A / D**, or the on-screen arrow buttons to switch among three lanes.
- Catch gold batons. Every three increases your combo, up to 8×.
- Press **Space** or tap **Boost**. A surge lasts 1.8 seconds, costs 25% energy, and multiplies speed by 2.2. Energy recharges at 8% per second only while the real hamster runs and no surge is active.
- Sleep makes the track icy. Avoid ice patches and sleeping runners, which reset the combo. The first baton is close enough to collect within a few seconds even at the sleeping crawl.
- **P / Escape** pauses or resumes. The real heat clock continues; leaving the tab or opening help pauses gameplay too. Sound can be muted in the header or in help on mobile.

The big race meter is **meters ridden**, `floor(distance)`. The “N m distance” chip and the end card’s big number use the same `meters()` function on the same game state, so they always match, including after a pause or an outage freeze. The score is `floor(distance × final combo)` and is always labelled in **points (pts)**, never as meters. It is an arcade score, with no token or monetary reward. A normal heat ends at the current round boundary. If verified timing is unavailable, the lifecycle is unsuitable, or fewer than 12 seconds remain, it uses a 90-second heat. The title also offers an explicit 90-second quick heat.

## Live Squeekchain data

The app reads these public APIs directly from the browser:

| API | Fields and behavior |
| --- | --- |
| [GET /v1/status](https://api.squeekchain.com/v1/status) | `measurement.rpmMilli`, `coreStatus`, `cumulativeWorkUnits`, `freshness`, `observedAt`, and `staleAfterSeconds`. RPM is `rpmMilli / 1000`. Base game speed is `min(RPM × 0.4, 38)` m/s. |
| [GET /v1/economy/state](https://api.squeekchain.com/v1/economy/state) | `lifecycle.currentRound`, `stage`, and `paused`. Supplies the displayed round and gates scoring during a lifecycle pause. |
| [GET /v1/core](https://api.squeekchain.com/v1/core) | `configuration.genesisTimestamp` and `roundDuration`, fetched initially and on manual reconnect. Used with the economy round to derive its real end time. No guessed genesis timestamp is embedded. |

`/v1/status` and `/v1/economy/state` are polled **directly** from `https://api.squeekchain.com` (CORS `*`) every **2.5 seconds**, each on its own loop so a slow round feed never delays the wheel. Every attempt is aborted after **3 seconds** and immediately retried on a second direct route that bypasses the HTTP cache (`cache: "no-store"`; the API rejects unknown query parameters, so no cache-buster is added). No third-party proxy is used, and the app registers no service worker.

The round feed often answers **HTTP 200 with `{"status":"unavailable","reason":"indexer_unavailable"}`** while its indexer catches up (seen repeatedly on 2026-11-03). That is a reachable API, not an outage: the last real round stays on screen marked “last seen” and the HUD stays LIVE. The earlier build treated it as a failure, which is why QA saw RECONNECTING while the API was healthy. The browser’s `navigator.onLine` flag is not trusted either (headless Chromium reports `false` while requests succeed): the `offline`/`online` events only trigger an immediate re-poll, and the real answers decide.

A real failure (network error, non-2xx, unparseable wheel data, a status reading older than 7 seconds, or two missed round polls in a row) shows **OFFLINE / RECONNECTING**: scoring, recharge and the distance meter freeze, RPM shows “—”, and work units are marked “last seen”. Nothing is estimated. The next real reading resumes the race from live values. Before the first reading the badge reads **SYNC / CONNECTING**, which on a healthy API lasts well under a second. Freshness is judged on the server’s `generatedAt` clock, so a device with the wrong time is not shown stale. Stale measurements produce blue frost and pause scoring. A fresh, sleeping motor permits only a 0.6 m/s crawl, cancels boost, and cannot recharge it. This deliberately distinguishes genuine sleep from missing data.

Work units are displayed from the measured integer string using `BigInt`; they change only when the API reports a new total. They are never interpolated. No fabricated chain data, offline simulation, or runtime demo switch is shipped. The in-game **How it works** dialog names the APIs and explains the rules. See the primary [API documentation](https://docs.squeekchain.com/developers/api/) and [round definition](https://docs.squeekchain.com/system/rounds-and-blocks/).

## Hosting and gateway fallback

The plane publishes `dist/` under **squeek-relay-one-hamster-all-of.identitymd.eth**. The title screen has a “Page slow to load?” line linking public gateways for the **live CID**. The CID is found at runtime: from a `<cid>.ipfs.` host or `/ipfs/<cid>/` path, otherwise from the gateway’s `X-Ipfs-Path`/`X-Ipfs-Roots` headers (eth.limo sends them), otherwise from ENS DNSLink through `https://dns.eth.limo/dns-query`. The links then point to `https://<cid>.ipfs.dweb.link/` and `https://<cid>.ipfs.inbrowser.link/`. Until the CID is known they use the ENS-name form (`squeek--relay--one--hamster--all--of-identitymd-eth.ipns.dweb.link`).

**eth.limo TLS (QA item 1):** this job cannot fix it in the site’s files. On 2026-11-03 `https://squeek-relay-one-hamster-all-of.identitymd.eth.limo/` failed the TLS handshake with a server-side `tlsv1 alert internal error`, before any content was served. A made-up label under `identitymd.eth.limo` fails the same way, while `identitymd.eth.limo` itself and other names complete TLS, and ENS DNSLink for this name resolves correctly through eth.limo’s own DoH (`dnslink=/ipfs/bafybeid244duorixf5mo3xu3g57pqfkiskukkoozprvcbcn7gneyqvyq3a`). So eth.limo is not issuing a certificate for this second-level `*.identitymd.eth.limo` name; the site’s bytes are not the cause. The fix needs the publishing plane or eth.limo (certificate issuance for the name), or a shorter top-level label. Until then, the gateway links above reach the same CID.

## Multiplayer and identity

All visitors read the same real hamster motor. **The v1 relay board is explicitly labeled “This device.”** Finished scores live in `localStorage`; a storage event updates other tabs. Same-origin tabs exchange current runners and live scores through `BroadcastChannel`, so friends can race in separate tabs on this browser. No public worldwide score-writing service is implied. The board retains at most 100 completed entries and shows the current heat’s top five.

Wallet identity is optional. One sheet offers named EIP-6963 extensions, Coinbase Wallet / Smart Wallet, and on mobile the MetaMask, Coinbase Wallet, Rabby, and Phantom browser links. No WalletConnect relay or project ID is used. The current API deployment identifies Sepolia, so the connector uses Sepolia when a network switch is needed. A free, readable message includes this origin, address, a fresh nonce, and issue time. EOA signatures are recovered locally; smart account signatures use the public Sepolia RPC for verification. The signed address is attached only to local game scores. The app requests no transactions, approvals, private keys, or seed phrases. Reconnected wallets sign again for a new visit.

## Validation

This fix job’s results, the six-domain Better Interface review and its limitations are in **[VALIDATION.md](VALIDATION.md)**. The implemented design is documented in **[DESIGN.md](DESIGN.md)**.

Final checks for this fix (2026-11-03):

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| Unit tests (`node --import tsx --test tests/*.test.ts`) | 12/12 passed (`npm test` uses the tsx CLI, which could not open its IPC pipe in this sandbox) |
| `npm run build` | Passed; static export in `dist/` |
| `tests/browser.mjs` (Chromium) | 21/22 passed. The live-network check failed only because this sandbox’s Chromium has no internet; the live run below covers it. WebKit was not installed here (recorded limitation). |
| Live 62 s heat against real API answers | LIVE after 0.45 s and in 31 of 31 samples; RPM, work units and round matched the API; offline froze the meter at 38 m for 6 s; recovery in about 0.2 s |
| Pinned `taste.mjs --out test/scratch/taste` | 16/16 checks passed at 320, 390 and 1440 wide |
| Axe WCAG A / AA scans (in the browser suite) | Zero violations in title, wallet, help and race states |

To reproduce browser validation with installed browser dependencies:

```sh
npx playwright install --with-deps chromium webkit
npm run build
npm run test:browser
```

`tests/browser.mjs` starts and closes its own local server at `/preview/`, checks the actual production export, and writes disposable evidence to `test/scratch/browser-validation/`. It first checks the real public feeds, then intercepts APIs **only inside isolated test contexts** to exercise running, sleep, stale, failure, and recovery deterministically. A fresh ephemeral test wallet signs a real message; it is never part of the application or stored in the export. Playwright’s virtual clock exercises a full 90-second heat, while the unit suite also integrates the complete heat’s physics.

The provided browser connector failed to launch, so local Playwright supplied rendered inspection. WebKit initially lacked system libraries, a software EGL renderer, and its GIO TLS module; temporary test dependencies were installed outside the submission, after which its mobile flow and real API console smoke check passed. Native iPhone apps, actual installed wallet extensions, Coinbase passkey creation, screen-reader use, browser-native 200% zoom, and audible SFX quality were not manually tested. Text enlargement to 200% and reduced-motion behavior were tested. The Vite build reports an unused transitive `node:worker_threads` browser-externalization warning; the tested production flows produced no script errors or missing local assets.

## Submission size and generated paths

The explicit **`.gitignore` path budget is 512 bytes** (implemented file: 203 bytes). It excludes `node_modules/`, `.vite/`, `.cache/`, `*.tsbuildinfo` at every nesting level and disposable `test/scratch/`. It deliberately does **not** exclude `dist/`. No dependencies, browser downloads, package caches, registry archives, or submodules are part of the deliverable. The complete deliverable is below the 8 MiB limit.

Font and wallet-mark notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). All hamster, wheel, track, favicon, share-card artwork and synthesized SFX were implemented for this game.
