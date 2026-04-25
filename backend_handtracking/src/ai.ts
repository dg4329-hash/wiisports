import * as THREE from "three";
import type { BallState } from "./physics";
import { aimedLaunch } from "./physics";
import type { Racket, Avatar } from "./scene";
import { TABLE, OPP_END_Z, USER_END_Z } from "./types";

// Ballistic predictor — projects the ball forward until it crosses a target Z plane.
// Uses our slowed gravity (matches physics.ts).
const PRED_GRAVITY = 7.0;
function predictLandingAtZ(ball: BallState, targetZ: number): THREE.Vector3 | null {
  const { pos, vel } = ball;
  if (Math.abs(vel.z) < 0.01) return null;
  const t = (targetZ - pos.z) / vel.z;
  if (t <= 0 || t > 3) return null;
  const x = pos.x + vel.x * t;
  const y = pos.y + vel.y * t - 0.5 * PRED_GRAVITY * t * t;
  return new THREE.Vector3(x, Math.max(y, TABLE.height + 0.05), targetZ);
}

// A shot profile combines pace, landing depth, and arc height. Each named shot lands at the
// user's body at a characteristic height — that's what creates the "feels like a real game"
// variety.
export type ShotProfile = {
  kind: "smash" | "drive" | "loop" | "drop" | "lob";
  flightTime: number;       // seconds from contact to landing on receiver's side
  landingZRatio: number;    // 0 = at the net, 1 = at the receiver's baseline
  arcBoost: number;         // extra m/s added to vy after aimedLaunch — lifts the apex
};

// Picks a shot profile from a weighted distribution. Arcs are flattened from before so balls
// stay in the camera frame and feel rally-able.
//   smash  5% — fast & flat, lands deep
//   drive 30% — medium pace, mid-deep, chest height
//   loop  30% — slower with mild arc, mid-court, hip-to-shoulder
//   drop  20% — short ball just past net
//   lob   15% — slow, moderate arc (no longer screen-exiting)
export function randomShot(): ShotProfile {
  const r = Math.random();
  if (r < 0.05) return { kind: "smash", flightTime: 0.78 + Math.random() * 0.10, landingZRatio: 0.55 + Math.random() * 0.20, arcBoost: -0.3 };
  if (r < 0.35) return { kind: "drive", flightTime: 0.90 + Math.random() * 0.10, landingZRatio: 0.55 + Math.random() * 0.20, arcBoost: 0.0 };
  if (r < 0.65) return { kind: "loop",  flightTime: 1.00 + Math.random() * 0.10, landingZRatio: 0.40 + Math.random() * 0.20, arcBoost: 0.7 };
  if (r < 0.85) return { kind: "drop",  flightTime: 0.90 + Math.random() * 0.10, landingZRatio: 0.18 + Math.random() * 0.15, arcBoost: 0.3 };
  return        { kind: "lob",   flightTime: 1.10 + Math.random() * 0.15, landingZRatio: 0.30 + Math.random() * 0.20, arcBoost: 1.2 };
}

// Serve profile — restricted to flat shots so the ball never arcs above the screen on the
// rally start. No lobs or smashes; just drives, drops, and gentle loops.
export function randomServeShot(): ShotProfile {
  const r = Math.random();
  if (r < 0.55) return { kind: "drive", flightTime: 0.92 + Math.random() * 0.10, landingZRatio: 0.55 + Math.random() * 0.18, arcBoost: 0.0 };
  if (r < 0.85) return { kind: "drop",  flightTime: 0.92 + Math.random() * 0.08, landingZRatio: 0.20 + Math.random() * 0.15, arcBoost: 0.2 };
  return        { kind: "loop",  flightTime: 1.00 + Math.random() * 0.10, landingZRatio: 0.45 + Math.random() * 0.15, arcBoost: 0.5 };
}

// Backwards-compat: callers that only need a flight time use this.
export function randomFlightTime(): number {
  return randomShot().flightTime;
}

// Compute a deterministic, varied return aimed at the user's side. X (lateral) varies for
// placement variety and Y (apex) varies via flight-time / arcBoost — but Z (the depth at
// which the ball lands on the user's table) is FIXED so the ball always crosses the user's
// racket plane at a consistent reach distance. The user can keep their racket at one depth
// and just adjust laterally + vertically to make contact.
const USER_LANDING_Z_RATIO = 0.55; // 55% of the way to user's baseline = mid-user-court
export function plannedReturn(ballPos: THREE.Vector3): THREE.Vector3 {
  const shot = randomShot();
  const targetX = (Math.random() - 0.5) * TABLE.width * 0.65;
  const targetZ = USER_END_Z * USER_LANDING_Z_RATIO;
  const target = new THREE.Vector3(targetX, TABLE.height + 0.02, targetZ);
  const vel = aimedLaunch(ballPos, target, shot.flightTime);
  vel.y = Math.min(vel.y + shot.arcBoost, 4.0);
  return vel;
}

