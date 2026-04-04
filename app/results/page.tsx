"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_KEY!
);

type GameResult = {
  game_id: string;
  home_score: number;
  away_score: number;
};

type GameOdds = {
  game_id: string;
  bookmaker: string;
  spread_home: number | null;
  total_over: number | null;
};

type Game = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  status: string | null;
  result: GameResult | null;
  odds: GameOdds | null;
};

function formatYesterday() {
  const now = new Date();
  const todayET = new Date(now);
  todayET.setUTCHours(4, 0, 0, 0);
  if (now < todayET) todayET.setUTCDate(todayET.getUTCDate() - 1);
  const yesterday = new Date(todayET);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

function HitBadge({ hit, label }: { hit: boolean | null | undefined; label: string }) {
  if (hit === null || hit === undefined) return <span className="badge unknown">N/A</span>;
  return (
    <span className={`badge ${hit ? "hit" : "miss"}`}>
      {hit ? "✓" : "✗"} {label}
    </span>
  );
}

export default function Results() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Use ET midnight (04:00 UTC) as day boundaries to capture late-night games
      const now = new Date();
      const todayET = new Date(now);
      todayET.setUTCHours(4, 0, 0, 0);
      // If we haven't reached 4 AM UTC yet today, shift back one day
      if (now < todayET) todayET.setUTCDate(todayET.getUTCDate() - 1);

      const yesterdayStart = new Date(todayET);
      yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

      const startStr = yesterdayStart.toISOString();
      const endStr = todayET.toISOString();

      const { data: gamesData } = await supabase
        .from("games")
        .select("*")
        .gte("commence_time", startStr)
        .lt("commence_time", endStr)
        .order("commence_time");

      if (!gamesData || gamesData.length === 0) {
        setLoading(false);
        return;
      }

      const gameIds = gamesData.map((g) => g.id);

      const { data: resultsData } = await supabase
        .from("results")
        .select("*")
        .in("game_id", gameIds);

      const { data: oddsData } = await supabase
        .from("odds")
        .select("game_id, bookmaker, spread_home, total_over")
        .in("game_id", gameIds);

      const resultsMap: Record<string, GameResult> = {};
      for (const r of resultsData || []) {
        resultsMap[r.game_id] = r;
      }

      const oddsMap: Record<string, GameOdds> = {};
      for (const o of oddsData || []) {
        if (!oddsMap[o.game_id]) oddsMap[o.game_id] = o;
      }

      setGames(
        gamesData.map((g) => ({
          ...g,
          result: resultsMap[g.id] || null,
          odds: oddsMap[g.id] || null,
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  const gamesWithResults = games.filter((g) => g.status === "final" || (g.status == null && g.result));
  const postponedGames = games.filter((g) => g.status === "postponed");
  const pendingGames = games.filter((g) => g.status !== "final" && g.status !== "postponed" && !(g.status == null && g.result));

  return (
    <main className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <Link href="/" className="back-link">← Today</Link>
            <span className="divider">|</span>
            <span className="logo-icon">⚾</span>
            <span className="logo-text">LINEWATCH</span>
          </div>
          <div className="header-meta">
            <span className="date-badge">{formatYesterday()}</span>
          </div>
        </div>
      </header>

      <div className="content">
        <div className="section-header">
          <h2 className="section-title">Yesterday&apos;s Results</h2>
          <span className="game-count">{gamesWithResults.length} games</span>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>Loading results...</span>
          </div>
        ) : gamesWithResults.length === 0 ? (
          <div className="empty">No results found for yesterday.</div>
        ) : (
          <div className="games-list">
            {gamesWithResults.map((game) => {
              const r = game.result!;
              const o = game.odds;
              const awayWon = r.away_score > r.home_score;
              const homeWon = r.home_score > r.away_score;

              const totalRuns = r.home_score + r.away_score;
              const wentOver = o?.total_over != null ? totalRuns > o.total_over : null;

              const homeCovered = o?.spread_home != null
                ? (r.home_score + o.spread_home) > r.away_score
                : null;
              const awayCovered = homeCovered != null ? !homeCovered : null;

              return (
                <div key={game.id} className="game-card">
                  <div className="game-row">
                    {/* Teams & Score */}
                    <div className="matchup">
                      <div className="team-block">
                        <span className={`team-name ${awayWon ? "winner" : "loser"}`}>
                          {game.away_team}
                        </span>
                        {awayWon && <span className="win-dot" />}
                      </div>
                      <div className="score-block">
                        <span className={`score ${awayWon ? "winner" : ""}`}>
                          {r.away_score}
                        </span>
                        <span className="score-sep">—</span>
                        <span className={`score ${homeWon ? "winner" : ""}`}>
                          {r.home_score}
                        </span>
                      </div>
                      <div className="team-block right">
                        {homeWon && <span className="win-dot" />}
                        <span className={`team-name ${homeWon ? "winner" : "loser"}`}>
                          {game.home_team}
                        </span>
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="badges">
                      <HitBadge
                        hit={awayCovered}
                        label={`Away covered (${o?.spread_home != null ? ((-o.spread_home) > 0 ? "+" : "") + (-o.spread_home) : ""})`}
                      />
                      <HitBadge
                        hit={homeCovered}
                        label={`Home covered (${o?.spread_home != null ? (o.spread_home > 0 ? "+" : "") + o.spread_home : ""})`}
                      />
                      <HitBadge
                        hit={wentOver}
                        label={`${wentOver ? "Over" : "Under"} ${o?.total_over ?? ""} (${totalRuns})`}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Postponed games */}
        {postponedGames.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: "32px" }}>
              <h2 className="section-title">Postponed</h2>
              <span className="game-count">{postponedGames.length} games</span>
            </div>
            <div className="games-list">
              {postponedGames.map((game) => (
                <div key={game.id} className="game-card pending">
                  <div className="game-row">
                    <div className="matchup">
                      <span className="team-name loser">{game.away_team}</span>
                      <span className="score-sep pending-label">PPD</span>
                      <span className="team-name loser">{game.home_team}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Games with no results yet */}
        {pendingGames.length > 0 && (
          <>
            <div className="section-header" style={{ marginTop: "32px" }}>
              <h2 className="section-title">Pending Results</h2>
              <span className="game-count">{pendingGames.length} games</span>
            </div>
            <div className="games-list">
              {pendingGames.map((game) => (
                <div key={game.id} className="game-card pending">
                  <div className="game-row">
                    <div className="matchup">
                      <span className="team-name loser">{game.away_team}</span>
                      <span className="score-sep pending-label">No result yet</span>
                      <span className="team-name loser">{game.home_team}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #080c10;
          color: #e2e8f0;
          font-family: 'DM Mono', monospace;
          min-height: 100vh;
        }

        .app {
          max-width: 960px;
          margin: 0 auto;
          padding: 0 16px 60px;
        }

        .header {
          border-bottom: 1px solid #1e2a38;
          padding: 24px 0 20px;
          margin-bottom: 32px;
        }
        .header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .back-link {
          font-size: 12px;
          color: #3a6080;
          text-decoration: none;
          letter-spacing: 0.04em;
          transition: color 0.2s;
        }
        .back-link:hover { color: #6aaad4; }
        .divider { color: #1e2a38; font-size: 14px; }
        .logo-icon { font-size: 22px; }
        .logo-text {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: #f0f4f8;
        }
        .date-badge {
          font-size: 11px;
          color: #4a6080;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .section-header {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 16px;
        }
        .section-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #cbd5e1;
          text-transform: uppercase;
        }
        .game-count {
          font-size: 11px;
          color: #3a5068;
        }

        .game-card {
          background: #0d1520;
          border: 1px solid #1a2535;
          border-radius: 6px;
          margin-bottom: 8px;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .game-card:hover { border-color: #2a3f58; }
        .game-card.pending { opacity: 0.5; }

        .game-row {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .matchup {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .team-block {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 1;
        }
        .team-block.right {
          justify-content: flex-end;
          flex-direction: row-reverse;
        }

        .team-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .team-name.winner { color: #e2e8f0; }
        .team-name.loser { color: #3a5068; }

        .win-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #34d399;
          flex-shrink: 0;
        }

        .score-block {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .score {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 26px;
          font-weight: 700;
          color: #3a5068;
          min-width: 28px;
          text-align: center;
        }
        .score.winner { color: #e2e8f0; }

        .score-sep {
          font-size: 16px;
          color: #1e2a38;
        }

        .pending-label {
          font-size: 11px;
          color: #2a3f58;
          letter-spacing: 0.06em;
        }

        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .badge {
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 3px;
          letter-spacing: 0.04em;
          font-family: 'DM Mono', monospace;
        }
        .badge.hit {
          background: #0a2018;
          color: #34d399;
          border: 1px solid #1a4030;
        }
        .badge.miss {
          background: #1a0e0e;
          color: #f87171;
          border: 1px solid #3a1818;
        }
        .badge.unknown {
          background: #0f1a26;
          color: #2a3f58;
          border: 1px solid #1a2535;
        }

        .loading {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #2d4a64;
          font-size: 13px;
          padding: 40px 0;
        }
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #1a2c40;
          border-top-color: #1e90ff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .empty {
          color: #2d4a64;
          font-size: 13px;
          padding: 40px 0;
        }
      `}</style>
    </main>
  );
}
