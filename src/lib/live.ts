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
  const m = object(object(value).measurement);
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
  const observedAt = Date.parse(String(m.observedAt));
  if (!Number.isFinite(observedAt))
    throw new Error("Wheel timestamp unavailable");
  return {
    rpm: m.rpmMilli / 1000,
    coreStatus: m.coreStatus,
    work: m.cumulativeWorkUnits,
    freshness: m.freshness,
    observedAt,
    receivedAt: now,
    staleAfterMs:
      typeof m.staleAfterSeconds === "number" && m.staleAfterSeconds > 0
        ? m.staleAfterSeconds * 1000
        : 120000,
  };
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
export function motorMode(
  m: Measurement | null,
  healthy: boolean,
  now = Date.now(),
): MotorMode {
  if (!m || !healthy || now - m.receivedAt > 8000) return "reconnecting";
  if (
    m.freshness !== "online" ||
    now - m.observedAt > m.staleAfterMs ||
    m.observedAt - now > 30000
  )
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
export async function readApi(
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    signal,
    cache: "no-cache",
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`Squeekchain returned ${response.status}`);
  return response.json();
}
