import { useEffect, useState } from "react";

/** The ENS name the site is published under. */
export const ENS_NAME = "squeek-relay-one-hamster-all-of.identitymd.eth";
export const LIMO_URL = `https://${ENS_NAME}.limo/`;
const DOH = "https://dns.eth.limo/dns-query";
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/;

/** A gateway subdomain label for a DNSLink name: "-" doubles, "." becomes "-". */
export function inlineDnsLabel(name: string) {
  return name.replace(/-/g, "--").replace(/\./g, "-");
}

/** Finds the CID in a gateway hostname (`<cid>.ipfs.host`) or path (`/ipfs/<cid>/`). */
export function cidFromLocation(host: string, path: string): string | null {
  const sub = host.split(".");
  if (sub.length > 2 && sub[1] === "ipfs" && CID.test(sub[0])) return sub[0];
  const match = /^\/ipfs\/([^/]+)/.exec(path);
  return match && CID.test(match[1]) ? match[1] : null;
}

/** Reads the root CID a gateway reports in its `X-Ipfs-Path`/`X-Ipfs-Roots` headers. */
export function cidFromHeaders(path: string | null, roots: string | null) {
  const fromPath = path ? /^\/ipfs\/([^/]+)/.exec(path)?.[1] : undefined;
  if (fromPath && CID.test(fromPath)) return fromPath;
  const root = roots?.split(",")[0]?.trim();
  return root && CID.test(root) ? root : null;
}

/** Reads the DNSLink CID from an eth.limo DNS-over-HTTPS JSON answer. */
export function cidFromDnsJson(value: unknown): string | null {
  const answers = (value as { Answer?: Array<{ data?: unknown }> })?.Answer;
  if (!Array.isArray(answers)) return null;
  for (const a of answers) {
    const text = String(a?.data ?? "").replace(/"/g, "");
    const m = /dnslink=\/ipfs\/([^/\s]+)/.exec(text);
    if (m && CID.test(m[1])) return m[1];
  }
  return null;
}

export type Mirror = { label: string; href: string };
/** Public gateway links for the live site: by CID when known, otherwise by ENS name. */
export function mirrorLinks(cid: string | null): Mirror[] {
  if (cid && cid.startsWith("b"))
    return [
      { label: "dweb.link", href: `https://${cid}.ipfs.dweb.link/` },
      { label: "inbrowser.link", href: `https://${cid}.ipfs.inbrowser.link/` },
    ];
  if (cid) return [{ label: "dweb.link", href: `https://dweb.link/ipfs/${cid}/` }];
  const label = inlineDnsLabel(ENS_NAME);
  return [
    { label: "dweb.link", href: `https://${label}.ipns.dweb.link/` },
    { label: "inbrowser.link", href: `https://${label}.ipns.inbrowser.link/` },
  ];
}

async function timed(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves the live CID once per visit: location, then gateway headers, then ENS DNSLink. */
export function useLiveCid() {
  const [cid, setCid] = useState<string | null>(() =>
    cidFromLocation(location.hostname, location.pathname),
  );
  useEffect(() => {
    if (cid) return;
    let active = true;
    (async () => {
      try {
        const head = await timed(location.href.split("#")[0], {
          method: "HEAD",
          cache: "no-store",
        });
        const found = cidFromHeaders(
          head.headers.get("x-ipfs-path"),
          head.headers.get("x-ipfs-roots"),
        );
        if (found) {
          if (active) setCid(found);
          return;
        }
      } catch {
        // Not served by a gateway that reports its CID; ask ENS instead.
      }
      try {
        const answer = await timed(
          `${DOH}?name=${encodeURIComponent(ENS_NAME)}&type=TXT`,
          { headers: { accept: "application/dns-json" }, credentials: "omit" },
        );
        const found = cidFromDnsJson(await answer.json());
        if (found && active) setCid(found);
      } catch {
        // The ENS-name links below still work without a CID.
      }
    })();
    return () => {
      active = false;
    };
  }, [cid]);
  return cid;
}
