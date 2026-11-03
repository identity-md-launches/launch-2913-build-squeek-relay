import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canScore,
  createGame,
  meters,
  moveLane,
  score,
  step,
  targetSpeed,
  triggerBoost,
  type Motor,
} from "../src/game/engine.ts";
import {
  chooseHeat,
  formatTime,
  economyGap,
  formatWork,
  LIVE_WINDOW_MS,
  motorMode,
  parseEconomy,
  parseRoundConfig,
  parseStatus,
} from "../src/lib/live.ts";
import {
  cidFromDnsJson,
  cidFromHeaders,
  cidFromLocation,
  ENS_NAME,
  inlineDnsLabel,
  mirrorLinks,
} from "../src/lib/gateway.ts";

const running: Motor = { mode: "running", rpm: 25, paused: false };
const sleeping: Motor = { mode: "sleeping", rpm: 0, paused: false };
const at = Date.parse("2026-11-03T12:00:00Z");
const fixture = {
  measurement: {
    rpmMilli: 25500,
    coreStatus: "RUNNING",
    cumulativeWorkUnits: "9007199254740993123",
    freshness: "online",
    observedAt: new Date(at).toISOString(),
    staleAfterSeconds: 120,
  },
};
function advance(g: ReturnType<typeof createGame>, m: Motor, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) step(g, m, 0.05);
}

test("converts live milli-RPM, retains large work totals and freshness", () => {
  const m = parseStatus(fixture, at);
  assert.equal(m.rpm, 25.5);
  assert.equal(motorMode(m, true, at), "running");
  assert.equal(formatWork(m.work), "9,007,199,254,740,993,123");
  assert.equal(
    motorMode({ ...m, coreStatus: "IDLE", rpm: 0 }, true, at),
    "sleeping",
  );
  assert.equal(motorMode({ ...m, observedAt: at - 121000 }, true, at), "stale");
  assert.equal(motorMode({ ...m, freshness: "stale" }, true, at), "stale");
  assert.equal(motorMode(m, true, at + LIVE_WINDOW_MS + 1), "reconnecting");
  assert.equal(motorMode(m, false, at), "reconnecting");
  assert.throws(() =>
    parseStatus({ measurement: { ...fixture.measurement, rpmMilli: NaN } }, at),
  );
  assert.throws(() =>
    parseStatus(
      {
        measurement: {
          ...fixture.measurement,
          cumulativeWorkUnits: "invented",
        },
      },
      at,
    ),
  );
  assert.throws(() =>
    parseStatus(
      { measurement: { ...fixture.measurement, observedAt: null } },
      at,
    ),
  );
});
test("validates economy and core timing rather than inventing a round", () => {
  assert.deepEqual(
    parseEconomy({
      status: "available",
      lifecycle: { currentRound: "2", stage: "active", paused: false },
    }),
    { round: "2", stage: "active", paused: false },
  );
  assert.throws(() => parseEconomy({ status: "unavailable" }));
  assert.throws(() =>
    parseEconomy({ status: "available", lifecycle: { currentRound: null } }),
  );
  assert.deepEqual(
    parseRoundConfig({
      status: "available",
      configuration: {
        genesisTimestamp: String(at / 1000),
        roundDuration: "600",
      },
    }),
    { genesis: at, duration: 600000 },
  );
});
test("uses the API round boundary and a true 90-second fallback", () => {
  const e = { round: "2", stage: "active", paused: false };
  const c = { genesis: at - 650000, duration: 600000 };
  const h = chooseHeat(e, c, at);
  assert.equal(h.id, "round-2");
  assert.equal(h.endsAt, at + 550000);
  assert.equal(h.round, true);
  for (const fallback of [
    chooseHeat(e, null, at),
    chooseHeat(null, c, at),
    chooseHeat({ ...e, round: "10000" }, c, at),
    chooseHeat({ ...e, paused: true }, c, at),
  ]) {
    assert.equal(fallback.duration, 90000);
    assert.equal(fallback.endsAt, at + 90000);
    assert.equal(fallback.round, false);
  }
  assert.equal(formatTime(90000), "01:30");
  assert.equal(formatTime(-100), "00:00");
});
test("RPM controls speed directly and sleep immediately adds heavy friction", () => {
  assert.equal(targetSpeed({ ...running, rpm: 10 }), 4);
  assert.equal(targetSpeed({ ...running, rpm: 20 }), 8);
  const g = createGame();
  advance(g, running, 3);
  assert.ok(g.speed > 9.9);
  step(g, sleeping, 0.05);
  assert.ok(g.speed <= 0.6);
  assert.equal(g.boostTime, 0);
  assert.ok(g.items.some((i) => i.kind === "ice"));
  assert.ok(g.items.some((i) => i.kind === "sleepy"));
});
test("boost only fires and recharges while the real motor is running", () => {
  const g = createGame();
  const start = g.charge;
  assert.equal(triggerBoost(g, sleeping), false);
  advance(g, sleeping, 5);
  assert.equal(g.charge, start);
  assert.equal(triggerBoost(g, running), true);
  assert.equal(g.charge, start - 25);
  assert.equal(triggerBoost(g, running), false);
  assert.ok(targetSpeed(running, true) > targetSpeed(running));
  step(g, sleeping, 0.05);
  assert.equal(g.boostTime, 0);
  const frozen = g.charge;
  advance(g, sleeping, 2);
  assert.equal(g.charge, frozen);
  advance(g, running, 5);
  assert.ok(g.charge > frozen);
  assert.equal(triggerBoost(g, { ...running, paused: true }), false);
});
test("API failures, stale data and pause freeze distance and boost energy", () => {
  for (const mode of ["reconnecting", "stale"] as const) {
    const g = createGame();
    advance(g, running, 2);
    const before = { distance: g.distance, charge: g.charge, combo: g.combo };
    const m = { ...running, mode };
    advance(g, m, 3);
    assert.equal(g.distance, before.distance);
    assert.equal(g.charge, before.charge);
    assert.equal(g.combo, before.combo);
    assert.equal(g.speed, 0);
    assert.equal(canScore(m), false);
  }
  const g = createGame();
  advance(g, { ...running, paused: true }, 10);
  assert.equal(g.distance, 0);
});
test("lane controls clamp and batons raise combo; obstacles reset it", () => {
  const g = createGame();
  moveLane(g, -1);
  moveLane(g, -1);
  assert.equal(g.lane, 0);
  moveLane(g, 1);
  moveLane(g, 1);
  moveLane(g, 1);
  assert.equal(g.lane, 2);
  g.lane = 1;
  g.visualLane = 1;
  g.items = [0, 1, 2].map((i) => ({
    id: i,
    x: i * 0.1,
    lane: 1,
    kind: "baton",
    hit: false,
  }));
  step(g, running, 0.05);
  assert.equal(g.batons, 3);
  assert.equal(g.combo, 2);
  g.distance = 20;
  assert.equal(score(g), 40);
  g.items = [{ id: 9, x: g.distance + 0.1, lane: 1, kind: "ice", hit: false }];
  step(g, sleeping, 0.05);
  assert.equal(g.combo, 1);
  assert.ok(g.hitTime > 0);
});
test("a complete 90-second heat advances fairly and remains bounded", () => {
  const g = createGame();
  advance(g, running, 90);
  assert.ok(g.distance > 850 && g.distance < 901);
  assert.ok(g.items.length < 30);
  assert.ok(g.charge <= 100);
  assert.ok(score(g) > 0);
  assert.ok(g.elapsed > 89.9);
});

