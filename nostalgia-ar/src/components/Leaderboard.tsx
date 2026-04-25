import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type GameFilter = "all" | "pong" | "fruit";
type Game = "pong" | "fruit";

type ScoreRow = {
  id: number;
  created_at: string;
  game: Game;
  player_name: string;
  user_id: string | null;
  score: number;
  combo: number | null;
};

type DisplayEntry = {
  rank: number;
  player: string;
  tag: string;
  game: Game;
  score: number;       // For fruit: best score. For pong: match count.
  combo?: number;      // For fruit only.
  when: string;
  key: string;         // Stable key for React
};

type Props = {
  onClose: () => void;
};

export default function Leaderboard({ onClose }: Props) {
  const [filter, setFilter] = useState<GameFilter>("all");
  const [rows, setRows] = useState<ScoreRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initial fetch + realtime subscription. One query gets everything we need.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data, error: err } = await supabase
        .from("scores")
        .select("id, created_at, game, player_name, user_id, score, combo")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
        return;
      }
      setError(null);
      setRows((data ?? []) as ScoreRow[]);
    };

    void load();

    const channel = supabase
      .channel("scores-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scores" },
        (payload) => {
          const row = payload.new as ScoreRow;
          setRows((prev) => (prev ? [row, ...prev] : [row]));
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  const filtered = useMemo<DisplayEntry[]>(() => {
    if (!rows) return [];
    if (filter === "fruit") {
      return aggregateFruit(rows.filter((r) => r.game === "fruit"));
    }
    if (filter === "pong") {
      return aggregatePong(rows.filter((r) => r.game === "pong"));
    }
    // "all" — most recent submissions across both games, no aggregation.
    return rows.slice(0, 50).map((r, i) => ({
      rank: i + 1,
      player: r.player_name,
      tag: playerTag(r.player_name, r.user_id),
      game: r.game,
      score: r.score,
      combo: r.combo ?? undefined,
      when: timeAgo(r.created_at),
      key: `all-${r.id}`,
    }));
  }, [rows, filter]);

  const isPong = filter === "pong";

  return (
    <div className="lb-view">
      <div className="lb-panel">
        <div className="lb-head">
          <div>
            <p className="eyebrow" style={{ color: "var(--cyan)", marginBottom: 8 }}>
              NOSTALGIA · AR
            </p>
            <h1 className="lb-title">Leaderboard</h1>
            <p className="lb-sub">Top slicers, swingers, and streak-holders across the cabinet.</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>← Lobby</button>
        </div>

        <div className="lb-tabs">
          <TabBtn active={filter === "all"}   onClick={() => setFilter("all")}  >All Games</TabBtn>
          <TabBtn active={filter === "pong"}  onClick={() => setFilter("pong")} accent="cyan">Table Tennis</TabBtn>
          <TabBtn active={filter === "fruit"} onClick={() => setFilter("fruit")} accent="pink">Fruit Ninja</TabBtn>
          <div style={{ flex: 1 }} />
          <div className="lb-meta">
            <span className="dot-live" />
            <span>LIVE · GLOBAL</span>
          </div>
        </div>

        <div className="lb-table">
          <div className="lb-row lb-row-head">
            <span className="lb-c-rank">#</span>
            <span className="lb-c-player">Player</span>
            <span className="lb-c-game">Game</span>
            <span className="lb-c-combo">{isPong ? "—" : "Best Combo"}</span>
            <span className="lb-c-when">When</span>
            <span className="lb-c-score">{isPong ? "Matches" : "Score"}</span>
          </div>
          <div className="lb-scroll">
            {rows === null && (
              <div className="lb-row" style={{ color: "var(--tx-dim)", justifyContent: "center" }}>
                <span style={{ gridColumn: "1 / -1", textAlign: "center", padding: "18px 0" }}>
                  Loading leaderboard…
                </span>
              </div>
            )}
            {rows !== null && filtered.length === 0 && (
              <div className="lb-row" style={{ color: "var(--tx-dim)" }}>
                <span style={{ gridColumn: "1 / -1", textAlign: "center", padding: "24px 0" }}>
                  {error ? `Couldn't load scores: ${error}` : "No scores yet — go play a game."}
                </span>
              </div>
            )}
            {filtered.map((e) => (
              <div
                key={e.key}
                className={"lb-row" + (e.rank <= 3 ? " lb-top" : "") + ` lb-rank-${e.rank}`}
              >
                <span className="lb-c-rank mono">
                  {e.rank <= 3 ? <Medal rank={e.rank} /> : e.rank.toString().padStart(2, "0")}
                </span>
                <span className="lb-c-player">
                  <span className="lb-avatar" data-game={e.game} />
                  <span className="lb-name">
                    <span>{e.player}</span>
                    <span className="lb-tag mono">@{e.tag}</span>
                  </span>
                </span>
                <span className="lb-c-game">
                  <span className={"lb-chip lb-chip-" + (e.game === "pong" ? "cyan" : "pink")}>
                    {e.game === "pong" ? "TABLE TENNIS" : "FRUIT NINJA"}
                  </span>
                </span>
                <span className="lb-c-combo mono">
                  {e.game === "fruit" && e.combo != null ? `×${e.combo}` : "—"}
                </span>
                <span className="lb-c-when mono">{e.when}</span>
                <span className="lb-c-score mono">{e.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Aggregation helpers -------------------------------------------------

function playerKey(row: Pick<ScoreRow, "user_id" | "player_name">): string {
  return row.user_id ?? `name:${row.player_name.toLowerCase()}`;
}

function playerTag(name: string, userId: string | null): string {
  if (userId) return userId.slice(0, 6).toUpperCase();
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (cleaned || "PLAYER").slice(0, 6);
}

function aggregateFruit(rows: ScoreRow[]): DisplayEntry[] {
  const best = new Map<string, ScoreRow>();
  for (const r of rows) {
    const k = playerKey(r);
    const cur = best.get(k);
    if (!cur || r.score > cur.score) best.set(k, r);
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 50)
    .map((r, i) => ({
      rank: i + 1,
      player: r.player_name,
      tag: playerTag(r.player_name, r.user_id),
      game: "fruit" as const,
      score: r.score,
      combo: r.combo ?? undefined,
      when: timeAgo(r.created_at),
      key: `fruit-${playerKey(r)}`,
    }));
}

function aggregatePong(rows: ScoreRow[]): DisplayEntry[] {
  type Acc = {
    player: string;
    user_id: string | null;
    count: number;
    latest: string;
  };
  const acc = new Map<string, Acc>();
  for (const r of rows) {
    const k = playerKey(r);
    const cur = acc.get(k);
    if (cur) {
      cur.count += 1;
      if (r.created_at > cur.latest) cur.latest = r.created_at;
    } else {
      acc.set(k, {
        player: r.player_name,
        user_id: r.user_id,
        count: 1,
        latest: r.created_at,
      });
    }
  }
  return [...acc.entries()]
    .map(([k, a]) => ({ k, ...a }))
    .sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest))
    .slice(0, 50)
    .map((a, i) => ({
      rank: i + 1,
      player: a.player,
      tag: playerTag(a.player, a.user_id),
      game: "pong" as const,
      score: a.count,
      when: timeAgo(a.latest),
      key: `pong-${a.k}`,
    }));
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60)        return `${Math.floor(s)}s ago`;
  if (s < 3600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86400)     return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// --- UI bits -------------------------------------------------------------

function TabBtn({
  active, onClick, accent, children,
}: {
  active: boolean;
  onClick: () => void;
  accent?: "cyan" | "pink";
  children: React.ReactNode;
}) {
  const cls =
    "lb-tab" +
    (active ? " on" : "") +
    (accent ? ` lb-tab-${accent}` : "");
  return (
    <button className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

function Medal({ rank }: { rank: number }) {
  const color = rank === 1 ? "#fde047" : rank === 2 ? "#e6edf7" : "#ffb874";
  return (
    <span className="lb-medal" style={{ color, textShadow: `0 0 12px ${color}` }}>
      ★
    </span>
  );
}
