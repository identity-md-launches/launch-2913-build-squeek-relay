# Squeek Relay design system

## Product and visual idea

Squeek Relay is an arcade game about sharing one real hamster’s energy. The visual idea is a tiny gold runner crossing a midnight observatory track: the same scene warms to gold while the wheel runs and freezes blue while it sleeps. The game and Play action appear on the first screen, including at 390 CSS pixels wide.

The source of truth is `src/styles.css`, the application in `src/App.tsx`, and canvas artwork in `src/game/render.ts`. This document describes the final implementation, not a proposal. The completed review and its limits are in `artifacts/validation.md`.

## Colors

UI primitives and their semantic aliases are declared in `src/styles.css:15`.

| Semantic token | Value | Implemented role |
| --- | --- | --- |
| `--bg` | `#0b1316` | Page, dark input fill, primary-button ink |
| `--surface` | `#101c20` | Arcade frame, live bar, dialogs |
| `--surface-raised` | `#17272d` | Wallet rows and disabled boost |
| `--surface-hover` / `--line` | `#22363d` | Hover surfaces and structural separators |
| `--ink-600` | `#3b535a` | Frame, input, and secondary-control boundaries |
| `--text` / `--focus` | `#f4f0e5` | Primary text and focus perimeter |
| `--muted` | `#a2b2b5` | Secondary copy and compact metadata |
| `--accent` | `#f4d45e` | Play, running state, boost energy, batons |
| `--accent-hover` | `#ffe58a` | Primary action hover |
| `--frost` | `#9ad9f2` | Sleep/stale state and frozen boost meter |
| `--frost-bg` | `#17303b` | Reconnection notice |
| `--error` | `#ffb5a8` | Recoverable form and wallet errors |

The dotted page pattern is a 16px grid of 0.65px translucent dots. Canvas art has its own small illustration palette: `#edb565` fur, `#fff1cf` cheeks, `#f7d758` batons, `#101f25` sky, `#253a30` warm track, and `#193441` frozen track. These are artwork colors, not alternative UI themes.

Only the main Play / Resume / Race again / Sign action receives a filled gold background in its respective state. The boost control uses an outline; ice is a state rather than an interactive accent. State labels and icons accompany color changes. The requested spectator banner deliberately uses uppercase status words.

Declared token-pair WCAG contrast was computed: primary button 12.89:1, input text 16.48:1, muted copy on surface 7.92:1, running banner 11.93:1, sleeping banner 11.23:1, reconnect notice 8.92:1, disabled boost text 7.01:1. The probe passed its measured solid-background text. Text over the canvas and dotted backgrounds was not exhaustively contrast-measured; do not infer complete contrast certification from these pairs.

## Typography

- **Outfit** is the display, prose, label, and control family. Its local WOFF2 supplies weights 400–800; this interface uses 400, 600, and 800.
- **Space Mono**, local WOFF2 at 400, is restricted to RPM, work, timers, ranks, and numerical score details.
- Fallbacks are system sans and UI monospace. Both fonts use `font-display: swap`. Licenses ship beside their local files in `public/fonts/` and `dist/fonts/`.

| Token | Default | Use |
| --- | --- | --- |
| `--text-xs` | 12px | Captions, hints, compact data |
| `--text-sm` | 14px | Secondary UI, descriptions, wallet rows |
| `--text-md` | 16px | Body baseline, inputs, primary buttons, desktop LIVE badge |
| `--text-lg` | 24px | Brand, section/dialog headings, feedback |
| `--text-xl` | 36px | Declared intermediate step, currently unused |
| `--text-display` | 72px; 48px at ≤730px | Title and primary race/result score |

Body line height is 1.5, descriptive copy can use 1.6, section headings 1.2, and the two-line display title 0.98. Display tracking is −0.055em; smaller headings use −0.025em. Changing numbers request tabular figures. Headings balance their wraps; descriptions use `text-wrap: pretty`. Inputs remain 16px on phones to avoid iOS input zoom. The mobile title description is limited to 23ch to keep it beside the wheel art. Long headings can wrap rather than disappear behind scene clipping.

The final entry probe observed four sizes at 390 and five at 1440, two families, and three weights.

## Layout and responsive behavior

The shell has a maximum width of 1256px, centered with 40px default horizontal padding. Major spacing follows a 4px rhythm: 8/12px within controls, 16/20/24px within groups, 28/32/40px between regions, and a 64px desktop gap between the story and board.

The header puts the hamster brand at the leading edge and help, audio, and wallet utilities at the trailing edge. The arcade contains the spectator bar, one canvas scene, and a stable control strip. The title’s nickname and Play action sit over the scene above the track. Starting a race replaces the title with score, combo, timer, and pause control. Results occupy the same scene. Below it, a simple two-column story/leaderboard area avoids nested cards.