// Generic helper — aims a shot toward the given end (USER_END_Z or OPP_END_Z) with shot variety.
export function shotTowards(ballPos: THREE.Vector3, endZ: number): THREE.Vector3 {
  return shotWith(ballPos, endZ, randomShot());
}

// Same but with a serve-only profile (flatter, no lobs/smashes).
export function serveShot(ballPos: THREE.Vector3, endZ: number): THREE.Vector3 {
  return shotWith(ballPos, endZ, randomServeShot());
}

// Hard ceiling on vertical launch speed — keeps the ball's apex inside the camera frustum.
// Camera looks down at the table from y≈1.85, top of view sits around y≈2.6 m. With g=7
// and a launch from y≈1.0, vy=4.0 peaks at ~2.16 m. Anything above 4.0 risks going off-frame.
const MAX_LAUNCH_VY = 4.0;

function shotWith(ballPos: THREE.Vector3, endZ: number, shot: ShotProfile): THREE.Vector3 {
  const targetX = (Math.random() - 0.5) * TABLE.width * 0.65;
  const targetZ = endZ * shot.landingZRatio;
  const target = new THREE.Vector3(targetX, TABLE.height + 0.02, targetZ);
  const vel = aimedLaunch(ballPos, target, shot.flightTime);
  vel.y = Math.min(vel.y + shot.arcBoost, MAX_LAUNCH_VY);
  return vel;
}

// Dedicated return profile for the user's magnet hit — guaranteed to land on opponent's side.
// Restricted to safe shots (drop/drive/loop), cross-court X bounded inside the table.
export function magnetReturnShot(ballPos: THREE.Vector3, ballSideSign: number): THREE.Vector3 {
  const r = Math.random();
  let shot: ShotProfile;
  if (r < 0.25) shot = { kind: "drop",  flightTime: 0.95 + Math.random() * 0.05, landingZRatio: 0.28 + Math.random() * 0.15, arcBoost: 0.25 };
  else if (r < 0.80) shot = { kind: "drive", flightTime: 0.90 + Math.random() * 0.10, landingZRatio: 0.55 + Math.random() * 0.20, arcBoost: 0.0 };
  else shot = { kind: "loop", flightTime: 1.00 + Math.random() * 0.10, landingZRatio: 0.45 + Math.random() * 0.18, arcBoost: 0.5 };

  // Cross-court bias on X with clamped magnitude (stays well inside the table width).
  const sideMag = 0.18 + Math.random() * 0.28; // [0.18, 0.46] of half-width
  const targetX = -ballSideSign * sideMag * (TABLE.width / 2);
  const targetZ = OPP_END_Z * shot.landingZRatio;
  const target = new THREE.Vector3(targetX, TABLE.height + 0.02, targetZ);
  const vel = aimedLaunch(ballPos, target, shot.flightTime);
  vel.y = Math.min(vel.y + shot.arcBoost, MAX_LAUNCH_VY);
  return vel;
}

export class OpponentAI {
  // Where the paddle currently is / wants to be.
  public paddlePos = new THREE.Vector3(0, TABLE.height + 0.25, OPP_END_Z - 0.25);
  public paddleVel = new THREE.Vector3();
  public paddleNormal = new THREE.Vector3(0, 0, 1); // faces +Z (toward user)
  private prevPos = this.paddlePos.clone();
  public missProb = 0.0;
  public skill = 1.0;
  // Set to true at the start of an incoming-ball cycle to make the AI deliberately whiff.
  // The paddle still tracks toward the ball but is offset by `missOffset*` so it lunges
  // and visibly fails — `canReturnNow()` returns false so no actual hit registers.
  public skipThisRally = false;
  private missOffsetX = 0;
  private missOffsetY = 0;
  private missLerp = 1.0;       // how aggressively the paddle chases on a miss (lower = looks late)

