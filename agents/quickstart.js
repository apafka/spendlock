#!/usr/bin/env node
// One-command Spendlock setup for a developer who builds agents.
// Local anvil (default) or Base Sepolia if the user supplies RPC + test keys.
// Deploys the vault, creates one agent profile, starts the mock x402 sellers,
// prints an MCP snippet, and optionally runs paid / blocked / waiting-for-approval.
// Testnet and local only. Refuses mainnet. Never writes keys into the git repo.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { dirname, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http } from 'viem';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MAINNET_CHAIN_IDS, abi, keyToAccount, usdc } from './lib.js';
import { SELLER_CATALOG, startMockSellers } from './mock-sellers.js';
import { approvePay } from './pay.js';
import { createTeam } from './profiles.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

/** Anvil's well-known public test keys. Worthless on any network with real funds. */
export const ANVIL = {
  owner: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    key: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  },
  agent: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    key: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  },
};

export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

/** One agent. $0.02 pays, $0.50 waits (above $0.10), $25 is over the $5 cap. */
export const QUICKSTART_AGENT = {
  id: 'scout',
  name: 'Scout',
  role: 'Your first Spendlock agent',
  perTxUSDC: 5,
  dailyUSDC: 50,
  budgetUSDC: 100,
  approvalRule: 0.1,
};

export const SELLER_PORTS = { 'price-feed': 4021, 'company-data': 4022, dataset: 4023 };

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [],
  },
];

export function prependFoundryPath() {
  const bin = join(homedir(), '.foundry', 'bin');
  if (existsSync(bin) && !process.env.PATH.split(delimiter).includes(bin)) {
    process.env.PATH = `${bin}${delimiter}${process.env.PATH}`;
  }
}

