// Base Sepolia go-live checklist. Reads agents/.env and tells you exactly what is missing.
// It NEVER reads, prints, or uses private keys. It only checks that the key variables are SET
// and look like a key (0x + 64 hex), using the public *_ADDRESS values for balance checks.
//   node checklist.js            (checks NETWORK from .env; use NETWORK=base-sepolia node checklist.js to force)
//   node checklist.js --spendlock (also checks the Spendlock vault roles: OWNER + AGENT_A)
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createPublicClient, http, isAddress, formatEther, formatUnits, parseAbi } from 'viem';
import { baseSepolia, base } from 'viem/chains';
import { ROOT } from './config.js';

const NETWORK = process.env.NETWORK || 'local';
const TARGETS = { 'base-sepolia': { chain: baseSepolia, rpc: 'https://sepolia.base.org', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', explorer: 'https://sepolia.basescan.org' },
                  base: { chain: base, rpc: 'https://mainnet.base.org', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', explorer: 'https://basescan.org' } };
const missing = [], ok = [], warn = [];
const SPENDLOCK = process.argv.includes('--spendlock');
const need = (cond, good, fix) => (cond ? ok.push(good) : missing.push(fix));

console.log(`Spendlock go-live checklist — NETWORK=${NETWORK}\n`);
if (!TARGETS[NETWORK]) {
  console.log(`✘ NETWORK is "${NETWORK}". Set NETWORK=base-sepolia in agents/.env (copy from .env.example).`);
  process.exit(1);
}
const T = TARGETS[NETWORK];

// 1) files
const envFile = path.join(ROOT, 'agents', '.env');
need(fs.existsSync(envFile), 'agents/.env exists', 'Create agents/.env:  cp agents/.env.example agents/.env');
let ignored = false;
try { execSync('git check-ignore -q agents/.env', { cwd: ROOT }); ignored = true; } catch {}
need(ignored, 'agents/.env is git-ignored', 'agents/.env is NOT git-ignored. Add ".env" to .gitignore before putting keys in it!');
need(fs.existsSync(path.join(ROOT, 'contracts/out/ResultEscrow.sol/ResultEscrow.json')), 'contracts compiled', 'Compile contracts:  cd contracts && forge build');
if (SPENDLOCK) need(fs.existsSync(path.join(ROOT, 'contracts/out/Spendlock.sol/Spendlock.json')), 'Spendlock compiled', 'Compile contracts:  cd contracts && forge build');

// 2) keys: presence + shape only. Values are never printed or used here.
for (const role of ['DEPLOYER', 'CLIENT', 'WORKER', 'VERIFIER', ...(SPENDLOCK ? ['OWNER', 'AGENT_A'] : [])]) {
  const v = process.env[`${role}_PRIVATE_KEY`] || '';
  need(/^0x[0-9a-fA-F]{64}$/.test(v), `${role}_PRIVATE_KEY is set (format ok)`,
    v ? `${role}_PRIVATE_KEY is set but doesn't look like 0x + 64 hex characters` : `${role}_PRIVATE_KEY is empty. Export it from a NEW wallet account used only for ${role.toLowerCase()} (never your main wallet)`);
}

// 3) public addresses (needed for the web page + balance checks)
const addr = {};
for (const name of ['DEPLOYER_ADDRESS', 'CLIENT_ADDRESS', 'WORKER_ADDRESS', 'VERIFIER_ADDRESS', 'FEE_RECIPIENT', ...(SPENDLOCK ? ['OWNER_ADDRESS', 'AGENT_A_ADDRESS'] : [])]) {
  const v = process.env[name] || '';
  if (isAddress(v)) { addr[name] = v; ok.push(`${name} = ${v}`); }
  else missing.push(`${name} ${v ? 'is not a valid address' : 'is empty'}: paste the PUBLIC address (0x…, 42 chars) of that wallet account`);
}
if (addr.VERIFIER_ADDRESS && addr.VERIFIER_ADDRESS === addr.CLIENT_ADDRESS) warn.push('VERIFIER_ADDRESS equals CLIENT_ADDRESS. OK for a test, but use separate accounts for real jobs.');

// 4) caps
const cap = Number(process.env.MAX_JOB_BUDGET_USDC), spend = Number(process.env.MAX_SPEND_USDC), fee = Number(process.env.FEE_BPS ?? 200);
need(cap > 0, `MAX_JOB_BUDGET_USDC = ${cap}`, 'MAX_JOB_BUDGET_USDC is empty (on-chain cap per job, e.g. 20)');
need(spend > 0, `MAX_SPEND_USDC = ${spend}`, 'MAX_SPEND_USDC is empty (script-side cap, e.g. 20)');
need(fee >= 0 && fee <= 1000, `FEE_BPS = ${fee}`, 'FEE_BPS must be 0..1000 (200 = 2%)');
if (NETWORK === 'base' && (cap > 50 || spend > 50)) warn.push('Mainnet caps above $50: the contract is unaudited. Keep them small.');

// 5) chain: RPC reachable, right chain id, balances of PUBLIC addresses
const rpc = process.env.RPC_URL || T.rpc;
if (!process.env.RPC_URL) warn.push(`RPC_URL empty: using public ${T.rpc} (fine for testing, rate-limited).`);
try {
  const pc = createPublicClient({ chain: T.chain, transport: http(rpc) });
  const id = await pc.getChainId();
  need(id === T.chain.id, `RPC reachable, chainId ${id}`, `RPC_URL points at chainId ${id}, expected ${T.chain.id}`);
  const usdcAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);
  for (const [name, a] of Object.entries(addr)) {
    if (name === 'FEE_RECIPIENT') continue;
    const eth = await pc.getBalance({ address: a });
    need(eth > 0n, `${name} has ${formatEther(eth)} ETH for gas`, `${name} ${a} has 0 ETH. Get Base Sepolia ETH from a faucet (Coinbase Developer Platform faucet)`);
  }
  if (SPENDLOCK && addr.OWNER_ADDRESS) {
    const u = await pc.readContract({ address: T.usdc, abi: usdcAbi, functionName: 'balanceOf', args: [addr.OWNER_ADDRESS] });
    need(u > 0n, `OWNER has ${formatUnits(u, 6)} USDC to fund the vault`, `OWNER ${addr.OWNER_ADDRESS} has 0 USDC. Get test USDC at https://faucet.circle.com (choose Base Sepolia)`);
  }
  if (addr.CLIENT_ADDRESS) {
    const u = await pc.readContract({ address: T.usdc, abi: usdcAbi, functionName: 'balanceOf', args: [addr.CLIENT_ADDRESS] });
    need(u > 0n, `CLIENT has ${formatUnits(u, 6)} USDC`, `CLIENT ${addr.CLIENT_ADDRESS} has 0 USDC. Get test USDC at https://faucet.circle.com (choose Base Sepolia)`);
  }
} catch (e) {
  missing.push(`Cannot reach RPC ${rpc}: ${e.shortMessage || e.message}`);
}

// 6) deployment
const dep = path.join(ROOT, 'deployments', `${NETWORK}.json`);
if (fs.existsSync(dep)) ok.push(`deployed: ${JSON.parse(fs.readFileSync(dep, 'utf8')).escrow} (${T.explorer})`);
else warn.push('Not deployed yet. Once everything above is ✔:  node deploy.js');
if (SPENDLOCK) {
  if (NETWORK === 'base') missing.push('Spendlock is unaudited: use NETWORK=base-sepolia only.');
  const d = fs.existsSync(dep) ? JSON.parse(fs.readFileSync(dep, 'utf8')) : {};
  if (d.spendlock) ok.push(`Spendlock vault: ${d.spendlock} (owner ${d.spendlockOwner})`);
  else warn.push('Spendlock not deployed yet. After node deploy.js:  node deploy-spendlock.js');
}

for (const m of ok) console.log('✔', m);
for (const w of warn) console.log('!', w);
for (const m of missing) console.log('✘', m);
console.log(missing.length ? `\n${missing.length} thing(s) missing. Fix the ✘ lines, then run this again.` : '\nAll set. Next: node deploy.js && node post-job.js --spec data/bess-spec.json');
process.exit(missing.length ? 1 : 0);
