'use client';
// Draft page: pick 5 real Hyperliquid traders under the salary cap, name your team, submit.
import { useEffect, useMemo, useState } from 'react';
import { signText } from './sign';

const pct = (x: number | null, d = 1) => (x == null ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%');
const usd = (x: number | null) => (x == null ? '—' : (x < 0 ? '-$' : '$') + Math.abs(x).toLocaleString('en-US'));
const short = (a: string) => a.slice(0, 6) + '…' + a.slice(-4);

export default function Draft() {
  const [pool, setPool] = useState<any>(null);
  const [err, setErr] = useState('');
  const [picks, setPicks] = useState<string[]>([]);
  const [player, setPlayer] = useState('');
  const [wallet, setWallet] = useState('');
  const [sort, setSort] = useState<'salary' | 'monthRoi' | 'monthPnl' | 'weekRet'>('salary');
  const [msg, setMsg] = useState<any>(null);
  useEffect(() => {
    fetch('/api/game/pool').then((r) => r.json()).then((p) => (p.error ? setErr(p.error) : setPool(p)));
    const saved = localStorage.getItem('hlfl_player'); if (saved) setPlayer(saved);
  }, []);
  const byAddr = useMemo(() => Object.fromEntries((pool?.traders || []).map((t: any) => [t.address, t])), [pool]);
  const spent = picks.reduce((s, a) => s + (byAddr[a]?.salary || 0), 0);
  const left = (pool?.cap || 50) - spent;
  const rows = useMemo(() => [...(pool?.traders || [])].sort((a: any, b: any) => (b[sort] ?? -1e9) - (a[sort] ?? -1e9)), [pool, sort]);

  function toggle(a: string) {
    setMsg(null);
    if (picks.includes(a)) return setPicks(picks.filter((x) => x !== a));
    if (picks.length >= (pool?.teamSize || 5)) return setMsg({ error: 'Team is full: remove someone first.' });
    if (byAddr[a].salary > left) return setMsg({ error: `Over the cap: ${byAddr[a].nick} costs ${byAddr[a].salary}, you have ${left} left.` });
    setPicks([...picks, a]);
  }
  async function connect() {
    const eth = (window as any).ethereum;
    if (!eth) return setMsg({ error: 'No browser wallet found. A username is enough to play.' });
    const [a] = await eth.request({ method: 'eth_requestAccounts' }); setWallet(a);
  }
  async function submit() {
    setMsg(null);
    const body: any = { player, picks };
    if (wallet) {
      try { body.wallet = wallet; body.signature = await (window as any).ethereum.request({ method: 'personal_sign', params: [signText(player, pool.weekKey), wallet] }); }
      catch { return setMsg({ error: 'Signature cancelled.' }); }
    }
    const r = await fetch('/api/game/enter', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
    if (r.ok) localStorage.setItem('hlfl_player', player);
    setMsg(r);
  }

  if (err) return <p style={{ color: '#b00' }}>{err}</p>;
  if (!pool) return <p>Loading the pool…</p>;
  const th = (k: any, label: string) => <th onClick={() => setSort(k)} style={{ cursor: 'pointer', textAlign: 'right', textDecoration: sort === k ? 'underline' : 'none' }}>{label}</th>;
  return (
    <div>
      <h1 style={{ margin: '0 0 4px' }}>Draft 5 real traders. Beat everyone.</h1>
      <p style={{ marginTop: 0, color: '#444' }}>
        Week <b>{pool.weekKey}</b> · ends {new Date(pool.end).toUTCString().slice(0, 22)} UTC · your score = your 5 traders' average real return on Hyperliquid
        from the moment you draft. Salary cap <b>{pool.cap}</b>, so you can't just take the top 5. <a href="/game/leaderboard">See the leaderboard →</a>
      </p>
      <div style={{ position: 'sticky', top: 0, background: '#fff', padding: '10px 0', borderBottom: '1px solid #eee', zIndex: 1 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {Array.from({ length: pool.teamSize }, (_, i) => picks[i]).map((a, i) => (
            <span key={i} onClick={() => a && toggle(a)} style={{ border: '1px solid #ccc', borderRadius: 8, padding: '4px 10px', minWidth: 120, background: a ? '#eef6ff' : '#fafafa', cursor: a ? 'pointer' : 'default' }}>
              {a ? <>{byAddr[a].nick} <b>{byAddr[a].salary}</b> ✕</> : <span style={{ color: '#999' }}>pick {i + 1}</span>}
            </span>
          ))}
          <b style={{ marginLeft: 'auto', color: left < 0 ? '#b00' : '#060' }}>{left} / {pool.cap} credits left</b>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input placeholder="username (3-20 letters, numbers, _)" value={player} onChange={(e) => setPlayer(e.target.value)} style={{ padding: 6, width: 240 }} />
          <button onClick={connect}>{wallet ? `Wallet ${short(wallet)}` : 'Connect wallet (optional)'}</button>
          <button onClick={submit} disabled={picks.length !== pool.teamSize || !player} style={{ fontWeight: 700, padding: '6px 16px' }}>Lock in team</button>
          {msg?.error && <span style={{ color: '#b00' }}>{msg.error}</span>}
          {msg?.ok && <span style={{ color: '#060' }}>Locked in! <a href={msg.share}>Your share card →</a></span>}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 8 }}>
        <thead><tr style={{ borderBottom: '2px solid #333' }}>
          <th></th><th style={{ textAlign: 'left' }}>Trader</th>{th('salary', 'Salary')}{th('monthRoi', '30d return')}{th('monthPnl', '30d PnL')}
          <th style={{ textAlign: 'right' }}>30d trades</th><th style={{ textAlign: 'right' }}>Account</th>{th('weekRet', 'This week')}
        </tr></thead>
        <tbody>
          {rows.map((t: any) => {
            const on = picks.includes(t.address);
            return (
              <tr key={t.address} onClick={() => toggle(t.address)} style={{ borderBottom: '1px solid #eee', background: on ? '#eef6ff' : undefined, cursor: 'pointer' }}>
                <td><input type="checkbox" readOnly checked={on} /></td>
                <td><b>{t.nick}</b> <a href={`https://app.hyperliquid.xyz/explorer/address/${t.address}`} target="_blank" onClick={(e) => e.stopPropagation()} style={{ fontSize: 12, color: '#888' }}>{short(t.address)}</a></td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.salary}</td>
                <td style={{ textAlign: 'right' }}>{pct(t.monthRoi)}</td>
                <td style={{ textAlign: 'right' }}>{usd(t.monthPnl)}</td>
                <td style={{ textAlign: 'right' }} title={t.veryActive ? 'At the API 10k-fill history cap: very active' : ''}>{t.veryActive ? '10k+' : t.trades30d ?? '—'}</td>
                <td style={{ textAlign: 'right' }}>{usd(t.accountValue)}</td>
                <td style={{ textAlign: 'right', color: t.weekRet == null ? '#999' : t.weekRet >= 0 ? '#060' : '#b00' }}>{pct(t.weekRet, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: '#666' }}>Pool: {pool.traders.length} wallets from the public Hyperliquid leaderboard, each re-checked against the official info API
        (≥{pool.rules.minTrades} trades and ≥${pool.rules.minAccountValueUsd.toLocaleString()} account in 30 days). Built {new Date(pool.builtAt).toUTCString()}.
        Not investment advice; nobody here trades your money.</p>
    </div>
  );
}
