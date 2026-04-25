import * as THREE from "three";
import { TABLE, USER_END_Z, OPP_END_Z } from "./types";

export type BallState = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  alive: boolean;
  bouncesSinceHit: number;
  lastToucher: "user" | "opp" | "none";
};

export type CollisionResult =
  | { kind: "table"; side: "user" | "opp"; point: THREE.Vector3 }
  | { kind: "net"; point: THREE.Vector3 }
  | { kind: "floor"; point: THREE.Vector3 }
  | { kind: "out"; point: THREE.Vector3 }
  | { kind: "racket"; who: "user" | "opp"; point: THREE.Vector3 }
  | null;

// Slowed gravity gives a more "moon-ball" arc — more reaction time for the user.
const GRAVITY_Y = -7.0;
export const GRAVITY = new THREE.Vector3(0, GRAVITY_Y, 0);
const AIR_DRAG = 0.05;            // per-second linear drag scale
const TABLE_RESTITUTION = 0.88;
const TABLE_FRICTION = 0.2;       // tangential velocity loss on bounce
const RACKET_RESTITUTION = 0.85;
const RACKET_RADIUS = 0.2;        // generous — visual paddle is 0.13, hit zone larger for forgiveness
const BALL_RADIUS = 0.02;

// Helper exposed for the AI: solve for the velocity needed to launch a projectile
// from `from` so it lands at `to` after `t` seconds, under our gravity.
export function aimedLaunch(from: THREE.Vector3, to: THREE.Vector3, t: number): THREE.Vector3 {
  return new THREE.Vector3(
    (to.x - from.x) / t,
    (to.y - from.y) / t - 0.5 * GRAVITY_Y * t,  // -0.5*g*t  (g is negative here, so -0.5*(-7)*t = +3.5t)
    (to.z - from.z) / t,
  );
}

export function makeBall(): BallState {
  return {
    pos: new THREE.Vector3(0, 1.3, USER_END_Z - 0.3),
    vel: new THREE.Vector3(),
    alive: false,
    bouncesSinceHit: 0,
    lastToucher: "none",
  };
}

export function resetBallForServe(
  ball: BallState,
  server: "user" | "opp",
  userRacketPos: THREE.Vector3,
  oppRacketPos: THREE.Vector3,
): void {
  const src = server === "user" ? userRacketPos : oppRacketPos;
  ball.pos.copy(src).add(new THREE.Vector3(0, 0.25, 0));
  ball.vel.set(0, 0, 0);
  ball.alive = false;
  ball.bouncesSinceHit = 0;
  ball.lastToucher = "none";
}

type StepCtx = {
  userRacketPos: THREE.Vector3;
  userRacketNormal: THREE.Vector3;
  userRacketVel: THREE.Vector3;
  oppRacketPos: THREE.Vector3;
  oppRacketNormal: THREE.Vector3;
  oppRacketVel: THREE.Vector3;
  canUserHit: boolean;
  canOppHit: boolean;
};

