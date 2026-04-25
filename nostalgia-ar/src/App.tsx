import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import Hero from "./components/Hero";
import Portal from "./components/Portal";
import Streaks from "./components/Streaks";
import Particles from "./components/Particles";
import GameCard from "./components/GameCard";
import PaddleProp from "./components/PaddleProp";
import FruitProp from "./components/FruitProp";
import SignIn from "./components/SignIn";
import Leaderboard from "./components/Leaderboard";
import type { Phase } from "./phase";
import { supabase } from "./lib/supabase";

type View = "lobby" | "leaderboard";

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
  const [showSignIn, setShowSignIn] = useState(false);
  const [view, setView] = useState<View>("lobby");
  const [session, setSession] = useState<Session | null>(null);
  const mouse = useRef({ x: 0.5, y: 0.5 });
  const timersRef = useRef<number[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) setShowSignIn(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

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

  // Legacy CSS-portal fallback — only used if the MP4 fails to load or play.
  const runLegacyPortal = () => {
    setPhase("opening");
    const tDur = TRANSITION_MS;
    const t1 = window.setTimeout(() => setPhase("dolly"), 380);
    const t2 = window.setTimeout(() => setPhase("flash"), 380 + tDur * 0.78);
    const t3 = window.setTimeout(() => setPhase("select"), 380 + tDur * 0.78 + 280);
    timersRef.current.push(t1, t2, t3);
  };

  const startPortal = () => {
    if (phase !== "idle") return;
    const v = videoRef.current;
    if (!v) {
      runLegacyPortal();
      return;
    }
    // Strategy: keep lobby visible while we kick off playback, swap to the video element
    // ONLY when its `playing` event fires — at which point the first frame is decoded
    // and rendered. Result: no black gap, no half-decoded frame.
    v.currentTime = 0;
    let switched = false;
    const onPlaying = () => {
      if (switched) return;
      switched = true;
      v.removeEventListener("playing", onPlaying);
      setPhase("transitioning");
    };
    v.addEventListener("playing", onPlaying);

    // Safety net: if `playing` doesn't fire within 600ms (network hiccup, decode failure),
    // fall back to the legacy CSS portal so the user isn't stuck.
    const safety = window.setTimeout(() => {
      if (switched) return;
      v.removeEventListener("playing", onPlaying);
      runLegacyPortal();
    }, 600);
    timersRef.current.push(safety);

    const playPromise = v.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise.catch(() => {
        if (switched) return;
        switched = true;
        v.removeEventListener("playing", onPlaying);
        runLegacyPortal();
      });
    }
  };

  // The video paused on its last frame is held visible until React commits the
  // picker→`select` phase change, then we cut. The picker is already laid out (we
  // render it during transitioning, see JSX), so the swap is single-frame.
  const handleVideoEnded = () => {
    setPhase("select");
  };

  const handleVideoError = () => {
    if (phase === "transitioning") {
      setPhase("idle");
      runLegacyPortal();
    }
  };

  const reset = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    setPhase("idle");
  };

  // Stage data-phase drives CSS layer visibility (hero, washes, etc.).
  // "transitioning" is its own bucket so the hero/HUD can be removed instantly without
  // running the legacy dolly transitions.
  const stagePhase: "idle" | "select" | "dolly" | "transitioning" =
    phase === "idle"
      ? "idle"
      : phase === "select"
        ? "select"
        : phase === "transitioning"
          ? "transitioning"
          : "dolly";

  // Picker is rendered into its final state both during the transition (so it's behind
  // the video, fully laid out by the time the video ends) and during select (interactive).
  const pickerVisible = phase === "select" || phase === "transitioning";

  const bloomOpacity = phase === "flash" ? 1 : 0;

  const playGame = (which: "pong" | "fruit") => {
    const url = which === "pong" ? PINGPONG_URL : FRUIT_URL;
    window.location.assign(url);
  };

  return (
    <>
      {showSignIn && <SignIn onClose={() => setShowSignIn(false)} />}
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
          <div className="meta">
            <span className="dot-live" />
            <span>STAGE · LIVE</span>
          </div>
          <div className="nav">
            <a
              className={view === "lobby" && phase !== "select" ? "on" : ""}
              href="#"
              onClick={(e) => { e.preventDefault(); setView("lobby"); reset(); }}
            >
              Lobby
            </a>
            <a
              className={view === "leaderboard" ? "on" : ""}
              href="#"
              onClick={(e) => { e.preventDefault(); setView("leaderboard"); }}
            >
              Leaderboard
            </a>
          </div>
          {session ? (
            <UserChip session={session} onSignOut={signOut} />
          ) : (
            <button className="btn-ghost" onClick={() => setShowSignIn(true)}>Sign In</button>
          )}
        </div>

        {/* HERO */}
        {phase !== "select" && view === "lobby" && <Hero phase={phase} onPlay={startPortal} />}

        {/* PORTAL + STREAKS */}
        <Portal phase={phase} />
        <Streaks active={phase === "dolly"} count={48} />

        {/* LEADERBOARD */}
        {view === "leaderboard" && <Leaderboard onClose={() => setView("lobby")} />}

        {/* SELECTION — rendered into "visible" during transitioning too (covered by the
            video) so by the time the MP4 ends the picker is already laid out behind it
            for a hard cut. Also gated on view === "lobby" so it hides under the leaderboard. */}
        <div
          className={"select-screen" + (pickerVisible && view === "lobby" ? " visible" : "")}
          style={{ pointerEvents: phase === "select" && view === "lobby" ? "auto" : "none" }}
        >
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

        {/* WHITE BLOOM FLASH (legacy fallback only — MP4 path doesn't use it) */}
        <div
          className="bloom"
          style={{ opacity: bloomOpacity, transition: "opacity 220ms ease" }}
        />

        {/* MP4 transition — visibility flips instantly only after the `playing` event
            fires (first frame decoded). No opacity fade in or out — the picker is laid
            out underneath beforehand so the end is a clean cut, not a fade. */}
        <video
          ref={videoRef}
          className={"transition-video" + (phase === "transitioning" ? " visible" : "")}
          src="/transition.mp4"
          preload="auto"
          playsInline
          muted
          onEnded={handleVideoEnded}
          onError={handleVideoError}
        />

        {/* Bottom-right cover — masks the corner of the video while it's playing. */}
        <div
          className={"transition-watermark-cover" + (phase === "transitioning" ? " visible" : "")}
        />

        {/* BOTTOM HUD */}
        {phase !== "select" && view === "lobby" && (
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

function UserChip({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const user = session.user;
  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
    avatar_url?: string;
    picture?: string;
  };
  const name = meta.full_name || meta.name || user.email?.split("@")[0] || "Player";
  const avatar = meta.avatar_url || meta.picture;
  const first = name.split(" ")[0];

  return (
    <div className="user-chip">
      {avatar ? (
        <img src={avatar} alt="" className="user-chip-avatar" referrerPolicy="no-referrer" />
      ) : (
        <div className="user-chip-avatar user-chip-avatar-fallback">
          {first.charAt(0).toUpperCase()}
        </div>
      )}
      <span className="user-chip-name">{first}</span>
      <button className="user-chip-out" onClick={onSignOut} aria-label="Sign out" title="Sign out">
        ⎋
      </button>
    </div>
  );
}
