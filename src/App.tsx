import { useCallback, useEffect, useRef, useState } from "react";
import { HamsterMark, Icon } from "./components/Icon";
import { Modal } from "./components/Modal";
import { WalletControl } from "./components/WalletControl";
import { useLive } from "./lib/useLive";
import { chooseHeat, formatTime, formatWork, type Heat } from "./lib/live";
import {
  entries,
  saveEntry,
  saveSetting,
  stored,
  type Entry,
} from "./lib/storage";
import { squeak, unlockAudio } from "./lib/audio";
import {
  canScore,
  createGame,
  moveLane,
  score,
  step,
  triggerBoost,
  type Motor,
} from "./game/engine";
import { render } from "./game/render";
import { usePeers } from "./game/usePeers";
import { shortAddress } from "./lib/wallet";

type Phase = "title" | "racing" | "finished";
type Hud = {
  distance: number;
  score: number;
  combo: number;
  charge: number;
  boost: boolean;
  speed: number;
  feedback: string;
  lane: number;
};
const hudOf = (g: ReturnType<typeof createGame>): Hud => ({
  distance: g.distance,
  score: score(g),
  combo: g.combo,
  charge: g.charge,
  boost: g.boostTime > 0,
  speed: g.speed,
  feedback: g.feedbackTime > 0 ? g.feedback : "",
  lane: g.lane,
});

