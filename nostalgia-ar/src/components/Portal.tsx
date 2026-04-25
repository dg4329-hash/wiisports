import type { Phase } from "../phase";

type Props = { phase: Phase };

export default function Portal({ phase }: Props) {
  const size =
    phase === "idle"
      ? 0
      : phase === "opening"
        ? 220
        : phase === "dolly"
          ? 2400
          : phase === "flash"
            ? 2800
            : 0;
  const opacity =
    phase === "idle"
      ? 0
      : phase === "opening"
        ? 1
        : phase === "dolly"
          ? 1
          : phase === "flash"
            ? 0
            : 0;
  const dur = phase === "opening" ? 380 : phase === "dolly" ? 1200 : 280;

  return (
    <div className="portal-layer">
      <div
        className="portal"
        style={{
          width: size + "px",
          height: size + "px",
          opacity,
          transition: `width ${dur}ms cubic-bezier(0.55,0.05,0.25,1), height ${dur}ms cubic-bezier(0.55,0.05,0.25,1), opacity 280ms ease`,
        }}
      >
        <div className="ring" />
        <div className="ring r2" />
        <div className="ring r3" />
        <div className="core" />
      </div>
    </div>
  );
}
