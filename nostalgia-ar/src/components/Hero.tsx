import type { Phase } from "../phase";

type Props = {
  phase: Phase;
  onPlay: () => void;
};

export default function Hero({ phase, onPlay }: Props) {
  return (
    <div className="hero-stack">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
        <div className="eyebrow" style={{ color: "var(--tx-dim)" }}>
          <span style={{ color: "var(--cyan)" }}>●</span>
          <span style={{ marginLeft: 10 }}>CAMERA · TRACKED · ARCADE</span>
        </div>
        <div className="wordmark">
          NOSTALGIA
          <span className="line2">AR</span>
        </div>
        <div className="tagline">
          CHILDHOOD GAMES <span className="sep">/</span> PLAYED WITH YOUR HANDS
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center" }}>
          <button className="btn-primary" onClick={onPlay} disabled={phase !== "idle"}>
            <span className="dot" />
            PLAY
          </button>
          <button className="btn-ghost">HOW IT WORKS</button>
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 28, alignItems: "center" }}>
          <div
            className="mono"
            style={{ fontSize: 10, letterSpacing: "0.2em", color: "var(--tx-faint)" }}
          >
            02 CABINETS · WEBCAM REQUIRED · NO INSTALL
          </div>
        </div>
      </div>
    </div>
  );
}
