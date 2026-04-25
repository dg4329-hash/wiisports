import * as THREE from "three";
import {
  detect,
  initTrackers,
  pairHandsToPoseWrists,
  poseToScene,
  handDeltaToScene,
  startCamera,
  LEFT_HIP,
  RIGHT_HIP,
  LEFT_WRIST,
  RIGHT_WRIST,
  type Frame,
  type HandFrame,
  type V3,
} from "./tracking";
import {
  createSceneBundle,
  fitRendererToContainer,
  pushTrail,
  clearTrail,
  triggerSpark,
  updateSpark,
  updateHand3D,
  hideHand3D,
  USER_Z,
  RIM_HEIGHT,
  RIM_Z,
  BALL_RADIUS,
  type SceneBundle,
} from "./scene";
import { aimedLaunch, makeBall, stepBall } from "./physics";

// ---- Config ----
const MIRROR_X = true;
const REACH_SCALE = 1.3;
const HIP_ANCHOR = { x: 0, y: 0.95, z: USER_Z };
const BALL_RESPAWN_MS = 1100;
const SHOT_FLIGHT_RANGE = [0.85, 1.25] as [number, number];

// Shot trigger: right-hand finger curl combined with a tiny forward wrist motion.
// "Openness" = average of (tip-to-wrist) / (PIP-to-wrist) for index/middle/ring/pinky.
// Fully extended = ~1.15+, closed fist = ~0.85.
const SHOT_OPENNESS_OPEN = 1.05;          // must reach this BEFORE the curl to count as "loaded"
const SHOT_CURL_RATE_TRIGGER = -1.6;       // rate at which openness must drop (per second)
const SHOT_FORWARD_VEL_MIN = 0.25;         // m/s of forward (toward hoop) wrist motion
const SHOT_COOLDOWN_MS = 800;              // anti-double-trigger window

type AppState = {
  score: number;
  attempts: number;
  makes: number;
  streak: number;
  bestStreak: number;
};

