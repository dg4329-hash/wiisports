import type { MatchConfig } from "./types";

export type MatchState = {
  score: [number, number]; // [user, opp]
  serving: 0 | 1;
  serveIndexInRotation: number;
  rallyCount: number;
  gameOver: boolean;
  winner: 0 | 1 | null;
};

export function newMatch(cfg: MatchConfig): MatchState {
  return {
    score: [0, 0],
    serving: cfg.userServesFirst ? 0 : 1,
    serveIndexInRotation: 0,
    rallyCount: 0,
    gameOver: false,
    winner: null,
  };
}

export function pointWon(state: MatchState, cfg: MatchConfig, by: 0 | 1): void {
  if (state.gameOver) return;
  state.score[by]++;
  state.rallyCount = 0;
  state.serveIndexInRotation++;

  const [a, b] = state.score;
  const max = Math.max(a, b);
  const reachedTarget = max >= cfg.pointsToWin;
  const leadBy2 = Math.abs(a - b) >= 2;

  if (reachedTarget && (!cfg.deuce || leadBy2)) {
    state.gameOver = true;
    state.winner = a > b ? 0 : 1;
    return;
  }

  // At deuce (both ≥ pointsToWin-1 when deuce is on) service alternates every point.
  const atDeuce = cfg.deuce && a >= cfg.pointsToWin - 1 && b >= cfg.pointsToWin - 1;
  const rotation = atDeuce ? 1 : cfg.servesPerRotation;
  if (state.serveIndexInRotation >= rotation) {
    state.serving = (state.serving === 0 ? 1 : 0);
    state.serveIndexInRotation = 0;
  }
}
