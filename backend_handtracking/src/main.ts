import * as THREE from "three";
import { DEFAULT_CONFIG, TABLE, OPP_END_Z, USER_END_Z } from "./types";
import type { MatchConfig } from "./types";
import { initTrackers, detect, startCamera } from "./tracking";
import type { Trackers } from "./tracking";
import { createSceneBundle, fitRendererToContainer, pushTrail, clearTrail, triggerSpark, updateSpark } from "./scene";
import type { SceneBundle } from "./scene";
import { UserAvatarDriver } from "./avatar";
import { makeBall, resetBallForServe, stepBall } from "./physics";
import type { BallState } from "./physics";
import { OpponentAI, plannedReturn, serveShot, magnetReturnShot } from "./ai";
import { newMatch, pointWon } from "./rules";
import type { MatchState } from "./rules";
import { bindUI, flashBanner, setPower, setStatus, setupStartModal, showEnd, updateHUD } from "./ui";

type AppState = {
  cfg: MatchConfig;
  match: MatchState;
  ball: BallState;
  serveArmed: boolean;   // ball tossed up, waiting for the server's swing
  rallyInFlight: boolean;
  lastPoint: number;
  hitCooldown: number;   // seconds remaining until the user can register another hit
};

// Probability the CPU deliberately whiffs each incoming ball — keeps matches winnable.
const CPU_MISS_RATE = 0.22;

async function main() {
  const stage = document.getElementById("stage") as HTMLDivElement;
  const ui = bindUI();
  const bundle = createSceneBundle(stage);
  window.addEventListener("resize", () => fitRendererToContainer(bundle, stage));

  // Start camera immediately so the PIP gets a feed while the user tweaks settings.
  setStatus(ui, "requesting camera…");
  try {
    await startCamera(ui.pipVideo);
  } catch (err: any) {
    setStatus(ui, `camera error: ${err?.message ?? err}`);
    return;
  }

  setStatus(ui, "loading models…");
  const trackers = await initTrackers();
  setStatus(ui, "ready · configure match");

  // Show start modal.
  let app: AppState | null = null;
  setupStartModal(ui, DEFAULT_CONFIG, (cfg) => {
    app = startMatch(bundle, ui, trackers, cfg);
  });
}

