import { useMemo } from "react";

type StreakItem = {
  id: number;
  x: number;
  y: number;
  len: number;
  delay: number;
  pink: boolean;
};

type Props = {
  active: boolean;
  count?: number;
};

export default function Streaks({ active, count = 60 }: Props) {
  const items = useMemo<StreakItem[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: 30 + Math.random() * 40,
        len: 80 + Math.random() * 240,
        delay: Math.random() * 200,
        pink: Math.random() < 0.35,
      })),
    [count],
  );
  return (
    <div className="streaks">
      {items.map((s) => (
        <div
          key={s.id}
          className={"streak" + (s.pink ? " pink" : "")}
          style={{
            left: s.x + "%",
            top: s.y + "%",
            height: s.len + "px",
            transform: active
              ? `translate3d(0, ${window.innerHeight}px, 0) scaleY(1.4)`
              : "translate3d(0,0,0) scaleY(0.2)",
            opacity: active ? 0.9 : 0,
            transition: `transform 1200ms cubic-bezier(0.55, 0.05, 0.25, 1) ${s.delay}ms, opacity 600ms ease ${s.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
