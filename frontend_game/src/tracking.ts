import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export type V3 = { x: number; y: number; z: number; visibility?: number };

export type BladePoint = {
  id: string;
  handedness: "Left" | "Right" | "Unknown";
  /** Normalized (0..1) in mirrored display space. x grows left→right as seen on screen. */
  nx: number;
  ny: number;
  /** Instantaneous speed in normalized units per second (pythagorean). */
  speed: number;
  /** True when backed by a fresh detection; false while dead-reckoning. */
  live: boolean;
};

export type TrackerSnapshot = {
  ready: boolean;
  blades: BladePoint[];
  handsDetected: number;
  gesturesActive: number;
  /** True when at least one blade is currently extrapolating (no live detection). */
  extrapolating: boolean;
};

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17],
  [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
];
const FINGERTIPS = [4, 8, 12, 16, 20];

const WRIST = 0;
const INDEX_PIP = 6, INDEX_TIP = 8;
const MIDDLE_PIP = 10, MIDDLE_TIP = 12;
const RING_PIP = 14, RING_TIP = 16;
const PINKY_PIP = 18, PINKY_TIP = 20;

const GESTURE_HIGHLIGHT_CONNECTIONS: Array<[number, number]> = [
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
];

// Position EMA smoothing strength (higher = snappier, less smoothing).
const POS_EMA_ALPHA = 0.55;
// How much the instantaneous velocity sample blends into the running velocity.
const VEL_EMA_BLEND = 0.55;
// How long a blade keeps moving on its own after losing tracking.
const DEAD_RECKON_MS = 350;
// Exponential velocity decay during extrapolation (per second).
const VEL_DECAY_HZ = 2.2;
// Gesture hysteresis: once the scissor gesture is seen, latch this many
// detection frames so a single-frame flicker doesn't drop the blade.
const GESTURE_STICKY_FRAMES = 6;
// Two detections within this normalized distance are treated as duplicates of the
// same physical hand (MP occasionally double-detects when bboxes overlap).
const DEDUPE_DIST = 0.10;
// A new detection within this distance of an existing blade slot is treated as the
// same physical hand — handedness label is ignored. Prevents ghost blades from L↔R flicker.
const SLOT_MATCH_DIST = 0.28;

// Gesture thresholds (rotation-invariant — ratios of distance-from-wrist).
const EXTENDED_RATIO = 1.15;
const NOT_EXTENDED_RATIO = 1.05;

type HandGestureState = { active: boolean };

type BladeState = {
  handedness: "Left" | "Right" | "Unknown";
  nx: number;
  ny: number;
  vx: number; // normalized units per second
  vy: number;
  /** Timestamp of the last detection-backed update. */
  lastLiveTs: number;
  /** Timestamp of the last position update (live or extrapolated). */
  lastUpdateTs: number;
  /** True iff updated from a detection this frame. */
  live: boolean;
};

export class HandTracker {
  private video: HTMLVideoElement;
  private previewCanvas: HTMLCanvasElement;
  private previewCtx: CanvasRenderingContext2D;
  private hands: HandLandmarker | null = null;
  private lastVideoTime = -1;
  private lastResult: {
    landmarks: V3[][];
    handedness: string[];
    gestures: HandGestureState[];
  } = { landmarks: [], handedness: [], gestures: [] };
  private gestureSticky = new Map<string, number>();
  private bladeStates = new Map<string, BladeState>();
  private _ready = false;

  constructor(video: HTMLVideoElement, previewCanvas: HTMLCanvasElement) {
    this.video = video;
    this.previewCanvas = previewCanvas;
    const ctx = previewCanvas.getContext("2d");
    if (!ctx) throw new Error("could not get 2d context for preview canvas");
    this.previewCtx = ctx;
  }

  get ready() {
    return this._ready;
  }