export default function App() {
  const live = useLive();
  const [phase, setPhase] = useState<Phase>("title");
  const [nick, setNick] = useState(() =>
    stored("squeek-relay:nick", "Tiny Runner").slice(0, 18),
  );
  const [identity, setIdentity] = useState<string>();
  const [muted, setMuted] = useState(
    () => stored("squeek-relay:muted", "false") === "true",
  );
  const [help, setHelp] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(document.hidden);
  const [heat, setHeat] = useState<Heat | null>(null);
  const [quick, setQuick] = useState(false);
  const [board, setBoard] = useState(entries);
  const [saved, setSaved] = useState(true);
  const [result, setResult] = useState<Entry | null>(null);
  const [copied, setCopied] = useState(false);
  const [nameError, setNameError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const gameRegion = useRef<HTMLElement>(null);
  const game = useRef(createGame());
  const [hud, setHud] = useState(hudOf(game.current));
  const { peers, broadcast, runnerId } = usePeers();
  const reduced = useRef(
    matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const motor: Motor = {
    mode: live.mode,
    rpm: live.measurement?.rpm ?? 0,
    paused: paused || hidden || help || Boolean(live.economy?.paused),
  };
  const latest = useRef({ phase, motor, muted, heat, nick, peers, identity });
  latest.current = { phase, motor, muted, heat, nick, peers, identity };
  const activeHeat =
    heat ??
    chooseHeat(
      quick ? null : live.economy,
      quick ? null : live.roundConfig,
      live.now,
    );
  const currentPeers = peers.filter(
    (p) => p.heatId === activeHeat.id && p.id !== runnerId,
  );
  const boardRows = board
    .filter((e) => e.heatId === activeHeat.id)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const online = live.mode === "running" || live.mode === "sleeping";
  const ice = live.mode !== "running";
  const status =
    live.mode === "running"
      ? "HE’S RUNNING"
      : live.mode === "sleeping"
        ? "HE’S SLEEPING"
        : live.mode === "stale"
          ? "SIGNAL STALE"
          : "RECONNECTING";
  const statusHint =
    live.mode === "running"
      ? "The whole track is surging."
      : live.mode === "sleeping"
        ? "Ice mode: save your energy."
        : live.mode === "stale"
          ? "Scoring paused until fresh data arrives."
          : "Scoring paused. Retrying the live feeds…";

  const finish = useCallback(() => {
    const current = latest.current;
    if (current.phase !== "racing" || !current.heat) return;
    latest.current.phase = "finished";
    const entry: Entry = {
      id: crypto.randomUUID(),
      heatId: current.heat.id,
      nick: current.nick,
      address: current.identity,
      score: score(game.current),
      distance: game.current.distance,
      combo: game.current.combo,
      at: Date.now(),
    };
    setResult(entry);
    setSaved(saveEntry(entry));
    setBoard(entries());
    setPhase("finished");
    setPaused(false);
    squeak("finish", current.muted);
  }, []);

  useEffect(() => {
    const read = () => setBoard(entries());
    window.addEventListener("storage", read);
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => {
      reduced.current = media.matches;
    };
    media.addEventListener("change", motion);
    return () => {
      window.removeEventListener("storage", read);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", motion);
    };
  }, []);

  useEffect(() => {
    let raf = 0,
      previous = 0,
      lastHud = 0;
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let w = c.clientWidth,
      h = c.clientHeight;
    const resize = () => {
      w = c.clientWidth;
      h = c.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(c);
    resize();
    const frame = (at: number) => {
      const dt = previous ? Math.min((at - previous) / 1000, 0.05) : 0;
      previous = at;
      const v = latest.current;
      if (v.phase === "racing") {
        if (v.heat && Date.now() >= v.heat.endsAt) finish();
        else {
          const event = step(game.current, v.motor, dt);
          if (event) squeak(event, v.muted);
        }
      }
      // Reduced motion keeps essential racing movement, with no ambient drift or particles.
      render(
        ctx,
        w,
        h,
        game.current,
        v.motor.mode,
        v.phase,
        at / 1000,
        reduced.current,
        v.nick,
        v.peers.filter((p) => p.heatId === v.heat?.id),
      );
      if (at - lastHud > 100) {
        setHud(hudOf(game.current));
        lastHud = at;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [finish]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const v = latest.current;
      if (v.phase === "racing" && v.heat) {
        broadcast({
          heatId: v.heat.id,
          nick: v.nick,
          distance: game.current.distance,
          lane: game.current.lane,
          score: score(game.current),
        });
        if (Date.now() >= v.heat.endsAt) finish();
      }
    }, 500);
    return () => clearInterval(timer);
  }, [broadcast, finish]);

  const boost = useCallback(() => {
    if (latest.current.phase !== "racing") return;
    unlockAudio();
    if (triggerBoost(game.current, latest.current.motor)) {
      squeak("boost", latest.current.muted);
      setHud(hudOf(game.current));
    }
  }, []);
  const lane = useCallback((direction: number) => {
    if (latest.current.phase === "racing" && !latest.current.motor.paused) {
      moveLane(game.current, direction);
      setHud(hudOf(game.current));
    }
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        latest.current.phase !== "racing" ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        document.querySelector("dialog[open]")
      )
        return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (!e.repeat) lane(-1);
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        if (!e.repeat) lane(1);
      }
      if (
        e.code === "Space" &&
        (!(e.target instanceof HTMLButtonElement) ||
          e.target.classList.contains("control-key"))
      ) {
        e.preventDefault();
        if (!e.repeat) boost();
      }
      if (e.key === "Escape" || e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [boost, lane]);

  function start() {
    const name = nick.trim();
    if (!name) {
      setNameError("Give your runner a name.");
      document.getElementById("nickname")?.focus();
      return;
    }
    setNameError("");
    setNick(name);
    saveSetting("squeek-relay:nick", name);
    unlockAudio();
    const next = chooseHeat(
      quick ? null : live.economy,
      quick ? null : live.roundConfig,
      Date.now(),
    );
    setHeat(next);
    game.current = createGame();
    setHud(hudOf(game.current));
    setPaused(false);
    setResult(null);
    setCopied(false);
    setPhase("racing");
    requestAnimationFrame(() => {
      gameRegion.current?.focus({ preventScroll: true });
      if (innerWidth < 700)
        gameRegion.current?.scrollIntoView({
          block: "start",
          behavior: "instant",
        });
    });
  }
  function home() {
    setPhase("title");
    setHeat(null);
    setPaused(false);
    game.current = createGame();
    setHud(hudOf(game.current));
  }

  return (
    <>
      <a href="#relay" className="skip-link">
        Skip to the relay
      </a>
      <div className="site-shell">
        <header className="header">
          <a
            href="#"
            className="brand"
            aria-label="Squeek Relay home"
            onClick={(e) => {
              e.preventDefault();
              if (phase !== "racing") home();
            }}
          >
            <HamsterMark />
            <span>
              Squeek<span className="brand-light">Relay</span>
            </span>
          </a>
          <nav className="header-actions" aria-label="Game settings">
            <button
              className="icon-button"
              aria-label="How to play"
              onClick={() => setHelp(true)}
            >
              <Icon name="help" />
            </button>
            <button
              className="icon-button sound-button"
              aria-label={muted ? "Turn sound on" : "Mute sound"}
              aria-pressed={!muted}
              onClick={() => {
                unlockAudio();
                setMuted(!muted);
                saveSetting("squeek-relay:muted", String(!muted));
                if (muted) squeak("baton", false);
              }}
            >
              <Icon name={muted ? "muted" : "sound"} />
            </button>
            <WalletControl verified={identity} onIdentity={setIdentity} />
          </nav>
        </header>

        <main id="relay">
          <section
            className={`arcade ${ice ? "frost" : "warm"} ${phase === "racing" ? "is-racing" : ""}`}
            ref={gameRegion}
            tabIndex={-1}
            aria-label="Squeek Relay game"
            data-lane={hud.lane}
            data-speed={hud.speed.toFixed(2)}
            data-mode={live.mode}
          >
            <div className="live-bar">
              <div className="live-state">
                <span className={`live-badge ${!online ? "offline" : ""}`}>
                  <i />
                  {online ? "LIVE" : "SYNC"}
                </span>
                <span className="motor-state" role="status">
                  {status}
                </span>
              </div>
              <div className="live-numbers">
                <span className="rpm">
                  <b>
                    {online && live.measurement
                      ? live.measurement.rpm.toFixed(1)
                      : "—"}
                  </b>{" "}
                  RPM
                </span>
                <span className="work">
                  <span className="work-label">Work units</span>{" "}
                  <b>{formatWork(live.measurement?.work)}</b>
                  {!online && live.measurement && <small>last seen</small>}
                </span>
              </div>
            </div>
            <div className="scene">
              <canvas
                ref={canvas}
                className="track"
                aria-label="Three-lane hamster relay track. Use the lane buttons or left and right arrow keys to catch gold batons."
                role="img"
              />
              <div
                className={`track-notice ${!online ? "connection-notice" : ""}`}
              >
                <Icon name={ice ? "snow" : "bolt"} size={16} />
                <span>
                  {live.economy?.paused
                    ? "Chain lifecycle paused. Scoring is paused."
                    : statusHint}
                </span>
                {!online && (
                  <button
                    onClick={live.reconnect}
                    aria-label="Retry live connection"
                  >
                    <Icon name="refresh" size={16} />
                  </button>
                )}
              </div>
              {phase === "title" && (
                <div className="title-content">
                  <h1>
                    One hamster.
                    <br />
                    <span>All of us.</span>
                  </h1>
                  <p className="title-description">
                    A live relay powered by Squeektoshi.
                  </p>
                  <form
                    className="play-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      start();
                    }}
                  >
                    <div className="nick-field">
                      <label htmlFor="nickname">Runner name</label>
                      <input
                        id="nickname"
                        name="nickname"
                        autoComplete="nickname"
                        value={nick}
                        maxLength={18}
                        onChange={(e) => {
                          setNick(e.target.value);
                          setNameError("");
                        }}
                        aria-invalid={!!nameError}
                        aria-describedby={nameError ? "name-error" : undefined}
                      />
                    </div>
                    <button className="primary play-button" type="submit">
                      {identity ? "Play relay" : "Play as guest"}
                      <Icon name="arrow" size={22} />
                    </button>
                    {nameError && (
                      <p id="name-error" className="error-note" role="alert">
                        {nameError}
                      </p>
                    )}
                  </form>
                  <div className="play-note">
                    <span>Free to play, tiny legs welcome.</span>
                    <label className="quick-toggle">
                      <input
                        type="checkbox"
                        checked={quick}
                        onChange={(e) => setQuick(e.target.checked)}
                      />
                      90s quick heat
                    </label>
                  </div>
                </div>
              )}

              {phase === "racing" && (
                <div className="race-overlay">
                  <div className="race-top">
                    <div className="race-score">
                      <span>Meters ridden</span>
                      <strong data-testid="score">
                        {hud.score.toLocaleString("en-US")}
                        <small>m</small>
                      </strong>
                      <span>with Squeektoshi</span>
                    </div>
                    <div className="heat-clock">
                      <span>{heat?.label}</span>
                      <b data-testid="timer">
                        {formatTime(
                          Math.min(
                            heat?.duration ?? 0,
                            (heat?.endsAt ?? live.now) - live.now,
                          ),
                        )}
                      </b>
                      <button
                        className="icon-button"
                        aria-label={paused ? "Resume race" : "Pause race"}
                        onClick={() => setPaused(!paused)}
                      >
                        <Icon name={paused ? "play" : "pause"} />
                      </button>
                    </div>
                  </div>
                  <div className="combo-indicator">
                    <span className={hud.combo > 1 ? "combo-active" : ""}>
                      {hud.combo}× combo
                    </span>
                    <span>{hud.distance.toFixed(0)} m distance</span>
                  </div>
                  <p
                    className={`race-feedback ${hud.feedback ? "show" : ""}`}
                    aria-hidden="true"
                  >
                    {hud.feedback || "Keep the relay rolling"}
                  </p>
                </div>
              )}

              {phase === "racing" && (paused || hidden || help) && (
                <div className="pause-cover">
                  <Icon name="pause" size={32} />
                  <h2>Take a tiny breather.</h2>
                  <p>The heat clock keeps running.</p>
                  <button
                    className="primary"
                    onClick={() => {
                      setPaused(false);
                      setHelp(false);
                      gameRegion.current?.focus();
                    }}
                  >
                    Resume race
                    <Icon name="play" />
                  </button>
                  <button className="text-button" onClick={home}>
                    Leave this heat
                  </button>
                </div>
              )}

              {phase === "finished" && result && (
                <div className="finish-cover">
                  <div className="finish-heading">
                    <Icon name="trophy" size={28} />
                    <h2>Little legs. Big relay.</h2>
                  </div>
                  <strong className="finish-score">
                    {result.score.toLocaleString("en-US")}
                    <span>m</span>
                  </strong>
                  <p>meters ridden with Squeektoshi</p>
                  <div className="finish-detail">
                    <span>{result.distance.toFixed(1)} m distance</span>
                    <span>×</span>
                    <span>{result.combo}× final combo</span>
                  </div>
                  <p className="save-note" role="status">
                    {saved
                      ? "Score saved on this device."
                      : "Storage is unavailable. This score lasts for this visit."}
                  </p>
                  <div className="finish-actions">
                    <button className="primary" onClick={start}>
                      Race again
                      <Icon name="arrow" />
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        const text = `I rode ${result.score.toLocaleString("en-US")} meters with Squeektoshi in Squeek Relay. One real hamster powers the whole race. ${location.href.split("#")[0]}`;
                        void navigator.clipboard
                          ?.writeText(text)
                          .then(() => setCopied(true))
                          .catch(() => setCopied(false));
                      }}
                    >
                      {copied ? "Copied!" : "Copy score"}
                      <Icon name={copied ? "check" : "link"} size={16} />
                    </button>
                  </div>
                  <button className="text-button" onClick={home}>
                    Back to the burrow
                  </button>
                </div>
              )}
            </div>

            <div className="game-controls">
              <div className="lane-controls">
                <div className="lane-buttons">
                  <button
                    className="control-key"
                    aria-label="Change lane left"
                    disabled={phase !== "racing" || motor.paused}
                    onClick={() => lane(-1)}
                  >
                    <Icon name="left" />
                  </button>
                  <button
                    className="control-key"
                    aria-label="Change lane right"
                    disabled={phase !== "racing" || motor.paused}
                    onClick={() => lane(1)}
                  >
                    <Icon name="right" />
                  </button>
                </div>
                <div className="control-description">
                  <strong>Switch lanes</strong>
                  <span>
                    <kbd>←</kbd> <kbd>→</kbd> or A / D
                  </span>
                </div>
              </div>
              <div className="boost-controls">
                <div className="boost-status">
                  <div className="boost-caption">
                    <strong>
                      {hud.boost
                        ? "Surging!"
                        : ice
                          ? "Boost on ice"
                          : "Squeek boost"}
                    </strong>
                    <span>{Math.floor(hud.charge)}%</span>
                  </div>
                  <div
                    className="boost-meter"
                    role="progressbar"
                    aria-label="Boost energy"
                    aria-valuenow={Math.floor(hud.charge)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <i style={{ width: `${hud.charge}%` }} />
                  </div>
                  <span className="boost-hint">
                    {ice
                      ? "Recharges when he runs"
                      : "Recharging from the real wheel"}
                  </span>
                </div>
                <button
                  className="boost-button"
                  onClick={boost}
                  disabled={
                    phase !== "racing" ||
                    live.mode !== "running" ||
                    motor.paused ||
                    hud.charge < 25 ||
                    hud.boost
                  }
                >
                  <Icon name="bolt" />
                  <span>
                    Boost<small>Space / tap</small>
                  </span>
                </button>
              </div>
            </div>
          </section>

          <div className="below-game">
            <section className="relay-story" aria-labelledby="story-title">
              <div className="section-heading">
                <h2 id="story-title">Ride his rhythm.</h2>
                <span className="round-tag">
                  {live.economy
                    ? `Round ${live.economy.round}`
                    : "Finding the round…"}
                </span>
              </div>
              <p>
                One real hamster powers everyone’s track. When Squeektoshi runs,
                we fly. When he naps, we all skate.
              </p>
              <div className="how-steps">
                <div>
                  <span className="step-art baton-art" aria-hidden="true" />
                  <p>
                    <strong>Catch the gold.</strong>
                    <span>Every 3 batons builds your combo.</span>
                  </p>
                </div>
                <div>
                  <span className="step-art">
                    <Icon name="snow" size={27} />
                  </span>
                  <p>
                    <strong>Mind the ice.</strong>
                    <span>Sleepy obstacles reset your combo.</span>
                  </p>
                </div>
                <div>
                  <span className="step-art">
                    <Icon name="bolt" size={27} />
                  </span>
                  <p>
                    <strong>Ride his rhythm.</strong>
                    <span>Boost only works while he runs.</span>
                  </p>
                </div>
              </div>
              <button
                className="how-link text-button"
                onClick={() => setHelp(true)}
              >
                How it works
                <Icon name="right" size={16} />
              </button>
            </section>

            <section className="leaderboard" aria-labelledby="board-title">
              <div className="section-heading">
                <h2 id="board-title">The relay board</h2>
                <span className="device-label">This device</span>
              </div>
              <div className="board-subhead">
                <span>{activeHeat.label}</span>
                <span>Distance × combo</span>
              </div>
              {boardRows.length ? (
                <ol className="board-list">
                  {boardRows.map((e, i) => (
                    <li key={e.id}>
                      <span className="rank">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="board-name">
                        {e.nick}
                        {e.address && <small>{shortAddress(e.address)}</small>}
                      </span>
                      <strong>
                        {e.score.toLocaleString("en-US")}
                        <small> m</small>
                      </strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="board-empty">
                  <Icon name="trophy" size={27} />
                  <div>
                    <strong>The first baton is yours.</strong>
                    <p>Finish a heat to set this device’s first score.</p>
                  </div>
                </div>
              )}
              {phase === "racing" && (
                <div className="you-row">
                  <span>
                    <i /> {nick} <small>on track</small>
                  </span>
                  <b>{hud.score.toLocaleString("en-US")} m</b>
                </div>
              )}
              {phase === "racing" &&
                currentPeers.map((p) => (
                  <div className="you-row peer-row" key={p.id}>
                    <span>
                      {p.nick} <small>on track</small>
                    </span>
                    <b>{Math.floor(p.score).toLocaleString("en-US")} m</b>
                  </div>
                ))}
              <p className="board-footnote">
                {currentPeers.length
                  ? `${currentPeers.length} other ${currentPeers.length === 1 ? "runner" : "runners"} in this browser.`
                  : "Race friends in tabs on this browser."}{" "}
                Scores stay here.
              </p>
            </section>
          </div>
        </main>
        <footer className="footer">
          <span>
            <HamsterMark />
            Built for the Squeekchain rhythm.
          </span>
          <a
            href="https://docs.squeekchain.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Meet Squeekchain
            <Icon name="link" size={14} />
          </a>
        </footer>
      </div>
      {help && (
        <Modal
          title="One wheel. Everyone’s race."
          onClose={() => setHelp(false)}
        >
          <div className="help-body">
            <p>
              Steer with <kbd>←</kbd> <kbd>→</kbd> or <kbd>A</kbd> /{" "}
              <kbd>D</kbd>. On a phone, use the lane buttons. Catch gold batons;
              every three raises your combo, up to 8×.
            </p>
            <p>
              Press <kbd>Space</kbd> or tap Boost for a burst of speed. It costs
              25% energy and only works while Squeektoshi is running. Ice and
              sleeping hamsters reset your combo.
            </p>
            <p>
              Your score is distance × your final combo: meters ridden with
              Squeektoshi. A heat lasts until the current 10-minute round ends,
              or 90 seconds if its timing is unavailable. Choose “90s quick
              heat” for a shorter race.
            </p>
            <button
              className="secondary full"
              aria-pressed={!muted}
              onClick={() => {
                unlockAudio();
                setMuted(!muted);
                saveSetting("squeek-relay:muted", String(!muted));
              }}
            >
              <Icon name={muted ? "muted" : "sound"} />
              {muted ? "Turn sound on" : "Mute sound"}
            </button>
            <h3>How it works</h3>
            <p>
              The public{" "}
              <a
                href="https://api.squeekchain.com/v1/status"
                target="_blank"
                rel="noopener noreferrer"
              >
                Squeekchain /v1/status API
              </a>{" "}
              supplies real RPM, work units and freshness.{" "}
              <a
                href="https://api.squeekchain.com/v1/economy/state"
                target="_blank"
                rel="noopener noreferrer"
              >
                /v1/economy/state
              </a>{" "}
              supplies the round and lifecycle. Both refresh every 2.5 seconds.{" "}
              <a
                href="https://api.squeekchain.com/v1/core"
                target="_blank"
                rel="noopener noreferrer"
              >
                /v1/core
              </a>{" "}
              supplies round timing.
            </p>
            <p>
              Wheel RPM is rpmMilli ÷ 1,000; game speed is RPM × 0.4 m/s, capped
              at 38 m/s before boost. Sleep or stale data ices the track. If
              either live feed fails, scoring pauses until it reconnects. Work
              units are measured totals, never simulated.
            </p>
            <p>
              Everyone shares the same real motor. This v1 leaderboard is saved
              on this device; open tabs share live runners. Wallet signatures
              add an optional local identity. Scores are game points, with no
              token rewards.
            </p>
            <button className="primary full" onClick={() => setHelp(false)}>
              Got it
              <Icon name="check" />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
