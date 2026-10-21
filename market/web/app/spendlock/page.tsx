'use client';
// Spendlock owner dashboard: vault balance, agents + their rules, recent spends/rejections, pending approvals.
// Everything is read straight from the chain (contract state + events). Approve/reject sign as the owner:
// on the local chain with anvil's public test account #5 (play money), elsewhere with a browser wallet.
import { useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, http, defineChain, formatUnits } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk'; // PUBLIC, local only
const REQ = ['None', 'Pending', 'Approved', 'Rejected', 'Cancelled'];
const usd = (v: bigint) => `$${Number(formatUnits(v, 6)).toFixed(2)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const th = { textAlign: 'left' as const, borderBottom: '1px solid #ccc', padding: '4px 8px', fontSize: 13 };
const td = { padding: '4px 8px', borderBottom: '1px solid #eee', fontSize: 13, verticalAlign: 'top' as const };

export default function SpendlockDashboard() {
  const [cfg, setCfg] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const chain = cfg && defineChain({ id: cfg.chainId, name: cfg.network, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [cfg.rpc] } } });
  const pub: any = chain ? createPublicClient({ chain, transport: http(cfg.rpc) }) : null;
  const vault = cfg?.deployment?.spendlock;

  useEffect(() => { fetch('/api/config').then((r) => r.json()).then((c) => (c.error ? setMsg(c.error) : setCfg(c))); }, []);
  useEffect(() => { if (pub && vault) load(); else if (cfg && !vault) setMsg('Spendlock is not deployed on this network. Run ./demo-spendlock.sh (KEEP=1) or node agents/deploy-spendlock.js'); }, [cfg]); // eslint-disable-line

  async function load() {
    const c = { address: vault, abi: cfg.spendlockAbi };
    const read = (functionName: string, args: any[] = []) => pub.readContract({ ...c, functionName, args });
    const [balance, killed, owner, n, reqCount] = await Promise.all([read('balance'), read('killed'), read('owner'), read('agentCount'), read('requestCount')]);
    const agentAddrs: string[] = await Promise.all([...Array(Number(n)).keys()].map((i) => read('agentList', [BigInt(i)])));
    const events: any[] = await pub.getContractEvents({ ...c, fromBlock: BigInt(0) });
    const allow: Record<string, Record<string, boolean>> = {};
    for (const e of events.filter((x) => x.eventName === 'AllowlistSet')) (allow[e.args.agent] ||= {})[e.args.target] = e.args.allowed;
    const agents = await Promise.all(agentAddrs.map(async (a) => {
      const [perTxCap, dailyLimit, totalBudget, approvalThreshold, expiry, active, paused] = await read('policies', [a]);
      const [, today, budgetLeft, now] = await read('remaining', [a]);
      const spentToday = await read('spentToday', [a]);
      return { a, perTxCap, dailyLimit, totalBudget, approvalThreshold, expiry, active, paused, today, budgetLeft, now, spentToday,
        allowed: Object.entries(allow[a] || {}).filter(([, ok]) => ok).map(([t]) => t) };
    }));
    const requests = await Promise.all([...Array(Number(reqCount)).keys()].map(async (i) => ({ id: i + 1, ...(await read('getRequest', [BigInt(i + 1)])) })));
    const blocks: Record<string, number> = {};
    const activity = events.filter((e) => ['Spent', 'SpendRejected', 'SpendRequested'].includes(e.eventName)).reverse().slice(0, 25);
    await Promise.all([...new Set(activity.map((e) => e.blockNumber))].map(async (b: any) => { blocks[String(b)] = Number((await pub.getBlock({ blockNumber: b })).timestamp); }));
    setData({ balance, killed, owner, agents, requests, activity, blocks, policyChanges: events.filter((e) => ['PolicySet', 'AllowlistSet', 'AgentPaused', 'KillSwitch', 'AgentRemoved'].includes(e.eventName)).length });
  }

  async function ownerWallet() {
    if (cfg.network === 'local') return createWalletClient({ account: mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 5 }), chain, transport: http(cfg.rpc) });
    const eth = (window as any).ethereum;
    if (!eth) throw new Error('Connect the owner wallet (MetaMask / Coinbase Wallet).');
    const [a] = await eth.request({ method: 'eth_requestAccounts' });
    return createWalletClient({ account: a, chain, transport: custom(eth) });
  }
  async function act(functionName: string, args: any[], label: string) {
    setBusy(true); setMsg(`${label}…`);
    try {
      const w: any = await ownerWallet();
      const { request } = await pub.simulateContract({ account: w.account, address: vault, abi: cfg.spendlockAbi, functionName, args });
      const r = await pub.waitForTransactionReceipt({ hash: await w.writeContract(request) });
      setMsg(`${label}: done (tx ${r.transactionHash.slice(0, 10)}…).`);
      await load();
    } catch (e: any) { setMsg('Error: ' + (e.shortMessage || e.message)); }
    setBusy(false);
  }

  const name = (t: string) => (cfg?.deployment?.escrow && t.toLowerCase() === cfg.deployment.escrow.toLowerCase() ? 'ResultEscrow' : short(t));
  const agentName = (a: string) => { const i = data?.agents.findIndex((x: any) => x.a === a); return i >= 0 ? `Agent ${String.fromCharCode(65 + i)}` : short(a); };
  const pending = data?.requests.filter((r: any) => r.status === 1) || [];

  return (
    <div style={{ width: 'min(1100px, 96vw)', position: 'relative', left: '50%', transform: 'translateX(-50%)' }}>
      <h1 style={{ marginBottom: 0 }}>Spendlock: owner dashboard</h1>
      <p style={{ marginTop: 4, color: '#555' }}>Your agents spend from this vault only within the rules below. The rules are enforced by the contract, not by this page.</p>
      {msg && <p style={{ background: '#f4f4f4', padding: 8 }}>{msg}</p>}
      {data && (<>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Card label="Vault balance" value={usd(data.balance)} />
          <Card label="Agents" value={String(data.agents.length)} />
          <Card label="Pending approvals" value={String(pending.length)} warn={pending.length > 0} />
          <Card label="Kill switch" value={data.killed ? 'ON: all spending stopped' : 'off'} warn={data.killed} />
        </div>
        <p style={{ fontSize: 12, color: '#666' }}>Network {cfg.network} · vault {vault} · owner {data.owner} · {data.policyChanges} policy changes onchain</p>
        <button disabled={busy} onClick={() => act('setKill', [!data.killed], data.killed ? 'Turning kill switch off' : 'Turning kill switch ON')}
          style={{ background: data.killed ? '#2a7' : '#c22', color: '#fff', border: 0, padding: '6px 12px', borderRadius: 4 }}>
          {data.killed ? 'Turn kill switch off' : 'KILL SWITCH: stop all agents'}
        </button>

        <h2>Pending approvals</h2>
        {pending.length === 0 ? <p>None.</p> : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr>{['#', 'Agent', 'Pay to', 'Amount', 'Memo', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{pending.map((r: any) => (
              <tr key={r.id} style={{ background: '#fff7d6' }}>
                <td style={td}>{r.id}</td><td style={td}>{agentName(r.agent)}</td><td style={td}>{name(r.to)}{r.isCall ? ' (escrow job: approving here funds it; use node spendlock-owner.js approve to also run delivery)' : ''}</td>
                <td style={td}><b>{usd(r.amount)}</b></td><td style={td}>{r.memo}</td>
                <td style={td}>
                  <button disabled={busy} onClick={() => act('approveRequest', [BigInt(r.id)], `Approving #${r.id}`)}>Approve</button>{' '}
                  <button disabled={busy} onClick={() => act('rejectRequest', [BigInt(r.id), 'rejected in dashboard'], `Rejecting #${r.id}`)}>Reject</button>
                </td>
              </tr>))}</tbody></table>)}

        <h2>Agents and rules</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr>{['Agent', 'Per tx', 'Daily (spent today)', 'Budget left', 'Ask owner above', 'Expires', 'May pay', 'State'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{data.agents.map((g: any) => (
            <tr key={g.a}>
              <td style={td}><b>{agentName(g.a)}</b><br /><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{short(g.a)}</span></td>
              <td style={td}>{usd(g.perTxCap)}</td>
              <td style={td}>{usd(g.dailyLimit)} ({usd(g.spentToday)})</td>
              <td style={td}>{usd(g.budgetLeft)} of {usd(g.totalBudget)}</td>
              <td style={td}>{g.approvalThreshold ? usd(g.approvalThreshold) : 'never'}</td>
              <td style={td}>{g.expiry ? new Date(Number(g.expiry) * 1000).toISOString().slice(0, 10) : 'never'}</td>
              <td style={td}>{g.allowed.map(name).join(', ') || 'nobody'}</td>
              <td style={td}>
                {!g.active ? 'removed' : g.paused ? 'paused' : data.killed ? 'stopped (kill switch)' : `can spend ${usd(g.now)} now`}<br />
                {g.active && <button disabled={busy} style={{ fontSize: 11 }} onClick={() => act('setAgentPaused', [g.a, !g.paused], g.paused ? 'Resuming agent' : 'Pausing agent')}>{g.paused ? 'Resume' : 'Pause'}</button>}
              </td>
            </tr>))}</tbody></table>

        <h2>Recent spends and rejections</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr>{['Time (chain)', 'Agent', 'Event', 'Amount', 'To', 'Reason / memo', 'Tx'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>{data.activity.map((e: any, i: number) => {
            const bg = e.eventName === 'Spent' ? '#eaffea' : e.eventName === 'SpendRejected' ? '#ffecec' : '#fff7d6';
            const label = e.eventName === 'Spent' ? 'spent' : e.eventName === 'SpendRejected' ? 'REJECTED' : `asked approval (#${e.args.requestId})`;
            return (<tr key={i} style={{ background: bg }}>
              <td style={td}>{new Date(data.blocks[String(e.blockNumber)] * 1000).toISOString().slice(5, 16).replace('T', ' ')} UTC</td>
              <td style={td}>{agentName(e.args.agent)}</td><td style={td}>{label}</td><td style={td}>{usd(e.args.amount)}</td>
              <td style={td}>{name(e.args.to)}</td>
              <td style={td}>{e.args.reason ? <b>{e.args.reason}</b> : null}{e.args.reason ? ' · ' : ''}{e.args.memo}</td>
              <td style={{ ...td, fontFamily: 'monospace', fontSize: 11 }}>{e.transactionHash.slice(0, 10)}…</td>
            </tr>);
          })}</tbody></table>
        <p><button onClick={load}>Refresh</button></p>
      </>)}
    </div>
  );
}

function Card({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', minWidth: 160, background: warn ? '#fff1f1' : '#fafafa' }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: warn ? '#b00' : '#111' }}>{value}</div>
    </div>
  );
}
