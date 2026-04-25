---
meta:
  product: "Nostalgia AR"
  tagline: "Childhood games, played with your hands."
  category: "AR / motion-controlled web arcade"
  mood:
    - "phantom"
    - "neon-noir"
    - "retro-arcade"
    - "minimal-tech"
    - "vaporwave-residue"

colors:
  background:
    base: "#04060a"            # deepest, near-black, used behind everything
    surface: "#0a0f18"         # slightly raised; rarely seen flat — usually behind glass
    surface_elevated: "#111827" # innermost glow of the radial backdrop
    backdrop_gradient: "radial-gradient(ellipse 80% 60% at 50% 22%, #17223a 0%, #05070d 55%, #000 100%)"

  glass:
    base: "rgba(12, 18, 28, 0.55)"
    light: "rgba(18, 24, 36, 0.40)"
    deep: "rgba(8, 12, 20, 0.78)"
    stroke: "rgba(180, 200, 230, 0.12)"
    stroke_emphasis: "rgba(180, 200, 230, 0.22)"

  accent:
    cyan: "#22d3ee"            # primary signal — PLAY, scores, "your" team
    cyan_soft: "#7fdcff"       # halo / hover glow / connecting lines
    pink: "#f472b6"            # secondary signal — opponent, alternate game card
    pink_soft: "#fbb6ce"
    yellow: "#fde047"           # rare — fingertip dots, "hot" spark moments
    success: "#4ade80"
    warning: "#fbbf24"
    danger: "#f87171"

  text:
    primary: "#e6edf7"
    secondary: "#cdd7e6"
    dim: "#8b9ab3"
    faint: "#5b6b85"
    inverse: "#04060a"          # used on cyan-fill buttons

  divider: "rgba(255, 255, 255, 0.06)"

typography:
  family:
    display: "'Epilogue', 'Neue Haas Grotesk', 'Inter', system-ui, sans-serif"
    sans: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif"
    mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

  weight:
    regular: 400
    medium: 500
    semibold: 600
    bold: 700
    heavy: 800
    black: 900

  scale:
    eyebrow:
      family: sans
      size: "10px"
      weight: 700
      letter_spacing: "0.34em"
      line_height: 1.0
      transform: "uppercase"
      role: "small SECTION / STATE / META labels — chips, score labels, status"
    label:
      family: sans
      size: "12px"
      weight: 500
      letter_spacing: "0.04em"
      line_height: 1.4
    body:
      family: sans
      size: "14px"
      weight: 400
      letter_spacing: "0.0em"
      line_height: 1.55
    body_lg:
      family: sans
      size: "16px"
      weight: 400
      letter_spacing: "0.0em"
      line_height: 1.55
    button:
      family: sans
      size: "11px"
      weight: 700
      letter_spacing: "0.36em"
      transform: "uppercase"
    title_sm:
      family: display
      size: "22px"
      weight: 600
      letter_spacing: "-0.01em"
      line_height: 1.15
    title_md:
      family: display
      size: "32px"
      weight: 700
      letter_spacing: "-0.02em"
      line_height: 1.1
    title_lg:
      family: display
      size: "56px"
      weight: 800
      letter_spacing: "-0.03em"
      line_height: 1.0
    hero:
      family: display
      size: "104px"
      weight: 900
      letter_spacing: "-0.045em"
      line_height: 0.95
      style: "italic optional — for marquee word-marks"
    numeric_score:
      family: mono
      size: "52px"
      weight: 500
      letter_spacing: "0em"
      line_height: 1.0
      tabular: true
      role: "scoreboards, timers, large numerals"
    numeric_lg:
      family: mono
      size: "68px"
      weight: 300
      tabular: true
    numeric_xl:
      family: mono
      size: "92px"
      weight: 300
      tabular: true

space:
  unit: 4
  scale:
    "0": "0px"
    "1": "4px"
    "2": "8px"
    "3": "12px"
    "4": "16px"
    "5": "20px"
    "6": "24px"
    "7": "32px"
    "8": "40px"
    "9": "48px"
    "10": "64px"
    "11": "96px"
    "12": "128px"