test("server clock judges freshness, so device clock skew never fakes a stale or live feed", () => {
  const skewed = at - 10 * 60_000; // device clock 10 minutes behind
  const m = parseStatus(
    { ...fixture, generatedAt: new Date(at + 5000).toISOString() },
    skewed,
  );
  assert.equal(m.observedAt, skewed - 5000);
  assert.equal(motorMode(m, true, skewed + 1000), "running");
  const old = parseStatus(
    { ...fixture, generatedAt: new Date(at + 130_000).toISOString() },
    skewed,
  );
  assert.equal(motorMode(old, true, skewed), "stale");
  // A reading counts as live for LIVE_WINDOW_MS after it arrived, then it is RECONNECTING.
  assert.equal(motorMode(m, true, skewed + LIVE_WINDOW_MS), "running");
  assert.equal(motorMode(m, true, skewed + LIVE_WINDOW_MS + 1), "reconnecting");
});

test("meter, distance chip and end card share one rounding; a paused heat keeps it frozen", () => {
  const g = createGame();
  advance(g, running, 3);
  const frozen = meters(g.distance);
  assert.ok(frozen > 0);
  for (const m of [
    { ...running, paused: true },
    { ...running, mode: "reconnecting" as const },
    { ...running, mode: "stale" as const },
  ]) {
    advance(g, m, 5);
    assert.equal(meters(g.distance), frozen);
    assert.equal(g.speed, 0);
  }
  assert.equal(meters(12.9999), 12);
  assert.equal(meters(13), 13);
  // Score is distance × combo, reported in points and never as the meter's meters.
  assert.equal(score({ distance: 13.7, combo: 2 }), 27);
});

test("gateway helpers find the live CID and build public mirror links", () => {
  const cid = "bafybeid244duorixf5mo3xu3g57pqfkiskukkoozprvcbcn7gneyqvyq3a";
  assert.equal(cidFromLocation(`${cid}.ipfs.dweb.link`, "/"), cid);
  assert.equal(cidFromLocation("example.com", `/ipfs/${cid}/index.html`), cid);
  assert.equal(cidFromLocation(`${ENS_NAME}.limo`, "/"), null);
  assert.equal(cidFromHeaders(`/ipfs/${cid}/`, null), cid);
  assert.equal(cidFromHeaders(null, `${cid},bafyother`), cid);
  assert.equal(cidFromHeaders(null, null), null);
  assert.equal(
    cidFromDnsJson({ Answer: [{ data: `dnslink=/ipfs/${cid}` }] }),
    cid,
  );
  assert.equal(cidFromDnsJson({ Status: 3 }), null);
  assert.deepEqual(
    mirrorLinks(cid).map((m) => m.href),
    [`https://${cid}.ipfs.dweb.link/`, `https://${cid}.ipfs.inbrowser.link/`],
  );
  assert.equal(
    inlineDnsLabel(ENS_NAME),
    "squeek--relay--one--hamster--all--of-identitymd-eth",
  );
  assert.match(mirrorLinks(null)[0].href, /\.ipns\.dweb\.link\/$/);
});

test("a 200 'indexer_unavailable' round answer is a data gap, not a lost connection", () => {
  assert.equal(
    economyGap({ status: "unavailable", reason: "indexer_unavailable" }),
    "indexer_unavailable",
  );
  assert.equal(economyGap({ status: "unavailable" }), "unavailable");
  assert.equal(
    economyGap({
      status: "available",
      lifecycle: { stage: "active", paused: false, currentRound: "7" },
    }),
    null,
  );
  assert.throws(() => parseEconomy({ status: "unavailable" }));
});