function startMatch(bundle: SceneBundle, ui: any, trackers: Trackers, cfg: MatchConfig): AppState {
  const match = newMatch(cfg);
  const ball = makeBall();
  const userDriver = new UserAvatarDriver(bundle.userAvatar, bundle.userRacket, cfg.playerHand);
  const ai = new OpponentAI(bundle.oppAvatar, bundle.oppRacket);

  // Set initial ball position near the server's paddle, not alive yet.
  queueMicrotask(() => {
    resetBallForServe(ball, match.serving === 0 ? "user" : "opp", bundle.userRacket.root.position, bundle.oppRacket.root.position);
    bundle.ballMesh.position.copy(ball.pos);
  });

  updateHUD(ui, match);
  flashBanner(ui, match.serving === 0 ? "YOUR SERVE" : "OPPONENT SERVES");
  setStatus(ui, "match · in progress");

  const app: AppState = {
    cfg,
    match,
    ball,
    serveArmed: false,
    rallyInFlight: false,
    lastPoint: performance.now(),
    hitCooldown: 0,
  };

  // PIP canvas setup — skeleton overlay for the webcam feed.
  const pipCtx = ui.pipCanvas.getContext("2d")!;
  ui.pipCanvas.width = 320;
  ui.pipCanvas.height = 240;

  let lastTs = performance.now();
  let lastVideoTime = -1;

  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.033, (now - lastTs) / 1000);
    lastTs = now;

    // Run detection only on new video frames to avoid duplicate work.
    const video = ui.pipVideo as HTMLVideoElement;
    let frame: ReturnType<typeof detect> | null = null;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      frame = detect(trackers, video, now);
    }

    if (frame) {
      // Pass ball pos + approach status so the racket can auto-snap to the right face.
      const ballForSnap = ball.alive ? ball.pos : undefined;
      const ballApproaching = ball.alive && ball.vel.z > 0;
      userDriver.update(frame, dt, ballForSnap, ballApproaching);
      drawPip(pipCtx, ui.pipCanvas, video, frame, cfg.playerHand);
    }

    // Live power meter: reflect current swing speed even between hits.
    setPower(ui, userDriver.faceVelocity.length() / 10);

    // Hand-detection chip — turns green once the playing hand + arm are visible.
    if (ui.handChip) {
      const ok = userDriver.visible && userDriver.handVisible;
      ui.handChip.dataset.state = ok ? "ok" : (userDriver.visible ? "warn" : "off");
      ui.handChip.textContent = ok ? "HAND · LOCKED" : userDriver.visible ? "HAND · NO HAND" : "HAND · NO BODY";
    }

    // Action prompt — what should the user do right now?
    if (ui.actionPrompt) {
      let msg = "";
      const sinceLast = now - app.lastPoint;
      const remaining = Math.max(0, Math.ceil((1800 - sinceLast) / 1000));
      if (!userDriver.visible) msg = "Step into frame";
      else if (!userDriver.handVisible) msg = `Show your ${cfg.playerHand.toUpperCase()} hand`;
      else if (!ball.alive && match.serving === 0) {
        msg = remaining > 0 ? `YOUR SERVE IN ${remaining}` : "Serving…";
      } else if (!ball.alive && match.serving === 1) {
        msg = remaining > 0 ? `OPPONENT SERVE IN ${remaining}` : "Opponent serving…";
      } else if (ball.alive && ball.vel.z > 0) msg = "Incoming — swing!";
      else msg = "Rally";
      ui.actionPrompt.textContent = msg;
    }

    // Opponent.
    ai.update(ball, dt);

    // Serve gating — if nobody's hitting yet, pin ball to server's paddle face.
    if (!ball.alive && !app.serveArmed) {
      const serverPos = match.serving === 0 ? userDriver.facePos : ai.paddlePos;
      ball.pos.copy(serverPos).add(new THREE.Vector3(0, 0.18, 0));
      ball.vel.set(0, 0, 0);
    }

    // Auto-serve for whoever's serving after a fixed delay. No swing required — that prevents
    // the user's "swing to hit" motion from being misread as a serve trigger.
    const SERVE_DELAY_MS = 1800;
    const sinceLast = now - app.lastPoint;
    if (!ball.alive && sinceLast > SERVE_DELAY_MS) {
      ball.alive = true;
      app.serveArmed = true;
      app.rallyInFlight = true;
      clearTrail(bundle.ballTrail);
      if (match.serving === 0) {
        // User serve — flat-only profile (no lobs) so the ball stays on screen.
        ball.vel.copy(serveShot(ball.pos, OPP_END_Z));
        ball.lastToucher = "user";
        // Roll dice for whether the CPU will whiff this incoming serve.
        ai.rollDice(CPU_MISS_RATE);
      } else {
        ball.pos.copy(ai.paddlePos).add(new THREE.Vector3(0, 0.18, 0));
        // Opponent serves use the same flat profile, aimed at user's side.
        ball.vel.copy(serveShot(ball.pos, USER_END_Z));
        ball.lastToucher = "opp";
        ai.skipThisRally = false;
      }
      ball.bouncesSinceHit = 0;
    }

    // Step physics.
    const ctx = {
      userRacketPos: userDriver.facePos,
      userRacketNormal: userDriver.racketNormal,
      userRacketVel: userDriver.faceVelocity,
      oppRacketPos: ai.paddlePos,
      oppRacketNormal: ai.paddleNormal,
      oppRacketVel: ai.paddleVel,
      canUserHit: ball.alive && ball.pos.z > 0.2 && ball.vel.z > 0 && userDriver.visible,
      canOppHit: ball.alive && ai.canReturnNow(ball),
    };
    const events = stepBall(ball, dt, ctx);

    // === Magnet hit (forgiveness layer) ===
    // If the swept physics collision didn't fire but the user clearly tried to hit the ball
    // and the ball is in their hitting zone, treat it as a hit and aim a return.
    app.hitCooldown = Math.max(0, app.hitCooldown - dt);
    const sweptHitFired = events.some((e) => e && e.kind === "racket" && e.who === "user");
    if (sweptHitFired) app.hitCooldown = 0.3;

    if (
      !sweptHitFired &&
      ball.alive &&
      ball.lastToucher !== "user" &&
      app.hitCooldown <= 0 &&
      userDriver.visible &&
      ball.pos.z > 0 &&
      ball.vel.z > 0
    ) {
      const wrist = userDriver.wristPos;
      const distToWrist = ball.pos.distanceTo(wrist);
      const wristSpeed = userDriver.wristVelocity.length();
      const lateralGap = Math.abs(ball.pos.x - wrist.x);
      const sameLateralSide =
        Math.sign(ball.pos.x) * Math.sign(wrist.x) >= 0 || lateralGap < 0.25;

      // When the wrist is extrapolated (off-frame), be more lenient: bigger sphere, no flick required.
      const sphereRadius = userDriver.wristEstimated ? 0.68 : 0.52;
      const inHitSphere = distToWrist < sphereRadius;
      const flicked = userDriver.wristEstimated || wristSpeed > 0.4;

      if (sameLateralSide && inHitSphere && flicked) {
        // Magnet return: dedicated profile that always lands on opponent's side, cross-court biased.
        const ballSideSign = Math.sign(ball.pos.x) || (Math.random() > 0.5 ? 1 : -1);
        const aimedVel = magnetReturnShot(ball.pos, ballSideSign);
        // Tiny swing flavor — clamped so it can't push the ball off the table.
        const swingBoost = userDriver.wristVelocity.clone().multiplyScalar(0.06);
        if (swingBoost.length() > 0.4) swingBoost.setLength(0.4);
        ball.vel.copy(aimedVel).add(swingBoost);

        ball.lastToucher = "user";
        ball.bouncesSinceHit = 0;
        app.hitCooldown = 0.3;
        match.rallyCount++;
        updateHUD(ui, match);
        setPower(ui, Math.max(wristSpeed, 1.5) / 8);
        triggerSpark(bundle.hitSpark, ball.pos);
        // Roll for whether the CPU will whiff this incoming return.
        ai.rollDice(CPU_MISS_RATE);
      }
    }

    bundle.ballMesh.position.copy(ball.pos);
    if (ball.alive) pushTrail(bundle.ballTrail, ball.pos);

    for (const ev of events) {
      if (!ev) continue;
      if (ev.kind === "racket") {
        triggerSpark(bundle.hitSpark, ev.point);
        match.rallyCount++;
        updateHUD(ui, match);
        // Power meter reflects last swing strength.
        const who = ev.who;
        if (who === "user") {
          setPower(ui, userDriver.faceVelocity.length() / 10);
          // Roll for whether the CPU will whiff this incoming return.
          ai.rollDice(CPU_MISS_RATE);
        }
        if (who === "opp") {
          // Override the passive reflection with a deterministic aimed return so the
          // CPU is reliable and the ball arcs slowly enough to react to.
          ball.vel.copy(plannedReturn(ball.pos));
          ball.bouncesSinceHit = 0;
          ball.lastToucher = "opp";
          ai.skipThisRally = false;
        }
      } else if (ev.kind === "table") {
        // Valid or fault is decided by serve rules + rally context.
        handleTable(app, ev.side);
      } else if (ev.kind === "net") {
        // no-op — physical response already applied.
      } else if (ev.kind === "floor" || ev.kind === "out") {
        concludePoint(app, ball.lastToucher === "user" ? 1 : 0);
      }
    }

    // Update spark particles.
    updateSpark(bundle.hitSpark, dt);

    // Render.
    bundle.renderer.render(bundle.scene, bundle.camera);

    // Check for match completion.
    if (match.gameOver) {
      const userWon = match.winner === 0;
      showEnd(ui, userWon, [...match.score] as [number, number], () => {
        // Restart same config.
        const m = newMatch(cfg);
        Object.assign(match, m);
        match.score = m.score;
        updateHUD(ui, match);
        resetRally(app, bundle, ai);
      });
    }

    requestAnimationFrame(tick);
  };

  tick();
  return app;
}

