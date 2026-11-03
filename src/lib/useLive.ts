import { useCallback, useEffect, useState } from "react";
import {
  economyGap,
  motorMode,
  parseEconomy,
  parseRoundConfig,
  parseStatus,
  POLL_MS,
  readApi,
  type Economy,
  type Measurement,
  type RoundConfig,
} from "./live";

/**
 * Polls /v1/status and /v1/economy/state directly every POLL_MS.
 *
 * Each endpoint runs on its own loop, so a slow round feed never holds back the
 * wheel reading. A request that hangs is aborted after ~3 s and retried once on
 * the second route; an endpoint is healthy as soon as one answer parses. Nothing
 * is ever estimated: when the wheel feed is down the game reports RECONNECTING,
 * stops scoring and shows no RPM until a real reading arrives again.
 */
export function useLive() {
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [roundConfig, setRoundConfig] = useState<RoundConfig | null>(null);
  const [statusOk, setStatusOk] = useState(false);
  const [economyOk, setEconomyOk] = useState(false);
  const [economyGapReason, setEconomyGap] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [retry, setRetry] = useState(0);
  const reconnect = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    let timer = 0;
    const controller = new AbortController();
    const load = () => {
      readApi("/v1/core", controller.signal)
        .then(parseRoundConfig)
        .then((c) => {
          if (active) setRoundConfig(c);
        })
        .catch(() => {
          // Round timing is optional (heats fall back to 90 s); try again later.
          if (active) timer = window.setTimeout(load, 15000);
        });
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [retry]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const loops: Array<() => void> = [];
    function feed<T>(
      path: string,
      parse: (value: unknown) => T,
      ok: (value: T) => void,
      failed: () => void,
    ) {
      let busy = false;
      let timer = 0;
      const run = async () => {
        clearTimeout(timer);
        if (!active) return;
        if (busy) return;
        busy = true;
        const started = Date.now();
        try {
          const value = parse(await readApi(path, controller.signal));
          if (active) ok(value);
        } catch {
          if (active) failed();
        } finally {
          busy = false;
          if (active) {
            setNow(Date.now());
            timer = window.setTimeout(
              () => void run(),
              Math.max(250, POLL_MS - (Date.now() - started)),
            );
          }
        }
      };
      loops.push(() => void run());
      void run();
      return () => clearTimeout(timer);
    }
    const stopStatus = feed(
      "/v1/status",
      (v) => parseStatus(v),
      (m) => {
        setMeasurement(m);
        setStatusOk(true);
      },
      () => setStatusOk(false),
    );
    let economyFailures = 0;
    const stopEconomy = feed(
      "/v1/economy/state",
      (v): { gap: string } | { economy: ReturnType<typeof parseEconomy> } => {
        const gap = economyGap(v);
        return gap ? { gap } : { economy: parseEconomy(v) };
      },
      (read) => {
        economyFailures = 0;
        setEconomyOk(true);
        if ("gap" in read) setEconomyGap(read.gap);
        else {
          setEconomyGap(null);
          setEconomy(read.economy);
        }
      },
      // One missed round poll is tolerated; two in a row is a real outage.
      () => {
        economyFailures++;
        if (economyFailures >= 2) setEconomyOk(false);
      },
    );
    const pollNow = () => loops.forEach((run) => run());
    const online = () => pollNow();
    // navigator.onLine is unreliable (it reads false on some healthy machines),
    // so the offline event only marks the feed down and re-checks at once: the
    // next real answer, not the browser flag, decides whether we are live.
    const offline = () => {
      setStatusOk(false);
      setEconomyOk(false);
      pollNow();
    };
    const visible = () => {
      if (!document.hidden) pollNow();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => {
      active = false;
      stopStatus();
      stopEconomy();
      clearInterval(clock);
      controller.abort();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [retry]);

  const healthy = statusOk && economyOk;
  return {
    measurement,
    economy,
    roundConfig,
    now,
    /** Set while the API answers but its round indexer has no current data. */
    economyGap: economyGapReason,
    /** True once a real wheel reading has arrived in this visit. */
    connected: measurement !== null,
    mode: motorMode(measurement, healthy, now),
    reconnect,
  };
}
