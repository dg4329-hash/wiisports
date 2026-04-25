import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabase: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(url ?? "https://invalid.local", anonKey ?? "missing", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "nostalgia-auth",
  },
});

export type SubmitScoreArgs = {
  game: "pong" | "fruit";
  player: string;
  score: number;
  combo?: number;
};

export type SubmitResult = { ok: true } | { ok: false; error: string };

export async function submitScore(args: SubmitScoreArgs): Promise<SubmitResult> {
  if (!hasSupabase) {
    return { ok: false, error: "Leaderboard offline (no Supabase config)" };
  }
  const name = args.player.trim();
  if (!name) return { ok: false, error: "Enter a name first" };
  if (name.length > 24) return { ok: false, error: "Name too long (max 24)" };

  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id ?? null;

  const { error } = await supabase.from("scores").insert({
    game: args.game,
    player_name: name,
    score: Math.max(0, Math.floor(args.score)),
    combo: args.combo == null ? null : Math.floor(args.combo),
    user_id: userId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getSessionDisplayName(): Promise<string | null> {
  if (!hasSupabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    name?: string;
  };
  return (meta.full_name || meta.name || user.email?.split("@")[0] || null) as string | null;
}
