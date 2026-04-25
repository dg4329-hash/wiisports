import * as THREE from "three";
import type { Avatar, Racket } from "./scene";
import type { Frame, Handedness, V3 } from "./types";
import { mpDirToScene, mpToScene, OneEuroFilter, pickPlayingHand, Smoother } from "./tracking";

const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13, RIGHT_ELBOW = 14;
const LEFT_WRIST = 15, RIGHT_WRIST = 16;
const LEFT_HIP = 23, RIGHT_HIP = 24;

const HAND_WRIST = 0, HAND_INDEX_MCP = 5, HAND_PINKY_MCP = 17, HAND_MIDDLE_MCP = 9;

// Place a cylinder so it spans between two points.
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

// Distance from wrist to centre of paddle face along the palm-up (fingers) axis.
// Matches the head offset built into makeRacket(). Kept short so the paddle sits roughly
// at the user's hand rather than floating above it.
export const RACKET_HEAD_OFFSET = 0.08;

export class UserAvatarDriver {
  private smoother = new Smoother(0.55);
  private prevWrist: THREE.Vector3 | null = null;
  private prevFace: THREE.Vector3 | null = null;
  public wristVelocity = new THREE.Vector3();
  public faceVelocity = new THREE.Vector3();
  public wristPos = new THREE.Vector3();
  public facePos = new THREE.Vector3();
  public palmNormal = new THREE.Vector3(0, 0, -1);   // raw, from MediaPipe hand landmarks
  public palmUp = new THREE.Vector3(0, 1, 0);
  public racketNormal = new THREE.Vector3(0, 0, -1); // SNAPPED — what the paddle actually faces
  public visible = false;
  public handVisible = false;
  public isBackhand = false;     // racket face mode — snaps with hysteresis
  public wristEstimated = false; // true when extrapolating from elbow + cached forearm
  private lastForearmDir = new THREE.Vector3(0, 1, 0);
  private lastForearmLen = 0.3;
  // One-Euro filter on the pitch component of palm normal. Tuned for low-jitter when
  // the wrist is held still, but responsive to actual tilt motion.
  private pitchFilter = new OneEuroFilter(/*freqMin*/ 0.8, /*beta*/ 0.04, /*freqDeriv*/ 1.0);

  constructor(private avatar: Avatar, private racket: Racket, private hand: Handedness) {}

  setHand(h: Handedness): void {
    this.hand = h;
  }

