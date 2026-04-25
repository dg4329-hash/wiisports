import { FilesetResolver, PoseLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";

export type V3 = { x: number; y: number; z: number; visibility?: number };

export type Handedness = "Left" | "Right";

export type HandFrame = {
  handedness: Handedness;        // display-side: "Left" hand appears on screen-left
  imageLandmarks: V3[];          // 21 landmarks in [0,1] image coords (used to match to pose wrist)
  worldLandmarks: V3[];          // 21 landmarks in MP hand-world frame (wrist-origin meters)
};

export type Frame = {
  pose?: V3[];        // image-space normalized 0..1
  poseWorld?: V3[];   // world-space (hip-origin meters, MP convention)
  hands: HandFrame[]; // up to 2
  ts: number;
};

// Pose landmark indices.
export const RIGHT_SHOULDER = 12, LEFT_SHOULDER = 11;
export const RIGHT_ELBOW = 14, LEFT_ELBOW = 13;
export const RIGHT_WRIST = 16, LEFT_WRIST = 15;
export const LEFT_HIP = 23, RIGHT_HIP = 24;

export type Trackers = {
  pose: PoseLandmarker;
  hand: HandLandmarker;
};

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: 30 },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

export async function initTrackers(): Promise<Trackers> {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
  );
  const [pose, hand] = await Promise.all([
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
  return { pose, hand };
}

export function detect(trackers: Trackers, video: HTMLVideoElement, ts: number): Frame {
  const poseRes = trackers.pose.detectForVideo(video, ts);
  const handRes = trackers.hand.detectForVideo(video, ts);

  const pose = poseRes.landmarks?.[0];
  const poseWorld = poseRes.worldLandmarks?.[0];

  const handsRaw = (handRes as any);
  const lmList: V3[][] = handRes.landmarks ?? [];
  const worldList: V3[][] = handsRaw.worldLandmarks ?? [];
  const handednesses = handsRaw.handednesses ?? handsRaw.handedness ?? [];

  const hands: HandFrame[] = [];
  for (let i = 0; i < lmList.length; i++) {
    const raw = handednesses[i]?.[0]?.categoryName as Handedness | undefined;
    // Display-side flip: MP labels assume an unmirrored image, but we render mirror-style.
    const displaySide: Handedness =
      raw === "Left" ? "Right" : raw === "Right" ? "Left" : "Right";
    hands.push({
      handedness: displaySide,
      imageLandmarks: lmList[i],
      worldLandmarks: worldList[i] ?? lmList[i],
    });
  }

  return { pose, poseWorld, hands, ts };
}

// Standard MediaPipe hand connection list — 21 landmarks, 21 bones.
export const HAND_CONNECTIONS: Array<[number, number]> = [
  // Palm
  [0, 1], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17],
  // Thumb
  [1, 2], [2, 3], [3, 4],
  // Index
  [5, 6], [6, 7], [7, 8],
  // Middle
  [9, 10], [10, 11], [11, 12],
  // Ring
  [13, 14], [14, 15], [15, 16],
  // Pinky
  [17, 18], [18, 19], [19, 20],
];

// Convert a single hand-local world landmark (MP convention: +X person's right, +Y down,
// +Z toward camera) into a scene-space *delta* from the wrist. Mirrors X for selfie display.
export function handDeltaToScene(p: V3, mirrorX: boolean): { x: number; y: number; z: number } {
  const sx = mirrorX ? -1 : 1;
  return { x: sx * p.x, y: -p.y, z: -p.z };
}

// Convert a pose world landmark (centered on hip midpoint) into a scene-space position
// given the user's anchor point in the scene.
export function poseToScene(
  p: V3,
  hipCentre: V3,
  anchor: { x: number; y: number; z: number },
  mirrorX: boolean,
  reachScale: number,
): { x: number; y: number; z: number } {
  const sx = mirrorX ? -1 : 1;
  return {
    x: anchor.x + sx * (p.x - hipCentre.x) * reachScale,
    y: anchor.y - (p.y - hipCentre.y),
    z: anchor.z - (p.z - hipCentre.z) * reachScale,
  };
}

// Match each detected hand to a pose wrist (left or right). Uses image-space proximity
// of the hand's wrist landmark (#0) to the pose's wrist landmarks (#15 / #16). Returns
// { left: HandFrame | null, right: HandFrame | null } where left/right are person-side.
export function pairHandsToPoseWrists(frame: Frame): {
  left: HandFrame | null;
  right: HandFrame | null;
} {
  const result = { left: null as HandFrame | null, right: null as HandFrame | null };
  if (!frame.pose || frame.hands.length === 0) return result;

  const poseLeftWristImg = frame.pose[LEFT_WRIST];
  const poseRightWristImg = frame.pose[RIGHT_WRIST];

  for (const hand of frame.hands) {
    const handWristImg = hand.imageLandmarks[0];
    if (!handWristImg) continue;
    const dLeft = poseLeftWristImg
      ? Math.hypot(handWristImg.x - poseLeftWristImg.x, handWristImg.y - poseLeftWristImg.y)
      : Infinity;
    const dRight = poseRightWristImg
      ? Math.hypot(handWristImg.x - poseRightWristImg.x, handWristImg.y - poseRightWristImg.y)
      : Infinity;
    if (dLeft < dRight) {
      if (!result.left || dLeft < distToWristImg(result.left, poseLeftWristImg!)) result.left = hand;
    } else {
      if (!result.right || dRight < distToWristImg(result.right, poseRightWristImg!)) result.right = hand;
    }
  }
  return result;
}

function distToWristImg(hand: HandFrame, target: V3): number {
  const w = hand.imageLandmarks[0];
  return Math.hypot(w.x - target.x, w.y - target.y);
}
