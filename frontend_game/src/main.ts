import { HandTracker } from "./tracking";
import { FruitNinjaGame } from "./game";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const statusEl = $<HTMLDivElement>("status");
const startOverlay = $<HTMLDivElement>("startOverlay");
const gameOverOverlay = $<HTMLDivElement>("gameOverOverlay");
const startBtn = $<HTMLButtonElement>("startBtn");
const restartBtn = $<HTMLButtonElement>("restartBtn");

const scoreValue = $<HTMLDivElement>("scoreValue");
const scorePanel = $<HTMLDivElement>("scorePanel");
const livesEl = $<HTMLDivElement>("lives");
const comboEl = $<HTMLDivElement>("combo");
const finalScore = $<HTMLDivElement>("finalScore");
const statSliced = $<HTMLSpanElement>("statSliced");
const statCombo = $<HTMLSpanElement>("statCombo");
const statBombs = $<HTMLSpanElement>("statBombs");

const video = $<HTMLVideoElement>("cam");
const camOverlay = $<HTMLCanvasElement>("camOverlay");
const camPreview = $<HTMLDivElement>("camPreview");
const gameCanvas = $<HTMLCanvasElement>("game");

const setStatus = (text: string | null) => {
  if (text === null) {
    statusEl.classList.add("hidden");
  } else {
    statusEl.classList.remove("hidden");
    statusEl.textContent = text;
  }
};

const tracker = new HandTracker(video, camOverlay);

// Wire back-to-lobby chip to the configured URL (default `/`).
const lobbyUrl = ((import.meta as any).env?.VITE_LOBBY_URL as string | undefined) ?? "/";
const backChip = document.getElementById("back-chip") as HTMLAnchorElement | null;
if (backChip) backChip.href = lobbyUrl;

let comboHideTimeout: number | null = null;
const showCombo = (count: number) => {
  comboEl.textContent = `COMBO x${count}!`;
  comboEl.classList.add("show");
  if (comboHideTimeout) window.clearTimeout(comboHideTimeout);
  comboHideTimeout = window.setTimeout(() => {
    comboEl.classList.remove("show");
  }, 900);
};

const game = new FruitNinjaGame(gameCanvas, {
  onScoreChange: (s) => {
    scoreValue.textContent = s.toLocaleString();
  },
  onLivesChange: (lives) => {
    const els = livesEl.querySelectorAll<HTMLDivElement>(".life");
    els.forEach((el, i) => {
      if (i < lives) el.classList.remove("lost");
      else el.classList.add("lost");
    });
  },
  onCombo: (count) => showCombo(count),
  onGameOver: (summary) => {
    finalScore.textContent = summary.score.toLocaleString();
    statSliced.textContent = String(summary.fruitsSliced);
    statCombo.textContent = `x${summary.bestCombo}`;
    statBombs.textContent = String(summary.bombsHit);
    gameOverOverlay.classList.add("show");
  },
});

const showStart = () => {
  startOverlay.classList.add("show");
  gameOverOverlay.classList.remove("show");
  scorePanel.style.display = "none";
  livesEl.style.display = "none";
  camPreview.style.display = "none";
};

const beginPlay = () => {
  startOverlay.classList.remove("show");
  gameOverOverlay.classList.remove("show");
  scorePanel.style.display = "block";
  livesEl.style.display = "flex";
  camPreview.style.display = "block";
  // reset lives dots
  livesEl.querySelectorAll<HTMLDivElement>(".life").forEach((el) => el.classList.remove("lost"));
  game.start();
};

startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  setStatus("requesting camera…");
  try {
    await tracker.init();
    setStatus(null);
    beginPlay();
  } catch (err: any) {
    console.error(err);
    setStatus(`error: ${err?.message ?? err}`);
    startBtn.disabled = false;
  }
});

restartBtn.addEventListener("click", () => {
  beginPlay();
});

// rAF loop — runs always (renders tracker preview + game)
const loop = () => {
  const now = performance.now();
  const snapshot = tracker.update();
  game.tick(now, snapshot);
  requestAnimationFrame(loop);
};

showStart();
setStatus("click Begin to allow camera");
requestAnimationFrame(loop);
