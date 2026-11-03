import { useCallback, useEffect, useRef, useState } from "react";
import {
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

export function useLive() {
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [roundConfig, setRoundConfig] = useState<RoundConfig | null>(null);
  const [healthy, setHealthy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [retry, setRetry] = useState(0);
  const polling = useRef(false);
  const reconnect = useCallback(() => setRetry((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    readApi("/v1/core", controller.signal)
      .then(parseRoundConfig)
      .then((c) => {
        if (active) setRoundConfig(c);
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [retry]);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    const poll = async () => {
      if (polling.current) return;
      polling.current = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 4500);
      try {
        const [s, e] = await Promise.allSettled([
          readApi("/v1/status", controller.signal).then((v) => parseStatus(v)),
          readApi("/v1/economy/state", controller.signal).then(parseEconomy),
        ]);
        if (!active) return;
        if (s.status === "fulfilled") setMeasurement(s.value);
        if (e.status === "fulfilled") setEconomy(e.value);
        setHealthy(s.status === "fulfilled" && e.status === "fulfilled");
        setNow(Date.now());
      } finally {
        clearTimeout(timeout);
        polling.current = false;
      }
    };
    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, POLL_MS);
    const online = () => {
      void poll();
    };
    window.addEventListener("online", online);
    const offline = () => setHealthy(false);
    window.addEventListener("offline", offline);
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => {
      active = false;
      clearInterval(interval);
      clearInterval(clock);
      controller?.abort();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [retry]);
  return {
    measurement,
    economy,
    roundConfig,
    now,
    mode: motorMode(measurement, healthy, now),
    reconnect,
  };
}