  // Roll the dice for this incoming ball. Call once per user-touch event.
  public rollDice(missRate: number): void {
    this.skipThisRally = Math.random() < missRate;
    if (this.skipThisRally) {
      // Pick a miss profile — random direction + distance + reaction speed.
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.28 + Math.random() * 0.18;  // 28–46cm off the predicted landing
      this.missOffsetX = Math.cos(angle) * dist;
      this.missOffsetY = Math.sin(angle) * dist * 0.4;
      this.missLerp = 0.55 + Math.random() * 0.25; // 55–80% chase speed (looks slightly late)
    } else {
      this.missOffsetX = 0;
      this.missOffsetY = 0;
      this.missLerp = 1.0;
    }
  }

  constructor(private avatar: Avatar, private racket: Racket) {}

  // Called every frame.
  update(ball: BallState, dt: number): void {
    const hitZ = OPP_END_Z + 0.05;
    let target = this.paddlePos.clone();

    if (ball.alive && ball.vel.z < -0.01) {
      // Ball is heading toward opponent — track toward intercept (even on a miss, so
      // the paddle visually lunges).
      const pred = predictLandingAtZ(ball, hitZ);
      if (pred) {
        pred.x = THREE.MathUtils.clamp(pred.x, -TABLE.width / 2 - 0.4, TABLE.width / 2 + 0.4);
        pred.y = THREE.MathUtils.clamp(pred.y, TABLE.height + 0.05, TABLE.height + 0.9);
        if (this.skipThisRally) {
          // Lunge in the wrong direction so the paddle reaches but doesn't connect.
          pred.x += this.missOffsetX;
          pred.y = Math.max(TABLE.height + 0.05, pred.y + this.missOffsetY);
        }
        target.copy(pred);
      }
    } else {
      target.set(0, TABLE.height + 0.32, OPP_END_Z - 0.05);
    }

    // Snap paddle to target. On a miss-rally, chase speed is throttled so the paddle looks slightly late.
    const chaseSpeed = 22 * (this.skipThisRally ? this.missLerp : 1.0);
    this.paddlePos.lerp(target, 1 - Math.exp(-chaseSpeed * dt));
    this.paddleVel.copy(this.paddlePos).sub(this.prevPos).divideScalar(Math.max(dt, 1e-3));
    this.prevPos.copy(this.paddlePos);

    // Paddle face aims at the user's side, slightly downward so returns clear the net and land.
    const desiredNormal = new THREE.Vector3(0, 0, 1);
    // When returning, aim for a target on the user's side; tilt normal to produce that direction.
    if (ball.alive && ball.vel.z < 0 && ball.pos.z < 0) {
      const aimX = (Math.random() - 0.5) * TABLE.width * 0.8;
      const aimPoint = new THREE.Vector3(aimX, TABLE.height + 0.02, TABLE.length * 0.3);
      const dir = aimPoint.clone().sub(this.paddlePos).normalize();
      desiredNormal.copy(dir);
    }
    this.paddleNormal.lerp(desiredNormal, 0.15).normalize();

    // Sync racket + arm visuals.
    this.racket.root.position.copy(this.paddlePos);
    const forward = this.paddleNormal.clone();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(worldUp, forward).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    const m = new THREE.Matrix4().makeBasis(right, up, forward);
    this.racket.root.quaternion.setFromRotationMatrix(m);

    // Move opponent arm so it looks plausibly attached.
    const shoulder = new THREE.Vector3(-0.2, TABLE.height + 0.65, OPP_END_Z - 0.8);
    this.avatar.shoulder.position.copy(shoulder);
    const wrist = this.paddlePos.clone();
    const elbow = shoulder.clone().lerp(wrist, 0.5);
    // Give the elbow a small droop so the arm doesn't look stick-straight.
    elbow.y -= 0.05;
    this.avatar.elbow.position.copy(elbow);
    this.avatar.wrist.position.copy(wrist);
    orientSegment(this.avatar.upperArm, shoulder, elbow);
    orientSegment(this.avatar.forearm, elbow, wrist);
  }

  canReturnNow(ball: BallState): boolean {
    // Only allow the opponent to hit when the ball is close to their paddle plane.
    return (
      ball.alive &&
      ball.pos.z < OPP_END_Z + 0.3 &&
      ball.vel.z < 0 &&
      !this.skipThisRally
    );
  }
}

function orientSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a);
  const len = dir.length();
  mesh.position.copy(mid);
  mesh.scale.set(1, Math.max(len, 0.0001), 1);
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
  mesh.quaternion.copy(q);
  mesh.visible = true;
}