function handleTable(app: AppState, side: "user" | "opp"): void {
  const { ball } = app;
  const lastHit = ball.lastToucher;
  if (lastHit === "none") return;

  const hitterSide: "user" | "opp" = lastHit === "user" ? "user" : "opp";
  const receiverSide: "user" | "opp" = hitterSide === "user" ? "opp" : "user";

  if (app.serveArmed) {
    // Serve in flight. Accept first bounce on either side (relaxed from strict ITTF).
    // After the ball reaches the receiver's side, switch to rally mode.
    if (ball.bouncesSinceHit === 1) {
      if (side === receiverSide) {
        // Direct serve to opponent side — legal, switch to rally.
        app.serveArmed = false;
        return;
      }
      // Bounce on server's own side — legal serve setup, wait for next bounce.
      return;
    }
    if (ball.bouncesSinceHit === 2) {
      if (side === receiverSide) {
        // Two-bounce serve completed legally. Now in rally.
        app.serveArmed = false;
        return;
      }
      // Two bounces on server's side without crossing — fault.
      concludePoint(app, hitterSide === "user" ? 1 : 0);
      return;
    }
    if (ball.bouncesSinceHit >= 3) {
      // Receiver couldn't return the serve.
      concludePoint(app, hitterSide === "user" ? 0 : 1);
      return;
    }
    return;
  }

  // RALLY mode (post-serve).
  if (ball.bouncesSinceHit === 1) {
    if (side === hitterSide) {
      // Bounced on own side after rally hit — fault.
      concludePoint(app, hitterSide === "user" ? 1 : 0);
      return;
    }
    // Legal bounce on receiver's side — wait for receiver's hit.
    return;
  }
  if (ball.bouncesSinceHit >= 2) {
    // Receiver didn't return — point to hitter.
    concludePoint(app, hitterSide === "user" ? 0 : 1);
    return;
  }
}

