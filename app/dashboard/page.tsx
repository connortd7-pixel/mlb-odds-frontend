"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../supabase";

type OddsRow = {
  game_id: string;
  bookmaker: string;
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

type BetStats = {
  wins: number;
  losses: number;
  pushes: number;
  pnl: number;
};

function initStats(): BetStats {
  return { wins: 0, losses: 0, pushes: 0, pnl: 0 };
}

function calcProfit(odds: number, won: boolean): number {
  if (!won) return -100;
  if (odds > 0) return 100 * (odds / 100);
  return 100 * (100 / Math.abs(odds));
}

// Returns the highest value for a field across all bookmaker rows (best line for bettor)
function bestOf(rows: OddsRow[], field: keyof OddsRow): number | null {
  let best: number | null = null;
  for (const r of rows) {
    const v = r[field] as number | null;
    if (v != null && (best === null || v > best)) best = v;
  }
  return best;
}

function recordBet(stats: BetStats, won: boolean, odds: number | null): void {
  if (odds == null) return;
  if (won) stats.wins++;
  else stats.losses++;
  stats.pnl += calcProfit(odds, won);
}

function recordPush(stats: BetStats): void {
  stats.pushes++;
}

function winRate(stats: BetStats): number {
  const total = stats.wins + stats.losses;
  if (total === 0) return 0;
  return (stats.wins / total) * 100;
}

function roi(stats: BetStats): number {
  const totalBets = stats.wins + stats.losses + stats.pushes;
  if (totalBets === 0) return 0;
  return (stats.pnl / (totalBets * 100)) * 100;
}

function formatPnL(pnl: number): string {
  const abs = Math.abs(Math.round(pnl));
  return pnl >= 0 ? `+$${abs}` : `-$${abs}`;
}

function formatRoi(r: number): string {
  const abs = Math.abs(r).toFixed(1);
  return r >= 0 ? `+${abs}%` : `-${abs}%`;
}

type AllStats = {
  over: BetStats;
  under: BetStats;
  homeML: BetStats;
  awayML: BetStats;
  favoriteML: BetStats;
  underdogML: BetStats;
  homeSpread: BetStats;
  awaySpread: BetStats;
  awayPlusOneHalf: BetStats;
};

function StatCard({
  label,
  stats,
  note,
}: {
  label: string;
  stats: BetStats;
  note?: string;
}) {
  const total = stats.wins + stats.losses;
  const totalWithPushes = total + stats.pushes;
  const rate = winRate(stats);
  const roiVal = roi(stats);
  const pnl = stats.pnl;
  const pnlPositive = pnl >= 0;
  const roiPositive = roiVal >= 0;

  // Color the win rate based on profitability threshold (~52.4% breaks even at -110)
  const rateColor =
    total === 0 ? "#2d4a64" : rate >= 54 ? "#34d399" : rate >= 48 ? "#8aa4bc" : "#f87171";

  return (
    <div className="stat-card">
      <div className="card-top">
        <span className="card-label">{label}</span>
        <span className="card-count">{totalWithPushes} bets</span>
      </div>
      <div className="card-rate" style={{ color: rateColor }}>
        {total === 0 ? "—" : `${rate.toFixed(1)}%`}
      </div>
      <div className="card-rate-label">win rate</div>
      {note && <div className="card-note">{note}</div>}
      <div className="card-bottom">
        <span className="card-record">
          {stats.wins}–{stats.losses}{stats.pushes > 0 ? `–${stats.pushes}` : ""}
        </span>
        <div className="card-right">
          <span className="card-pnl" style={{ color: pnlPositive ? "#34d399" : "#f87171" }}>
            {total === 0 ? "—" : formatPnL(pnl)}
          </span>
          <span className="card-roi" style={{ color: roiPositive ? "#34d399" : "#f87171" }}>
            {totalWithPushes === 0 ? "" : formatRoi(roiVal)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<AllStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Fetch all final game results
      const { data: resultsData, error: resultsErr } = await supabase
        .from("results")
        .select("game_id, home_score, away_score, status")
        .limit(10000);

      if (resultsErr) {
        setError("Failed to load results.");
        setLoading(false);
        return;
      }

      if (!resultsData || resultsData.length === 0) {
        setLoading(false);
        return;
      }

      // Only completed games
      const finalResults = resultsData.filter(
        (r) => r.status === "final" || r.status == null
      );

      if (finalResults.length === 0) {
        setLoading(false);
        return;
      }

      const gameIds = finalResults.map((r: { game_id: string }) => r.game_id);

      // Fetch all odds for those games
      const { data: oddsData, error: oddsErr } = await supabase
        .from("odds")
        .select(
          "game_id, bookmaker, ml_home, ml_away, spread_home, spread_home_price, spread_away, spread_away_price, total_over, total_over_price, total_under, total_under_price"
        )
        .in("game_id", gameIds)
        .limit(50000);

      if (oddsErr) {
        setError("Failed to load odds.");
        setLoading(false);
        return;
      }

      // Group odds by game_id
      const oddsMap: Record<string, OddsRow[]> = {};
      for (const row of oddsData || []) {
        if (!oddsMap[row.game_id]) oddsMap[row.game_id] = [];
        oddsMap[row.game_id].push(row);
      }

      // Accumulate stats
      const over = initStats();
      const under = initStats();
      const homeML = initStats();
      const awayML = initStats();
      const favoriteML = initStats();
      const underdogML = initStats();
      const homeSpread = initStats();
      const awaySpread = initStats();
      const awayPlusOneHalf = initStats();

      for (const result of finalResults) {
        const rows: OddsRow[] = oddsMap[result.game_id];
        if (!rows || rows.length === 0) continue;

        const { home_score, away_score } = result;
        const totalRuns = home_score + away_score;
        const homeWon = home_score > away_score;
        const awayWon = away_score > home_score;

        // Best moneyline prices
        const bestMlHome = bestOf(rows, "ml_home");
        const bestMlAway = bestOf(rows, "ml_away");

        // Best spread prices
        const bestSpreadHomePrice = bestOf(rows, "spread_home_price");
        const bestSpreadAwayPrice = bestOf(rows, "spread_away_price");

        // Best totals prices
        const bestOverPrice = bestOf(rows, "total_over_price");
        const bestUnderPrice = bestOf(rows, "total_under_price");

        // Spread and total lines (consistent across books; take first non-null)
        const spreadHomeLine = rows.find((r) => r.spread_home != null)?.spread_home ?? null;
        const spreadAwayLine = rows.find((r) => r.spread_away != null)?.spread_away ?? null;
        const totalLine = rows.find((r) => r.total_over != null)?.total_over ?? null;

        // --- Over / Under ---
        if (totalLine != null) {
          const margin = totalRuns - totalLine;
          if (margin === 0) {
            recordPush(over);
            recordPush(under);
          } else {
            recordBet(over, margin > 0, bestOverPrice);
            recordBet(under, margin < 0, bestUnderPrice);
          }
        }

        // --- Home ML / Away ML ---
        recordBet(homeML, homeWon, bestMlHome);
        recordBet(awayML, awayWon, bestMlAway);

        // --- Favorite ML / Underdog ML ---
        // Lower (more negative) ML = favorite
        if (bestMlHome != null && bestMlAway != null) {
          const homeIsFavorite = bestMlHome < bestMlAway;
          if (homeIsFavorite) {
            recordBet(favoriteML, homeWon, bestMlHome);
            recordBet(underdogML, awayWon, bestMlAway);
          } else {
            recordBet(favoriteML, awayWon, bestMlAway);
            recordBet(underdogML, homeWon, bestMlHome);
          }
        }

        // --- Home Spread / Away Spread ---
        if (spreadHomeLine != null) {
          const homeMargin = home_score + spreadHomeLine - away_score;
          if (homeMargin === 0) recordPush(homeSpread);
          else recordBet(homeSpread, homeMargin > 0, bestSpreadHomePrice);
        }
        if (spreadAwayLine != null) {
          const awayMargin = away_score + spreadAwayLine - home_score;
          if (awayMargin === 0) recordPush(awaySpread);
          else recordBet(awaySpread, awayMargin > 0, bestSpreadAwayPrice);
        }

        // --- Away +1.5 (only games listed at that exact line) ---
        const awayPlusOneHalfRows = rows.filter((r) => r.spread_away === 1.5);
        if (awayPlusOneHalfRows.length > 0) {
          const bestPrice = awayPlusOneHalfRows.reduce<number | null>((best, r) => {
            if (r.spread_away_price == null) return best;
            return best === null || r.spread_away_price > best ? r.spread_away_price : best;
          }, null);
          const coversOneHalf = away_score + 1.5 > home_score;
          recordBet(awayPlusOneHalf, coversOneHalf, bestPrice);
        }
      }

      setStats({ over, under, homeML, awayML, favoriteML, underdogML, homeSpread, awaySpread, awayPlusOneHalf });
      setLoading(false);
    }

    load();
  }, []);

  return (
    <main className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <Link href="/" className="nav-link">← Today</Link>
            <span className="divider">|</span>
            <span className="logo-icon">⚾</span>
            <span className="logo-text">LINEWATCH</span>
            <span className="divider">|</span>
            <Link href="/results" className="nav-link">Yesterday →</Link>
          </div>
        </div>
      </header>

      <div className="content">
        <div className="section-header">
          <h2 className="section-title">Bet Performance</h2>
          <span className="section-sub">flat $100 / best available line</span>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <span>Crunching numbers...</span>
          </div>
        ) : error ? (
          <div className="empty">{error}</div>
        ) : !stats ? (
          <div className="empty">No historical data found.</div>
        ) : (
          <div className="cards-grid">
            <StatCard label="OVER" stats={stats.over} />
            <StatCard label="UNDER" stats={stats.under} />
            <StatCard label="HOME ML" stats={stats.homeML} />
            <StatCard label="AWAY ML" stats={stats.awayML} />
            <StatCard label="FAVORITE ML" stats={stats.favoriteML} />
            <StatCard label="UNDERDOG ML" stats={stats.underdogML} />
            <StatCard label="HOME SPREAD" stats={stats.homeSpread} />
            <StatCard label="AWAY SPREAD" stats={stats.awaySpread} />
            <StatCard label="AWAY +1.5" stats={stats.awayPlusOneHalf} note="run line only" />
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
        .nav-link {
          font-size: 12px;
          color: #3a6080;
          text-decoration: none;
          letter-spacing: 0.04em;
          transition: color 0.2s;
        }
        .nav-link:hover { color: #6aaad4; }
        .divider { color: #1e2a38; font-size: 14px; }

        .section-header {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 24px;
        }
        .section-title {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #cbd5e1;
          text-transform: uppercase;
        }
        .section-sub {
          font-size: 11px;
          color: #3a5068;
          letter-spacing: 0.04em;
        }

        .cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        @media (max-width: 640px) {
          .cards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 400px) {
          .cards-grid {
            grid-template-columns: 1fr;
          }
        }

        .stat-card {
          background: #0d1520;
          border: 1px solid #1a2535;
          border-radius: 6px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transition: border-color 0.2s;
        }
        .stat-card:hover { border-color: #2a3f58; }

        .card-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .card-label {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: #8aa4bc;
          text-transform: uppercase;
        }

        .card-count {
          font-size: 10px;
          color: #2d4a64;
          letter-spacing: 0.04em;
        }

        .card-rate {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 48px;
          font-weight: 800;
          letter-spacing: -0.01em;
          line-height: 1;
        }

        .card-rate-label {
          font-size: 10px;
          color: #2d4a64;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .card-note {
          font-size: 10px;
          color: #2d4a64;
          letter-spacing: 0.04em;
          font-style: italic;
          margin-bottom: 2px;
        }

        .card-bottom {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #111e2c;
        }

        .card-record {
          font-size: 13px;
          color: #4a6880;
          letter-spacing: 0.02em;
        }

        .card-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .card-pnl {
          font-family: 'Barlow Condensed', sans-serif;
          font-size: 18px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .card-roi {
          font-size: 10px;
          letter-spacing: 0.04em;
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
