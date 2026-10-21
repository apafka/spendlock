// Server side: hands the browser the contract addresses + ABIs for the chosen network.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd(), '..');
const NETWORK = process.env.NETWORK || 'local';
const RPC: Record<string, string> = { local: 'http://127.0.0.1:8545', 'base-sepolia': 'https://sepolia.base.org', base: 'https://mainnet.base.org' };
const CHAIN_ID: Record<string, number> = { local: 31337, 'base-sepolia': 84532, base: 8453 };
const abi = (n: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/out', `${n}.sol`, `${n}.json`), 'utf8')).abi;

export async function GET() {
  const depFile = path.join(ROOT, 'deployments', `${NETWORK}.json`);
  if (!fs.existsSync(depFile)) return Response.json({ error: `No deployment for ${NETWORK}. Run: cd agents && node deploy.js` }, { status: 500 });
  return Response.json({
    network: NETWORK,
    chainId: CHAIN_ID[NETWORK],
    rpc: process.env.NEXT_PUBLIC_RPC_URL || RPC[NETWORK],
    deployment: JSON.parse(fs.readFileSync(depFile, 'utf8')),
    escrowAbi: abi('ResultEscrow'),
    usdcAbi: abi('MockUSDC'),
    spendlockAbi: fs.existsSync(path.join(ROOT, 'contracts/out/Spendlock.sol/Spendlock.json')) ? abi('Spendlock') : null,
  });
}
