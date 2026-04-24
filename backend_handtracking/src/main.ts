import { FilesetResolver, PoseLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";

const video = document.getElementById("cam") as HTMLVideoElement;
const canvas = document.getElementById("overlay") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const readout = document.getElementById("readout") as HTMLPreElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

// Pose landmark indices
const LEFT_SHOULDER = 11, RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13, RIGHT_ELBOW = 14;
const LEFT_WRIST_POSE = 15, RIGHT_WRIST_POSE = 16;

// Hand landmark indices (21 per hand)
const THUMB_TIP = 4, INDEX_TIP = 8, MIDDLE_TIP = 12, RING_TIP = 16, PINKY_TIP = 20;
const FINGERTIPS = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];

// Bone connections for drawing the hand skeleton
const HAND_CONNECTIONS: Array<[number, number]> = [
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

type V3 = { x: number; y: number; z: number; visibility?: number };

const setStatus = (s: string) => { statusEl.textContent = s; };

async function start() {
  setStatus("requesting camera…");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, frameRate: 30 },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;

  setStatus("loading models…");
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
  setStatus("tracking");

  // EMA smoother keyed by source+index
  const smoothed = new Map<string, V3>();
  const alpha = 0.5;
  const smooth = (key: string, p: V3): V3 => {
    const prev = smoothed.get(key);
    if (!prev) { smoothed.set(key, { ...p }); return p; }
    const next: V3 = {
      x: prev.x + alpha * (p.x - prev.x),
      y: prev.y + alpha * (p.y - prev.y),
      z: prev.z + alpha * (p.z - prev.z),
      visibility: p.visibility,
    };
    smoothed.set(key, next);
    return next;
  };

  const toPx = (p: V3): [number, number] => [p.x * canvas.width, p.y * canvas.height];

  const drawArm = (
    lm: V3[],
    shoulderIdx: number,
    elbowIdx: number,
    wristIdx: number,
    color: string,
  ) => {
    const shoulder = smooth(`pose:${shoulderIdx}`, lm[shoulderIdx]);
    const elbow = smooth(`pose:${elbowIdx}`, lm[elbowIdx]);
    const wrist = smooth(`pose:${wristIdx}`, lm[wristIdx]);

    const [sx, sy] = toPx(shoulder);
    const [ex, ey] = toPx(elbow);
    const [wx, wy] = toPx(wrist);

    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.lineTo(wx, wy);
    ctx.stroke();

    const dots: Array<[number, number, number, string, string]> = [
      [sx, sy, 6, "#ffffff", color],
      [ex, ey, 10, color, "#ffffff"],
      [wx, wy, 12, "#fde047", color],
    ];
    for (const [x, y, r, fill, stroke] of dots) {
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  };

  const drawHand = (lm: V3[], handIdx: number, color: string) => {
    const sm = lm.map((p, i) => smooth(`hand${handIdx}:${i}`, p));

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    for (const [a, b] of HAND_CONNECTIONS) {
      const [ax, ay] = toPx(sm[a]);
      const [bx, by] = toPx(sm[b]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    for (let i = 0; i < sm.length; i++) {
      const [x, y] = toPx(sm[i]);
      const isTip = FINGERTIPS.includes(i);
      ctx.fillStyle = isTip ? "#fde047" : color;
      ctx.beginPath();
      ctx.arc(x, y, isTip ? 6 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const fmt = (p: V3 | undefined) =>
    p
      ? `x ${p.x.toFixed(3).padStart(7)}  y ${p.y.toFixed(3).padStart(7)}  z ${p.z.toFixed(3).padStart(7)}`
      : "—";

  const getHandedness = (handResult: any, i: number): string => {
    const h = handResult.handednesses?.[i]?.[0] ?? handResult.handedness?.[i]?.[0];
    return h?.categoryName ?? "?";
  };

  const updateReadout = (
    poseWorld: V3[] | undefined,
    handResult: any,
    fpsShown: number,
  ) => {
    const parts: string[] = [`fps: ${fpsShown}`, ""];

    parts.push("POSE · meters, hip-origin");
    if (poseWorld) {
      parts.push("LEFT arm");
      parts.push(`  shoulder  ${fmt(poseWorld[LEFT_SHOULDER])}`);
      parts.push(`  elbow     ${fmt(poseWorld[LEFT_ELBOW])}`);
      parts.push(`  wrist     ${fmt(poseWorld[LEFT_WRIST_POSE])}`);
      parts.push("RIGHT arm");
      parts.push(`  shoulder  ${fmt(poseWorld[RIGHT_SHOULDER])}`);
      parts.push(`  elbow     ${fmt(poseWorld[RIGHT_ELBOW])}`);
      parts.push(`  wrist     ${fmt(poseWorld[RIGHT_WRIST_POSE])}`);
    } else {
      parts.push("  (no body detected)");
    }

    parts.push("");
    parts.push("HANDS · meters, wrist-origin");
    const handWorlds: V3[][] = handResult.worldLandmarks ?? [];
    if (handWorlds.length === 0) {
      parts.push("  (no hands detected)");
    } else {
      handWorlds.forEach((lm, i) => {
        const side = getHandedness(handResult, i);
        parts.push(`[${side}]`);
        parts.push(`  thumb   ${fmt(lm[THUMB_TIP])}`);
        parts.push(`  index   ${fmt(lm[INDEX_TIP])}`);
        parts.push(`  middle  ${fmt(lm[MIDDLE_TIP])}`);
        parts.push(`  ring    ${fmt(lm[RING_TIP])}`);
        parts.push(`  pinky   ${fmt(lm[PINKY_TIP])}`);
      });
    }

    readout.textContent = parts.join("\n");
  };

  let frames = 0;
  let fpsShown = 0;
  let lastFpsTime = performance.now();
  let lastVideoTime = -1;

  const tick = () => {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const ts = performance.now();
      const poseRes = pose.detectForVideo(video, ts);
      const handRes = hands.detectForVideo(video, ts);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const poseLm: V3[] | undefined = poseRes.landmarks?.[0];
      const poseWorld: V3[] | undefined = poseRes.worldLandmarks?.[0];
      if (poseLm) {
        drawArm(poseLm, LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST_POSE, "#22d3ee");
        drawArm(poseLm, RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST_POSE, "#f472b6");
      }

      const handLmList: V3[][] = handRes.landmarks ?? [];
      handLmList.forEach((lm, i) => {
        const side = getHandedness(handRes, i);
        const color = side === "Left" ? "#22d3ee" : side === "Right" ? "#f472b6" : "#ffffff";
        drawHand(lm, i, color);
      });

      updateReadout(poseWorld, handRes, fpsShown);

      frames++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        fpsShown = Math.round((frames * 1000) / (now - lastFpsTime));
        frames = 0;
        lastFpsTime = now;
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

start().catch((err) => {
  console.error(err);
  setStatus(`error: ${err?.message ?? err}`);
  readout.textContent = String(err?.stack ?? err);
});