async function main() {
  const stage = document.getElementById("stage") as HTMLDivElement;
  const video = document.getElementById("cam") as HTMLVideoElement;
  const pipCanvas = document.getElementById("pip-canvas") as HTMLCanvasElement;
  const setStatus = (s: string) => {
    const el = document.getElementById("status");
    if (el) el.textContent = s;
  };

  // Wire back-to-lobby chip to the configured URL (default `/`). For local dev, override
  // via `.env.local` with VITE_LOBBY_URL=http://localhost:5180/ to point at the lobby.
  const lobbyUrl = ((import.meta as any).env?.VITE_LOBBY_URL as string | undefined) ?? "/";
  const backChip = document.getElementById("back-chip") as HTMLAnchorElement | null;
  if (backChip) backChip.href = lobbyUrl;

  setStatus("requesting camera…");
  await startCamera(video);

  setStatus("loading models…");
  const trackers = await initTrackers();
  setStatus("tracking · raise hands to begin");

  const bundle = createSceneBundle(stage);
  window.addEventListener("resize", () => fitRendererToContainer(bundle, stage));

  const ball = makeBall();
  // Start ball at user's hands height in front of the body — like the arcade rack just delivered one.
  resetBall(ball, USER_Z);
  bundle.ballMesh.position.copy(ball.pos);

  const app: AppState = { score: 0, attempts: 0, makes: 0, streak: 0, bestStreak: 0 };
  updateHUD(app);

  // Right-hand shot state — openness, openness derivative, wrist velocity, cooldown.
  const rightShotState: ShotState = {
    pos: null,
    vel: new THREE.Vector3(),
    openness: 1.0,
    opennessRate: 0,
    wasLoaded: false,
    lastShotMs: 0,
  };
  let respawnAt = 0;
  let lastVideoTime = -1;
  let lastTs = performance.now();

  pipCanvas.width = 320;
  pipCanvas.height = 240;
  const pipCtx = pipCanvas.getContext("2d")!;

  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.033, (now - lastTs) / 1000);
    lastTs = now;

    let frame: Frame | null = null;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      frame = detect(trackers, video, now);
    }

    let hipCentre: V3 | null = null;
    let leftWristScene: THREE.Vector3 | null = null;
    let rightWristScene: THREE.Vector3 | null = null;

    if (frame?.poseWorld) {
      const hipL = frame.poseWorld[LEFT_HIP];
      const hipR = frame.poseWorld[RIGHT_HIP];
      if (hipL && hipR) {
        hipCentre = {
          x: (hipL.x + hipR.x) / 2,
          y: (hipL.y + hipR.y) / 2,
          z: (hipL.z + hipR.z) / 2,
        };
        const lwRaw = frame.poseWorld[LEFT_WRIST];
        const rwRaw = frame.poseWorld[RIGHT_WRIST];
        if (lwRaw) {
          const p = poseToScene(lwRaw, hipCentre, HIP_ANCHOR, MIRROR_X, REACH_SCALE);
          leftWristScene = new THREE.Vector3(p.x, p.y, p.z);
        }
        if (rwRaw) {
          const p = poseToScene(rwRaw, hipCentre, HIP_ANCHOR, MIRROR_X, REACH_SCALE);
          rightWristScene = new THREE.Vector3(p.x, p.y, p.z);
        }
      }
    }

    // Pair detected hands to person-side wrists (image-space proximity).
    let leftHand: HandFrame | null = null;
    let rightHand: HandFrame | null = null;
    if (frame) {
      const pair = pairHandsToPoseWrists(frame);
      // Display-side flip — pose's "Left" wrist is the user's left, which appears on screen-right.
      // We render a "left hand" cyan rig anchored to whatever hand the user uses on their LEFT side.
      leftHand = pair.left;
      rightHand = pair.right;
    }

    // Update Hand3D rigs (or hide them if not tracked).
    if (leftWristScene && leftHand) {
      const positions = handLandmarksToScene(leftHand, leftWristScene);
      updateHand3D(bundle.leftHand, positions);
    } else {
      hideHand3D(bundle.leftHand);
    }
    if (rightWristScene && rightHand) {
      const positions = handLandmarksToScene(rightHand, rightWristScene);
      updateHand3D(bundle.rightHand, positions);
    } else {
      hideHand3D(bundle.rightHand);
    }

    // Track right-hand state — openness curl + wrist velocity (only for shot detection).
    if (rightWristScene && rightHand) {
      const opn = computeOpenness(rightHand.worldLandmarks);
      updateShotState(rightShotState, rightWristScene, opn, dt);
    } else {
      // Reset when right hand drops out of frame so we don't fire stale curl rates.
      rightShotState.pos = null;
      rightShotState.opennessRate = 0;
      rightShotState.wasLoaded = false;
    }

    // While ball is held: position the ball so the RIGHT hand is the shooting hand —
    // under the ball and behind it (between the user's body and the ball). The left hand
    // is the guide hand, sitting against the side of the ball.
    if (!ball.alive) {
      const pinned = computeShotHoldPosition(leftWristScene, rightWristScene);
      if (pinned) {
        ball.pos.copy(pinned);
        bundle.ballMesh.position.copy(pinned);
      }
    }

    // Shot trigger: rapid right-hand curl + tiny forward wrist motion.
    if (!ball.alive && now > respawnAt) {
      const trigger = detectShotCurl(rightShotState, now);
      if (trigger) {
        launchBall(ball, trigger.swingVel, trigger.curlSpeed, trigger.aimX);
        app.attempts++;
        ball.scoredThisFlight = false;
        clearTrail(bundle.ballTrail);
        rightShotState.lastShotMs = now;
        rightShotState.wasLoaded = false;
        rightShotState.opennessRate = 0;
      }
    }

    // Step physics + handle events.
    const events = stepBall(ball, dt);
    for (const ev of events) {
      if (ev.kind === "score") {
        app.score += 2;
        app.makes++;
        app.streak++;
        if (app.streak > app.bestStreak) app.bestStreak = app.streak;
        triggerSpark(bundle.swishSpark, new THREE.Vector3(0, RIM_HEIGHT - 0.1, RIM_Z));
        flashBanner(`SWISH! +2  ·  STREAK ${app.streak}`);
        updateHUD(app);
      } else if (ev.kind === "rimHit") {
        flashBanner("RIM!", 600);
      } else if (ev.kind === "boardHit") {
        flashBanner("BOARD", 500);
      } else if (ev.kind === "floor") {
        // First floor hit ends the shot — schedule respawn.
        if (ball.alive) {
          ball.alive = false;
          if (!ball.scoredThisFlight) {
            app.streak = 0;
            updateHUD(app);
          }
          respawnAt = performance.now() + BALL_RESPAWN_MS;
          // Animate ball "rolling back" — see updateRollback below.
          startBallRollback(ball, bundle, respawnAt);
        }
      } else if (ev.kind === "outOfPlay") {
        ball.alive = false;
        respawnAt = performance.now() + BALL_RESPAWN_MS;
        startBallRollback(ball, bundle, respawnAt);
      }
    }

    // Animate ball rolling back to user when not in flight.
    if (!ball.alive && respawnAt > 0 && now > respawnAt) {
      resetBall(ball, USER_Z);
      bundle.ballMesh.position.copy(ball.pos);
      respawnAt = 0;
    }
    advanceRollback(ball, bundle, dt, respawnAt);

    // Spin (visual only).
    if (ball.alive) {
      bundle.ballMesh.rotateOnAxis(ball.spinAxis, ball.spinRate * dt);
    }
    bundle.ballMesh.position.copy(ball.pos);

    if (ball.alive) pushTrail(bundle.ballTrail, ball.pos);

    updateSpark(bundle.swishSpark, dt);
    bundle.renderer.render(bundle.scene, bundle.camera);

    drawPip(pipCtx, pipCanvas, frame);

    requestAnimationFrame(tick);
  };

  tick();
}