radius:
  none: "0px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  "2xl": "22px"
  "3xl": "28px"
  pill: "999px"
  card_default: "18px"
  panel_default: "14px"
  chip_default: "999px"

border:
  hairline: "1px"
  thin: "1px"
  emphasis: "2px"

shadow:
  glass:
    value: "0 20px 60px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.05)"
    role: "default for any glass panel sitting over backdrop"
  card:
    value: "0 14px 40px rgba(0,0,0,0.50)"
  elevated:
    value: "0 30px 80px rgba(0,0,0,0.70)"
    role: "modals, the rising selection cards after the portal transition"
  glow_cyan_sm:
    value: "0 0 24px rgba(34, 211, 238, 0.35)"
  glow_cyan_lg:
    value: "0 0 60px rgba(34, 211, 238, 0.55)"
  glow_pink_sm:
    value: "0 0 24px rgba(244, 114, 182, 0.35)"
  glow_pink_lg:
    value: "0 0 60px rgba(244, 114, 182, 0.55)"
  glow_dual:
    value: "0 0 80px rgba(34, 211, 238, 0.40), 0 0 80px rgba(244, 114, 182, 0.30)"
    role: "portal ring, hero word-mark hover state"
  cta_press:
    value: "0 8px 24px rgba(34, 211, 238, 0.30)"

blur:
  none: "0px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "22px"

motion:
  duration:
    instant: "100ms"
    fast: "180ms"
    base: "260ms"
    slow: "480ms"
    very_slow: "900ms"
    cinematic: "1400ms"        # full hero → portal → cards transition
  easing:
    standard: "cubic-bezier(0.2, 0.7, 0.2, 1)"   # default for UI
    enter: "cubic-bezier(0.0, 0.0, 0.2, 1)"      # things appearing
    exit: "cubic-bezier(0.4, 0.0, 1, 1)"         # things leaving
    spring_soft: "cubic-bezier(0.2, 0.9, 0.3, 1.4)"
    portal_dolly: "cubic-bezier(0.55, 0.05, 0.25, 1)"  # camera dolly into portal
  property_groups:
    micro: "transform 180ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 180ms ease"
    panel: "transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 260ms ease"
    cinematic: "all 1400ms cubic-bezier(0.55, 0.05, 0.25, 1)"

z_index:
  backdrop: -10
  scene: 0
  surface: 10
  hud: 20
  modal: 40
  toast: 60
  cursor: 80

opacity:
  faint: 0.06
  subtle: 0.18
  glass: 0.55
  primary: 0.92
  full: 1.0

icon:
  stroke: "1.5px"
  size_sm: "16px"
  size_md: "20px"
  size_lg: "24px"
  size_xl: "32px"
  style: "outline-only, hairline strokes — do not use filled icons except for primary CTAs"

components:
  button_primary:
    background: "linear-gradient(135deg, #7fdcff 0%, #22d3ee 100%)"
    color: "#04060a"
    radius: "10px"
    padding: "14px 28px"
    typography: "button"
    shadow_hover: "cta_press"
    motion: "micro"
  button_ghost:
    background: "rgba(255,255,255,0.04)"
    color: "#e6edf7"
    border: "1px solid rgba(180,200,230,0.18)"
    radius: "10px"
    padding: "12px 22px"
    typography: "button"
  chip:
    background: "rgba(12, 18, 28, 0.55)"
    backdrop_blur: "10px"
    border: "1px solid rgba(180,200,230,0.12)"
    radius: "999px"
    padding: "6px 12px"
    typography: "eyebrow"
    color_default: "#cdd7e6"
    color_active: "#22d3ee"
    color_warn: "#fbbf24"
    color_error: "#f87171"
  glass_panel:
    background: "rgba(12, 18, 28, 0.55)"
    backdrop_blur: "14px"
    border: "1px solid rgba(180,200,230,0.12)"
    radius: "18px"
    padding: "18px 26px"
    shadow: "glass"
  scoreboard_card:
    background: "rgba(12, 18, 28, 0.55)"
    backdrop_blur: "14px"
    border: "1px solid rgba(180,200,230,0.12)"
    radius: "18px"
    padding: "14px 26px"
    shadow: "glass"
    accent_left: "#22d3ee"
    accent_right: "#f472b6"
    divider: "rgba(180, 200, 230, 0.12)"
  modal_card:
    background: "linear-gradient(180deg, rgba(18,24,36,0.95), rgba(10,14,22,0.97))"
    border: "1px solid rgba(180,200,230,0.12)"
    radius: "22px"
    padding: "32px 30px 28px"
    shadow: "elevated"
  game_card:
    background: "linear-gradient(180deg, rgba(18,24,36,0.92), rgba(10,14,22,0.95))"
    border: "1px solid rgba(180,200,230,0.12)"
    radius: "22px"
    padding: "32px"
    aspect_ratio: "4 / 5"
    shadow: "card"
    hover_shadow: "glow_dual"
    hover_translate_y: "-6px"
    motion: "panel"

