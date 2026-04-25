import { useEffect, useRef, useState } from "react";
import Hero from "./components/Hero";
import Portal from "./components/Portal";
import Streaks from "./components/Streaks";
import Particles from "./components/Particles";
import GameCard from "./components/GameCard";
import PaddleProp from "./components/PaddleProp";
import FruitProp from "./components/FruitProp";
import type { Phase } from "./phase";

// Game launch URLs — overridable via env at build time for Vercel deploy.
// Defaults to relative paths so they can be configured via Vercel rewrites.
const PINGPONG_URL = (import.meta.env.VITE_PINGPONG_URL as string | undefined) ?? "/pingpong/";
const FRUIT_URL = (import.meta.env.VITE_FRUIT_URL as string | undefined) ?? "/fruit/";

const PARTICLE_DENSITY = 180;
const TRANSITION_MS = 1400;
const SHOW_SCANLINES = true;
const SHOW_GRAIN = true;

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX / window.innerWidth;
      mouse.current.y = e.clientY / window.innerHeight;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Cancel any pending phase timers on unmount.
  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const startPortal = () => {
    if (phase !== "idle") return;
    setPhase("opening");
    const tDur = TRANSITION_MS;
    const t1 = window.setTimeout(() => setPhase("dolly"), 380);
    const t2 = window.setTimeout(() => setPhase("flash"), 380 + tDur * 0.78);
    const t3 = window.setTimeout(() => setPhase("select"), 380 + tDur * 0.78 + 280);
    timersRef.current.push(t1, t2, t3);
  };

  const reset = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setPhase("idle");
  };

  const stagePhase: "idle" | "select" | "dolly" =
    phase === "idle" ? "idle" : phase === "select" ? "select" : "dolly";

  const bloomOpacity = phase === "flash" ? 1 : 0;

  const playGame = (which: "pong" | "fruit") => {
    const url = which === "pong" ? PINGPONG_URL : FRUIT_URL;
    window.location.assign(url);
  };

  return (
    <>
      <div className="stage" data-phase={stagePhase}>
        <div className="wash-cyan" />
        <div className="wash-pink" />
        <Particles density={PARTICLE_DENSITY} mouse={mouse} />

        {SHOW_SCANLINES && <div className="scanlines" />}
        {SHOW_GRAIN && <div className="grain" />}
        <div className="vignette" />

        {/* corner crosshairs */}
        <div className="corner tl" />
        <div className="corner tr" />
        <div className="corner bl" />
        <div className="corner br" />

        {/* TOP HUD */}
        <div className="hud top">
          <div className="brand">
            <span className="mark" />
            <span>NOSTALGIA · AR</span>
          </div>
          <div className="nav">
            <a className="on" href="#">
              Lobby
            </a>
            <a href="#">Cabinets</a>
            <a href="#">How it works</a>
            <a href="#">About</a>
          </div>
          <div className="meta">
            <span className="dot-live" />
            <span>STAGE · LIVE</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>v0.4.2</span>
          </div>
        </div>

        {/* HERO */}
        {phase !== "select" && <Hero phase={phase} onPlay={startPortal} />}

        {/* PORTAL + STREAKS */}
        <Portal phase={phase} />
        <Streaks active={phase === "dolly"} count={48} />

        {/* SELECTION */}
        <div className={"select-screen" + (phase === "select" ? " visible" : "")}>
          <GameCard
            index={1}
            accent="cyan"
            eyebrow="TABLE TENNIS"
            title="Table Tennis"
            desc="Mirror your paddle in the air. The camera reads your wrist, the rally reads your nerve."
            players="1 — 2"
            input="HAND · PADDLE"
            ctaLabel="PLAY"
            prop={<PaddleProp />}
            onPlay={() => playGame("pong")}
          />
          <div className="divider-neon" />
          <GameCard
            index={2}
            accent="pink"
            eyebrow="FRUIT NINJA"
            title="Fruit Ninja"
            desc="Slice the air with your finger. Every fruit is a frame, every combo is a streak."
            players="1"
            input="HAND · BLADE"
            ctaLabel="PLAY"
            prop={<FruitProp />}
            delay
            onPlay={() => playGame("fruit")}
          />
        </div>

        {/* BACK */}
        {phase === "select" && (
          <button
            className="btn-ghost"
            style={{ position: "absolute", top: 22, right: 32, zIndex: 25 }}
            onClick={reset}
          >
            ← LOBBY
          </button>
        )}

        {/* WHITE BLOOM FLASH */}
        <div
          className="bloom"
          style={{ opacity: bloomOpacity, transition: "opacity 220ms ease" }}
        />

        {/* BOTTOM HUD */}
        {phase !== "select" && (
          <div className="hud bot">
            <div className="meta">
              <span>SIGNAL</span>
              <span style={{ color: "var(--tx-secondary)" }}>● ● ● ● ○</span>
            </div>
            <div className="eyebrow" style={{ color: "var(--tx-faint)" }}>
              SCROLL OR PRESS PLAY
            </div>
            <div className="meta">
              <span>FPS</span>
              <span className="mono" style={{ color: "var(--tx-secondary)" }}>
                60.0
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
