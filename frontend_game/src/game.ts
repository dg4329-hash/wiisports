import type { BladePoint, TrackerSnapshot } from "./tracking";

type FruitKind = {
  name: string;
  emoji: string;
  color: string;
  juice: string;
  score: number;
  radius: number;
};

const FRUIT_KINDS: FruitKind[] = [
  { name: "apple",     emoji: "🍎", color: "#ff3b3b", juice: "#ff6b6b", score: 10, radius: 64 },
  { name: "strawberry",emoji: "🍓", color: "#ff4563", juice: "#ff8aa0", score: 10, radius: 58 },
  { name: "orange",    emoji: "🍊", color: "#ff9422", juice: "#ffb766", score: 10, radius: 64 },
  { name: "lemon",     emoji: "🍋", color: "#ffd93d", juice: "#ffe680", score: 10, radius: 62 },
  { name: "watermelon",emoji: "🍉", color: "#ff5c77", juice: "#ff8aa0", score: 15, radius: 74 },
  { name: "pineapple", emoji: "🍍", color: "#ffd23f", juice: "#ffe680", score: 20, radius: 78 },
  { name: "grape",     emoji: "🍇", color: "#9b5de5", juice: "#c77dff", score: 10, radius: 58 },
  { name: "kiwi",      emoji: "🥝", color: "#7bc74d", juice: "#b8e986", score: 15, radius: 60 },
  { name: "peach",     emoji: "🍑", color: "#ffb385", juice: "#ffd0a8", score: 10, radius: 64 },
];
const BOMB_KIND = { name: "bomb", emoji: "💣", color: "#111", radius: 52 };

type Vec = { x: number; y: number };

type Fruit = {
  kind: FruitKind;
  pos: Vec;
  vel: Vec;
  angle: number;
  angVel: number;
  alive: boolean;
  sliced: boolean;
};

type Bomb = {
  pos: Vec;
  vel: Vec;
  angle: number;
  angVel: number;
  alive: boolean;
  sliced: boolean;
};

type Half = {
  emoji: string;
  side: "L" | "R";
  pos: Vec;
  vel: Vec;
  angle: number;
  angVel: number;
  radius: number;
  life: number; // seconds remaining
};

type Particle = {
  pos: Vec;
  vel: Vec;
  color: string;
  size: number;
  life: number;
  maxLife: number;
};

type Popup = {
  text: string;
  pos: Vec;
  vel: Vec;
  color: string;
  life: number;
  maxLife: number;
  size: number;
};

type TrailPoint = {
  x: number;
  y: number;
  t: number;
  bladeId: string;
};

export type GameEvents = {
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onCombo: (count: number) => void;
  onGameOver: (summary: {
    score: number;
    fruitsSliced: number;
    bestCombo: number;
    bombsHit: number;
  }) => void;
};