scene_3d:
  scene_background: "#000000 with radial-gradient overlay (matches `colors.background.backdrop_gradient`)"
  fog:
    color: "#05070b"
    near: 8
    far: 22
  lighting:
    ambient:
      color: "#6b7fa8"
      intensity: 0.35
    key:
      color: "#ffffff"
      intensity: 1.6
      position_hint: "above-right"
    rim_cyan:
      color: "#7fdcff"
      intensity: 0.9
      position_hint: "behind-left"
    fill_pink:
      color: "#f472b6"
      intensity: 0.35
      position_hint: "side-right"
  particles:
    color_primary: "#7fdcff"
    color_secondary: "#f472b6"
    size: "2..6 px subpixel sprites"
    density: "150–300 particles, sparse"
    motion: "very slow drift + parallax to mouse"
  portal_ring:
    radius: "ramps from 0 to viewport-spanning during transition"
    color: "linear gradient cyan → pink along arc"
    glow: "shadow.glow_dual"
    composition: "thin (4–6 px) ring with bloom; multiple concentric rings on emit"

surface_treatments:
  scanline_overlay:
    description: "Optional very-subtle horizontal scanline texture on backdrop for retro-arcade feel"
    opacity: 0.03
    spacing: "2px"
  noise_overlay:
    description: "Static film grain over the entire viewport"
    opacity: 0.04
    blend: "overlay"
  vignette:
    inner_alpha: 0
    outer_alpha: 0.55
    role: "always present — focuses eye on stage center"

states:
  default:
    transition: "micro"
  hover:
    elevation_delta: "+4px translate-y"
    glow_added: "glow_cyan_sm"
  active:
    scale: 0.97
  disabled:
    opacity: 0.35
    saturation: 0.6
  focus_visible:
    outline: "2px solid #22d3ee"
    outline_offset: "3px"
---

# Nostalgia AR — Visual Identity

## What this product is

Nostalgia AR is a small web arcade you play with your hands. It opens its
camera, watches your fingers, and turns swings and swipes into game input
— right now there are two cabinets in the lobby (a table-tennis simulator
and a fruit-slicing game). The launcher is the lobby itself: a dark,
cinematic stage where you press PLAY and a glowing portal pulls you
forward into a screen where you choose your cabinet.

The design has to do two things at once that don't usually go together:
feel like **modern minimal tech** (so the camera/AR layer reads as
deliberate and trustworthy, not gimmicky) and carry a **trace of arcade
nostalgia** (the reason the product exists is to revisit familiar games
through a new input). The look that resolves both is **neon-noir**: black
canvas, neon cyan and magenta as the only saturated colors, generous
negative space, monospace numerals, and frosted glass for every surface
that holds information. It is closer to a high-end broadcast overlay than
a video-game HUD. Vaporwave is the residue, not the destination.

## Mood & atmosphere

Imagine an empty arena at midnight. The stage is dark and gently lit
from above. Two thin colored lights — one cyan, one magenta — wash the
edges and never quite meet in the middle. There is a low, soft fog at
ankle height. Particles drift slowly. The only typography you see is
either tiny, all-caps eyebrows in metered letter-spacing, or
oversized italic word-marks that feel cut from black foil. Nothing
shouts. The product earns the user's attention by being still and
confident; the moment they touch PLAY, all of that stillness releases
forward through a glowing ring.