  update(frame: Frame, dt: number, ballPos?: THREE.Vector3, ballApproaching?: boolean): void {
    if (!frame.poseWorld) {
      this.visible = false;
      return;
    }
    const hipL = frame.poseWorld[LEFT_HIP];
    const hipR = frame.poseWorld[RIGHT_HIP];
    if (!hipL || !hipR) {
      this.visible = false;
      return;
    }
    const hipCentre: V3 = {
      x: (hipL.x + hipR.x) * 0.5,
      y: (hipL.y + hipR.y) * 0.5,
      z: (hipL.z + hipR.z) * 0.5,
    };
    // Anchor the avatar root position at its fixed world spot; hip world coords are *relative* already.
    const hipAnchor = this.avatar.root.position.clone();
    hipAnchor.y = 0.95; // approximate pelvis height

    const shoulderIdx = this.hand === "Right" ? RIGHT_SHOULDER : LEFT_SHOULDER;
    const elbowIdx = this.hand === "Right" ? RIGHT_ELBOW : LEFT_ELBOW;
    const wristIdx = this.hand === "Right" ? RIGHT_WRIST : LEFT_WRIST;

    const rawShoulder = frame.poseWorld[shoulderIdx];
    const rawElbow = frame.poseWorld[elbowIdx];
    const rawWrist = frame.poseWorld[wristIdx];
    if (!rawShoulder || !rawElbow || !rawWrist) {
      this.visible = false;
      return;
    }

    // Subtract hip centre so joints are hip-origin offsets, then lift into scene space.
    const mk = (p: V3) => ({ x: p.x - hipCentre.x, y: p.y - hipCentre.y, z: p.z - hipCentre.z });
    const shoulder = this.smoother.smoothVec("ush", mpToScene(mk(rawShoulder), hipAnchor));
    const elbow = this.smoother.smoothVec("uel", mpToScene(mk(rawElbow), hipAnchor));
    let wrist = this.smoother.smoothVec("uwr", mpToScene(mk(rawWrist), hipAnchor));

    // Detect wrist tracking quality. If it's at the screen edge or visibility dropped,
    // extrapolate the wrist from the elbow + last known forearm vector.
    const wristImg = frame.pose?.[wristIdx];
    const wristVis = (rawWrist as any).visibility ?? wristImg?.visibility ?? 0.5;
    const imgX = wristImg?.x ?? 0.5;
    const wristOutOfFrame = imgX < 0.04 || imgX > 0.96;
    const wristTracked = wristVis > 0.4 && !wristOutOfFrame;

    if (wristTracked) {
      // Refresh the cached forearm geometry.
      const forearm = wrist.clone().sub(elbow);
      const len = forearm.length();
      if (len > 0.05) {
        this.lastForearmDir.copy(forearm).divideScalar(len);
        this.lastForearmLen = len;
      }
      this.wristEstimated = false;
    } else {
      // Project wrist from elbow along the cached forearm direction.
      wrist = elbow.clone().addScaledVector(this.lastForearmDir, this.lastForearmLen);
      this.wristEstimated = true;
    }

    this.avatar.shoulder.position.copy(shoulder);
    this.avatar.elbow.position.copy(elbow);
    this.avatar.wrist.position.copy(wrist);

    orientSegment(this.avatar.upperArm, shoulder, elbow);
    orientSegment(this.avatar.forearm, elbow, wrist);

    // Mitten hand glove sphere stashed on the wrist node.
    const handMesh = (this.avatar.wrist as any).handMesh as THREE.Mesh | undefined;
    if (handMesh) {
      handMesh.position.copy(wrist);
      handMesh.visible = true;
    }

    // Wrist velocity (for swing power).
    if (this.prevWrist) {
      this.wristVelocity.copy(wrist).sub(this.prevWrist).divideScalar(Math.max(dt, 1e-3));
      // Clamp to avoid crazy spikes when tracking jumps.
      const max = 15;
      if (this.wristVelocity.length() > max) this.wristVelocity.setLength(max);
    }
    this.prevWrist = wrist.clone();
    this.wristPos.copy(wrist);

    // Derive palm frame from hand landmarks of the playing hand.
    const playingHand = pickPlayingHand(frame, this.hand);
    this.handVisible = false;
    if (playingHand && playingHand.world && playingHand.world.length >= 18) {
      const lw = playingHand.world;
      const w = lw[HAND_WRIST];
      const iM = lw[HAND_INDEX_MCP];
      const pM = lw[HAND_PINKY_MCP];
      const mM = lw[HAND_MIDDLE_MCP];
      if (w && iM && pM && mM) {
        const iv = mpDirToScene({ x: iM.x - w.x, y: iM.y - w.y, z: iM.z - w.z });
        const pv = mpDirToScene({ x: pM.x - w.x, y: pM.y - w.y, z: pM.z - w.z });
        const mv = mpDirToScene({ x: mM.x - w.x, y: mM.y - w.y, z: mM.z - w.z });
        // Palm-normal direction = perpendicular to palm, pointing OUT of the palm side.
        // For a right hand the cross (index − wrist) × (pinky − wrist) points out of the palm;
        // for a left hand it points out of the back, so negate.
        let normal = iv.clone().cross(pv);
        if (this.hand === "Left") normal.negate();
        if (normal.lengthSq() < 1e-6) normal = this.palmNormal.clone();
        normal.normalize();
        const up = mv.clone().normalize();

        // Heavier base smoothing on the palm frame — reduces high-frequency jitter
        // before any axis is extracted from it.
        this.palmNormal.lerp(normal, 0.35).normalize();
        this.palmUp.lerp(up, 0.35).normalize();
        this.handVisible = true;
      }
    }
    // If hand isn't visible, fall back to elbow→wrist direction for palmUp and a sensible default normal.
    if (!this.handVisible) {
      const fallbackUp = wrist.clone().sub(this.avatar.elbow.position).normalize();
      if (fallbackUp.lengthSq() > 1e-6) this.palmUp.lerp(fallbackUp, 0.25).normalize();
      // Keep palm normal generally facing the opponent.
      const towardOpp = new THREE.Vector3(0, 0, -1);
      this.palmNormal.lerp(towardOpp, 0.1).normalize();
    }

    // SNAPPED racket basis — only two states: perfect forehand or perfect backhand.
    // +Y axis = forearm direction (elbow → wrist) so the head extends naturally from the hand.
    // +Z axis = always toward the opponent (world -Z), with a 180° flip for backhand.
    let yAxis = wrist.clone().sub(this.avatar.elbow.position);
    if (yAxis.lengthSq() < 1e-4) yAxis = this.palmUp.clone();
    yAxis.normalize();

    const opponentDir = new THREE.Vector3(0, 0, -1);
    // Project opponentDir into the plane perpendicular to yAxis so the basis stays orthogonal.
    let zForehand = opponentDir.clone().sub(yAxis.clone().multiplyScalar(opponentDir.dot(yAxis)));
    if (zForehand.lengthSq() < 1e-4) zForehand.set(0, 0, -1);
    zForehand.normalize();

    // Determine target face: prefer ball-side auto-snap when the ball is in our hitting zone,
    // otherwise fall back to palm orientation. Both with hysteresis so the state doesn't flicker.
    const handSign = this.hand === "Right" ? 1 : -1;
    const ballInZone =
      !!ballPos && ballApproaching === true && ballPos.distanceTo(wrist) < 0.9;

    if (ballInZone && ballPos) {
      // For a right-handed player, ball on the right of the wrist = forehand side.
      // (Mirrored for left-handed via handSign.)
      const ballRelX = (ballPos.x - wrist.x) * handSign;
      if (!this.isBackhand && ballRelX < -0.08) this.isBackhand = true;
      else if (this.isBackhand && ballRelX > 0.08) this.isBackhand = false;
    } else {
      const palmDot = this.palmNormal.dot(zForehand); // > 0 = palm faces opponent = forehand
      if (!this.isBackhand && palmDot < -0.25) this.isBackhand = true;
      else if (this.isBackhand && palmDot > 0.25) this.isBackhand = false;
    }

    // Pitch — vertical wrist tilt rotates the paddle face up/down without changing
    // forehand/backhand orientation. palmNormal.y > 0 = wrist tipped back (palm up) →
    // paddle face opens upward → ball gets lifted on contact. < 0 = closed face → flat drive.
    // One-Euro filter on the raw pitch input — heavy smoothing when held still, lighter
    // during deliberate tilt. Then a small deadzone so micro-noise stays at exactly zero.
    const rawPitch = this.palmNormal.y;
    const filteredPitch = this.pitchFilter.filter(rawPitch, dt);
    const PITCH_DEADZONE = 0.08;
    const deadzoned =
      Math.abs(filteredPitch) < PITCH_DEADZONE
        ? 0
        : filteredPitch - Math.sign(filteredPitch) * PITCH_DEADZONE;
    const pitchClamped = Math.max(-0.55, Math.min(0.55, deadzoned));
    const pitchAngle = Math.asin(pitchClamped);
    const pitchAxis = new THREE.Vector3().crossVectors(zForehand, yAxis).normalize();
    const zPitched = zForehand.clone().applyAxisAngle(pitchAxis, pitchAngle);

    const zAxis = zPitched.multiplyScalar(this.isBackhand ? -1 : 1);
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(m);

    this.racket.root.position.copy(wrist);
    // Smooth quaternion interpolation — ~200ms to flip face.
    const slerpFactor = 1 - Math.exp(-15 * dt);
    this.racket.root.quaternion.slerp(targetQuat, slerpFactor);

    // Re-derive the actual paddle-face normal from the (possibly mid-slerp) quaternion
    // so physics matches the visual rather than snapping ahead.
    this.racketNormal.set(0, 0, 1).applyQuaternion(this.racket.root.quaternion).normalize();

    // Compute paddle face position from the *current* racket quaternion (which may be mid-slerp),
    // so the physics hit zone matches what the user actually sees on screen.
    const currentY = new THREE.Vector3(0, 1, 0).applyQuaternion(this.racket.root.quaternion);
    const face = wrist.clone().addScaledVector(currentY, RACKET_HEAD_OFFSET);
    if (this.prevFace) {
      this.faceVelocity.copy(face).sub(this.prevFace).divideScalar(Math.max(dt, 1e-3));
      const max = 18;
      if (this.faceVelocity.length() > max) this.faceVelocity.setLength(max);
    }
    this.prevFace = face.clone();
    this.facePos.copy(face);

    this.visible = true;
  }
}