function concludePoint(app: AppState, winnerIdx: 0 | 1): void {
  if (!app.rallyInFlight) return;
  // Score attribution was inverted from how it actually played out — flip here so
  // the right side gets credit + the banner matches what the user observed.
  winnerIdx = (winnerIdx === 0 ? 1 : 0) as 0 | 1;
  app.rallyInFlight = false;
  app.serveArmed = false;
  app.ball.alive = false;
  app.lastPoint = performance.now();
  pointWon(app.match, app.cfg, winnerIdx);
  const ui = bindUI();
  updateHUD(ui, app.match);
  flashBanner(ui, winnerIdx === 0 ? "POINT · YOU" : "POINT · OPP");
}

function resetRally(app: AppState, bundle: SceneBundle, ai: OpponentAI): void {
  app.rallyInFlight = false;
  app.serveArmed = false;
  app.ball.alive = false;
  app.ball.bouncesSinceHit = 0;
  app.ball.lastToucher = "none";
  app.lastPoint = performance.now();
  resetBallForServe(app.ball, app.match.serving === 0 ? "user" : "opp", bundle.userRacket.root.position, ai.paddlePos);
}

function drawPip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  frame: ReturnType<typeof detect>,
  playingHand: "Left" | "Right",
): void {
  const w = canvas.width, h = canvas.height;
  ctx.save();
  // Mirror for a selfie feel.
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
  // Skeleton overlay on the mirrored image — since our landmarks are in unmirrored video coords,
  // we need to mirror the X when drawing.
  const mx = (x: number) => (1 - x) * w;
  const my = (y: number) => y * h;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(127, 220, 255, 0.9)";
  const pose = frame.pose;
  if (pose) {
    const segs: [number, number][] = [
      [11, 13], [13, 15],
      [12, 14], [14, 16],
      [11, 12],
    ];
    for (const [a, b] of segs) {
      const pa = pose[a], pb = pose[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(mx(pa.x), my(pa.y));
      ctx.lineTo(mx(pb.x), my(pb.y));
      ctx.stroke();
    }
  }
  for (const hand of frame.hands) {
    const isPlaying = hand.handedness === playingHand;
    ctx.strokeStyle = isPlaying ? "rgba(253, 224, 71, 0.9)" : "rgba(244, 114, 182, 0.55)";
    ctx.fillStyle = ctx.strokeStyle;
    const connections: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];
    for (const [a, b] of connections) {
      const pa = hand.image[a], pb = hand.image[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(mx(pa.x), my(pa.y));
      ctx.lineTo(mx(pb.x), my(pb.y));
      ctx.stroke();
    }
  }
}

main().catch((err) => {
  console.error(err);
  const s = document.getElementById("status");
  if (s) s.textContent = `error: ${err?.message ?? err}`;
});
