export type Entry = {
  id: string;
  heatId: string;
  nick: string;
  address?: string;
  score: number;
  distance: number;
  combo: number;
  at: number;
};
export const BOARD_KEY = "squeek-relay:scores:v1";
export function stored(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
export function entries(): Entry[] {
  try {
    const data: unknown = JSON.parse(stored(BOARD_KEY, "[]"));
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (e): e is Entry =>
          e &&
          typeof e.id === "string" &&
          typeof e.heatId === "string" &&
          typeof e.nick === "string" &&
          (e.address === undefined ||
            (typeof e.address === "string" &&
              /^0x[a-fA-F0-9]{40}$/.test(e.address))) &&
          typeof e.score === "number" &&
          Number.isFinite(e.score) &&
          e.score >= 0 &&
          typeof e.distance === "number" &&
          Number.isFinite(e.distance) &&
          e.distance >= 0 &&
          typeof e.combo === "number" &&
          Number.isFinite(e.combo) &&
          e.combo >= 1 &&
          e.combo <= 8 &&
          typeof e.at === "number" &&
          Number.isFinite(e.at),
      )
      .slice(0, 100);
  } catch {
    return [];
  }
}
export function saveEntry(entry: Entry) {
  const all = entries().filter((e) => e.id !== entry.id);
  all.push(entry);
  return saveSetting(
    BOARD_KEY,
    JSON.stringify(all.sort((a, b) => b.at - a.at).slice(0, 100)),
  );
}