// --------------------------------------------------------------------------------------
// Helpers

// Right-hand shot state — tracks the curl gesture + wrist velocity used at release.
type ShotState = {
  pos: THREE.Vector3 | null;
  vel: THREE.Vector3;            // EMA-smoothed wrist velocity in scene space
  openness: number;              // current finger openness (avg of 4 finger ratios)
  opennessRate: number;          // d(openness)/dt, smoothed
  wasLoaded: boolean;            // true once openness rose above the LOAD threshold this rep
  lastShotMs: number;
};

// Average finger extension ratio across index/middle/ring/pinky. Same idea as the fruit
// ninja gesture detector — robust to hand orientation since it uses tip-vs-PIP distance ratio.
function computeOpenness(handWorldLandmarks: { x: number; y: number; z: number }[]): number {
  if (!handWorldLandmarks || handWorldLandmarks.length < 21) return 1.0;
  const w = handWorldLandmarks[0];
  const d = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
  const idx = d(handWorldLandmarks[8], w) / Math.max(1e-6, d(handWorldLandmarks[6], w));
  const mid = d(handWorldLandmarks[12], w) / Math.max(1e-6, d(handWorldLandmarks[10], w));
  const rng = d(handWorldLandmarks[16], w) / Math.max(1e-6, d(handWorldLandmarks[14], w));
  const pnk = d(handWorldLandmarks[20], w) / Math.max(1e-6, d(handWorldLandmarks[18], w));
  return (idx + mid + rng + pnk) / 4;
}

function updateShotState(s: ShotState, p: THREE.Vector3, openness: number, dt: number): void {
  // Wrist velocity (light EMA).
  if (s.pos) {
    const inst = p.clone().sub(s.pos).divideScalar(Math.max(dt, 1e-3));
    s.vel.lerp(inst, 0.55);
  }
  s.pos = p.clone();

  // Openness rate (smoothed).
  const rawRate = (openness - s.openness) / Math.max(dt, 1e-3);
  s.opennessRate = s.opennessRate * 0.6 + rawRate * 0.4;
  s.openness = openness;

  // Latch "loaded" when fingers rise above the open threshold — required to count a curl.
  if (openness > SHOT_OPENNESS_OPEN) s.wasLoaded = true;
}

type ShotTrigger = {
  swingVel: THREE.Vector3;
  curlSpeed: number;             // |opennessRate| at trigger — used for power
  aimX: number;                  // wrist X at release relative to body (for lateral aim)
};

