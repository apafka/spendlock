// Share page for one player. X reads the og:image / twitter:image tags and shows the result card.
import { board, pct, usd } from '../../data';
export const dynamic = 'force-dynamic';
const BASE = process.env.GAME_PUBLIC_URL || 'http://localhost:3000';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { week, rows } = board();
  const r = rows.find((x: any) => x.player.toLowerCase() === decodeURIComponent(name).toLowerCase());
  const title = r ? `${r.player} is #${r.rank} in HL Fantasy League ${week.key} (${pct(r.score)})` : 'HL Fantasy League';
  const img = `${BASE}/game/card/${encodeURIComponent(name)}`;
  return { metadataBase: new URL(BASE), title, description: 'Draft 5 real Hyperliquid traders. Free to play.',
    openGraph: { title, images: [{ url: img, width: 1200, height: 630 }] }, twitter: { card: 'summary_large_image', title, images: [img] } };
}

export default async function Player({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { week, rows } = board();
  const r = rows.find((x: any) => x.player.toLowerCase() === decodeURIComponent(name).toLowerCase());
  if (!r) return <p>No team called “{decodeURIComponent(name)}” this week. <a href="/game">Draft one →</a></p>;
  const text = `My HL Fantasy League team is #${r.rank}/${rows.length} this week at ${pct(r.score)}. Draft 5 real Hyperliquid traders and beat me:`;
  const url = `${BASE}/game/p/${encodeURIComponent(r.player)}`;
  return (
    <div>
      <img src={`/game/card/${encodeURIComponent(r.player)}`} alt="result card" style={{ width: '100%', maxWidth: 800, borderRadius: 12, border: '1px solid #ddd' }} />
      <p>
        <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank"
          style={{ background: '#000', color: '#fff', padding: '8px 16px', borderRadius: 20, textDecoration: 'none', fontWeight: 700 }}>Share on X</a>
        {' '}<a href="/game/leaderboard">Leaderboard</a> · <a href="/game">Draft your own</a>
      </p>
      <p style={{ color: '#444' }}>{r.player}: {pct(r.score)} · team PnL {usd(r.pnl)} · rank {r.rank} of {rows.length} · week {week.key}</p>
    </div>
  );
}
