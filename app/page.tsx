"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_KEY!
);

const BOOKMAKERS = ["betmgm", "draftkings", "fanduel", "caesars"];

const BOOKMAKER_LABELS: Record<string, string> = {
  betmgm: "BetMGM",
  draftkings: "DraftKings",
  fanduel: "FanDuel",
  caesars: "Caesars",
};

type OddsRow = {
  ml_home: number | null;
  ml_away: number | null;
  spread_home: number | null;
  spread_home_price: number | null;
  spread_away: number | null;
  spread_away_price: number | null;
  total_over: number | null;
  total_over_price: number | null;
  total_under: number | null;
  total_under_price: number | null;
};

type Game = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  odds: Record<string, OddsRow>;
};

function formatOdds(val: number | null | undefined) {
  if (val == null) return "—";
  return val > 0 ? `+${val}` : `${val}`;
}

function formatSpread(val: number | null | undefined) {
  if (val == null) return "—";
  return val > 0 ? `+${val}` : `${val}`;
}

function formatTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    hour12: true,
  });
}

function getBestML(oddsMap: Record<string, OddsRow>, team: string) {
  let best: number | null = null;
  for (const book of BOOKMAKERS) {
    const val = oddsMap[book]?.[team === "home" ? "ml_home" : "ml_away"];
    if (val != null && (best === null || val > best)) best = val;
  }
  return best;
}