  async init() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, frameRate: 30 },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();

    this.previewCanvas.width = this.video.videoWidth || 640;
    this.previewCanvas.height = this.video.videoHeight || 480;

    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
    );
    this.hands = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/models/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
      // Lower thresholds — keep tracking even when MP's confidence dips. Drift is
      // tolerable here; momentary track-loss is what feels broken to the player.
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
    this._ready = true;
  }

  update(): TrackerSnapshot {
    if (!this._ready || !this.hands) {
      return { ready: false, blades: [], handsDetected: 0, gesturesActive: 0, extrapolating: false };
    }
    if (this.video.readyState < 2) {
      return { ready: true, blades: [], handsDetected: 0, gesturesActive: 0, extrapolating: false };
    }

    const now = performance.now();
    const videoAdvanced = this.video.currentTime !== this.lastVideoTime;

    if (videoAdvanced) {
      this.lastVideoTime = this.video.currentTime;
      this.runDetection(now);
    }

    return this.buildSnapshot(now);
  }

  private runDetection(now: number) {
    const res = this.hands!.detectForVideo(this.video, now);
    const landmarks = (res.landmarks ?? []) as V3[][];
    const handedness: string[] = [];
    const hands = (res as any).handednesses ?? (res as any).handedness ?? [];
    for (let i = 0; i < landmarks.length; i++) {
      handedness.push(hands?.[i]?.[0]?.categoryName ?? "Unknown");
    }

    // Determine display-side handedness per hand and compute gesture w/ hysteresis.
    const sides: BladeState["handedness"][] = landmarks.map((_, i) => {
      const raw = handedness[i] ?? "Unknown";
      return raw === "Left" ? "Right" : raw === "Right" ? "Left" : "Unknown";
    });

    const gestures: HandGestureState[] = landmarks.map((lm, i) => {
      const side = sides[i];
      const raw = this.detectScissorGesture(lm);
      let remaining = this.gestureSticky.get(side) ?? 0;
      remaining = raw ? GESTURE_STICKY_FRAMES : Math.max(0, remaining - 1);
      this.gestureSticky.set(side, remaining);
      return { active: raw || remaining > 0 };
    });

    // === Build a deduplicated candidate list keyed by blade position, not handedness ===
    type Candidate = {
      lm: V3[];
      side: BladeState["handedness"];
      active: boolean;
      rawNx: number;
      rawNy: number;
    };
    const allCandidates: Candidate[] = landmarks.map((lm, i) => ({
      lm,
      side: sides[i],
      active: gestures[i].active,
      rawNx: 1 - (lm[INDEX_TIP].x + lm[MIDDLE_TIP].x) / 2,
      rawNy: (lm[INDEX_TIP].y + lm[MIDDLE_TIP].y) / 2,
    }));

    // Drop spatially-overlapping detections (MP occasionally double-detects the same hand).
    const uniqueCandidates: Candidate[] = [];
    for (const cand of allCandidates) {
      const dup = uniqueCandidates.some(
        (u) => Math.hypot(u.rawNx - cand.rawNx, u.rawNy - cand.rawNy) < DEDUPE_DIST,
      );
      if (!dup) uniqueCandidates.push(cand);
    }

    // Active candidates are the ones that update existing blade slots / spawn new ones.
    const activeCandidates = uniqueCandidates.filter((c) => c.active);

    // === Position-based slot matching (handedness-agnostic) ===
    // For each active candidate, match to the closest existing blade state. If it's within
    // SLOT_MATCH_DIST, that's the same physical hand (regardless of MP's handedness label).
    // Otherwise it's a new hand and gets a fresh slot.
    const refreshedKeys = new Set<string>();
    type Match = { cand: Candidate; key: string };
    const matches: Match[] = [];

    for (const cand of activeCandidates) {
      let bestKey: string | null = null;
      let bestDist = Infinity;
      this.bladeStates.forEach((state, key) => {
        if (refreshedKeys.has(key)) return; // already taken by another candidate this frame
        const dist = Math.hypot(state.nx - cand.rawNx, state.ny - cand.rawNy);
        if (dist < bestDist) {
          bestDist = dist;
          bestKey = key;
        }
      });

      let key: string;
      if (bestKey !== null && bestDist < SLOT_MATCH_DIST) {
        key = bestKey;
      } else {
        // Fresh slot — base it on side label, append a suffix only if collision.
        key = cand.side;
        let suffix = 0;
        while (refreshedKeys.has(key) || this.bladeStates.has(key)) {
          suffix++;
          key = cand.side + suffix;
          if (suffix > 4) break;
        }
      }
      refreshedKeys.add(key);
      matches.push({ cand, key });
    }

    // Apply matches — smooth + write each blade state.
    for (const { cand, key } of matches) {
      const prev = this.bladeStates.get(key);
      let nx: number, ny: number, vx: number, vy: number;
      if (!prev) {
        nx = cand.rawNx;
        ny = cand.rawNy;
        vx = 0;
        vy = 0;
      } else {
        const smoothedNx = prev.nx + POS_EMA_ALPHA * (cand.rawNx - prev.nx);
        const smoothedNy = prev.ny + POS_EMA_ALPHA * (cand.rawNy - prev.ny);
        const dt = Math.max(0.001, (now - prev.lastUpdateTs) / 1000);
        const instVx = (smoothedNx - prev.nx) / dt;
        const instVy = (smoothedNy - prev.ny) / dt;
        vx = prev.vx * (1 - VEL_EMA_BLEND) + instVx * VEL_EMA_BLEND;
        vy = prev.vy * (1 - VEL_EMA_BLEND) + instVy * VEL_EMA_BLEND;
        nx = smoothedNx;
        ny = smoothedNy;
      }
      this.bladeStates.set(key, {
        handedness: cand.side,
        nx,
        ny,
        vx,
        vy,
        lastLiveTs: now,
        lastUpdateTs: now,
        live: true,
      });
    }

    // Reconcile unrefreshed blade states. Distinguish "user released gesture but hand
    // is still visible" (delete immediately) from "hand left frame" (dead-reckon).
    const toDelete: string[] = [];
    this.bladeStates.forEach((state, key) => {
      if (refreshedKeys.has(key)) return;
      // Is there a gesture-INACTIVE candidate near this blade's last position?
      // That means the user's hand is still visible — they intentionally released the gesture.
      let nearestInactive = Infinity;
      for (const c of uniqueCandidates) {
        if (c.active) continue;
        const dist = Math.hypot(state.nx - c.rawNx, state.ny - c.rawNy);
        if (dist < nearestInactive) nearestInactive = dist;
      }
      if (nearestInactive < SLOT_MATCH_DIST) {
        toDelete.push(key);
        return;
      }
      // Otherwise the hand left the frame — dead-reckon for up to DEAD_RECKON_MS.
      const age = now - state.lastLiveTs;
      if (age > DEAD_RECKON_MS) {
        toDelete.push(key);
        return;
      }
      const dt = Math.max(0.001, (now - state.lastUpdateTs) / 1000);
      state.nx += state.vx * dt;
      state.ny += state.vy * dt;
      const decay = Math.exp(-VEL_DECAY_HZ * dt);
      state.vx *= decay;
      state.vy *= decay;
      state.lastUpdateTs = now;
      state.live = false;
      state.nx = Math.max(-0.05, Math.min(1.05, state.nx));
      state.ny = Math.max(-0.05, Math.min(1.05, state.ny));
    });
    toDelete.forEach((k) => this.bladeStates.delete(k));

    this.lastResult = { landmarks, handedness, gestures };
    const anyExtrapolating = Array.from(this.bladeStates.values()).some((s) => !s.live);
    this.paintPreview(landmarks, handedness, gestures, anyExtrapolating);
  }

  private buildSnapshot(_now: number): TrackerSnapshot {
    const blades: BladePoint[] = [];
    let extrapolating = false;
    this.bladeStates.forEach((s, key) => {
      if (!s.live) extrapolating = true;
      blades.push({
        id: key,
        handedness: s.handedness,
        nx: Math.max(0, Math.min(1, s.nx)),
        ny: Math.max(0, Math.min(1, s.ny)),
        speed: Math.hypot(s.vx, s.vy),
        live: s.live,
      });
    });

    return {
      ready: true,
      blades,
      handsDetected: this.lastResult.landmarks.length,
      gesturesActive: this.lastResult.gestures.filter((g) => g.active).length,
      extrapolating,
    };
  }

  private detectScissorGesture(lm: V3[]): boolean {
    if (!lm || lm.length < 21) return false;
    const w = lm[WRIST];
    const d = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

    const indexRatio = d(lm[INDEX_TIP], w) / Math.max(1e-6, d(lm[INDEX_PIP], w));
    const middleRatio = d(lm[MIDDLE_TIP], w) / Math.max(1e-6, d(lm[MIDDLE_PIP], w));
    const ringRatio = d(lm[RING_TIP], w) / Math.max(1e-6, d(lm[RING_PIP], w));
    const pinkyRatio = d(lm[PINKY_TIP], w) / Math.max(1e-6, d(lm[PINKY_PIP], w));

    const indexUp = indexRatio > EXTENDED_RATIO;
    const middleUp = middleRatio > EXTENDED_RATIO;
    const ringDown = ringRatio < NOT_EXTENDED_RATIO;
    const pinkyDown = pinkyRatio < NOT_EXTENDED_RATIO;

    return indexUp && middleUp && ringDown && pinkyDown;
  }

  private paintPreview(
    landmarks: V3[][],
    handedness: string[],
    gestures: HandGestureState[],
    extrapolating: boolean,
  ) {
    const ctx = this.previewCtx;
    const w = this.previewCanvas.width;
    const h = this.previewCanvas.height;
    ctx.clearRect(0, 0, w, h);

    landmarks.forEach((lm, i) => {
      const active = gestures[i]?.active ?? false;
      const rawSide = handedness[i] ?? "Unknown";
      const displaySide =
        rawSide === "Left" ? "Right" : rawSide === "Right" ? "Left" : "Unknown";
      const baseColor = active
        ? "rgba(255,255,255,0.35)"
        : displaySide === "Left"
          ? "rgba(34,211,238,0.75)"
          : displaySide === "Right"
            ? "rgba(244,114,182,0.75)"
            : "rgba(255,255,255,0.6)";

      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = baseColor;
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
        ctx.stroke();
      }

      if (active) {
        ctx.shadowColor = "#55e16b";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "#55e16b";
        ctx.lineWidth = 3.5;
        for (const [a, b] of GESTURE_HIGHLIGHT_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(lm[a].x * w, lm[a].y * h);
          ctx.lineTo(lm[b].x * w, lm[b].y * h);
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
      }

      for (let k = 0; k < lm.length; k++) {
        const isTip = FINGERTIPS.includes(k);
        ctx.fillStyle = isTip ? "#fde047" : baseColor;
        ctx.beginPath();
        ctx.arc(lm[k].x * w, lm[k].y * h, isTip ? 3.5 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (active) {
        const bx = ((lm[INDEX_TIP].x + lm[MIDDLE_TIP].x) / 2) * w;
        const by = ((lm[INDEX_TIP].y + lm[MIDDLE_TIP].y) / 2) * h;
        ctx.save();
        ctx.shadowColor = "#55e16b";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#55e16b";
        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });

    ctx.save();
    ctx.font = "700 10px 'Plus Jakarta Sans', system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    const anyActive = gestures.some((g) => g.active);
    let msg: string;
    let color: string;
    if (extrapolating && !anyActive) {
      msg = "RECOVERING…";
      color = "#ffb874";
    } else if (anyActive) {
      const n = gestures.filter((g) => g.active).length;
      msg = `BLADE ACTIVE · ${n}`;
      color = "#55e16b";
    } else {
      msg = "MAKE SCISSOR GESTURE";
      color = "rgba(255,255,255,0.55)";
    }
    ctx.fillStyle = color;
    ctx.fillText(msg, w - 8, h - 6);
    ctx.restore();
  }
}