function detectShotCurl(s: ShotState, now: number): ShotTrigger | null {
  if (!s.pos || !s.wasLoaded) return null;
  if (now - s.lastShotMs < SHOT_COOLDOWN_MS) return null;

  // Fingers rapidly curling (openness dropping fast)?
  if (s.opennessRate >= SHOT_CURL_RATE_TRIGGER) return null;
  // Tiny forward wrist motion — confirmation that this is a shot, not a random curl.
  if (s.vel.z >= -SHOT_FORWARD_VEL_MIN) return null;

  return {
    swingVel: s.vel.clone(),
    curlSpeed: Math.abs(s.opennessRate),
    aimX: s.pos.x,
  };
}

function launchBall(
  ball: ReturnType<typeof makeBall>,
  swing: THREE.Vector3,
  curlSpeed: number,
  aimX: number,
): void {
  // Power from curl speed: 1.6/s (just above trigger) → slow shot, 5+ /s → quick low arc.
  const power = THREE.MathUtils.clamp((curlSpeed - 1.5) / 4.0, 0.0, 1.0);
  const flight = THREE.MathUtils.lerp(SHOT_FLIGHT_RANGE[1], SHOT_FLIGHT_RANGE[0], power);

  // Lateral aim from wrist X position (player can lean / shift to aim left or right).
  // aimX is in scene units relative to body center (0 = directly in front).
  const targetX = THREE.MathUtils.clamp(aimX * 0.6, -0.35, 0.35);
  const target = new THREE.Vector3(targetX, RIM_HEIGHT + 0.02, RIM_Z);
  const aimed = aimedLaunch(ball.pos, target, flight);

  // Modest swing influence — small bias from wrist forward velocity so harder pushes go further.
  aimed.x += swing.x * 0.12;
  aimed.z += Math.max(0, -swing.z) * 0.10 * -1; // forward velocity → slight extra forward thrust

  // Small random spread so back-to-back shots vary.
  aimed.x += (Math.random() - 0.5) * 0.18;
  aimed.y += (Math.random() - 0.5) * 0.15;

  ball.vel.copy(aimed);
  ball.alive = true;
  ball.scoredThisFlight = false;
}

function resetBall(ball: ReturnType<typeof makeBall>, userZ: number): void {
  ball.pos.set(0, 1.05, userZ - 0.05);
  ball.vel.set(0, 0, 0);
  ball.alive = false;
  ball.scoredThisFlight = false;
  ball.spinRate = 0;
}

function startBallRollback(ball: ReturnType<typeof makeBall>, bundle: SceneBundle, respawnAt: number): void {
  // Visual only — animate a small "ball rolls along the floor back to user" effect.
  // We don't actually use physics during rollback; just lerp to user position.
  void ball;
  void bundle;
  void respawnAt;
}

function advanceRollback(
  ball: ReturnType<typeof makeBall>,
  bundle: SceneBundle,
  _dt: number,
  respawnAt: number,
): void {
  if (ball.alive || respawnAt === 0) return;
  // Lerp ball along the floor toward the user's spot during the respawn window.
  const now = performance.now();
  const remaining = Math.max(0, respawnAt - now);
  const total = BALL_RESPAWN_MS;
  const t = 1 - remaining / total;
  // Curve: slow near 0, fast near 0.7, settle at end.
  const eased = t < 0.7 ? Math.pow(t / 0.7, 1.4) * 0.85 : 0.85 + (t - 0.7) / 0.3 * 0.15;
  // Land target: in front of user, at floor.
  const targetX = 0;
  const targetY = BALL_RADIUS;
  const targetZ = USER_Z - 0.05;
  // Source: wherever the ball ended up (its current pos).
  if (t < 0.05) {
    // First few % — set source explicitly so we can lerp from it.
    (ball as any).rollSrc = ball.pos.clone();
  }
  const src: THREE.Vector3 = (ball as any).rollSrc ?? ball.pos.clone();
  ball.pos.x = THREE.MathUtils.lerp(src.x, targetX, eased);
  ball.pos.y = THREE.MathUtils.lerp(src.y, targetY, eased);
  ball.pos.z = THREE.MathUtils.lerp(src.z, targetZ, eased);
  bundle.ballMesh.position.copy(ball.pos);
}

