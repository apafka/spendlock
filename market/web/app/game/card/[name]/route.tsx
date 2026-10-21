// GET /game/card/<player> -> 1200x630 PNG result card (used as the og:image for X).
import { ImageResponse } from 'next/og';
import { board, pct, usd } from '../../data';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { week, rows } = board();
  const r: any = rows.find((x: any) => x.player.toLowerCase() === decodeURIComponent(name).toLowerCase());
  const green = '#3ddc97', red = '#ff6b6b';
  const color = (x: number) => (x >= 0 ? green : red);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#071a17,#0b2e27 60%,#123f35)', color: '#fff', padding: 56, fontSize: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9fe0cf' }}>
          <span>⚡ HL FANTASY LEAGUE</span><span>{week?.key || ''}</span>
        </div>
        {!r ? <div style={{ display: 'flex', fontSize: 64, marginTop: 120 }}>Draft 5 real Hyperliquid traders.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 20, gap: 28 }}>
              <span style={{ fontSize: 100, fontWeight: 800, lineHeight: 1 }}>#{r.rank}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 48, fontWeight: 700 }}>{r.player}</span>
                <span style={{ color: '#9fe0cf' }}>of {rows.length} teams</span>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: 96, fontWeight: 800, color: color(r.score) }}>{pct(r.score)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22, gap: 4 }}>
              {r.picks.map((p: any) => (
                <div key={p.address} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1f5a4c', paddingBottom: 4, fontSize: 25 }}>
                  <span>{p.nick}</span><span style={{ color: color(p.ret) }}>{pct(p.ret * 100, 1)}  ·  {usd(p.pnl)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', marginTop: 'auto', paddingTop: 14, justifyContent: 'space-between', color: '#9fe0cf', fontSize: 22 }}>
              <span>Real Hyperliquid performance · free to play · points only</span><span>Team PnL {usd(r.pnl)}</span>
            </div>
          </div>
        )}
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
