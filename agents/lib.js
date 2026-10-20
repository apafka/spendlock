// Shared RPC helpers for the owner CLI and MCP server.
// Refuses mainnet chain ids. Play money / testnet only.
import { createPublicClient, createWalletClient, http, formatUnits, parseUnits, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
loadDotEnv(join(ROOT, '.env'));

export const MAINNET_CHAIN_IDS = new Set([1, 8453, 10, 42161, 137, 56, 43114]);
export const abi = JSON.parse(readFileSync(join(ROOT, 'abi.json'), 'utf8'));

export const NETWORK = process.env.NETWORK || 'local';
export const RPC = process.env.SPENDLOCK_RPC || process.env.RPC_URL || defaultRpc(NETWORK);

function defaultRpc(network) {
  if (network === 'base-sepolia') return 'https://sepolia.base.org';
  return 'http://127.0.0.1:8545';
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}

export function usdc(n) {
  return parseUnits(String(n), 6);
}

export function fromUsdc(v) {
  return Number(formatUnits(v, 6));
}

export function keyToAccount(raw) {
  if (!raw) {
    throw new Error('Missing private key in env. Copy agents/.env.example to agents/.env (test keys only).');
  }
  const hex = raw.startsWith('0x') ? raw : `0x${raw}`;
  return privateKeyToAccount(hex);
}

export async function clients(account) {
  const publicClient = createPublicClient({ transport: http(RPC) });
  const chainId = await publicClient.getChainId();
  if (MAINNET_CHAIN_IDS.has(chainId)) {
    throw new Error(`Spendlock refuses mainnet chain id ${chainId}. Use local anvil or Base Sepolia.`);
  }
  const chain = {
    id: chainId,
    name: NETWORK,
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [RPC] } },
  };
  const walletClient = account
    ? createWalletClient({ account, chain, transport: http(RPC) })
    : null;
  return { publicClient, walletClient, chainId };
}

export function vaultAddress() {
  const a = process.env.SPENDLOCK_VAULT;
  if (!a || !isAddress(a)) throw new Error('Set SPENDLOCK_VAULT to the deployed vault address.');
  return a;
}

export async function read(publicClient, functionName, args = []) {
  return publicClient.readContract({ address: vaultAddress(), abi, functionName, args });
}

export async function write(walletClient, publicClient, functionName, args) {
  const hash = await walletClient.writeContract({
    address: vaultAddress(),
    abi,
    functionName,
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}

export async function status(publicClient, agent) {
  const [policy, usedToday, remainingNow, killed, balance, owner] = await Promise.all([
    read(publicClient, 'policies', [agent]),
    read(publicClient, 'spentToday', [agent]),
    read(publicClient, 'remaining', [agent]),
    read(publicClient, 'killed'),
    read(publicClient, 'balance'),
    read(publicClient, 'owner'),
  ]);
  const [perTxCap, dailyLimit, totalBudget, approvalThreshold, expiry, active, paused] = policy;
  const [perTx, today, budget, spendableNow] = remainingNow;
  return {
    network: NETWORK,
    rpc: RPC,
    vault: vaultAddress(),
    owner,
    killed,
    vaultUSDC: fromUsdc(balance),
    agent,
    active,
    paused,
    perTxCapUSDC: fromUsdc(perTxCap),
    dailyLimitUSDC: fromUsdc(dailyLimit),
    totalBudgetUSDC: fromUsdc(totalBudget),
    approvalThresholdUSDC: fromUsdc(approvalThreshold),
    expiry: Number(expiry) === 0 ? null : Number(expiry),
    spentTodayUSDC: fromUsdc(usedToday),
    remaining: {
      perTxUSDC: fromUsdc(perTx),
      todayUSDC: fromUsdc(today),
      budgetUSDC: fromUsdc(budget),
      spendableNowUSDC: fromUsdc(spendableNow),
    },
  };
}
