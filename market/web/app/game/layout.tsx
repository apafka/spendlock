export const metadata = { title: 'HL Fantasy League — draft real Hyperliquid traders' };
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 'min(1080px, 96vw)', position: 'relative', left: '50%', transform: 'translateX(-50%)' }}>
      <nav style={{ display: 'flex', gap: 16, alignItems: 'baseline', borderBottom: '1px solid #ddd', paddingBottom: 8, marginBottom: 16 }}>
        <a href="/game" style={{ fontWeight: 800, fontSize: 20, color: '#111', textDecoration: 'none' }}>⚡ HL Fantasy League</a>
        <a href="/game">Draft</a>
        <a href="/game/leaderboard">Leaderboard</a>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>Free to play · points only · no real money</span>
      </nav>
      {children}
    </div>
  );
}
