import { useCallback, useEffect, useRef, useState } from "react";
import type { Peer } from "./render";
export function usePeers() {
  const id = useRef(crypto.randomUUID());
  const channel = useRef<BroadcastChannel | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel("squeek-relay:track:v1");
    channel.current = c;
    c.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!data || typeof data !== "object") return;
      const p = data as Peer;
      if (
        typeof p.id !== "string" ||
        typeof p.nick !== "string" ||
        typeof p.heatId !== "string" ||
        !Number.isFinite(p.distance) ||
        !Number.isFinite(p.lane) ||
        p.lane < 0 ||
        p.lane > 2 ||
        !Number.isFinite(p.at) ||
        !Number.isFinite(p.score)
      )
        return;
      setPeers((all) => [
        ...all.filter((x) => x.id !== p.id && Date.now() - x.at < 5000),
        p,
      ]);
    };
    const timer = window.setInterval(
      () => setPeers((all) => all.filter((x) => Date.now() - x.at < 5000)),
      2000,
    );
    return () => {
      clearInterval(timer);
      c.close();
      channel.current = null;
    };
  }, []);
  const broadcast = useCallback(
    (p: Omit<Peer, "id" | "at">) =>
      channel.current?.postMessage({ ...p, id: id.current, at: Date.now() }),
    [],
  );
  return { peers, runnerId: id.current, broadcast };
}