export class FruitNinjaGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;

  private fruits: Fruit[] = [];
  private bombs: Bomb[] = [];
  private halves: Half[] = [];
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private trail: TrailPoint[] = [];

  private score = 0;
  private lives = 3;
  private running = false;
  private lastTs = 0;

  private nextSpawnAt = 0;
  private lastSliceTs = 0;
  private currentCombo = 0;
  private bestCombo = 0;
  private fruitsSliced = 0;
  private bombsHit = 0;

  private screenFlash = 0; // 0..1 red flash for bomb hits

  private readonly gravity = 850; // px/s^2 — lower = longer airtime
  private readonly trailMs = 260;

  // Play-area inset (fraction of viewport). Fruits/bombs spawn within these bounds so
  // the user never has to reach the camera-frame edges where hand tracking degrades.
  private readonly insetX = 0.16;
  private readonly insetTop = 0.12;
  private readonly insetBottom = 0.16;
  private readonly comboWindowMs = 700;

  constructor(canvas: HTMLCanvasElement, private events: GameEvents) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("could not get 2d context for game canvas");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  start() {
    this.fruits = [];
    this.bombs = [];
    this.halves = [];
    this.particles = [];
    this.popups = [];
    this.trail = [];
    this.score = 0;
    this.lives = 3;
    this.running = true;
    this.lastTs = performance.now();
    this.nextSpawnAt = this.lastTs + 600;
    this.currentCombo = 0;
    this.bestCombo = 0;
    this.fruitsSliced = 0;
    this.bombsHit = 0;
    this.screenFlash = 0;
    this.events.onScoreChange(this.score);
    this.events.onLivesChange(this.lives);
  }

  isRunning() {
    return this.running;
  }

  /** Drive one frame. Caller provides blade snapshot. Handles its own rAF loop externally. */
  tick(now: number, snapshot: TrackerSnapshot) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTs) / 1000));
    this.lastTs = now;

    if (this.running) {
      this.maybeSpawn(now);
      this.updateEntities(dt);
      this.updateBlades(now, snapshot.blades);
      this.detectSlices(now, snapshot.blades);
      this.cullOffscreen();
      if (this.currentCombo > 0 && now - this.lastSliceTs > this.comboWindowMs) {
        this.currentCombo = 0;
      }
    }

    this.updateEffects(dt);
    this.render(now, snapshot);
  }

  // --- spawning ---

  private maybeSpawn(now: number) {
    if (now < this.nextSpawnAt) return;
    const wave = 1 + Math.random() * 2; // 1..3 things per wave
    const n = Math.max(1, Math.floor(wave));
    const bombChance = 0.22;
    for (let i = 0; i < n; i++) {
      if (Math.random() < bombChance) {
        this.spawnBomb();
      } else {
        this.spawnFruit();
      }
    }
    // next wave in 0.85s..1.4s
    this.nextSpawnAt = now + 850 + Math.random() * 550;
  }

  private randomToss(): { pos: Vec; vel: Vec; angVel: number } {
    // spawn from bottom offscreen, aim upward into the inset stage
    const marginX = this.width * this.insetX;
    const playWidth = this.width - 2 * marginX;
    const side = Math.random(); // 0..1 across playable width
    const startX = marginX + side * playWidth;
    const startY = this.height + 80;
    // Target apex anywhere in the upper half of the playable area, clamped to the inset.
    const rawTargetX = startX + (Math.random() - 0.5) * Math.min(500, playWidth * 0.7);
    const targetX = Math.max(marginX + 40, Math.min(this.width - marginX - 40, rawTargetX));
    const playHeight = this.height * (1 - this.insetTop - this.insetBottom);
    const targetY = this.height * this.insetTop + playHeight * (0.05 + Math.random() * 0.25);
    // kinematics: choose upward velocity so apex hits targetY
    const dy = startY - targetY;
    const v0y = -Math.sqrt(2 * this.gravity * dy);
    const tApex = Math.abs(v0y) / this.gravity;
    const v0x = (targetX - startX) / tApex;
    const angVel = (Math.random() - 0.5) * 6.5;
    return { pos: { x: startX, y: startY }, vel: { x: v0x, y: v0y }, angVel };
  }

  private spawnFruit() {
    const kind = FRUIT_KINDS[Math.floor(Math.random() * FRUIT_KINDS.length)];
    const toss = this.randomToss();
    this.fruits.push({
      kind,
      pos: toss.pos,
      vel: toss.vel,
      angle: Math.random() * Math.PI * 2,
      angVel: toss.angVel,
      alive: true,
      sliced: false,
    });
  }

  private spawnBomb() {
    const toss = this.randomToss();
    this.bombs.push({
      pos: toss.pos,
      vel: toss.vel,
      angle: Math.random() * Math.PI * 2,
      angVel: toss.angVel * 0.5,
      alive: true,
      sliced: false,
    });
  }

  // --- entity update ---

  private updateEntities(dt: number) {
    const applyPhysics = (e: { pos: Vec; vel: Vec; angle: number; angVel: number }) => {
      e.vel.y += this.gravity * dt;
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
      e.angle += e.angVel * dt;
    };
    for (const f of this.fruits) if (f.alive) applyPhysics(f);
    for (const b of this.bombs) if (b.alive) applyPhysics(b);
    for (const h of this.halves) {
      h.vel.y += this.gravity * dt;
      h.pos.x += h.vel.x * dt;
      h.pos.y += h.vel.y * dt;
      h.angle += h.angVel * dt;
      h.life -= dt;
    }
    for (const p of this.particles) {
      p.vel.y += this.gravity * 0.6 * dt;
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
    }
    for (const p of this.popups) {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
    }
  }

  private updateBlades(now: number, blades: BladePoint[]) {
    for (const b of blades) {
      const x = b.nx * this.width;
      const y = b.ny * this.height;
      this.trail.push({ x, y, t: now, bladeId: b.id });
    }
    const cutoff = now - this.trailMs;
    // trim old trail
    while (this.trail.length && this.trail[0].t < cutoff) this.trail.shift();
  }

  // --- slice detection ---

  private detectSlices(now: number, blades: BladePoint[]) {
    if (blades.length === 0) return;
    const bladePx = blades.map((b) => ({ x: b.nx * this.width, y: b.ny * this.height, id: b.id }));

    for (const fruit of this.fruits) {
      if (!fruit.alive || fruit.sliced) continue;
      for (const bp of bladePx) {
        const dx = bp.x - fruit.pos.x;
        const dy = bp.y - fruit.pos.y;
        if (dx * dx + dy * dy <= fruit.kind.radius * fruit.kind.radius) {
          this.sliceFruit(fruit, now);
          break;
        }
      }
    }
    for (const bomb of this.bombs) {
      if (!bomb.alive || bomb.sliced) continue;
      for (const bp of bladePx) {
        const dx = bp.x - bomb.pos.x;
        const dy = bp.y - bomb.pos.y;
        if (dx * dx + dy * dy <= BOMB_KIND.radius * BOMB_KIND.radius) {
          this.hitBomb(bomb);
          break;
        }
      }
    }
  }

  private sliceFruit(fruit: Fruit, now: number) {
    fruit.sliced = true;
    fruit.alive = false;
    this.fruitsSliced++;

    // combo
    if (now - this.lastSliceTs <= this.comboWindowMs) {
      this.currentCombo++;
    } else {
      this.currentCombo = 1;
    }
    this.lastSliceTs = now;
    if (this.currentCombo > this.bestCombo) this.bestCombo = this.currentCombo;
    if (this.currentCombo >= 2) this.events.onCombo(this.currentCombo);

    const multiplier = this.currentCombo >= 2 ? this.currentCombo : 1;
    const gained = fruit.kind.score * multiplier;
    this.score += gained;
    this.events.onScoreChange(this.score);

    this.popups.push({
      text: `+${gained}`,
      pos: { x: fruit.pos.x, y: fruit.pos.y - 10 },
      vel: { x: 0, y: -40 },
      color: "#55e16b",
      life: 0.9,
      maxLife: 0.9,
      size: multiplier >= 2 ? 34 : 26,
    });

    // halves
    const baseSpeed = 260;
    const spread = (Math.random() * 0.8 + 0.8) * baseSpeed;
    this.halves.push({
      emoji: fruit.kind.emoji,
      side: "L",
      pos: { ...fruit.pos },
      vel: { x: fruit.vel.x * 0.6 - spread * 0.7, y: fruit.vel.y * 0.6 - 120 },
      angle: fruit.angle,
      angVel: -4 - Math.random() * 4,
      radius: fruit.kind.radius,
      life: 1.6,
    });
    this.halves.push({
      emoji: fruit.kind.emoji,
      side: "R",
      pos: { ...fruit.pos },
      vel: { x: fruit.vel.x * 0.6 + spread * 0.7, y: fruit.vel.y * 0.6 - 120 },
      angle: fruit.angle,
      angVel: 4 + Math.random() * 4,
      radius: fruit.kind.radius,
      life: 1.6,
    });

    // juice particles
    for (let i = 0; i < 18; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 120 + Math.random() * 340;
      this.particles.push({
        pos: { x: fruit.pos.x, y: fruit.pos.y },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd - 80 },
        color: fruit.kind.juice,
        size: 3 + Math.random() * 5,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
      });
    }
  }

  private hitBomb(bomb: Bomb) {
    bomb.sliced = true;
    bomb.alive = false;
    this.bombsHit++;
    this.lives = Math.max(0, this.lives - 1);
    this.events.onLivesChange(this.lives);
    this.screenFlash = 1;
    this.currentCombo = 0;

    // explosion particles
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 200 + Math.random() * 600;
      this.particles.push({
        pos: { x: bomb.pos.x, y: bomb.pos.y },
        vel: { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd },
        color: i % 3 === 0 ? "#ffd23f" : i % 3 === 1 ? "#ff5545" : "#ffffff",
        size: 3 + Math.random() * 6,
        life: 0.55 + Math.random() * 0.55,
        maxLife: 1.1,
      });
    }

    this.popups.push({
      text: "BOOM!",
      pos: { x: bomb.pos.x, y: bomb.pos.y - 20 },
      vel: { x: 0, y: -30 },
      color: "#ff5545",
      life: 1.1,
      maxLife: 1.1,
      size: 48,
    });

    if (this.lives <= 0) {
      this.endGame();
    }
  }

  private endGame() {
    this.running = false;
    this.events.onGameOver({
      score: this.score,
      fruitsSliced: this.fruitsSliced,
      bestCombo: this.bestCombo,
      bombsHit: this.bombsHit,
    });
  }

  private cullOffscreen() {
    const margin = 200;
    const offscreen = (e: { pos: Vec; vel: Vec }) =>
      e.pos.y > this.height + margin && e.vel.y > 0;
    this.fruits = this.fruits.filter((f) => f.alive && !offscreen(f));
    this.bombs = this.bombs.filter((b) => b.alive && !offscreen(b));
    this.halves = this.halves.filter((h) => h.life > 0 && h.pos.y < this.height + margin);
    this.particles = this.particles.filter((p) => p.life > 0);
    this.popups = this.popups.filter((p) => p.life > 0);
  }

  private updateEffects(dt: number) {
    if (this.screenFlash > 0) {
      this.screenFlash = Math.max(0, this.screenFlash - dt * 2.5);
    }
  }

  // --- render ---

  private render(now: number, snapshot: TrackerSnapshot) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // fruits
    for (const f of this.fruits) {
      if (!f.alive) continue;
      this.drawEmoji(f.kind.emoji, f.pos.x, f.pos.y, f.kind.radius * 2, f.angle, 1);
    }

    // bombs (with fuse glow)
    for (const b of this.bombs) {
      if (!b.alive) continue;
      ctx.save();
      ctx.translate(b.pos.x, b.pos.y);
      ctx.rotate(b.angle);
      // pulsating danger glow
      const pulse = 0.55 + 0.25 * Math.sin(now * 0.012);
      const grad = ctx.createRadialGradient(0, 0, BOMB_KIND.radius * 0.3, 0, 0, BOMB_KIND.radius * 2);
      grad.addColorStop(0, `rgba(255, 85, 69, ${0.45 * pulse})`);
      grad.addColorStop(1, "rgba(255, 85, 69, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, BOMB_KIND.radius * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this.drawEmoji(BOMB_KIND.emoji, b.pos.x, b.pos.y, BOMB_KIND.radius * 2.1, b.angle, 1);
    }

    // halves (with simple split clip)
    for (const h of this.halves) {
      const alpha = Math.max(0, Math.min(1, h.life / 1.2));
      ctx.save();
      ctx.translate(h.pos.x, h.pos.y);
      ctx.rotate(h.angle);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      // clip to left or right half of the emoji
      const r = h.radius * 1.2;
      if (h.side === "L") {
        ctx.rect(-r, -r, r, 2 * r);
      } else {
        ctx.rect(0, -r, r, 2 * r);
      }
      ctx.clip();
      ctx.font = `${h.radius * 2}px "Apple Color Emoji","Segoe UI Emoji",system-ui,sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(h.emoji, 0, 0);
      ctx.restore();
    }

    // particles
    for (const p of this.particles) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // popups
    for (const p of this.popups) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 4;
      ctx.font = `900 ${p.size}px Epilogue, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeText(p.text, p.pos.x, p.pos.y);
      ctx.fillText(p.text, p.pos.x, p.pos.y);
    }
    ctx.globalAlpha = 1;

    // blade trail
    this.drawTrail(now, snapshot);

    // blade dots
    for (const b of snapshot.blades) {
      const x = b.nx * this.width;
      const y = b.ny * this.height;
      const color = b.handedness === "Left" ? "#22d3ee" : b.handedness === "Right" ? "#f472b6" : "#ffffff";
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // red screen flash (bomb)
    if (this.screenFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.screenFlash * 0.55;
      ctx.fillStyle = "#ff3030";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.restore();
    }

    // waiting for camera banner
    if (!snapshot.ready) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "600 14px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("waiting for hand tracker…", this.width / 2, this.height / 2);
    }
  }

  private drawEmoji(
    emoji: string,
    x: number,
    y: number,
    size: number,
    angle: number,
    alpha: number,
  ) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji",system-ui,sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // subtle drop shadow
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  }

  private drawTrail(now: number, _snapshot: TrackerSnapshot) {
    // group by blade id and draw a fading stroke per blade
    const byBlade = new Map<string, TrailPoint[]>();
    for (const p of this.trail) {
      const arr = byBlade.get(p.bladeId) ?? [];
      arr.push(p);
      byBlade.set(p.bladeId, arr);
    }
    const ctx = this.ctx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const [, pts] of byBlade) {
      if (pts.length < 2) continue;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const age = (now - b.t) / this.trailMs;
        const alpha = Math.max(0, Math.min(1, 1 - age));
        if (alpha <= 0) continue;
        // outer glow stroke
        ctx.strokeStyle = `rgba(34, 211, 238, ${alpha * 0.25})`;
        ctx.lineWidth = 18;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // middle stroke
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.65})`;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // inner hot line
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
}
