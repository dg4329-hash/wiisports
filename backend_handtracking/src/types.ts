export type V3 = { x: number; y: number; z: number; visibility?: number };

export type Hand = {
  handedness: "Left" | "Right";
  world: V3[];
  image: V3[];
};

export type Frame = {
  pose?: V3[];
  poseWorld?: V3[];
  hands: Hand[];
  ts: number;
};

export type Handedness = "Left" | "Right";

export type MatchConfig = {
  pointsToWin: number;
  servesPerRotation: number;
  deuce: boolean;
  playerHand: Handedness;
  userServesFirst: boolean;
};

export const DEFAULT_CONFIG: MatchConfig = {
  pointsToWin: 11,
  servesPerRotation: 2,
  deuce: true,
  playerHand: "Right",
  userServesFirst: true,
};

// Real ITTF table dimensions (meters). Scene uses Y-up, table length along Z.
export const TABLE = {
  length: 2.74,   // along Z
  width: 1.525,   // along X
  height: 0.76,   // top surface Y
  netHeight: 0.1525,
  thickness: 0.04,
};

// User stands near +Z end; opponent near -Z end.
export const USER_END_Z = +TABLE.length / 2;
export const OPP_END_Z = -TABLE.length / 2;
