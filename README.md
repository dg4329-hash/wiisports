# Nostalgia AR: childhood arcade games, played with your hands

**Play it:** https://wiisports.vercel.app (webcam required; Chrome or Edge recommended)

Nostalgia AR is a browser arcade of motion-controlled games. Your webcam is the controller: MediaPipe tracks your hands and
arms in real time, entirely in the browser, and you play by swinging or slicing in the air. There is nothing to install
and no special hardware.

## Games

| Game | Folder | Controls | Live |
|------|--------|----------|------|
| **Lobby**: cinematic landing page, game picker, Google sign-in, live leaderboard | [`nostalgia-ar/`](nostalgia-ar) | mouse | [wiisports.vercel.app](https://wiisports.vercel.app) |
| **Table Tennis**: 3D rally against a CPU opponent | [`backend_handtracking/`](backend_handtracking) | swing your arm like a paddle | [pingpongar.vercel.app](https://pingpongar.vercel.app) |
| **Fruit slicing**: slice fruit as it flies up the screen | [`frontend_game/`](frontend_game) | slice with your index finger | [fruitninjaar.vercel.app](https://fruitninjaar.vercel.app) |
| **Basketball** (prototype, not linked from the lobby yet) | [`basketball/`](basketball) | shooting motion: hand under the ball, wrist flick to release | local only |

## How it works

- **Tracking:** [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) Pose Landmarker (shoulder, elbow, wrist)
  and Hand Landmarker (fingertips) run on the GPU delegate at webcam frame rate. Model files are served statically from
  each game's `public/models/`.
- **Table Tennis:** the tracked wrist and elbow drive a paddle and an avatar in a Three.js scene. Custom ball physics
  handle bounces and paddle hits, and a CPU opponent plans its returns (with a set miss rate so
  matches stay winnable). Scoring follows table-tennis rules.
- **Fruit slicing:** the index fingertip draws a blade trail on a 2D canvas, and fruit is scored when the trail crosses it.
  Combos add up.
- **Lobby:** React landing page with a portal "fly-in" transition video and two game cards. Supabase handles Google OAuth
  and a `scores` table; the leaderboard updates live through Supabase Realtime.

## Tech stack

TypeScript · Vite · React 18 (lobby) · Three.js · MediaPipe Tasks Vision · Supabase (Auth, Postgres, Realtime) · Vercel

## Run locally

Each folder is its own Vite project:

```bash
cd nostalgia-ar            # or backend_handtracking, frontend_game, basketball
npm install
npm run dev                # lobby :5180 · table tennis :5173 · fruit :5174 · basketball :5176
```

Open the printed URL and allow camera access. The camera API needs `localhost` or HTTPS.

### Environment variables (optional)

Create a `.env.local` in a project folder. Without the Supabase variables the games still run, and only the leaderboard
is offline.

| Variable | Used by | Purpose |
|----------|---------|---------|
| `VITE_SUPABASE_URL` | all | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | all | Supabase anon (public) key |
| `VITE_PINGPONG_URL` | lobby | Table Tennis URL (default `/pingpong/`) |
| `VITE_FRUIT_URL` | lobby | Fruit game URL (default `/fruit/`) |
| `VITE_LOBBY_URL` | games | "Back to lobby" link |

## Deploy

Each folder deploys as a separate Vercel project (framework preset: Vite; set the Root Directory to the folder). The
game projects send `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers (see each `vercel.json`) for
the MediaPipe WASM runtime. See [`nostalgia-ar/README.md`](nostalgia-ar/README.md) for ways to connect the lobby to the games.

## Team

Built in April 2026 by Dev Gadde and Abhiviraj G. Design system: [`DESIGN.md`](DESIGN.md).

## Status

Playable prototype. Table Tennis, the fruit game and the lobby are deployed; Basketball is a work in progress.
This is a fan project and is not affiliated with Nintendo or any game publisher.
