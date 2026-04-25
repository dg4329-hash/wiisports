import type { MatchConfig, Handedness } from "./types";
import type { MatchState } from "./rules";
import { mapping } from "./tracking";

export type UIHandles = {
  scoreUser: HTMLElement;
  scoreOpp: HTMLElement;
  rally: HTMLElement;
  serveIndicator: HTMLElement;
  status: HTMLElement;
  powerFill: HTMLElement;
  pipVideo: HTMLVideoElement;
  pipCanvas: HTMLCanvasElement;
  matchBanner: HTMLElement;
  startModal: HTMLElement;
  endModal: HTMLElement;
  endText: HTMLElement;
  handChip: HTMLElement;
  actionPrompt: HTMLElement;
};

export function bindUI(): UIHandles {
  const q = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  return {
    scoreUser: q("score-user"),
    scoreOpp: q("score-opp"),
    rally: q("rally"),
    serveIndicator: q("serve-indicator"),
    status: q("status"),
    powerFill: q("power-fill"),
    pipVideo: q<HTMLVideoElement>("pip-video"),
    pipCanvas: q<HTMLCanvasElement>("pip-canvas"),
    matchBanner: q("match-banner"),
    startModal: q("start-modal"),
    endModal: q("end-modal"),
    endText: q("end-text"),
    handChip: q("hand-chip"),
    actionPrompt: q("action-prompt"),
  };
}

export function updateHUD(ui: UIHandles, state: MatchState): void {
  ui.scoreUser.textContent = String(state.score[0]).padStart(2, "0");
  ui.scoreOpp.textContent = String(state.score[1]).padStart(2, "0");
  ui.rally.textContent = `RALLY · ${state.rallyCount}`;
  ui.serveIndicator.textContent = state.serving === 0 ? "YOUR SERVE" : "OPPONENT SERVE";
  ui.serveIndicator.dataset.side = state.serving === 0 ? "user" : "opp";
}

export function setStatus(ui: UIHandles, text: string): void {
  ui.status.textContent = text;
}

export function setPower(ui: UIHandles, value: number): void {
  const clamped = Math.max(0, Math.min(1, value));
  ui.powerFill.style.transform = `scaleY(${clamped})`;
}

