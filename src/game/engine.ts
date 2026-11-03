import type { MotorMode } from "../lib/live";

export type Item = {
  id: number;
  x: number;
  lane: number;
  kind: "baton" | "ice" | "sleepy";
  hit: boolean;
};
export type Particle = {
  x: number;
  lane: number;
  age: number;
  kind: "gold" | "ice";
};
export type GameState = {
  distance: number;
  combo: number;
  batons: number;
  bestCombo: number;
  charge: number;
  boostTime: number;
  speed: number;
  lane: number;
  visualLane: number;
  items: Item[];
  particles: Particle[];
  nextSpawn: number;
  spawnId: number;
  hitTime: number;
  feedback: string;
  feedbackTime: number;
  elapsed: number;
  lastMode: MotorMode | null;
};
export type Motor = { mode: MotorMode; rpm: number; paused: boolean };
export const BASE_CHARGE = 35;
export function createGame(): GameState {
  return {
    distance: 0,
    combo: 1,
    batons: 0,
    bestCombo: 1,
    charge: BASE_CHARGE,
    boostTime: 0,
    speed: 0,
    lane: 1,
    visualLane: 1,
    items: [
      { id: 0, x: 4, lane: 1, kind: "baton", hit: false },
      { id: 1, x: 12, lane: 0, kind: "baton", hit: false },
    ],
    particles: [],
    nextSpawn: 24,
    spawnId: 2,
    hitTime: 0,
    feedback: "Grab the golden batons!",
    feedbackTime: 4,
    elapsed: 0,
    lastMode: null,
  };
}
export function canScore(m: Motor) {
  return !m.paused && (m.mode === "running" || m.mode === "sleeping");
}
export function moveLane(g: GameState, direction: number) {
  g.lane = Math.max(0, Math.min(2, g.lane + direction));
}
export function triggerBoost(g: GameState, m: Motor): boolean {
  if (m.mode !== "running" || m.paused || g.charge < 25 || g.boostTime > 0)
    return false;
  g.charge -= 25;
  g.boostTime = 1.8;
  g.feedback = "Squeek surge!";
  g.feedbackTime = 1.8;
  return true;
}
export function score(g: Pick<GameState, "distance" | "combo">) {
  return Math.floor(g.distance * g.combo);
}
export function targetSpeed(m: Motor, boosting = false, hit = false) {
  if (!canScore(m)) return 0;
  if (m.mode !== "running") return 0.6 * (hit ? 0.12 : 1);
  // A visible and direct mapping: 10 live RPM = 4 m/s. Extreme RPM is bounded for playability.
  return Math.min(m.rpm * 0.4, 38) * (boosting ? 2.2 : 1) * (hit ? 0.22 : 1);
}
export function step(
  g: GameState,
  m: Motor,
  delta: number,
): "baton" | "hit" | null {
  const dt = Math.min(delta, 0.05);
  g.visualLane += (g.lane - g.visualLane) * Math.min(1, dt * 16);
  if (!canScore(m)) {
    g.speed = 0;
    return null;
  }
  if (m.mode === "sleeping" && g.lastMode !== "sleeping") {
    g.items.push({
      id: g.spawnId++,
      x: g.distance + 8,
      lane: (g.lane + 1) % 3,
      kind: "ice",
      hit: false,
    });
    g.items.push({
      id: g.spawnId++,
      x: g.distance + 15,
      lane: (g.lane + 2) % 3,
      kind: "sleepy",
      hit: false,
    });
  }
  g.lastMode = m.mode;
  g.elapsed += dt;
  g.feedbackTime = Math.max(0, g.feedbackTime - dt);
  g.hitTime = Math.max(0, g.hitTime - dt);
  if (m.mode !== "running") g.boostTime = 0;
  else {
    g.boostTime = Math.max(0, g.boostTime - dt);
    if (!g.boostTime) g.charge = Math.min(100, g.charge + dt * 8);
  }
  const desired = targetSpeed(m, g.boostTime > 0, g.hitTime > 0);
  // Frost snaps on with heavy friction; acceleration eases in when the wheel restarts.
  if (m.mode !== "running") g.speed = Math.min(g.speed, desired);
  g.speed +=
    (desired - g.speed) * Math.min(1, dt * (m.mode === "running" ? 3 : 14));
  const before = g.distance;
  g.distance += g.speed * dt;
  if (g.nextSpawn < g.distance + 145) {
    const id = g.spawnId++;
    const lane = (id * 7 + Math.floor(id / 3)) % 3;
    const obstacle = m.mode !== "running" && id % 3 === 0;
    g.items.push({
      id,
      x: g.nextSpawn,
      lane,
      kind: obstacle ? (id % 2 ? "ice" : "sleepy") : "baton",
      hit: false,
    });
    g.nextSpawn += obstacle ? 10 : 12;
  }
  let event: "baton" | "hit" | null = null;
  for (const item of g.items) {
    if (
      !item.hit &&
      item.x >= before - 1.4 &&
      item.x <= g.distance + 1.4 &&
      Math.abs(g.visualLane - item.lane) < 0.4
    ) {
      item.hit = true;
      if (item.kind === "baton") {
        g.batons++;
        g.combo = Math.min(8, 1 + Math.floor(g.batons / 3));
        g.bestCombo = Math.max(g.bestCombo, g.combo);
        g.feedback =
          g.batons % 3 === 0 ? `${g.combo}× combo!` : "Baton grabbed!";
        g.feedbackTime = 1.3;
        g.particles.push({ x: item.x, lane: item.lane, age: 0, kind: "gold" });
        event = "baton";
      } else {
        g.combo = 1;
        g.batons = 0;
        g.hitTime = 1.6;
        g.feedback = "Slippery! Combo reset";
        g.feedbackTime = 2;
        g.particles.push({ x: item.x, lane: item.lane, age: 0, kind: "ice" });
        event = "hit";
      }
    }
  }
  g.items = g.items.filter((item) => item.x > g.distance - 15);
  g.particles.forEach((p) => {
    p.age += dt;
  });
  g.particles = g.particles.filter((p) => p.age < 0.65);
  return event;
}
/** Whole meters, the one rounding used by the meter, the distance chip and the end card. */
export function meters(distance: number) {
  return Math.floor(distance);
}