export function foundryBin(name) {
  prependFoundryPath();
  const home = join(homedir(), '.foundry', 'bin', name);
  if (existsSync(home)) return home;
  try {
    execFileSync(name, ['--version'], { stdio: 'ignore' });
    return name;
  } catch {
    return null;
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const opts = { verify: false, json: false, help: false, port: null, stateDir: null, network: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--verify' || a === '--e2e') opts.verify = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--dir') opts.stateDir = argv[++i];
    else if (a === '--network') opts.network = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

export function helpText() {
  return `Spendlock quickstart — spend limits your agent can't turn off.

  ./quickstart.sh                 local anvil + vault + sellers, print MCP config
  ./quickstart.sh --verify        same, then scripted paid / blocked / waiting-for-approval

  NETWORK=base-sepolia SPENDLOCK_RPC=... OWNER_PRIVATE_KEY=... SPENDLOCK_AGENT_KEY=... \\
    ./quickstart.sh               deploy to Base Sepolia (your test key + test USDC)

Local / testnet only. Refuses mainnet. Keys come from env or anvil defaults — never from git.`;
}

export function mcpConfig({ mcpPath, env, redactKey }) {
  const copied = { ...env };
  if (redactKey && copied.SPENDLOCK_AGENT_KEY) copied.SPENDLOCK_AGENT_KEY = '<your SPENDLOCK_AGENT_KEY>';
  return {
    mcpServers: {
      spendlock: {
        command: 'node',
        args: [mcpPath],
        env: copied,
      },
    },
  };
}

export function formatMcpSnippet(config) {
  return JSON.stringify(config, null, 2);
}

export async function freePort() {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

export async function rpcReady(url, { timeoutMs = 15_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export async function startAnvil({ port } = {}) {
  const bin = foundryBin('anvil');
  if (!bin) {
    throw new Error('anvil not found. Install Foundry: https://book.getfoundry.sh/getting-started/installation');
  }
  const child = spawn(bin, ['--host', '127.0.0.1', '--port', String(port), '--silent'], { stdio: 'ignore' });
  const rpc = `http://127.0.0.1:${port}`;
  if (!(await rpcReady(rpc))) {
    child.kill();
    throw new Error(`anvil did not come up on ${rpc}`);
  }
  return { child, rpc, port };
}

export function ensureForgeBuild(root = REPO) {
  const forge = foundryBin('forge');
  if (!forge) {
    throw new Error('forge not found. Install Foundry: https://book.getfoundry.sh/getting-started/installation');
  }
  const contracts = join(root, 'contracts');
  if (!existsSync(join(contracts, 'lib', 'forge-std', 'src', 'Test.sol'))) {
    execFileSync(forge, ['install', '--no-git'], { cwd: contracts, stdio: 'inherit' });
  }
  execFileSync(forge, ['build', '-q'], { cwd: contracts, stdio: 'inherit' });
}

export function loadArtifact(name, root = REPO) {
  const file = join(root, 'contracts', 'out', `${name}.sol`, `${name}.json`);
  if (!existsSync(file)) throw new Error(`missing ${file} — run forge build`);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return { abi: json.abi, bytecode: json.bytecode.object };
}

function refuseMainnet(chainId) {
  if (MAINNET_CHAIN_IDS.has(chainId)) {
    throw new Error(`Spendlock refuses mainnet chain id ${chainId}. Use local anvil or Base Sepolia.`);
  }
}

async function makeClients(rpc, account) {
  const publicClient = createPublicClient({ transport: http(rpc), pollingInterval: 100 });
  const chainId = await publicClient.getChainId();
  refuseMainnet(chainId);
  const chain = {
    id: chainId,
    name: chainId === 84532 ? 'base-sepolia' : 'local',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  };
  const walletClient = account
    ? createWalletClient({ account, chain, transport: http(rpc), pollingInterval: 100 })
    : null;
  return { publicClient, walletClient, chainId };
}

async function send(walletClient, publicClient, { address, abi: contractAbi, functionName, args }) {
  const hash = await walletClient.writeContract({ address, abi: contractAbi, functionName, args });
  return publicClient.waitForTransactionReceipt({ hash });
}

async function deploy(walletClient, publicClient, name, args, root) {
  const { abi: contractAbi, bytecode } = loadArtifact(name, root);
  const hash = await walletClient.deployContract({ abi: contractAbi, bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`deploy ${name} produced no address`);
  return receipt.contractAddress;
}

export function writeTeamProfile({ dataDir, agent }) {
  const team = createTeam({ dataDir, seed: false, mode: 'vault' });
  return team.upsert(agent);
}

export async function deployAndConfigure({ rpc, ownerKey, agentAddress, root = REPO, fundUSDC = 1000 }) {
  const owner = keyToAccount(ownerKey);
  const { publicClient, walletClient, chainId } = await makeClients(rpc, owner);
  const local = chainId === 31337;

  let token;
  if (chainId === 84532) {
    token = BASE_SEPOLIA_USDC;
  } else if (local) {
    token = await deploy(walletClient, publicClient, 'MockUSDC', [], root);
  } else {
    throw new Error(`Unsupported chain ${chainId}. Use local anvil (31337) or Base Sepolia (84532).`);
  }

  const vault = await deploy(walletClient, publicClient, 'Spendlock', [token, owner.address], root);
  const escrow = await deploy(
    walletClient,
    publicClient,
    'ResultEscrow',
    [token, owner.address, 200, 500n * 10n ** 6n],
    root,
  );

  const fundAmount = usdc(fundUSDC);
  let fundedUSDC = 0;
  if (local) {
    await send(walletClient, publicClient, {
      address: token,
      abi: ERC20_ABI,
      functionName: 'mint',
      args: [owner.address, usdc(1_000_000)],
    });
  }
  const balance = await publicClient.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [owner.address],
  });
  if (balance >= fundAmount) {
    await send(walletClient, publicClient, {
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [vault, fundAmount],
    });
    await send(walletClient, publicClient, {
      address: vault,
      abi,
      functionName: 'fund',
      args: [fundAmount],
    });
    fundedUSDC = fundUSDC;
  } else if (chainId === 84532) {
    console.warn(
      `Owner USDC on Base Sepolia is below $${fundUSDC}. Get test USDC from Circle, then fund the vault.`,
    );
  } else {
    throw new Error('owner has no MockUSDC to fund the vault');
  }

  await send(walletClient, publicClient, {
    address: vault,
    abi,
    functionName: 'setPolicy',
    args: [
      agentAddress,
      usdc(QUICKSTART_AGENT.perTxUSDC),
      usdc(QUICKSTART_AGENT.dailyUSDC),
      usdc(QUICKSTART_AGENT.budgetUSDC),
      usdc(50),
      0n,
    ],
  });
  for (const seller of SELLER_CATALOG) {
    await send(walletClient, publicClient, {
      address: vault,
      abi,
      functionName: 'setAllowed',
      args: [agentAddress, seller.address, true],
    });
  }

  return {
    chainId,
    token,
    vault,
    escrow,
    owner: owner.address,
    agent: agentAddress,
    fundedUSDC,
  };
}

export async function runMcpStory({ env, sellers }) {
  const mcp = new Client({ name: 'spendlock-quickstart', version: '0' });
  await mcp.connect(new StdioClientTransport({
    command: process.execPath,
    args: [join(HERE, 'spendlock-mcp.js')],
    env: { ...process.env, ...env },
  }));
  const call = async (name, args = {}) => {
    const res = await mcp.callTool({ name, arguments: args });
    const text = res.content[0].text;
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  };
  try {
    const status = await call('spendlock_status');
    const paid = await call('spendlock_pay', { agent: 'scout', url: sellers.byId['price-feed'].url });
    const blocked = await call('spendlock_pay', { agent: 'scout', url: sellers.byId.dataset.url });
    const pending = await call('spendlock_pay', { agent: 'scout', url: sellers.byId['company-data'].url });

    let approved = null;
    if (pending.outcome === 'pending' && pending.requestId != null) {
      Object.assign(process.env, env);
      const team = createTeam({ dataDir: env.SPENDLOCK_DATA_DIR, seed: false, mode: 'vault' });
      approved = await approvePay(team, pending.requestId);
    }

    const ok = (
      paid.outcome === 'paid'
      && blocked.outcome === 'blocked'
      && blocked.reason === 'over per-tx cap'
      && pending.outcome === 'pending'
    );
    return { status, paid, blocked, pending, approved, ok };
  } finally {
    await mcp.close();
  }
}

export function formatStory(story) {
  const line = (label, r) => {
    const bits = [r?.outcome];
    if (r?.amountUSDC != null) bits.push(`$${r.amountUSDC}`);
    if (r?.reason) bits.push(r.reason);
    if (r?.requestId != null) bits.push(`request #${r.requestId}`);
    return `  ${label.padEnd(28)} ${bits.filter(Boolean).join(' · ')}`;
  };
  return [
    'MCP story',
    line('price feed $0.02', story.paid),
    line('expensive dataset $25', story.blocked),
    line('company data $0.50', story.pending),
    story.approved ? line('owner approved $0.50', story.approved) : null,
    story.ok ? 'OK paid / blocked / waiting-for-approval' : 'FAIL expected paid, blocked, pending',
  ].filter(Boolean).join('\n');
}

export function printBanner({ network, rpc, deployed, sellers, agent, mcpSnippet, stateDir, verify }) {
  const lines = [
    '',
    'Spendlock — spend limits your agent can\'t turn off.',
    'Local / testnet play money only. The vault is unaudited. No mainnet.',
    '',
    `network   ${network}`,
    `rpc       ${rpc}`,
    `vault     ${deployed.vault}`,
    `token     ${deployed.token}${deployed.chainId === 31337 ? '  (MockUSDC)' : '  (Base Sepolia USDC)'}`,
    `funded    $${deployed.fundedUSDC}`,
    `agent     ${agent.id}  ${agent.address}`,
    `limits    $${agent.perTxUSDC}/tx  $${agent.dailyUSDC}/day  $${agent.budgetUSDC} budget`,
    `approval  auto-approve under $${agent.approvalRule}  →  $0.02 pays, $0.50 waits, $25 blocked`,
    '',
    'Sellers (leave this process running so they stay up)',
  ];
  for (const s of sellers.sellers) {
    lines.push(`  ${s.name.padEnd(18)} $${String(s.priceUSDC).padEnd(5)}  ${s.url}`);
  }
  lines.push('');
  lines.push('Paste this into Cursor (Settings → MCP) or Claude Desktop');
  lines.push('(~/Library/Application Support/Claude/claude_desktop_config.json on macOS):');
  lines.push('');
  lines.push(mcpSnippet);
  lines.push('');
  if (network === 'local') {
    lines.push('SPENDLOCK_AGENT_KEY is Anvil account #1 — a well-known public test key.');
    lines.push('Never use it on a network with real funds.');
  } else {
    lines.push('The printed snippet redacts your agent key. Copy the key from your environment');
    lines.push(`or from the gitignored file ${join(stateDir, 'mcp.json')}.`);
  }
  lines.push('');
  lines.push('Then ask your agent:');
  lines.push('  1. spendlock_status');
  const feed = sellers.byId['price-feed']?.url;
  const data = sellers.byId.dataset?.url;
  const company = sellers.byId['company-data']?.url;
  if (feed) lines.push(`  2. spendlock_pay  agent=scout  url=${feed}     → paid`);
  if (data) lines.push(`  3. spendlock_pay  agent=scout  url=${data}   → blocked (over per-tx cap)`);
  if (company) lines.push(`  4. spendlock_pay  agent=scout  url=${company}   → waiting for approval`);
  lines.push('');
  lines.push('Approve a queued pay (same data dir this process wrote):');
  lines.push(`  SPENDLOCK_DATA_DIR=${join(stateDir, 'data')} node agents/spendlock-owner.js queue`);
  lines.push(`  SPENDLOCK_DATA_DIR=${join(stateDir, 'data')} node agents/spendlock-owner.js approve 1`);
  lines.push('');
  if (!verify) {
    lines.push('Leave this terminal open. Ctrl+C stops anvil and the sellers.');
    lines.push('Scripted run (no chat client):  ./quickstart.sh --verify');
  }
  lines.push(`State (gitignored): ${stateDir}`);
  lines.push('');
  return lines.join('\n');
}

export async function runQuickstart(opts = {}) {
  const root = opts.root || REPO;
  const verify = Boolean(opts.verify);
  const network = opts.network || process.env.NETWORK || 'local';
  if (network !== 'local' && network !== 'base-sepolia') {
    throw new Error('NETWORK must be local or base-sepolia');
  }

  const stateDir = opts.stateDir || join(root, '.spendlock');
  mkdirSync(stateDir, { recursive: true });

  let ownerKey;
  let agentKey;
  if (network === 'local') {
    ownerKey = process.env.OWNER_PRIVATE_KEY || ANVIL.owner.key;
    agentKey = process.env.SPENDLOCK_AGENT_KEY || ANVIL.agent.key;
  } else {
    ownerKey = process.env.OWNER_PRIVATE_KEY;
    agentKey = process.env.SPENDLOCK_AGENT_KEY;
    if (!ownerKey || !agentKey) {
      throw new Error('Base Sepolia needs OWNER_PRIVATE_KEY and SPENDLOCK_AGENT_KEY in the environment. Do not commit them.');
    }
  }
  const agentAccount = keyToAccount(agentKey);

  const cleanups = [];
  const cleanup = async () => {
    while (cleanups.length) {
      const fn = cleanups.pop();
      try { await fn(); } catch { /* ignore */ }
    }
  };

  try {
    let rpc;
    if (network === 'local') {
      const preferred = opts.port || Number(process.env.ANVIL_PORT) || 8545;
      const existing = process.env.SPENDLOCK_RPC || `http://127.0.0.1:${preferred}`;
      if (!verify && await rpcReady(existing, { timeoutMs: 400 })) {
        rpc = existing;
      } else {
        const port = verify ? (opts.port || await freePort()) : preferred;
        const anvil = await startAnvil({ port });
        rpc = anvil.rpc;
        cleanups.push(() => { try { anvil.child.kill(); } catch { /* ignore */ } });
      }
    } else {
      rpc = process.env.SPENDLOCK_RPC || process.env.RPC_URL || 'https://sepolia.base.org';
    }

    ensureForgeBuild(root);
    const deployed = await deployAndConfigure({
      rpc,
      ownerKey,
      agentAddress: agentAccount.address,
      root,
    });

    const dataDir = join(stateDir, 'data');
    const agent = writeTeamProfile({
      dataDir,
      agent: { ...QUICKSTART_AGENT, address: agentAccount.address },
    });

    const sellers = await startMockSellers(verify ? {} : SELLER_PORTS);
    cleanups.push(() => sellers.close());

    const env = {
      SPENDLOCK_MODE: 'vault',
      NETWORK: network,
      SPENDLOCK_RPC: rpc,
      SPENDLOCK_VAULT: deployed.vault,
      SPENDLOCK_AGENT_KEY: agentKey,
      SPENDLOCK_DATA_DIR: dataDir,
    };
    Object.assign(process.env, env);

    const mcpPath = join(root, 'agents', 'spendlock-mcp.js');
    const printed = mcpConfig({ mcpPath, env, redactKey: network !== 'local' });
    const stored = mcpConfig({ mcpPath, env, redactKey: false });
    writeFileSync(join(stateDir, 'mcp.json'), `${formatMcpSnippet(stored)}\n`);
    writeFileSync(join(stateDir, 'run.json'), `${JSON.stringify({
      network,
      rpc,
      ...deployed,
      agent: { id: agent.id, address: agent.address, ...QUICKSTART_AGENT },
      sellers: sellers.sellers.map((s) => ({ id: s.id, url: s.url, priceUSDC: s.priceUSDC })),
    }, null, 2)}\n`);

    let story = null;
    if (verify) {
      story = await runMcpStory({ env, sellers });
    }

    return {
      network,
      rpc,
      deployed,
      agent,
      sellers,
      env,
      mcp: printed,
      mcpSnippet: formatMcpSnippet(printed),
      stateDir,
      story,
      cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(helpText());
    return;
  }
  const result = await runQuickstart({
    verify: args.verify,
    port: args.port,
    stateDir: args.stateDir,
    network: args.network || process.env.NETWORK || 'local',
  });
  const banner = printBanner({
    network: result.network,
    rpc: result.rpc,
    deployed: result.deployed,
    sellers: result.sellers,
    agent: result.agent,
    mcpSnippet: result.mcpSnippet,
    stateDir: result.stateDir,
    verify: args.verify,
  });
  if (args.json) {
    console.log(JSON.stringify({
      network: result.network,
      rpc: result.rpc,
      vault: result.deployed.vault,
      token: result.deployed.token,
      agent: result.agent,
      sellers: result.sellers.sellers.map((s) => ({ id: s.id, url: s.url, priceUSDC: s.priceUSDC })),
      mcp: result.mcp,
      story: result.story && {
        ok: result.story.ok,
        paid: result.story.paid.outcome,
        blocked: result.story.blocked.outcome,
        pending: result.story.pending.outcome,
        approved: result.story.approved?.outcome ?? null,
      },
    }, null, 2));
  } else {
    console.log(banner);
    if (result.story) {
      console.log(formatStory(result.story));
      console.log('');
    }
  }
  if (args.verify) {
    await result.cleanup();
    if (!result.story?.ok) process.exit(1);
    return;
  }
  await new Promise((resolve) => {
    const stop = async () => {
      console.log('\nStopping anvil and sellers.');
      await result.cleanup();
      resolve();
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
