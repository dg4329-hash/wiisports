# Nostalgia AR — Lobby

The landing site for **Nostalgia AR**: childhood games, played with your hands.
Cinematic dark stage with cyan/magenta neon accents, drifting particles, and a
portal-dolly transition that flies you forward into a two-card game-selection
screen.

Built from a Claude Design handoff, ported to a Vite + React + TypeScript
project so it can build cleanly and deploy to Vercel.

## Run

```bash
npm install
npm run dev   # http://localhost:5180
```

## Build

```bash
npm run build      # → dist/
npm run preview    # serve dist/ locally
```

## Game launch URLs

The PLAY buttons on the two game cards navigate to:

- `VITE_PINGPONG_URL` (default: `/pingpong/`)
- `VITE_FRUIT_URL`    (default: `/fruit/`)

**Until the two games are deployed and these URLs point at them, clicking
PLAY will 404.** That's expected: the lobby ships standalone first, then
gets wired to the games.

### Three ways to wire the games up

**Option A — separate Vercel projects (simplest).** Deploy each game as its
own Vercel project, then on the lobby's Vercel project, add Environment
Variables:

```
VITE_PINGPONG_URL  =  https://nostalgia-pong.vercel.app/
VITE_FRUIT_URL     =  https://nostalgia-fruit.vercel.app/
```

Redeploy the lobby. PLAY buttons now navigate cross-domain to each game.

**Option B — Vercel rewrites (one domain, no env vars).** Deploy each game
to its own Vercel project, then add to `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/pingpong/(.*)", "destination": "https://nostalgia-pong.vercel.app/$1" },
    { "source": "/fruit/(.*)",    "destination": "https://nostalgia-fruit.vercel.app/$1" }
  ]
}
```

Leave the env vars unset and the default `/pingpong/` / `/fruit/` paths
will hit the rewrites. Single domain, single canonical URL.

**Option C — local one-shot build for a demo.** Override at build time:

```bash
VITE_PINGPONG_URL="https://nostalgia-pong.vercel.app/" \
VITE_FRUIT_URL="https://nostalgia-fruit.vercel.app/" \
npm run build
```

## Structure

```
src/
├── App.tsx              # phase machine + stage composition
├── main.tsx             # React mount
├── phase.ts             # Phase = "idle" | "opening" | "dolly" | "flash" | "select"
├── tokens.css           # design tokens + every named class
└── components/
    ├── Particles.tsx    # drifting cyan/magenta dust w/ mouse parallax
    ├── Streaks.tsx      # vertical streak lines that fly past during dolly
    ├── Portal.tsx       # gradient ring that opens then expands to viewport
    ├── Hero.tsx         # wordmark + tagline + PLAY/HOW IT WORKS buttons
    └── GameCard.tsx     # two cards on selection screen
        ├── PaddleProp.tsx
        └── FruitProp.tsx
```

## The portal sequence (~1.4s)

```
idle        click PLAY ─►   opening (380ms)  ─►   dolly (~1090ms)
hero word-mark              gradient ring         ring expands viewport-wide,
+ tagline + PLAY            appears, pulses       streaks fly past,
                                                  hero z-translates back
                                                            │
                                                            ▼
                                          flash (~280ms)  ─►  select
                                          white bloom        cards rise
                                          peak               from below
```