export function stepBall(ball: BallState, dt: number, ctx: StepCtx): CollisionResult[] {
  const events: CollisionResult[] = [];
  if (!ball.alive) return events;

  // Apply forces.
  ball.vel.addScaledVector(GRAVITY, dt);
  ball.vel.multiplyScalar(Math.max(0, 1 - AIR_DRAG * dt));

  const next = ball.pos.clone().addScaledVector(ball.vel, dt);

  // Racket collisions — swept test along segment pos→next.
  let collided = false;
  if (ctx.canUserHit) {
    const ev = racketCollide(ball, next, ctx.userRacketPos, ctx.userRacketNormal, ctx.userRacketVel);
    if (ev) {
      ball.lastToucher = "user";
      ball.bouncesSinceHit = 0;
      events.push({ kind: "racket", who: "user", point: ev.clone() });
      collided = true;
    }
  }
  if (!collided && ctx.canOppHit) {
    const ev = racketCollide(ball, next, ctx.oppRacketPos, ctx.oppRacketNormal, ctx.oppRacketVel);
    if (ev) {
      ball.lastToucher = "opp";
      ball.bouncesSinceHit = 0;
      events.push({ kind: "racket", who: "opp", point: ev.clone() });
      collided = true;
    }
  }

  // Only advance to `next` if there was no racket collision (swept collide already snapped pos).
  if (!collided) {
    ball.pos.copy(next);
  }

  // Net.
  if (Math.abs(ball.pos.z) < 0.012 && ball.pos.y < TABLE.height + TABLE.netHeight + BALL_RADIUS) {
    if (ball.pos.y > TABLE.height - 0.01) {
      ball.vel.z *= -0.3;
      ball.vel.y *= 0.4;
      ball.pos.z += Math.sign(ball.vel.z || 1) * 0.02;
      events.push({ kind: "net", point: ball.pos.clone() });
    }
  }

  // Table bounce.
  const overTableX = Math.abs(ball.pos.x) <= TABLE.width / 2 + BALL_RADIUS;
  const overTableZ = Math.abs(ball.pos.z) <= TABLE.length / 2 + BALL_RADIUS;
  if (ball.pos.y - BALL_RADIUS <= TABLE.height && ball.vel.y < 0 && overTableX && overTableZ) {
    ball.pos.y = TABLE.height + BALL_RADIUS;
    ball.vel.y = -ball.vel.y * TABLE_RESTITUTION;
    ball.vel.x *= 1 - TABLE_FRICTION * 0.5;
    ball.vel.z *= 1 - TABLE_FRICTION * 0.5;
    const side: "user" | "opp" = ball.pos.z > 0 ? "user" : "opp";
    ball.bouncesSinceHit++;
    events.push({ kind: "table", side, point: ball.pos.clone() });
  }

  // Floor — if the ball gets here something went wrong / point is over.
  if (ball.pos.y - BALL_RADIUS <= 0) {
    ball.pos.y = BALL_RADIUS;
    ball.vel.y = -ball.vel.y * 0.3;
    ball.vel.multiplyScalar(0.4);
    events.push({ kind: "floor", point: ball.pos.clone() });
  }

  // Out of bounds — arbitrarily far from the arena.
  if (ball.pos.length() > 12) {
    events.push({ kind: "out", point: ball.pos.clone() });
  }

  return events;
}

// Swept ball-vs-paddle collision: tests the segment from the ball's current pos to its next pos
// against the paddle disk plane. Catches fast-moving balls that would tunnel through a point check.
function racketCollide(
  ball: BallState,
  next: THREE.Vector3,
  racketPos: THREE.Vector3,
  racketNormal: THREE.Vector3,
  racketVel: THREE.Vector3,
): THREE.Vector3 | null {
  const n = racketNormal.clone().normalize();
  const dStart = ball.pos.clone().sub(racketPos).dot(n);
  const dEnd = next.clone().sub(racketPos).dot(n);

  // Both endpoints far on the same side of the paddle plane → no chance of intersection.
  const tolerance = BALL_RADIUS + 0.015;
  if (
    Math.sign(dStart) === Math.sign(dEnd) &&
    Math.min(Math.abs(dStart), Math.abs(dEnd)) > tolerance
  ) {
    return null;
  }

  // Segment-plane intersection parameter along [start, next].
  const denom = dStart - dEnd;
  let t = 0.5;
  if (Math.abs(denom) > 1e-6) t = dStart / denom;
  t = Math.max(0, Math.min(1, t));

  const intersection = ball.pos.clone().lerp(next, t);
  // Distance from racket centre, projected onto the paddle plane.
  const rel = intersection.clone().sub(racketPos);
  const planar = rel.clone().sub(n.clone().multiplyScalar(rel.dot(n)));
  if (planar.length() > RACKET_RADIUS) return null;

  const vRel = ball.vel.clone().sub(racketVel);
  const approach = vRel.dot(n);
  const fromFront = dStart >= 0;
  // Must actually be moving toward the paddle from its current side.
  if (fromFront && approach >= 0) return null;
  if (!fromFront && approach <= 0) return null;

  // Reflect velocity (relative to paddle), then re-add paddle velocity.
  const newRelVel = vRel.clone().sub(n.clone().multiplyScalar((1 + RACKET_RESTITUTION) * approach));
  ball.vel.copy(newRelVel).add(racketVel);

  // Snap ball to the side it came from with a small clearance so we don't re-collide next frame.
  const sign = fromFront ? 1 : -1;
  ball.pos.copy(intersection).addScaledVector(n, sign * (BALL_RADIUS + 0.015));

  return intersection;
}
