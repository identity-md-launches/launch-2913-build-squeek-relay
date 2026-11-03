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

The score is `floor(game distance × final combo)`, labeled **meters ridden with Squeektoshi**. It is an arcade score, with no token or monetary reward. A normal heat ends at the current round boundary. If verified timing is unavailable, the lifecycle is unsuitable, or fewer than 12 seconds remain, it uses a 90-second heat. The title also offers an explicit 90-second quick heat.

## Live Squeekchain data

The app reads these public APIs directly from the browser:

| API | Fields and behavior |
| --- | --- |
| [GET /v1/status](https://api.squeekchain.com/v1/status) | `measurement.rpmMilli`, `coreStatus`, `cumulativeWorkUnits`, `freshness`, `observedAt`, and `staleAfterSeconds`. RPM is `rpmMilli / 1000`. Base game speed is `min(RPM × 0.4, 38)` m/s. |
| [GET /v1/economy/state](https://api.squeekchain.com/v1/economy/state) | `lifecycle.currentRound`, `stage`, and `paused`. Supplies the displayed round and gates scoring during a lifecycle pause. |
| [GET /v1/core](https://api.squeekchain.com/v1/core) | `configuration.genesisTimestamp` and `roundDuration`, fetched initially and on manual reconnect. Used with the economy round to derive its real end time. No guessed genesis timestamp is embedded. |

The two required feeds poll every **2.5 seconds**, without overlapping requests. Requests time out after 4.5 seconds. Either required feed failing or becoming invalid pauses distance, scoring, and recharge; the site shows a reconnect state and retries automatically. An eight-second receipt watchdog also freezes scoring. Stale measurements produce blue frost and pause scoring. A fresh, sleeping motor permits only a 0.6 m/s crawl, cancels boost, and cannot recharge it. This deliberately distinguishes genuine sleep from missing data.

Work units are displayed from the measured integer string using `BigInt`; they change only when the API reports a new total. They are never interpolated. No fabricated chain data, offline simulation, or runtime demo switch is shipped. The in-game **How it works** dialog names the APIs and explains the rules. See the primary [API documentation](https://docs.squeekchain.com/developers/api/) and [round definition](https://docs.squeekchain.com/system/rounds-and-blocks/).

## Multiplayer and identity

All visitors read the same real hamster motor. **The v1 relay board is explicitly labeled “This device.”** Finished scores live in `localStorage`; a storage event updates other tabs. Same-origin tabs exchange current runners and live scores through `BroadcastChannel`, so friends can race in separate tabs on this browser. No public worldwide score-writing service is implied. The board retains at most 100 completed entries and shows the current heat’s top five.

Wallet identity is optional. One sheet offers named EIP-6963 extensions, Coinbase Wallet / Smart Wallet, and on mobile the MetaMask, Coinbase Wallet, Rabby, and Phantom browser links. No WalletConnect relay or project ID is used. The current API deployment identifies Sepolia, so the connector uses Sepolia when a network switch is needed. A free, readable message includes this origin, address, a fresh nonce, and issue time. EOA signatures are recovered locally; smart account signatures use the public Sepolia RPC for verification. The signed address is attached only to local game scores. The app requests no transactions, approvals, private keys, or seed phrases. Reconnected wallets sign again for a new visit.

## Validation

Actual worker results are recorded in **[artifacts/validation.md](artifacts/validation.md)**, [interaction-results.json](artifacts/interaction-results.json), and [taste.json](artifacts/taste.json). The six-domain design review and fixes are included there. The implemented design is documented in **[DESIGN.md](DESIGN.md)**.

Final checks:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 8 engine / API tests passed |
| `npm run build` | Passed; static export present |
| `npm run test:browser` | 22 checks passed, including Chromium and WebKit mobile play |
| Pinned `taste.mjs --out test/scratch/taste` | 16/16 checks passed at 320, 390, and 1440 wide |
| Axe WCAG A / AA scans | Zero detected violations in title, wallet, help, and race states |

To reproduce browser validation with installed browser dependencies:

```sh
npx playwright install --with-deps chromium webkit
npm run build
npm run test:browser
```

`tests/browser.mjs` starts and closes its own local server at `/preview/`, checks the actual production export, and writes disposable evidence to `test/scratch/browser-validation/`. It first checks the real public feeds, then intercepts APIs **only inside isolated test contexts** to exercise running, sleep, stale, failure, and recovery deterministically. A fresh ephemeral test wallet signs a real message; it is never part of the application or stored in the export. Playwright’s virtual clock exercises a full 90-second heat, while the unit suite also integrates the complete heat’s physics.

The provided browser connector failed to launch, so local Playwright supplied rendered inspection. WebKit initially lacked system libraries, a software EGL renderer, and its GIO TLS module; temporary test dependencies were installed outside the submission, after which its mobile flow and real API console smoke check passed. Native iPhone apps, actual installed wallet extensions, Coinbase passkey creation, screen-reader use, browser-native 200% zoom, and audible SFX quality were not manually tested. Text enlargement to 200% and reduced-motion behavior were tested. The Vite build reports an unused transitive `node:worker_threads` browser-externalization warning; the tested production flows produced no script errors or missing local assets.

## Submission size and generated paths

The explicit **`.gitignore` path budget is 512 bytes** (implemented file: 203 bytes). It excludes `node_modules/`, `.vite/`, `.cache/`, `*.tsbuildinfo` at every nesting level and disposable `test/scratch/`. It deliberately does **not** exclude `dist/`. No dependencies, browser downloads, package caches, registry archives, or submodules are part of the deliverable. A byte inventory is in [artifacts/bundle-budget.json](artifacts/bundle-budget.json); the complete deliverable is below the 8 MiB limit.

Font and wallet-mark notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). All hamster, wheel, track, favicon, share-card artwork and synthesized SFX were implemented for this game.
