import { FilesetResolver, PoseLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";
import * as THREE from "three";
import type { Frame, Hand, Handedness, V3 } from "./types";

export type Trackers = {
  pose: PoseLandmarker;
  hands: HandLandmarker;
};

export async function initTrackers(): Promise<Trackers> {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
  );
  const [pose, hands] = await Promise.all([
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false,
    }),
    HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  ]);
  return { pose, hands };
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: 30 },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

export function detect(trackers: Trackers, video: HTMLVideoElement, ts: number): Frame {
  const poseRes = trackers.pose.detectForVideo(video, ts);
  const handRes = trackers.hands.detectForVideo(video, ts);

  const pose = poseRes.landmarks?.[0];
  const poseWorld = poseRes.worldLandmarks?.[0];

  const hands: Hand[] = [];
  const lmList: V3[][] = handRes.landmarks ?? [];
  const worldList: V3[][] = (handRes as any).worldLandmarks ?? [];
  for (let i = 0; i < lmList.length; i++) {
    const h: any = (handRes as any).handednesses?.[i]?.[0] ?? (handRes as any).handedness?.[i]?.[0];
    const side = (h?.categoryName as Handedness) ?? "Right";
    hands.push({ handedness: side, image: lmList[i], world: worldList[i] ?? lmList[i] });
  }

  return { pose, poseWorld, hands, ts };
}

// Exponential moving average smoother keyed by a string id.
export class Smoother {
  private cache = new Map<string, V3>();
  constructor(private alpha = 0.5) {}

  smooth(key: string, p: V3): V3 {
    const prev = this.cache.get(key);
    if (!prev) {
      this.cache.set(key, { ...p });
      return p;
    }
    const next: V3 = {
      x: prev.x + this.alpha * (p.x - prev.x),
      y: prev.y + this.alpha * (p.y - prev.y),
      z: prev.z + this.alpha * (p.z - prev.z),
      visibility: p.visibility,
    };
    this.cache.set(key, next);
    return next;
  }

  smoothVec(key: string, v: THREE.Vector3): THREE.Vector3 {
    const prev = this.cache.get(key);
    if (!prev) {
      this.cache.set(key, { x: v.x, y: v.y, z: v.z });
      return v.clone();
    }
    const nx = prev.x + this.alpha * (v.x - prev.x);
    const ny = prev.y + this.alpha * (v.y - prev.y);
    const nz = prev.z + this.alpha * (v.z - prev.z);
    this.cache.set(key, { x: nx, y: ny, z: nz });
    return new THREE.Vector3(nx, ny, nz);
  }
}

// Globally-toggleable mapping options (set from the settings modal).
export const mapping = {
  mirrorX: true,         // flip lateral so user-left feels like screen-left
  reachScale: 1.45,      // amplify forward arm extension (Z)
  lateralScale: 1.25,    // amplify lateral motion (X) so small wrist moves cover the table
};

// MediaPipe world coord → scene coord. MP: +X person's right, +Y down, +Z toward camera (= user's front).
// Scene: user faces -Z (toward opponent), +Y up, +X screen-right.
export function mpToScene(p: V3, hipWorld: THREE.Vector3): THREE.Vector3 {
  const sx = mapping.mirrorX ? -1 : 1;
  return new THREE.Vector3(
    hipWorld.x + sx * p.x * mapping.lateralScale,
    hipWorld.y - p.y,
    hipWorld.z - p.z * mapping.reachScale,
  );
}

export function mpDirToScene(v: V3): THREE.Vector3 {
  const sx = mapping.mirrorX ? -1 : 1;
  return new THREE.Vector3(sx * v.x, -v.y, -v.z);
}

// Pick the playing hand from the frame. Returns null if not visible.
export function pickPlayingHand(frame: Frame, hand: Handedness): Hand | null {
  if (!frame.hands.length) return null;
  const match = frame.hands.find((h) => h.handedness === hand);
  if (match) return match;
  // If no explicit match, fall back to the larger (closer) hand.
  return frame.hands[0];
}
