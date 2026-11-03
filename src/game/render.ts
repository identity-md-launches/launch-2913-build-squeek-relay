import type { MotorMode } from "../lib/live";
import type { GameState } from "./engine";

export type Peer = {
  id: string;
  nick: string;
  distance: number;
  lane: number;
  score: number;
  heatId: string;
  at: number;
};
const INK = "#0b1316";
function round(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
) {
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}
export function drawHamster(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  t: number,
  color = "#eeb563",
  sleeping = false,
  reduced = false,
) {
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  const bob = sleeping || reduced ? 0 : Math.sin(t * 12) * 2;
  c.fillStyle = "#030b1066";
  c.beginPath();
  c.ellipse(0, 27, 32, 7, 0, 0, Math.PI * 2);
  c.fill();
  c.translate(0, bob);
  const step = sleeping || reduced ? 0 : Math.sin(t * 14) * 6;
  round(c, -22 + step, 15, 18, 11, 5, "#f7d19c");
  round(c, 6 - step, 15, 19, 11, 5, "#f7d19c");
  // Small pixel corners keep the vector runner friendly without a blurry sprite sheet.
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(-3, -1, 30, 24, -0.12, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(19, -7, 20, 20, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.arc(12, -25, 10, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#e69e87";
  c.beginPath();
  c.arc(12, -26, 5, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#fff1cf";
  c.beginPath();
  c.ellipse(13, 4, 22, 15, -0.3, 0, Math.PI * 2);
  c.fill();
  if (sleeping) {
    c.strokeStyle = INK;
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(19, -8);
    c.quadraticCurveTo(23, -4, 27, -8);
    c.stroke();
  } else {
    c.fillStyle = INK;
    c.beginPath();
    c.arc(25, -9, 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#fff";
    c.fillRect(25, -10, 1.5, 1.5);
  }
  c.fillStyle = "#de9084";
  c.beginPath();
  c.ellipse(34, 0, 4, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#845845";
  c.lineWidth = 1.2;
  c.beginPath();
  c.moveTo(29, 4);
  c.lineTo(35, 6);
  c.moveTo(28, 7);
  c.lineTo(33, 10);
  c.stroke();
  c.fillStyle = "#eeb563";
  c.beginPath();
  c.arc(-31, 7, 5, 0, Math.PI * 2);
  c.fill();
  // Relay headband and trailing ribbon.
  c.strokeStyle = "#f4d655";
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(3, -18);
  c.lineTo(33, -17);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(4, -18);
  c.lineTo(-9, -24 + (reduced ? 0 : Math.sin(t * 9) * 3));
  c.lineTo(-15, -20);
  c.stroke();
  c.restore();
}
function snowflake(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    c.rotate(Math.PI / 3);
    c.beginPath();
    c.moveTo(-size, 0);
    c.lineTo(size, 0);
    c.moveTo(size * 0.5, -size * 0.25);
    c.lineTo(size * 0.7, 0);
    c.lineTo(size * 0.5, size * 0.25);
    c.moveTo(-size * 0.5, -size * 0.25);
    c.lineTo(-size * 0.7, 0);
    c.lineTo(-size * 0.5, size * 0.25);
    c.stroke();
  }
  c.restore();
}
function wheel(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  running: boolean,
  t: number,
  reduced: boolean,
) {
  c.save();
  c.translate(x, y);
  c.strokeStyle = running ? "#b79e4b" : "#3c6576";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-r * 0.65, r + 20);
  c.lineTo(-r * 0.25, r * 0.75);
  c.moveTo(r * 0.65, r + 20);
  c.lineTo(r * 0.25, r * 0.75);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 1;
  c.beginPath();
  c.arc(0, 0, r - 8, 0, Math.PI * 2);
  c.stroke();
  c.save();
  c.rotate(running && !reduced ? t * 0.8 : 0);
  for (let i = 0; i < 12; i++) {
    c.rotate(Math.PI / 6);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(r - 9, 0);
    c.stroke();
    c.fillStyle = running ? "#dfc969" : "#7194a3";
    c.fillRect(r - 4, -2, 4, 4);
  }
  c.restore();
  c.fillStyle = "#557581";
  c.beginPath();
  c.arc(0, 0, 6, 0, Math.PI * 2);
  c.fill();
  drawHamster(c, 0, r * 0.59, r / 80, t, "#d7a460", !running, reduced);
  if (!running) {
    c.fillStyle = "#a0d0e5";
    c.font = "600 14px Outfit, sans-serif";
    c.fillText("z", r * 0.4, -r * 0.28);
    c.fillText("Z", r * 0.62, -r * 0.55);
  }
  c.restore();
}
function baton(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  reduced: boolean,
) {
  c.save();
  c.translate(x, y - 14 + (reduced ? 0 : Math.sin(t * 3 + x) * 3));
  c.rotate(-0.65);
  round(c, -5, -18, 10, 32, 4, "#f7d758");
  round(c, -3, -16, 3, 28, 1, "#fff0ab");
  c.restore();
  c.fillStyle = "#f8dc6955";
  c.beginPath();
  c.ellipse(x, y + 13, 13, 3, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#fff0a0";
  c.fillRect(x + 15, y - 27, 3, 3);
  c.fillRect(x - 15, y - 10, 2, 2);
}
export function render(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  g: GameState,
  mode: MotorMode,
  phase: string,
  time: number,
  reduced: boolean,
  nick: string,
  peers: Peer[],
) {
  const running = mode === "running";
  const frost = !running;
  const playing = phase !== "title";
  const t = reduced ? 0 : time;
  c.clearRect(0, 0, w, h);
  c.fillStyle = "#101f25";
  c.fillRect(0, 0, w, h);
  // Hand-placed constellations, parallax ridges and a miniature wheel observatory.
  for (let i = 0; i < 82; i++) {
    const x = (i * 163.7 + 31) % w;
    const y = (i * 79.1 + 17) % (h * 0.63);
    c.fillStyle = i % 9 === 0 ? "#8ba4a1" : "#38535c";
    c.fillRect(x, y, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
  }
  const shift = g.distance * 0.35;
  const base = h - 184;
  for (let layer = 0; layer < 2; layer++) {
    c.fillStyle = layer ? "#1c3338" : "#172b32";
    c.beginPath();
    c.moveTo(0, base + 35);
    for (let i = -1; i <= Math.ceil(w / 130) + 1; i++) {
      const x = i * 130 - ((shift * (layer + 1)) % 130);
      c.lineTo(
        x,
        base - 12 - (Math.sin(i * 2.7 + layer) * 0.5 + 0.5) * (layer ? 35 : 80),
      );
      c.lineTo(
        x + 65,
        base - 40 - (Math.cos(i * 1.8) * 0.5 + 0.5) * (layer ? 23 : 60),
      );
    }
    c.lineTo(w, base + 70);
    c.lineTo(0, base + 70);
    c.fill();
  }
  const phone = w < 600;
  const wx = phone ? w * (playing ? 0.73 : 0.8) : w * 0.78;
  wheel(
    c,
    wx,
    h * (playing ? (phone ? 0.36 : 0.3) : 0.35),
    phone ? (playing ? 43 : 61) : 104,
    running,
    t,
    reduced,
  );
  // A little moon and mountain observatory are scenery, never pretend live players.
  c.fillStyle = "#d3d7b0";
  c.beginPath();
  c.arc(w * 0.56, h * 0.14, w < 600 ? 7 : 11, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = "#101f25";
  c.beginPath();
  c.arc(w * 0.56 + 4, h * 0.14 - 3, w < 600 ? 7 : 11, 0, Math.PI * 2);
  c.fill();
  const trackTop = h - 172;
  c.fillStyle = frost ? "#193441" : "#253a30";
  c.fillRect(0, trackTop, w, 172);
  c.fillStyle = frost ? "#345765" : "#526347";
  c.fillRect(0, trackTop, w, 3);
  // Ground tufts and brass rails.
  for (let i = 0; i < w / 35 + 2; i++) {
    const x = i * 35 - ((g.distance * 3) % 35);
    c.fillStyle = frost ? "#528196" : "#6a7960";
    c.fillRect(x, trackTop - 4, 2, 5);
    c.fillRect(x + 4, trackTop - 7, 2, 8);
    c.fillRect(x + 8, trackTop - 3, 2, 4);
  }
  const laneY = (lane: number) => trackTop + 40 + lane * 47;
  for (let lane = 0; lane < 3; lane++) {
    c.fillStyle = frost
      ? lane % 2
        ? "#1b3a49"
        : "#1c3844"
      : lane % 2
        ? "#2a3f33"
        : "#293b30";
    c.fillRect(0, trackTop + 6 + lane * 47, w, 45);
    c.strokeStyle = frost ? "#497080" : "#58644e";
    c.lineWidth = 1;
    c.setLineDash([12, 18]);
    c.lineDashOffset = -g.distance * 7;
    c.beginPath();
    c.moveTo(0, trackTop + 51 + lane * 47);
    c.lineTo(w, trackTop + 51 + lane * 47);
    c.stroke();
    c.setLineDash([]);
    for (let i = 0; i < w / 90; i++) {
      c.fillStyle = frost ? "#49718166" : "#a0a87c33";
      const x = (i * 90 + lane * 34 - g.distance * 7) % w;
      c.fillRect(x, laneY(lane) + 10, 4, 2);
    }
  }
  c.fillStyle = "#0a161c";
  c.fillRect(0, h - 16, w, 16);
  for (let i = 0; i < w / 12; i++) {
    c.fillStyle = frost ? "#213d49" : "#253c32";
    c.fillRect(i * 12, h - 14, 8, 5);
  }
  const playerX = playing ? Math.min(w * 0.23, 210) : Math.min(w * 0.24, 240);
  const pxPerMeter = w < 600 ? 6 : 8;
  for (let lane = 0; lane < 3; lane++) {
    if (playing) {
      for (const item of g.items.filter((i) => i.lane === lane && !i.hit)) {
        const x = playerX + (item.x - g.distance) * pxPerMeter;
        if (x < -50 || x > w + 50) continue;
        if (item.kind === "baton") baton(c, x, laneY(lane), t, reduced);
        else if (item.kind === "ice") {
          c.fillStyle = "#6eb9d177";
          c.beginPath();
          c.ellipse(x, laneY(lane) + 11, 28, 12, -0.13, 0, Math.PI * 2);
          c.fill();
          snowflake(c, x, laneY(lane) + 5, 10, "#9ddfff");
        } else {
          drawHamster(c, x, laneY(lane) - 13, 0.62, 0, "#91a4b6", true, true);
          c.fillStyle = "#b1d9e7";
          c.font = "12px Outfit";
          c.fillText("zZ", x + 20, laneY(lane) - 35);
        }
      }
      for (const p of peers.filter((p) => p.lane === lane)) {
        const x = playerX + (p.distance - g.distance) * pxPerMeter;
        if (x > -40 && x < w + 40) {
          c.globalAlpha = 0.55;
          drawHamster(
            c,
            x,
            laneY(lane) - 17,
            0.64,
            t,
            "#a399d8",
            frost,
            reduced,
          );
          c.globalAlpha = 1;
          c.fillStyle = "#c5bcf2";
          c.font = "12px Outfit";
          c.textAlign = "center";
          c.fillText(p.nick.slice(0, 16), x, laneY(lane) - 49);
          c.textAlign = "start";
        }
      }
    } else {
      baton(c, w * 0.58 + lane * 64, laneY(lane), t, reduced);
      if (lane !== 1) {
        c.globalAlpha = 0.5;
        drawHamster(
          c,
          w * (lane === 0 ? 0.66 : 0.8),
          laneY(lane) - 17,
          0.67,
          t + lane * 2,
          lane === 0 ? "#97a0cd" : "#c8a17b",
          frost,
          reduced,
        );
        c.globalAlpha = 1;
      }
    }
    if (Math.round(g.visualLane) === lane) {
      const py = laneY(g.visualLane) - 17;
      if (g.boostTime > 0 && !reduced) {
        for (let j = 0; j < 5; j++) {
          c.fillStyle = `rgba(247,215,88,${0.2 - j * 0.03})`;
          c.fillRect(playerX - 38 - j * 14, py - 10 + j * 3, 27, 3);
        }
      }
      drawHamster(
        c,
        playerX,
        py,
        w < 600 ? 0.8 : 1,
        t * (0.3 + g.speed * 0.1),
        "#edb565",
        false,
        reduced || g.speed < 0.1,
      );
      c.font = "600 12px Outfit, sans-serif";
      c.textAlign = "center";
      const tag = playing ? nick : "Your runner";
      const tagW = Math.min(c.measureText(tag).width + 18, 150);
      round(c, playerX - tagW / 2, py - 61, tagW, 21, 5, "#f4d45e");
      c.fillStyle = INK;
      c.fillText(tag, playerX, py - 46);
      c.textAlign = "start";
      if (g.hitTime > 0) snowflake(c, playerX - 5, py - 34, 20, "#9ddfff");
    }
  }
  if (frost) {
    // Ice crystals appear immediately, including stale and reconnect states.
    for (let i = 0; i < 8; i++) {
      const x = (i * 193 + 53 - g.distance * 2) % (w + 30);
      const y = trackTop + 12 + ((i * 47) % 122);
      snowflake(c, x, y, i % 2 ? 5 : 8, "#8ac1d666");
    }
    if (!reduced)
      for (let i = 0; i < 16; i++) {
        const x = (i * 149 + t * 9) % w;
        const y = (i * 63 + t * 12) % (h - 40);
        c.fillStyle = "#b4e5f04d";
        c.fillRect(x, y, 2, 2);
      }
    c.strokeStyle = "#82bdd24a";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(28, 20);
    c.lineTo(8, 42);
    c.moveTo(w, 0);
    c.lineTo(w - 32, 25);
    c.lineTo(w - 9, 62);
    c.stroke();
  }
  if (!reduced)
    for (const p of g.particles) {
      const x = playerX + (p.x - g.distance) * pxPerMeter;
      const y = laneY(p.lane) - 20;
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        const r = p.age * 85;
        c.globalAlpha = 1 - p.age / 0.65;
        c.fillStyle = p.kind === "gold" ? "#ffe386" : "#8cdbfb";
        c.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 4, 4);
      }
      c.globalAlpha = 1;
    }
}