function handLandmarksToScene(hand: HandFrame, sceneWristPos: THREE.Vector3): THREE.Vector3[] {
  // Use hand-local world landmarks (wrist-origin meters, MP convention) and lift each
  // into scene space by anchoring at the pose-derived wrist position.
  const positions: THREE.Vector3[] = [];
  const lw = hand.worldLandmarks;
  const wrist = lw[0] ?? { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 21; i++) {
    const p = lw[i] ?? wrist;
    const delta = handDeltaToScene(
      { x: p.x - wrist.x, y: p.y - wrist.y, z: p.z - wrist.z },
      MIRROR_X,
    );
    positions.push(new THREE.Vector3(
      sceneWristPos.x + delta.x,
      sceneWristPos.y + delta.y,
      sceneWristPos.z + delta.z,
    ));
  }
  return positions;
}

function computeHandsCentre(
  left: THREE.Vector3 | null,
  right: THREE.Vector3 | null,
): THREE.Vector3 | null {
  if (left && right) return left.clone().add(right).multiplyScalar(0.5);
  return left ?? right;
}

// Real shooting form: right hand is *under* the ball (palm up, fingers spread) and
// *behind* the ball (between body and ball). Left hand is just a guide on the side.
// So the ball sits above + forward of the right wrist. If only one hand is visible we
// still anchor to the right wrist (or fall back to the left if the right is out of frame).
function computeShotHoldPosition(
  left: THREE.Vector3 | null,
  right: THREE.Vector3 | null,
): THREE.Vector3 | null {
  const shootHand = right ?? left;
  if (!shootHand) return null;
  // Above the palm and forward (toward hoop = -Z).
  const ball = shootHand.clone();
  ball.y += 0.13;
  ball.z -= 0.07;
  // If both hands visible, nudge slightly toward the guide hand for the side support.
  if (right && left) {
    ball.x += (left.x - right.x) * 0.18;
  }
  return ball;
}

function updateHUD(state: AppState): void {
  const score = document.getElementById("score-value");
  const makes = document.getElementById("makes-value");
  const streak = document.getElementById("streak-value");
  const best = document.getElementById("best-value");
  const acc = document.getElementById("acc-value");
  if (score) score.textContent = state.score.toString().padStart(2, "0");
  if (makes) makes.textContent = `${state.makes} / ${state.attempts}`;
  if (streak) streak.textContent = String(state.streak);
  if (best) best.textContent = String(state.bestStreak);
  if (acc) {
    const pct = state.attempts > 0 ? Math.round((state.makes / state.attempts) * 100) : 0;
    acc.textContent = `${pct}%`;
  }
}

let bannerTimeout = 0;
function flashBanner(text: string, ms = 900): void {
  const el = document.getElementById("banner");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  if (bannerTimeout) window.clearTimeout(bannerTimeout);
  bannerTimeout = window.setTimeout(() => el.classList.remove("show"), ms);
}

function drawPip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: Frame | null,
): void {
  const w = canvas.width, h = canvas.height;
  // Pure black — only the skeleton shows.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (!frame) return;
  const mx = (x: number) => (1 - x) * w;
  const my = (y: number) => y * h;

  // Pose skeleton — simple stick figure for upper body.
  const pose = frame.pose;
  if (pose) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(127, 220, 255, 0.85)";
    const segs: [number, number][] = [
      [11, 13], [13, 15],
      [12, 14], [14, 16],
      [11, 12],
      [11, 23], [12, 24], [23, 24],
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
  // Hands.
  for (const hand of frame.hands) {
    const color = hand.handedness === "Left" ? "rgba(34,211,238,0.9)" : "rgba(255,138,60,0.9)";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    const connections: [number, number][] = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];
    for (const [a, b] of connections) {
      const pa = hand.imageLandmarks[a], pb = hand.imageLandmarks[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(mx(pa.x), my(pa.y));
      ctx.lineTo(mx(pb.x), my(pb.y));
      ctx.stroke();
    }
    // Fingertip dots.
    for (const tip of [4, 8, 12, 16, 20]) {
      const p = hand.imageLandmarks[tip];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(mx(p.x), my(p.y), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

main().catch((err) => {
  console.error(err);
  const s = document.getElementById("status");
  if (s) s.textContent = `error: ${err?.message ?? err}`;
});
