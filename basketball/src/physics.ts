import * as THREE from "three";
import {
  BALL_RADIUS,
  BACKBOARD_Z,
  BOARD_HEIGHT,
  BOARD_THICKNESS,
  BOARD_WIDTH,
  RIM_HEIGHT,
  RIM_RADIUS,
  RIM_Z,
} from "./scene";

export type BallState = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  alive: boolean;            // is the ball in flight (after release)?
  scoredThisFlight: boolean; // latch so we don't double-count one shot
  spinAxis: THREE.Vector3;   // for visual rotation only
  spinRate: number;          // rad/s
};

export type BallEvent =
  | { kind: "score" }
  | { kind: "rimHit" }
  | { kind: "boardHit" }
  | { kind: "floor" }
  | { kind: "outOfPlay" };

const GRAVITY = -9.81;
const AIR_DRAG = 0.04;          // gentle linear drag
const FLOOR_RESTITUTION = 0.65;
const FLOOR_FRICTION = 0.35;
const BOARD_RESTITUTION = 0.6;
const RIM_RESTITUTION = 0.55;

export function makeBall(): BallState {
  return {
    pos: new THREE.Vector3(0, 1.0, 0),
    vel: new THREE.Vector3(),
    alive: false,
    scoredThisFlight: false,
    spinAxis: new THREE.Vector3(1, 0, 0),
    spinRate: 0,
  };
}

export function stepBall(ball: BallState, dt: number): BallEvent[] {
  const events: BallEvent[] = [];
  if (!ball.alive) return events;

  // Forces.
  ball.vel.y += GRAVITY * dt;
  ball.vel.multiplyScalar(Math.max(0, 1 - AIR_DRAG * dt));

  // Tentative new position.
  const next = ball.pos.clone().addScaledVector(ball.vel, dt);

  // ---- Backboard (axis-aligned rectangle in XY plane at Z = BACKBOARD_Z) ----
  // Treat the front face only (ball must be coming from +Z side).
  const boardFrontZ = BACKBOARD_Z + BOARD_THICKNESS / 2 + BALL_RADIUS;
  if (
    ball.pos.z >= boardFrontZ &&
    next.z < boardFrontZ &&
    next.y > RIM_HEIGHT + 0.18 - BOARD_HEIGHT / 2 &&
    next.y < RIM_HEIGHT + 0.18 + BOARD_HEIGHT / 2 &&
    next.x > -BOARD_WIDTH / 2 &&
    next.x < BOARD_WIDTH / 2
  ) {
    next.z = boardFrontZ + 0.001;
    ball.vel.z = -ball.vel.z * BOARD_RESTITUTION;
    ball.vel.x *= 0.85;
    ball.vel.y *= 0.85;
    events.push({ kind: "boardHit" });
  }

  // ---- Rim collision (treated as a 1D circle in the horizontal plane at y=RIM_HEIGHT) ----
  // We test if the ball's path crosses the rim's "tube" (a thin torus).
  // Approximate: when the ball's y is near RIM_HEIGHT and its xz-distance from rim centre
  // is near RIM_RADIUS (within a small epsilon), reflect off the closest tangent.
  if (Math.abs(next.y - RIM_HEIGHT) < BALL_RADIUS + 0.04) {
    const dx = next.x - 0;
    const dz = next.z - RIM_Z;
    const horiz = Math.hypot(dx, dz);
    const radialError = Math.abs(horiz - RIM_RADIUS);
    if (radialError < BALL_RADIUS + 0.018) {
      // Compute outward radial direction and reflect the in-plane velocity component.
      const radialDir = new THREE.Vector3(dx, 0, dz).normalize();
      // Sign: ball is outside the rim radius → push outward; inside → push inward.
      const sign = horiz > RIM_RADIUS ? 1 : -1;
      const push = (BALL_RADIUS + 0.018 - radialError) * sign;
      next.x += radialDir.x * push;
      next.z += radialDir.z * push;
      const dot = ball.vel.x * radialDir.x + ball.vel.z * radialDir.z;
      ball.vel.x -= (1 + RIM_RESTITUTION) * dot * radialDir.x;
      ball.vel.z -= (1 + RIM_RESTITUTION) * dot * radialDir.z;
      ball.vel.x *= 0.92;
      ball.vel.z *= 0.92;
      ball.vel.y *= 0.95;
      events.push({ kind: "rimHit" });
    }
  }

  // ---- Made shot detection ----
  // Ball must enter the rim plane from above with downward velocity AND be inside the rim radius.
  if (!ball.scoredThisFlight) {
    const aboveBefore = ball.pos.y - BALL_RADIUS > RIM_HEIGHT;
    const belowAfter = next.y - BALL_RADIUS <= RIM_HEIGHT;
    if (aboveBefore && belowAfter && ball.vel.y < 0) {
      const dx = next.x - 0;
      const dz = next.z - RIM_Z;
      if (Math.hypot(dx, dz) < RIM_RADIUS - 0.02) {
        ball.scoredThisFlight = true;
        events.push({ kind: "score" });
      }
    }
  }

  // Commit position.
  ball.pos.copy(next);

  // ---- Floor bounce ----
  if (ball.pos.y - BALL_RADIUS <= 0 && ball.vel.y < 0) {
    ball.pos.y = BALL_RADIUS;
    ball.vel.y = -ball.vel.y * FLOOR_RESTITUTION;
    ball.vel.x *= 1 - FLOOR_FRICTION * 0.4;
    ball.vel.z *= 1 - FLOOR_FRICTION * 0.4;
    events.push({ kind: "floor" });
  }

  // ---- Out of play ----
  if (ball.pos.length() > 18) {
    events.push({ kind: "outOfPlay" });
  }

  // Spin (cosmetic only — based on horizontal velocity).
  const horizSpeed = Math.hypot(ball.vel.x, ball.vel.z);
  ball.spinRate = horizSpeed / BALL_RADIUS;
  if (horizSpeed > 0.05) {
    ball.spinAxis.set(-ball.vel.z, 0, ball.vel.x).normalize();
  }

  return events;
}

// Solve for launch velocity that lands at `target` after time `t`, under our gravity.
export function aimedLaunch(from: THREE.Vector3, to: THREE.Vector3, t: number): THREE.Vector3 {
  return new THREE.Vector3(
    (to.x - from.x) / t,
    (to.y - from.y) / t - 0.5 * GRAVITY * t,
    (to.z - from.z) / t,
  );
}
