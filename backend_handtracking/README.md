# backend_handtracking

Browser hand + elbow tracker using MediaPipe Pose Landmarker.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173 and allow camera access.

## What it does

- Captures webcam at 640×480 / 30 fps
- Runs MediaPipe Pose Landmarker (lite) with GPU delegate
- Draws shoulder → elbow → wrist chain for both arms on a mirrored overlay
- Shows live world-coordinate XYZ (meters, hip-origin) for each joint
- EMA smoothing (alpha 0.45) on displayed landmarks

## Files

- `src/main.ts` — camera, pose loop, overlay draw, readout
- `index.html` — layout + styles
- `public/models/pose_landmarker_lite.task` — ~6 MB model, served at `/models/…`
