import { useEffect, useMemo, useRef, type MutableRefObject } from "react";

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  depth: number;
  color: string;
  opacity: number;
  speed: number;
  phase: number;
};

export type MouseRef = MutableRefObject<{ x: number; y: number }>;

type Props = {
  density?: number;
  mouse: MouseRef;
};

export default function Particles({ density = 180, mouse }: Props) {
  const particles = useMemo<Particle[]>(() => {
    const arr: Particle[] = [];
    for (let i = 0; i < density; i++) {
      const isPink = Math.random() < 0.32;
      arr.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 1 + Math.random() * 4,
        depth: 0.1 + Math.random() * 0.9,
        color: isPink ? "rgba(244,114,182,0.8)" : "rgba(127,220,255,0.85)",
        opacity: 0.25 + Math.random() * 0.55,
        speed: 0.4 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return arr;
  }, [density]);

  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      const el = ref.current;
      if (el) {
        const mx = (mouse.current?.x ?? 0.5) - 0.5;
        const my = (mouse.current?.y ?? 0.5) - 0.5;
        const children = el.children;
        for (let i = 0; i < children.length && i < particles.length; i++) {
          const p = particles[i];
          const drift = Math.sin(t * 0.15 * p.speed + p.phase) * 8;
          const driftY = Math.cos(t * 0.12 * p.speed + p.phase) * 6;
          const px = mx * p.depth * -28;
          const py = my * p.depth * -22;
          (children[i] as HTMLDivElement).style.transform = `translate3d(${
            drift + px
          }px, ${driftY + py}px, 0)`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [particles, mouse]);

  return (
    <div className="particles" ref={ref}>
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: p.x + "%",
            top: p.y + "%",
            width: p.size + "px",
            height: p.size + "px",
            background: p.color,
            opacity: p.opacity,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          }}
        />
      ))}
    </div>
  );
}
