// Lobby state machine.
// Primary path:  idle → transitioning (MP4 plays) → select
// Legacy path (fallback when video fails to load): idle → opening → dolly → flash → select
export type Phase = "idle" | "transitioning" | "opening" | "dolly" | "flash" | "select";
