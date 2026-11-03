let context: AudioContext | undefined;
export function unlockAudio() {
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
  } catch {
    /* Audio is optional. */
  }
}
export function squeak(
  kind: "baton" | "hit" | "boost" | "finish",
  muted: boolean,
) {
  if (muted || !context || context.state !== "running") return;
  const at = context.currentTime;
  const o = context.createOscillator();
  const gain = context.createGain();
  o.type = kind === "hit" ? "triangle" : "sine";
  const start =
    kind === "hit"
      ? 170
      : kind === "finish"
        ? 800
        : kind === "boost"
          ? 650
          : 1400;
  o.frequency.setValueAtTime(start, at);
  o.frequency.exponentialRampToValueAtTime(
    kind === "hit" ? 80 : start * 1.7,
    at + 0.07,
  );
  o.frequency.exponentialRampToValueAtTime(start * 0.65, at + 0.17);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.045, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
  o.connect(gain);
  gain.connect(context.destination);
  o.start();
  o.stop(at + 0.21);
}
