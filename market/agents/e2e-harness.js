// Test harness for the end-to-end tests (concurrency.test.js, x402.test.js). Fully offline:
// a private anvil on a spare port, a fake Hyperliquid (leaderboard + info API) on localhost,
// and a temp folder for deployments and job files. Import config-dependent modules only AFTER setup().
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FOUNDRY = path.join(os.homedir(), '.foundry', 'bin');
const bin = (n) => [path.join(FOUNDRY, n), n].find((p) => { try { execFileSync(p, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; } });
export const hasAnvil = () => Boolean(bin('anvil'));

export const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const addr = (i) => '0x' + i.toString(16).padStart(2, '0').repeat(20);

// 16 fake traders: 6 very active winners, 4 light winners (25 trades), 6 losers.
export const WALLETS = [
  ...Array.from({ length: 6 }, (_, i) => ({ address: addr(0x10 + i), av: 100000, fills: 60, pnl: 400 })),
  ...Array.from({ length: 4 }, (_, i) => ({ address: addr(0x30 + i), av: 100000, fills: 25, pnl: 600 })),
  ...Array.from({ length: 6 }, (_, i) => ({ address: addr(0x50 + i), av: 100000, fills: 40, pnl: -50 })),
];

function startFakeHL() {
  const byAddr = Object.fromEntries(WALLETS.map((w) => [w.address, w]));
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => setTimeout(() => { // small delay so concurrent buys really interleave
      res.setHeader('content-type', 'application/json');
      if (req.url.startsWith('/leaderboard')) {
        return res.end(JSON.stringify({ leaderboardRows: WALLETS.map((w, i) => ({ ethAddress: w.address, displayName: `fake${i}`, accountValue: String(w.av),
          windowPerformances: [['month', { pnl: String(20000 + i), roi: '0.1', vlm: '1' }]] })) }));
      }
      const q = JSON.parse(body || '{}'); const w = byAddr[q.user] || { av: 0, fills: 0, pnl: 0 };
      if (q.type === 'clearinghouseState') return res.end(JSON.stringify({ marginSummary: { accountValue: String(w.av) } }));
      if (q.type === 'spotClearinghouseState') return res.end(JSON.stringify({ balances: [] }));
      if (q.type === 'userFillsByTime') return res.end(JSON.stringify(Array.from({ length: w.fills }, (_, k) => ({ time: q.endTime - 1000 * (k + 1), closedPnl: String(w.pnl), fee: '1' }))));
      res.statusCode = 400; res.end('{}');
    }, 5 + Math.random() * 10));
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve(srv)));
}

export async function setup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spendlock-e2e-'));
  const port = await freePort();
  const anvil = spawn(bin('anvil'), ['--port', String(port), '--silent'], { stdio: 'ignore' });
  const hl = await startFakeHL();
  const hlBase = `http://127.0.0.1:${hl.address().port}`;
  Object.assign(process.env, {
    NETWORK: 'local', LOCAL_RPC_URL: `http://127.0.0.1:${port}`, DEPLOYMENT_FILE: path.join(tmp, 'local.json'),
    JOBS_DIR: path.join(tmp, 'jobs'), HL_INFO_URL: `${hlBase}/info`, HL_LEADERBOARD_URL: `${hlBase}/leaderboard`, MAX_SPEND_USDC: '1000',
  });
  if (!fs.existsSync(path.join(here, '..', 'contracts', 'out', 'ResultEscrow.sol', 'ResultEscrow.json'))) {
    execFileSync(bin('forge'), ['build', '-q'], { cwd: path.join(here, '..', 'contracts') });
  }
  for (let i = 0; i < 100; i++) { // wait for anvil
    try { await fetch(process.env.LOCAL_RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' }); break; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  execFileSync('node', ['deploy.js'], { cwd: here, env: process.env, stdio: 'ignore' });
  return { tmp, teardown: () => { anvil.kill(); hl.close(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}