export function setupStartModal(
  ui: UIHandles,
  cfg: MatchConfig,
  onStart: (cfg: MatchConfig) => void,
): void {
  const pointsInput = document.getElementById("cfg-points") as HTMLInputElement;
  const handSelect = document.getElementById("cfg-hand") as HTMLSelectElement;
  const serverSelect = document.getElementById("cfg-server") as HTMLSelectElement;
  const rotationInput = document.getElementById("cfg-rotation") as HTMLInputElement;
  const deuceInput = document.getElementById("cfg-deuce") as HTMLInputElement;
  const startBtn = document.getElementById("cfg-start") as HTMLButtonElement;

  pointsInput.value = String(cfg.pointsToWin);
  handSelect.value = cfg.playerHand;
  serverSelect.value = cfg.userServesFirst ? "user" : "opp";
  rotationInput.value = String(cfg.servesPerRotation);
  deuceInput.checked = cfg.deuce;

  // Tracking mapping toggles — bind live so adjustments take effect immediately.
  const mirrorInput = document.getElementById("cfg-mirror") as HTMLInputElement | null;
  const reachInput = document.getElementById("cfg-reach") as HTMLInputElement | null;
  const reachLabel = document.getElementById("cfg-reach-val") as HTMLElement | null;
  if (mirrorInput) {
    mirrorInput.checked = mapping.mirrorX;
    mirrorInput.addEventListener("change", () => { mapping.mirrorX = mirrorInput.checked; });
  }
  if (reachInput && reachLabel) {
    reachInput.value = String(Math.round(mapping.reachScale * 100));
    reachLabel.textContent = `${Math.round(mapping.reachScale * 100)}%`;
    reachInput.addEventListener("input", () => {
      const v = Math.max(50, Math.min(250, parseInt(reachInput.value, 10) || 100)) / 100;
      mapping.reachScale = v;
      mapping.lateralScale = 0.85 + (v - 1) * 0.6; // scale lateral with reach for consistency
      reachLabel.textContent = `${Math.round(v * 100)}%`;
    });
  }

  startBtn.addEventListener("click", () => {
    const next: MatchConfig = {
      pointsToWin: Math.max(1, parseInt(pointsInput.value || "11", 10)),
      servesPerRotation: Math.max(1, parseInt(rotationInput.value || "2", 10)),
      deuce: deuceInput.checked,
      playerHand: handSelect.value as Handedness,
      userServesFirst: serverSelect.value === "user",
    };
    ui.startModal.classList.add("hidden");
    onStart(next);
  });
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

export function showEnd(
  ui: UIHandles,
  userWon: boolean,
  finalScore: [number, number],
  onRestart: () => void,
  opts?: {
    onSubmit?: (name: string) => Promise<SubmitResult>;
    canSubmit?: boolean;
    offlineReason?: string;
    /** If set, the input is hidden and the score is auto-submitted using this name. */
    autoSubmitName?: string | null;
  },
): void {
  ui.endText.innerHTML =
    `<div class="end-title">${userWon ? "MATCH · WON" : "MATCH · LOST"}</div>` +
    `<div class="end-score">${finalScore[0]} — ${finalScore[1]}</div>`;
  ui.endModal.classList.remove("hidden");

  const btn = document.getElementById("end-again") as HTMLButtonElement;
  btn.onclick = () => {
    ui.endModal.classList.add("hidden");
    onRestart();
  };

  // Leaderboard submit wiring.
  const row = document.getElementById("end-submit-row") as HTMLDivElement | null;
  const input = document.getElementById("end-submit-name") as HTMLInputElement | null;
  const submitBtn = document.getElementById("end-submit-btn") as HTMLButtonElement | null;
  const status = document.getElementById("end-submit-status") as HTMLParagraphElement | null;
  if (!row || !input || !submitBtn || !status) return;

  const setStatusText = (text: string, kind: "" | "success" | "error" = "") => {
    status.textContent = text;
    status.classList.remove("success", "error");
    if (kind) status.classList.add(kind);
  };

  // Reset state each time the end screen appears.
  let submitted = false;
  submitBtn.disabled = false;
  input.disabled = false;
  row.style.display = "";
  setStatusText("");
  input.value = localStorage.getItem("pong:lastName") ?? "";

  if (opts?.canSubmit === false || !opts?.onSubmit) {
    row.style.opacity = "0.5";
    submitBtn.disabled = true;
    input.disabled = true;
    setStatusText(opts?.offlineReason ?? "Leaderboard offline", "error");
    return;
  }
  row.style.opacity = "";

  const doSubmit = async (name: string) => {
    if (submitted) return;
    if (!name) {
      setStatusText("Enter a name first", "error");
      input.focus();
      return;
    }
    submitBtn.disabled = true;
    input.disabled = true;
    setStatusText("Submitting…");
    const result = await opts.onSubmit!(name);
    if (result.ok) {
      submitted = true;
      localStorage.setItem("pong:lastName", name);
      setStatusText(`Submitted as ${name}`, "success");
    } else {
      submitBtn.disabled = false;
      input.disabled = false;
      setStatusText(result.error, "error");
    }
  };

  // Auto-submit path for signed-in players: hide the input, push silently.
  if (opts?.autoSubmitName) {
    row.style.display = "none";
    void doSubmit(opts.autoSubmitName);
    return;
  }

  submitBtn.onclick = () => void doSubmit(input.value.trim());
  input.onkeydown = (e) => {
    if (e.key === "Enter") void doSubmit(input.value.trim());
  };
}

export function flashBanner(ui: UIHandles, text: string, ms = 1200): void {
  ui.matchBanner.textContent = text;
  ui.matchBanner.classList.add("show");
  window.setTimeout(() => ui.matchBanner.classList.remove("show"), ms);
}
