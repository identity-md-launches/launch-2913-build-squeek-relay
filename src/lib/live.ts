export const API = "https://api.squeekchain.com";
export const POLL_MS = 2500;
export type MotorMode = "running" | "sleeping" | "stale" | "reconnecting";
export type Measurement = {
  rpm: number;
  coreStatus: string;
  work: string;
  freshness: string;
  observedAt: number;
  staleAfterMs: number;
  receivedAt: number;
};
export type Economy = { round: string; stage: string; paused: boolean };
export type RoundConfig = { genesis: number; duration: number };
export type Heat = {
  id: string;
  label: string;
  endsAt: number;
  duration: number;
  round: boolean;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("Missing API data");
  return value as Record<string, unknown>;
}
export function parseStatus(value: unknown, now = Date.now()): Measurement {
  const body = object(value);
  const m = object(body.measurement);
  if (
    typeof m.rpmMilli !== "number" ||
    !Number.isFinite(m.rpmMilli) ||
    m.rpmMilli < 0 ||
    typeof m.coreStatus !== "string" ||
    typeof m.freshness !== "string" ||
    typeof m.cumulativeWorkUnits !== "string" ||
    !/^\d+$/.test(m.cumulativeWorkUnits)
  ) {
    throw new Error("Wheel measurement unavailable");
  }
  const observed = Date.parse(String(m.observedAt));
  if (!Number.isFinite(observed)) throw new Error("Wheel timestamp unavailable");
  // Freshness is judged on the server's clock (generatedAt) when it is sent, so a
  // visitor whose device clock is wrong never sees a healthy feed as stale.
  const generated = Date.parse(String(body.generatedAt));
  const serverNow = Number.isFinite(generated) ? generated : now;
  const age = Math.max(0, serverNow - observed);
  return {
    rpm: m.rpmMilli / 1000,
    coreStatus: m.coreStatus,
    work: m.cumulativeWorkUnits,
    freshness: m.freshness,
    observedAt: now - age,
    receivedAt: now,
    staleAfterMs:
      typeof m.staleAfterSeconds === "number" && m.staleAfterSeconds > 0
        ? m.staleAfterSeconds * 1000
        : 120000,
  };
}
/**
 * The economy endpoint answers HTTP 200 with {"status":"unavailable","reason":…}
 * while its indexer catches up. That is a reachable API reporting a gap in round
 * data, not a broken connection: return the reason so the caller keeps the last
 * real round and keeps the wheel feed LIVE.
 */
export function economyGap(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.status === "available") return null;
  return typeof body.reason === "string" ? body.reason : "unavailable";
}
export function parseEconomy(value: unknown): Economy {
  const body = object(value);
  if (body.status !== "available") throw new Error("Round feed unavailable");
  const l = object(body.lifecycle);
  if (
    typeof l.currentRound !== "string" ||
    !/^\d+$/.test(l.currentRound) ||
    typeof l.stage !== "string" ||
    typeof l.paused !== "boolean"
  ) {
    throw new Error("Round lifecycle unavailable");
  }
  return { round: l.currentRound, stage: l.stage, paused: l.paused };
}
export function parseRoundConfig(value: unknown): RoundConfig {
  const body = object(value);
  if (body.status !== "available") throw new Error("Round timing unavailable");
  const c = object(body.configuration);
  const genesis = Number(c.genesisTimestamp) * 1000;
  const duration = Number(c.roundDuration) * 1000;
  if (!Number.isFinite(genesis) || genesis <= 0 || duration !== 600000)
    throw new Error("Unsupported round timing");
  return { genesis, duration };
}
/** A status reading older than this (client clock) no longer counts as live. */
export const LIVE_WINDOW_MS = 7000;
export function motorMode(
  m: Measurement | null,
  healthy: boolean,
  now = Date.now(),
): MotorMode {
  if (!m || !healthy || now - m.receivedAt > LIVE_WINDOW_MS)
    return "reconnecting";
  if (m.freshness !== "online" || now - m.observedAt > m.staleAfterMs)
    return "stale";
  return m.coreStatus === "RUNNING" && m.rpm > 0 ? "running" : "sleeping";
}
export function chooseHeat(
  e: Economy | null,
  c: RoundConfig | null,
  now = Date.now(),
): Heat {
  if (e && c && e.stage === "active" && !e.paused) {
    const end = c.genesis + Number(e.round) * c.duration;
    const remaining = end - now;
    if (remaining >= 12000 && remaining <= c.duration) {
      return {
        id: `round-${e.round}`,
        label: `Round ${e.round}`,
        endsAt: end,
        duration: remaining,
        round: true,
      };
    }
  }
  return {
    id: `quick-${Math.floor(now / 90000)}`,
    label: "90-second heat",
    endsAt: now + 90000,
    duration: 90000,
    round: false,
  };
}
export function formatWork(work: string | undefined) {
  return work === undefined ? "—" : BigInt(work).toLocaleString("en-US");
}
export function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
/** Per-attempt budget: a hung request fails over or reports within ~3 s. */
export const ATTEMPT_MS = 3000;
type Route = { id: string; init: RequestInit };
/**
 * Two direct routes to the same public endpoint. The API rejects unknown query
 * parameters, so the fallback never adds a cache-buster: it bypasses the HTTP
 * cache instead. No third-party proxy is involved.
 */
export const ROUTES: Route[] = [
  { id: "direct", init: { cache: "no-cache" } },
  { id: "direct-no-store", init: { cache: "no-store" } },
];
async function attempt(
  path: string,
  route: Route,
  outer?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  outer?.addEventListener("abort", abort);
  const timer = setTimeout(abort, ATTEMPT_MS);
  try {
    const response = await fetch(`${API}${path}`, {
      ...route.init,
      method: "GET",
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Squeekchain returned ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", abort);
  }
}
let preferred = 0;
/** Reads one endpoint, starting with the route that last worked and failing over at once. */
export async function readApi(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  let last: unknown = new Error("No route");
  for (let i = 0; i < ROUTES.length; i++) {
    const index = (preferred + i) % ROUTES.length;
    if (signal?.aborted) break;
    try {
      const value = await attempt(path, ROUTES[index], signal);
      preferred = index;
      return value;
    } catch (e) {
      last = e;
    }
  }
  throw last;
}