function getBestSpread(oddsMap: Record<string, OddsRow>, side: string) {
  let best: number | null = null;
  for (const book of BOOKMAKERS) {
    const val =
      oddsMap[book]?.[
        side === "home" ? "spread_home_price" : "spread_away_price"
      ];
    if (val != null && (best === null || val > best)) best = val;
  }
  return best;
}

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGame, setActiveGame] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().split("T")[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

      const { data: gamesData } = await supabase
        .from("games")
        .select("*")
        .gte("commence_time", `${today}T04:00:00Z`)
        .lte("commence_time", `${tomorrow}T03:59:59Z`)
        .order("commence_time");

      if (!gamesData || gamesData.length === 0) {
        setLoading(false);
        return;
      }

      const gameIds = gamesData.map((g) => g.id);
      const { data: oddsData } = await supabase
        .from("odds")
        .select("*")
        .in("game_id", gameIds);

      // Build a map: game_id -> { bookmaker -> odds row }
      const oddsMap: Record<string, Record<string, OddsRow>> = {};
      for (const row of oddsData || []) {
        if (!oddsMap[row.game_id]) oddsMap[row.game_id] = {};
        oddsMap[row.game_id][row.bookmaker] = row;
      }

      setGames(gamesData.map((g) => ({ ...g, odds: oddsMap[g.id] || {} })));
      setLoading(false);
    }
    load();
  }, []);

  return (
    <main className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-icon">⚾</span>
            <span className="logo-text">LINEWATCH</span>
            <span className="divider">|</span>
            <Link href="/results" className="nav-link">Yesterday →</Link>
            <span className="divider">|</span>
            <Link href="/dashboard" className="nav-link">Dashboard →</Link>
          </div>
          <div className="header-meta">
            <span className="date-badge" suppressHydrationWarning>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </div>
      </header>

      <div className="content">
        <div className="section-header">
          <h2 className="section-title">Today&apos;s Games</h2>
          <span className="game-count">{games.length} games</span>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>Fetching lines...</span>
          </div>
        ) : games.length === 0 ? (
          <div className="empty">No games scheduled today.</div>
        ) : (
          <div className="games-list">
            {games.map((game) => {
              const isOpen = activeGame === game.id;
              const bestHomeML = getBestML(game.odds, "home");
              const bestAwayML = getBestML(game.odds, "away");
              const bestHomeSpread = getBestSpread(game.odds, "home");
              const bestAwaySpread = getBestSpread(game.odds, "away");

              return (
                <div key={game.id} className={`game-card ${isOpen ? "open" : ""}`}>
                  {/* Game Header */}
                  <div
                    className="game-header"
                    onClick={() =>
                      setActiveGame(isOpen ? null : game.id)
                    }
                  >
                    <div className="game-time">{formatTime(game.commence_time)}</div>

                    <div className="matchup">
                      <div className="team away-team">
                        <span className="team-name">{game.away_team}</span>
                        <span className={`ml-pill ${bestAwayML != null && bestAwayML > 0 ? "underdog" : "favorite"}`}>
                          {formatOdds(bestAwayML)}
                        </span>
                      </div>
                      <div className="at-sign">@</div>
                      <div className="team home-team">
                        <span className="team-name">{game.home_team}</span>
                        <span className={`ml-pill ${bestHomeML != null && bestHomeML > 0 ? "underdog" : "favorite"}`}>
                          {formatOdds(bestHomeML)}
                        </span>
                      </div>
                    </div>

                    <div className="expand-icon">{isOpen ? "▲" : "▼"}</div>
                  </div>

                  {/* Expanded Odds Table */}
                  {isOpen && (
                    <div className="odds-table-wrap">
                      <table className="odds-table">
                        <thead>
                          <tr>
                            <th>Book</th>
                            <th>Away Spread</th>
                            <th>Home Spread</th>
                            <th>Total</th>
                            <th>Away ML</th>
                            <th>Home ML</th>
                          </tr>
                        </thead>
                        <tbody>
                          {BOOKMAKERS.map((book) => {
                            const o = game.odds[book];
                            if (!o) return null;
                            return (
                              <tr key={book}>
                                <td className="book-name">
                                  {BOOKMAKER_LABELS[book]}
                                </td>
                                <td>
                                  {formatSpread(o.spread_away)}{" "}
                                  <span className={o.spread_away_price === bestAwaySpread ? "juice best" : "juice"}>
                                    ({formatOdds(o.spread_away_price)})
                                  </span>
                                </td>
                                <td>
                                  {formatSpread(o.spread_home)}{" "}
                                  <span className={o.spread_home_price === bestHomeSpread ? "juice best" : "juice"}>
                                    ({formatOdds(o.spread_home_price)})
                                  </span>
                                </td>
                                <td>
                                  O{o.total_over}{" "}
                                  <span className="juice">
                                    ({formatOdds(o.total_over_price)})
                                  </span>{" "}
                                  / U{o.total_under}{" "}
                                  <span className="juice">
                                    ({formatOdds(o.total_under_price)})
                                  </span>
                                </td>
                                <td
                                  className={
                                    o.ml_away === bestAwayML ? "best" : ""
                                  }
                                >
                                  {formatOdds(o.ml_away)}
                                </td>
                                <td
                                  className={
                                    o.ml_home === bestHomeML ? "best" : ""
                                  }
                                >
                                  {formatOdds(o.ml_home)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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

        /* Header */
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

        /* Section */
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

        /* Game Card */
        .game-card {
          background: #0d1520;
          border: 1px solid #1a2535;
          border-radius: 6px;
          margin-bottom: 8px;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .game-card:hover { border-color: #2a3f58; }
        .game-card.open { border-color: #1e90ff44; }

        .game-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          cursor: pointer;
          user-select: none;
        }

        .game-time {
          font-size: 11px;
          color: #3d5a78;
          min-width: 64px;
          letter-spacing: 0.04em;
        }

        .matchup {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .team {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        .away-team { justify-content: flex-end; }
        .home-team { justify-content: flex-start; }

        .team-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: 0.04em;
          color: #c8d8e8;
        }

        .at-sign {
          font-size: 12px;
          color: #2a3f58;
          flex-shrink: 0;
        }

        .ml-pill {
          font-size: 11px;
          font-family: 'DM Mono', monospace;
          padding: 2px 7px;
          border-radius: 3px;
          letter-spacing: 0.02em;
        }
        .ml-pill.favorite {
          background: #0a1f35;
          color: #4a8fc4;
          border: 1px solid #1a3a58;
        }
        .ml-pill.underdog {
          background: #1a0e05;
          color: #c47a3a;
          border: 1px solid #3a2010;
        }

        .expand-icon {
          font-size: 10px;
          color: #2a3f58;
          min-width: 16px;
          text-align: right;
        }

        /* Odds Table */
        .odds-table-wrap {
          overflow-x: auto;
          border-top: 1px solid #1a2535;
        }

        .odds-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .odds-table thead tr {
          background: #080c10;
        }

        .odds-table th {
          padding: 10px 14px;
          text-align: left;
          color: #2d4a64;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border-bottom: 1px solid #121e2c;
        }

        .odds-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #0f1a26;
          color: #8aa4bc;
          white-space: nowrap;
        }

        .odds-table tbody tr:last-child td { border-bottom: none; }
        .odds-table tbody tr:hover td { background: #0f1c2a; }

        .book-name {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 14px !important;
          font-weight: 600;
          color: #5a7a94 !important;
          letter-spacing: 0.04em;
        }

        .juice { color: #3a5468; }

        .odds-table td.best,
        .odds-table span.best {
          color: #34d399 !important;
          font-weight: 500;
        }

        /* Loading */
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
