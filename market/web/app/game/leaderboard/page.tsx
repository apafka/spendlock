// Live leaderboard (server-rendered from game/data/league.json; the scoring job refreshes the numbers).
import { board, pct, usd } from '../data';
export const dynamic = 'force-dynamic';

export default function Leaderboard() {
  const { week, rows } = board();
  if (!week) return <p>No week yet. Run <code>node scripts/snapshot.js</code> in /game.</p>;
  const ms = week.end - Date.now();
  const left = ms > 0 ? `${Math.floor(ms / 86400000)}d ${Math.floor((ms % 86400000) / 3600000)}h left` : 'final';
  return (
    <div>
      <meta httpEquiv="refresh" content="60" />
      <h1 style={{ margin: '0 0 4px' }}>Leaderboard · {week.key}</h1>
      <p style={{ marginTop: 0, color: '#444' }}>
        {left} · last update {week.latest ? new Date(week.latest.takenAt).toUTCString().slice(5, 25) + ' UTC' : 'never'} from Hyperliquid's live API ·
        {' '}{rows.length} teams · week-start baseline: {week.baseline.mode === 'live' ? 'live snapshot' : 'backfilled from Hyperliquid portfolio history'}
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead><tr style={{ borderBottom: '2px solid #333', textAlign: 'left' }}>
          <th>#</th><th>Player</th><th style={{ textAlign: 'right' }}>Score</th><th style={{ textAlign: 'right' }}>Team PnL</th><th>Team (salary)</th><th></th>
        </tr></thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.player} style={{ borderBottom: '1px solid #eee', verticalAlign: 'top' }}>
              <td style={{ fontWeight: 800, fontSize: 18 }}>{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</td>
              <td><b>{r.player}</b>{r.sim && <span title="simulated demo player" style={{ fontSize: 11, background: '#eee', borderRadius: 4, padding: '0 4px', marginLeft: 4 }}>sim</span>}</td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: r.score >= 0 ? '#060' : '#b00' }}>{pct(r.score)}</td>
              <td style={{ textAlign: 'right' }}>{usd(r.pnl)}</td>
              <td style={{ fontSize: 12 }}>
                {r.picks.map((p: any) => (
                  <span key={p.address} style={{ display: 'inline-block', marginRight: 8 }}>
                    {p.nick} <span style={{ color: p.ret >= 0 ? '#060' : '#b00' }}>{pct(p.ret * 100, 1)}</span>
                  </span>
                ))}
                <span style={{ color: '#888' }}>({r.salary})</span>
              </td>
              <td><a href={`/game/p/${encodeURIComponent(r.player)}`}>card</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>No teams yet. <a href="/game">Draft one →</a></p>}
      <p style={{ fontSize: 12, color: '#666' }}>Score = average of your 5 traders' return since you drafted (deposits and withdrawals removed, each trader capped at −100%/+200%). Ties: higher team PnL. See game/SCORING.md.</p>
    </div>
  );
}
