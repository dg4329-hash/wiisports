import type { ReactNode } from "react";

type Accent = "cyan" | "pink";

type Props = {
  index: number;
  accent: Accent;
  eyebrow: string;
  title: string;
  desc: string;
  players: string;
  input: string;
  ctaLabel: string;
  prop: ReactNode;
  delay?: boolean;
  onPlay: () => void;
};

export default function GameCard({
  index,
  accent,
  eyebrow,
  title,
  desc,
  players,
  input,
  ctaLabel,
  prop,
  delay,
  onPlay,
}: Props) {
  const cardClass = ["game-card", accent === "pink" ? "pink" : "", delay ? "delay" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cardClass} onClick={onPlay}>
      <div className="gc-top">
        <div className={"chip " + (accent === "pink" ? "pink" : "cyan")}>
          <span className="num">{String(index).padStart(2, "0")}</span>
          <span>·</span>
          <span>{eyebrow}</span>
        </div>
        <div className="gc-meta">
          <span className={"ind" + (accent === "pink" ? " p" : "")} />
          <span>READY</span>
        </div>
      </div>

      <div className="gc-stage">
        <div className="prop">{prop}</div>
      </div>

      <div className="gc-bottom">
        <div className="gc-row">
          <div>
            <div className="gc-title">{title}</div>
          </div>
        </div>
        <div className="gc-desc">{desc}</div>
        <div className="gc-cta-row">
          <div style={{ display: "flex", gap: 28 }}>
            <div className="stat">
              <div className="k">Players</div>
              <div className="v">{players}</div>
            </div>
            <div className="stat">
              <div className="k">Input</div>
              <div className="v">{input}</div>
            </div>
          </div>
          <button
            className={"btn-primary " + (accent === "pink" ? "pink" : "")}
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            <span className="dot" />
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