Implemented breakpoints:

| Width | Behavior |
| --- | --- |
| ≥1400px | 112px header, 32px shell padding, slightly deeper title scene |
| ≤1050px | 28px shell padding, 40px below-game column gap, narrower boost meter |
| ≤730px | 16px shell padding; 48px display type; single below-game column with the board first; work total gets its own live-bar row; on-screen arrow and Boost controls stay visible; wallet sheet rests at the bottom |
| ≤370px | 12px shell padding, compact header and field spacing; controls can wrap instead of overflowing |

The header, live numbers, section headings, and boost controls can wrap under text enlargement. Grid children use `min-width: 0` and the mobile grid uses `minmax(0, 1fr)`. The notice is in normal flow so a multi-line reconnect message cannot cover the title. Only the artwork is intentionally clipped. Starting on mobile focuses and scrolls the game into view. The game canvas uses `ResizeObserver`, logical CSS dimensions, and a device-pixel-ratio cap of two.

Rendered checks covered 320, 390, 730, 1024, and 1440 wide, 200% root text enlargement, and a 390-wide WebKit mobile context. These are browser emulations, not physical-device testing or native browser zoom.

## Surfaces, shapes, and depth

The interface is deliberately flat. Tonal layers and 1px structural borders separate the page, arcade, controls, and dialogs. The arcade radius is 16px; inputs and buttons are 8px; dialogs are 18px on desktop and 16px on mobile. Small badges and tags use 4–5px radii. The dialog backdrop is dark and blurred; the canvas uses illustrated ground shadows. No card surface combines a border with an elevation shadow. The baton illustration’s inset highlight is artwork.

The canvas is behind normal content inside an isolated scene. Status notices sit above it; pause/results cover the scene; native modal dialogs use the browser top layer.

On phones the title wheel has a 61px radius; during a race it becomes a 43px background motif below the clock. Pickup feedback sits at 43% of the race overlay, leaving the runner’s name tag clear. The skip link appears for visible keyboard focus.

## Components and states

| Source / pattern | Purpose and states |
| --- | --- |
| `src/App.tsx`, `.primary` / `.secondary` / `.text-button` | Gold primary action, outlined secondary, quieter disclosure. Hover, focus, active, and disabled states have explicit styles. |
| `src/components/Icon.tsx` | One currentColor SVG icon family plus the original hamster mark; decorative icons are hidden from assistive technology. |
| `src/components/Modal.tsx` | Native `dialog`; modal focus containment, Escape, backdrop dismissal, close control, and focus return. |
| `src/components/WalletControl.tsx` | Named provider discovery; mobile app links; Coinbase; per-row pending; recoverable connect/sign/switch failures; signed identity and Disconnect. |
| `src/App.tsx`, `.live-bar` / `.track-notice` | Actual RPM/work and running, sleeping, stale, reconnect, or lifecycle-pause messages. Unknown values are dashes, never invented zero readings. |
| `src/App.tsx`, `.nick-field` / `.play-form` | Visible nickname label, 18-character limit, inline empty-name error, one-tap Play with the stored default. |
| `src/game/engine.ts` and `render.ts` | Three lanes, batons, combo, boost/friction, particles, illustrated runners and observatory. Animation follows game distance derived from live RPM. |
| `src/App.tsx`, `.game-controls` | Native lane/boost buttons, numeric charge and semantic progressbar; disabled boost explains that recharge requires running. |
| `src/App.tsx`, `.leaderboard` | Explicit device scope; actionable empty state; finished top-five scores; real same-browser peers and the current runner; no seeded competitors. |
| `src/App.tsx`, `.finish-cover` | Exact final score, distance/combo explanation, save status, copy score, replay, and home. |

## Motion and audio

Interaction transitions name their properties and last 150ms. Pressed buttons scale to 0.96 only when reduced motion is not requested. A 2.5-second LIVE dot pulse also stops under reduced motion. The renderer disables decorative snowfall, wheel rotation, bobbing, and pickup particles for reduced motion while keeping essential race movement. A visible pause action stops the race physics; the wall-clock heat deadline continues.

Web Audio produces short 0.21-second squeak, hit, boost, and finish tones after a user gesture unlocks audio. Mute is stored locally and available on both layouts. Sound is supplementary, with visible pickup and state feedback.

## Reuse rules

Start new game UI from the existing shell, semantic tokens, and native controls. Use gold fill for the one primary action; use frost only for the motor’s cold state. Keep data tied to the actual APIs and label local persistence explicitly. Keep game geometry in the renderer and rules in the engine. New settings belong in the existing help/dialog pattern. Preserve the narrow-screen Play placement, local assets, and relative export paths.

Design guidance credits and retained licenses are in `THIRD_PARTY_NOTICES.md` and `artifacts/design-guidance-LICENSE.txt`.
