// One place that decides WHICH chain we talk to. Change NETWORK in .env, nothing else.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

// LOCAL_RPC_URL lets tests run their own anvil on a spare port.
const LOCAL_RPC = process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545';
export const NETWORKS = {
  local: {
    chain: defineChain({ id: 31337, name: 'anvil', nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [LOCAL_RPC] } } }),
    rpc: LOCAL_RPC,
    usdc: null, // MockUSDC gets deployed by deploy.js
  },
  'base-sepolia': { chain: baseSepolia, rpc: process.env.RPC_URL || 'https://sepolia.base.org', usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' },
  base: { chain: base, rpc: process.env.RPC_URL || 'https://mainnet.base.org', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' },
};

export const NETWORK = process.env.NETWORK || 'local';
const net = NETWORKS[NETWORK];
if (!net) throw new Error(`Unknown NETWORK=${NETWORK}`);

// Safety brake on the client side, on top of the on-chain cap.
export const MAX_SPEND_USDC = Number(process.env.MAX_SPEND_USDC || (NETWORK === 'base' ? 20 : 1000));

// Anvil's built-in dev accounts come from this PUBLIC test mnemonic (anvil prints it for everyone).
// They are worthless on real networks and only used when NETWORK=local.
const ANVIL_MNEMONIC = 'test test test test test test test test test test test junk';
// BUYER (#4) is an outside agent paying over x402; it is only ever used on the local chain.
// Spendlock: OWNER (#5) funds the vault and sets the rules; AGENT_A/AGENT_B (#6, #7) spend under them.
const ROLE_INDEX = { DEPLOYER: 0, CLIENT: 1, WORKER: 2, VERIFIER: 3, BUYER: 4, OWNER: 5, AGENT_A: 6, AGENT_B: 7 };

export function account(role) {
  if (NETWORK === 'local') return mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex: ROLE_INDEX[role] });
  const k = process.env[`${role}_PRIVATE_KEY`];
  if (!k) throw new Error(`Set ${role}_PRIVATE_KEY in agents/.env for NETWORK=${NETWORK}`);
  return privateKeyToAccount(k);
}

// Anvil mines instantly, so poll receipts fast locally (viem's default is 4 s).
const pollingInterval = NETWORK === 'local' ? 200 : undefined;
export const publicClient = createPublicClient({ chain: net.chain, transport: http(net.rpc), pollingInterval });
export const wallet = (role) => createWalletClient({ account: account(role), chain: net.chain, transport: http(net.rpc), pollingInterval });

// Contract ABIs/bytecode come from `forge build` output.
export function artifact(name) {
  const f = path.join(ROOT, 'contracts', 'out', `${name}.sol`, `${name}.json`);
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

const depFile = process.env.DEPLOYMENT_FILE || path.join(ROOT, 'deployments', `${NETWORK}.json`);
export const loadDeployment = () => JSON.parse(fs.readFileSync(depFile, 'utf8'));
export const saveDeployment = (d) => fs.writeFileSync(depFile, JSON.stringify(d, null, 2));
export const NET = net;

// USDC has 6 decimals: 1 USDC = 1_000_000 units.
export const toUnits = (usdc) => BigInt(Math.round(Number(usdc) * 1e6));
export const fromUnits = (u) => (Number(u) / 1e6).toFixed(2);
