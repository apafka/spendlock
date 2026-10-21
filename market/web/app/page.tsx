'use client';
// The whole UI in one file. Read top to bottom:
// 1) load config  2) connect a wallet  3) post + fund a job  4) list jobs.
import { useEffect, useState } from 'react';
import {
  createPublicClient, createWalletClient, custom, http, defineChain, keccak256, toBytes, zeroAddress, parseUnits, formatUnits,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

const STATUS = ['None', 'Open', 'Submitted', 'Settled', 'Refunded'];
// PUBLIC anvil test mnemonic: only used on the local chain, worthless anywhere else.
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';

export default function Home() {
  const [cfg, setCfg] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [addr, setAddr] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const [log, setLog] = useState('');
  const [report, setReport] = useState<any>(null);
  const [kind, setKind] = useState<'wallets' | 'leads'>('wallets');
  const [wform, setWform] = useState({
    title: 'Profitable active Hyperliquid perp traders (last 30 days)',
    windowDays: 30, minRealizedPnlUsd: 10000, minTrades: 20, minAccountValueUsd: 50000,
    maxItems: 30, pricePerItemUSDC: 3, deadlineHours: 24,
  });
  const [form, setForm] = useState({
    title: 'European energy companies with a live domain',
    countries: 'EE,LV,LT,FI,SE,DK,DE,PL,NL,FR,ES,IT',
    maxItems: 10, pricePerItemUSDC: 4, deadlineHours: 24,
  });

  const chain = cfg && defineChain({ id: cfg.chainId, name: cfg.network, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [cfg.rpc] } } });
  const pub: any = chain ? createPublicClient({ chain, transport: http(cfg.rpc) }) : null; // "any" keeps types simple for learning

  useEffect(() => { fetch('/api/config').then((r) => r.json()).then((c) => (c.error ? setLog(c.error) : setCfg(c))); }, []);
  useEffect(() => { if (pub) refreshJobs(); }, [cfg]); // eslint-disable-line

  async function connectBrowserWallet() {
    const eth = (window as any).ethereum;
    if (!eth) return setLog('No browser wallet found (install MetaMask or Coinbase Wallet).');
    const [a] = await eth.request({ method: 'eth_requestAccounts' });
    try { await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x' + cfg.chainId.toString(16) }] }); } catch {}
    setWallet(createWalletClient({ account: a, chain, transport: custom(eth) })); setAddr(a);
  }
  function useLocalTestAccount() {
    const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 1 }); // same CLIENT as the agents
    setWallet(createWalletClient({ account, chain, transport: http(cfg.rpc) })); setAddr(account.address);
  }

  async function postJob() {
    if (!wallet || !pub) return;
    try {
      const d = cfg.deployment;
      const spec: any = kind === 'wallets'
        ? { title: wform.title, resultType: 'hl-wallets/v1', maxItems: Number(wform.maxItems), pricePerItemUSDC: Number(wform.pricePerItemUSDC), deadlineHours: Number(wform.deadlineHours),
            rules: { windowDays: Number(wform.windowDays), minRealizedPnlUsd: Number(wform.minRealizedPnlUsd), minTrades: Number(wform.minTrades), minAccountValueUsd: Number(wform.minAccountValueUsd), claimTolerance: 0.1 } }
        : { title: form.title, resultType: 'company-leads/v1', countries: form.countries.split(',').map((s) => s.trim().toUpperCase()),
            maxItems: Number(form.maxItems), pricePerItemUSDC: Number(form.pricePerItemUSDC), deadlineHours: Number(form.deadlineHours) };
      const specText = JSON.stringify(spec, null, 2);
      const budget = parseUnits(String(spec.maxItems * spec.pricePerItemUSDC), 6);
      const account = wallet.account!;
      if (cfg.network === 'local') { // free play money, local only
        setLog('Minting test USDC…');
        await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ chain, account, address: d.usdc, abi: cfg.usdcAbi, functionName: 'mint', args: [account.address, budget] }) });
      }
      setLog('Step 1/2: approve USDC…');
      await pub.waitForTransactionReceipt({ hash: await wallet.writeContract({ chain, account, address: d.usdc, abi: cfg.usdcAbi, functionName: 'approve', args: [d.escrow, budget] }) });
      setLog('Step 2/2: create job (locks USDC in escrow)…');
      const deadline = BigInt(Math.floor(Date.now() / 1000) + spec.deadlineHours * 3600);
      const verifier = mnemonicVerifier(cfg.network);
      const { result: jobId, request } = await pub.simulateContract({ account, address: d.escrow, abi: cfg.escrowAbi, functionName: 'createJob',
        args: [zeroAddress, verifier, BigInt(spec.maxItems), parseUnits(String(spec.pricePerItemUSDC), 6), deadline, keccak256(toBytes(specText))] });
      await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request as any) });
      await fetch('/api/spec', { method: 'POST', body: JSON.stringify({ jobId: String(jobId), specText }) });
      setLog(`Job #${jobId} funded. Now run: node worker.js --job ${jobId}${kind === 'wallets' ? ' --candidates data/hl-candidates.csv' : ''} && node verifier.js --job ${jobId}`);
      refreshJobs();
    } catch (e: any) { setLog('Error: ' + (e.shortMessage || e.message)); }
  }

  async function refreshJobs() {
    if (!pub) return;
    const d = cfg.deployment;
    const n = Number(await pub.readContract({ address: d.escrow, abi: cfg.escrowAbi, functionName: 'jobCount' }));
    const out = [];
    for (let i = n; i >= 1 && i > n - 20; i--) {
      const j: any = await pub.readContract({ address: d.escrow, abi: cfg.escrowAbi, functionName: 'jobs', args: [BigInt(i)] });
      out.push({ id: i, client: j[0], worker: j[1], maxItems: Number(j[3]), price: formatUnits(j[4], 6), status: STATUS[j[6]] });
    }
    setJobs(out);
  }

  async function showResults(id: number) {
    const r = await fetch(`/api/report?id=${id}`).then((x) => x.json());
    setReport(r.error ? { jobId: id, error: r.error } : r);
  }

  if (!cfg) return <p>{log || 'Loading…'}</p>;
  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });
  const wset = (k: string) => (e: any) => setWform({ ...wform, [k]: e.target.value });
  return (
    <main>
      <h1>Spendlock · pay per verified result</h1>
      <p>Network: <b>{cfg.network}</b> · escrow <code>{cfg.deployment.escrow}</code> · fee {cfg.deployment.feeBps / 100}% · cap ${cfg.deployment.capUsdc}/job</p>
      {!addr ? (
        <p>
          <button onClick={connectBrowserWallet}>Connect wallet</button>{' '}
          {cfg.network === 'local' && <button onClick={useLocalTestAccount}>Use local test account</button>}
        </p>
      ) : <p>Connected: <code>{addr}</code></p>}

      <h2>Post a job</h2>
      <p>
        <label><input type="radio" checked={kind === 'wallets'} onChange={() => setKind('wallets')} /> Hyperliquid wallets</label>{' '}
        <label><input type="radio" checked={kind === 'leads'} onChange={() => setKind('leads')} /> Company leads (BESS example)</label>
      </p>
      {kind === 'wallets' ? (<>
        <label>What you want<br /><input style={{ width: '100%' }} value={wform.title} onChange={wset('title')} /></label><br />
        <label>Look-back days <input type="number" value={wform.windowDays} onChange={wset('windowDays')} /></label>{' '}
        <label>Min realized PnL $ <input type="number" value={wform.minRealizedPnlUsd} onChange={wset('minRealizedPnlUsd')} /></label>{' '}
        <label>Min trades <input type="number" value={wform.minTrades} onChange={wset('minTrades')} /></label>{' '}
        <label>Min account $ <input type="number" value={wform.minAccountValueUsd} onChange={wset('minAccountValueUsd')} /></label><br />
        <label>How many wallets <input type="number" value={wform.maxItems} onChange={wset('maxItems')} /></label>{' '}
        <label>USDC per verified wallet <input type="number" value={wform.pricePerItemUSDC} onChange={wset('pricePerItemUSDC')} /></label>{' '}
        <label>Hours <input type="number" value={wform.deadlineHours} onChange={wset('deadlineHours')} /></label>
        <p>Budget locked: <b>${wform.maxItems * wform.pricePerItemUSDC} USDC</b>. Every wallet is re-checked against Hyperliquid's public API; you only pay for wallets that pass.</p>
      </>) : (<>
      <label>What you want<br /><input style={{ width: '100%' }} value={form.title} onChange={set('title')} /></label><br />
        <label>Allowed countries (ISO codes)<br /><input style={{ width: '100%' }} value={form.countries} onChange={set('countries')} /></label><br />
        <label>How many leads <input type="number" value={form.maxItems} onChange={set('maxItems')} /></label>{' '}
        <label>USDC per verified lead <input type="number" value={form.pricePerItemUSDC} onChange={set('pricePerItemUSDC')} /></label>{' '}
        <label>Hours <input type="number" value={form.deadlineHours} onChange={set('deadlineHours')} /></label>
        <p>Budget locked: <b>${form.maxItems * form.pricePerItemUSDC} USDC</b>. You only pay for leads that pass verification; the rest comes back.</p>
      </>)}
      <button disabled={!addr} onClick={postJob}>Post &amp; fund job</button>
      <p><i>{log}</i></p>

      <h2>Jobs <button onClick={refreshJobs}>↻</button></h2>
      <table cellPadding={4}><thead><tr><th>#</th><th>Status</th><th>Items</th><th>$/item</th><th>Worker</th><th></th></tr></thead>
        <tbody>{jobs.map((j) => <tr key={j.id}><td>{j.id}</td><td>{j.status}</td><td>{j.maxItems}</td><td>{j.price}</td><td><code>{j.worker.slice(0, 10)}…</code></td><td>{j.status === 'Settled' && <button onClick={() => showResults(j.id)}>Results</button>}</td></tr>)}</tbody>
      </table>

      {report && (
        <section>
          <h2>Results for job #{report.jobId}</h2>
          {report.error ? <p>{report.error}</p> : (<>
            <p><b>{report.verifiedCount}</b> passed (paid) · <b>{report.reviewCount ?? 0}</b> needs review (refunded) · <b>{report.failedCount}</b> failed (refunded) · checked {new Date(report.checkedAt).toLocaleString()}</p>
            <table cellPadding={4} style={{ fontSize: 14 }}>
              {report.resultType === 'hl-wallets/v1'
                ? <thead><tr><th></th><th>Wallet</th><th>Address</th><th>Realized PnL</th><th>Trades</th><th>Account</th><th>Reason</th></tr></thead>
                : <thead><tr><th></th><th>Company</th><th>Domain</th><th>Country</th><th>Reason</th><th>Source</th></tr></thead>}
              <tbody>{['pass', 'review', 'fail'].flatMap((st) => report.items.filter((it: any) => (it.status || (it.passed ? 'pass' : 'fail')) === st)).map((it: any, i: number) => (
                <tr key={i} style={{ background: it.passed ? '#eaffea' : it.status === 'review' ? '#fff7d6' : '#ffecec' }} title={it.checks.map((c: any) => `${c.ok ? '✔' : c.ok === null ? '?' : '✘'} ${c.rule} ${c.detail}`).join('\n')}>
                  <td>{it.passed ? '✔' : it.status === 'review' ? '? review' : '✘'}</td>
                  {report.resultType === 'hl-wallets/v1' ? (<>
                    <td>{it.company}</td><td style={{ fontFamily: 'monospace' }}>{it.address}</td>
                    <td>{detail(it, 'min_pnl', /PnL (\S+)/)}</td><td>{detail(it, 'min_trades', /^(\d+)/)}</td><td>{detail(it, 'account_value', /value (\S+)/)}</td><td>{it.reason}</td>
                  </>) : (<>
                    <td>{it.company}</td><td>{it.domain}</td><td>{it.country}</td><td>{it.reason}</td>
                    <td>{it.source_url ? <a href={it.source_url} target="_blank">link</a> : '–'}</td>
                  </>)}
                </tr>))}
              </tbody>
            </table>
            <p style={{ fontSize: 12 }}>Hover a row to see every rule that ran.</p>
          </>)}
        </section>
      )}
    </main>
  );
}

// Pull one number out of a check's detail text for the wallet table ("–" if that rule didn't run).
function detail(it: any, rule: string, re: RegExp): string {
  const c = it.checks.find((x: any) => x.rule === rule);
  return c ? (c.detail.match(re)?.[1] ?? c.detail) : '–';
}

// Who is allowed to settle. Local: anvil account #3 (same as agents/verifier.js).
// Real networks: set NEXT_PUBLIC_VERIFIER_ADDRESS to your verifier wallet's address.
function mnemonicVerifier(network: string): `0x${string}` {
  if (network === 'local') return mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: 3 }).address;
  const v = process.env.NEXT_PUBLIC_VERIFIER_ADDRESS;
  if (!v) throw new Error('Set NEXT_PUBLIC_VERIFIER_ADDRESS in web/.env.local');
  return v as `0x${string}`;
}