The site is **never bright** and **never colored**. Color appears only
where it conveys meaning — a player's team, a state change, a glowing
edge of an active control. Treat saturated color as expensive. A page
that uses only the deep-navy palette plus white text is correct. A page
that uses cyan in three places is approaching its budget.

## Surfaces

Almost every interactive surface is **glass**: a low-opacity dark fill
(rgba(12,18,28,0.55)), a 1-pixel hairline border the color of moonlight
on a windowpane, and a backdrop blur of about 10–14 pixels. Glass sits
**on** the dark stage, not over content the user needs to read. Glass
panels have soft, deep, low-contrast drop-shadows so they appear to
float above the stage without casting hard ground shadows.

There is no flat solid card anywhere in the product. If a surface
appears to be solid (e.g. the modal card), it is actually a vertical
gradient between two near-black blues, edged by the same hairline
border. Hard fills break the spell.

Buttons split into two species:
- **Primary CTA** — a horizontal cyan→white-cyan gradient pill with
  near-black text. Uppercase, heavy letter-spacing. The only place the
  brightest cyan appears at full saturation. Use sparingly: usually one
  per screen.
- **Ghost button** — transparent with a moonlight border. Uppercase
  text in primary text color. Hover lifts it 1–2 px and adds a faint
  cyan glow.

## Typography

Three families, three jobs:
- **Display** (Epilogue / Neue Haas Grotesk style) — only for hero
  word-marks, marquee titles, and modal headlines. Heavy weights (800,
  900), tight negative tracking, often italicized for the hero
  word-mark. Reserved.
- **Sans** (Plus Jakarta Sans / Inter) — everything else. Body, labels,
  buttons, eyebrows, chips. The eyebrow style is a signature: 10–11px,
  weight 700, letter-spacing 0.32–0.36em, all caps. It's how the
  product whispers "section heading" or "state."
- **Mono** (IBM Plex Mono, tabular figures) — every number that the
  user might watch change in real time. Scores, timers, FPS,
  coordinates, countdowns. Numbers in the sans family are forbidden
  for live readouts; they jitter and ruin the broadcast feel.

Type is otherwise restrained: hierarchies emerge from size, weight, and
the eyebrow rhythm — not from color. Avoid colored body text.

## Color logic

There are exactly two saturated brand colors and they have meaning:
- **Cyan (#22d3ee)** — *you*, *primary*, *PLAY*, *forward motion*.
- **Magenta (#f472b6)** — *opponent*, *secondary*, *the other game*,
  *opposition*.

When both are present, they read as two parties on opposite sides of
something — opposite ends of a table, opposite cards in the selection
screen, opposite halves of the portal's gradient ring. They never blend
into purple; their meeting point is always interrupted by a divider, a
gap, or pure white.

Yellow (#fde047) is a third accent reserved for **moments**: a fingertip
dot when tracking locks, a spark on a successful hit, the exclamation
of a combo. It should never appear as a standing UI color — it appears
and fades.

Status colors (green/amber/red) are present in the system for tracking
state, but are themselves desaturated and used as **chip text colors**,
not as fills.

## Hero scene (the landing page)

The visitor opens the site to a single full-viewport stage. In the
center, the **NOSTALGIA AR** word-mark sits in display italic, almost
black-on-black except for a faint cyan rim-glow on the leading edge of
each letter. Below it, a small eyebrow-styled tagline and a single
primary CTA pill that reads `PLAY`. Around the word-mark, a slow swarm
of cyan and magenta particles drifts; the particles are sub-pixel small
and never crowd the type — closer to a lit dust than a visual effect.

The stage uses the radial backdrop gradient (deep blue at top center
falling to true black at the corners), a film-grain overlay at 4%
opacity, and an optional very faint scanline texture at 3% opacity.
The vignette is always on.

The cursor is the system cursor by default — not hidden — but it
acquires a subtle cyan halo when over the PLAY button.

## Portal transition (PLAY → selection screen)

This is the signature moment. When the user clicks PLAY:

1. The word-mark recedes (z-translates back, fades).
2. A thin glowing ring appears at the center of the screen, no thicker
   than 4–6 pixels, gradient-stroked from cyan to magenta around its
   circumference. It pulses once.
3. The camera **dollies forward** into the ring over ~1.4 seconds with
   the `portal_dolly` easing curve. The ring's apparent radius
   accelerates outward as the camera approaches; particles streak past
   the lens.
4. As the ring fills the viewport, a brief whiteout (≤80ms, very
   restrained — closer to a soft bloom than a flash) wipes through.
5. On the other side, the **two game cards rise from the bottom**,
   staggered by 80ms, with the panel motion curve. They settle in.

This sequence is the product's hero brand moment. It plays once per
session by default and can be skipped on subsequent visits.

## Selection screen

After the portal, the user lands on a still, quieter version of the
same dark stage. Two **game cards** are arranged side-by-side, separated
by a luminous vertical hairline that hints at the portal's gradient
(cyan above, magenta below, fading at the meeting point).

Each card is a glass panel with:
- A small eyebrow chip at top-left identifying the game (e.g.
  `01 · TABLE TENNIS`, `02 · FRUIT NINJA`).
- A large display title in the bottom third.
- A single-line body description in dim text.
- A primary CTA pill at the bottom (`PLAY`).
- A subtle translucent illustration or animated 3D prop floating in the
  upper portion (a paddle for one card, a sliced fruit silhouette for
  the other) — never photographic, always abstract / line-art / glass.
- On hover: card lifts 6 px, gains the dual cyan+magenta soft glow, and
  the prop inside it stirs to life.

The cards are **not skeuomorphic** screenshots of the games. They are
their own object — calm portals, not posters.

## Information density

The product errs toward emptiness. A page should feel like a stage
with one thing on it. Information density rises only inside live
gameplay HUDs (scoreboard, rally counter, hand-tracking PIP), and even
there each chunk gets its own glass panel with breathing room.

Padding inside glass panels uses the spacing scale — small chips at
6–10 px vertical, panels at 14–18 px, modals at 28–32 px. Cards of
equal class line up on a baseline. Asymmetry is allowed at the page
level (off-center heroes are fine) but never inside a single component.

## Motion principles

Three speeds, used like punctuation:
- **Micro** (~180 ms) for any control state change — hover, focus,
  press, chip color shift. Should feel like the UI breathing.
- **Panel** (~260 ms) for elements entering or leaving the page —
  scoreboard appearing, modal opening, card rising. Curve is the
  standard out-cubic.
- **Cinematic** (~1400 ms) reserved for the portal transition and
  end-of-match moments. Uses a more dramatic in-out curve.

Default to easing-out, never linear. Springiness is allowed for
celebratory moments only (combo popups, point-scored banners) and uses
the `spring_soft` curve. The product's overall motion vocabulary is
**confident and unhurried**, not bouncy or excitable.

## What to avoid

- **Bright pure white backgrounds.** The site is a stage; white in any
  large area instantly reads as "different product."
- **Multi-color gradients beyond the cyan↔magenta pairing.** No
  rainbow accents, no orange, no purple-blue blends.
- **Photographic imagery.** Anything raster-photo breaks the
  abstract-glass tone. Prefer line art, low-poly 3D, or matte renders.
- **Skeuomorphic textures** (wood grain, paper, leather). The product's
  warmest surface is frosted glass.
- **Filled icons except inside the primary CTA.** Stroke icons only.
- **Drop shadows on text** (except the optional very-subtle one on
  display titles). Glow yes, shadow no.
- **Animated background loops that demand attention.** Particles drift,
  but they never compete with the foreground.
- **Sans-family numerals for live-updating values.** Always mono.

## Voice

The product writes the way it looks: short sentences, lower-case where
possible, no exclamation marks outside in-game celebratory popups. The
landing page tagline is one line. Buttons say one word. Microcopy
explains *what just happened* not *what to do next*. The product
trusts the user.

## Summary

The look is a midnight arena, lit by two opposed neons, viewed through
glass. Type is heavy or hairline, never in between. Numbers are
monospace and proud. Color is rationed. Motion is restrained until one
cinematic moment — the portal — that releases all of that restraint
forward into the experience proper.
