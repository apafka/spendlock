#!/usr/bin/env node
// Owner CLI for a Spendlock vault (signs as OWNER).
//   node spendlock-owner.js status
//   node spendlock-owner.js policy <agent> <perTx> <daily> <budget> [approvalAbove] [expiresInDays]
//   node spendlock-owner.js allow <agent> <target> [false]
//   node spendlock-owner.js pause <agent> [false]
//   node spendlock-owner.js kill [false]
//   node spendlock-owner.js approve <requestId>
//   node spendlock-owner.js reject <requestId> [reason]
import { isAddress } from 'viem';
import { clients, fromUsdc, keyToAccount, read, status, usdc, vaultAddress, write } from './lib.js';

const [cmd, a1, a2, a3, a4, a5, a6] = process.argv.slice(2);
const owner = process.env.OWNER_PRIVATE_KEY ? keyToAccount(process.env.OWNER_PRIVATE_KEY) : null;
const no = (x) => x === 'false' || x === 'off';
const show = (o) => console.log(JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

if (!cmd || cmd === 'help') {
  console.log(`Spendlock owner CLI (testnet / local only)
  node spendlock-owner.js status
  node spendlock-owner.js policy <agent> <perTx> <daily> <budget> [approvalAbove] [expiresInDays]
  node spendlock-owner.js allow <agent> <0xTarget> [false]
  node spendlock-owner.js pause <agent> [false]
  node spendlock-owner.js kill [false]
  node spendlock-owner.js approve <requestId>
  node spendlock-owner.js reject <requestId> [reason]
Need OWNER_PRIVATE_KEY and SPENDLOCK_VAULT in agents/.env`);
  process.exit(0);
}

const { publicClient, walletClient, chainId } = await clients(owner);
if (cmd !== 'status' && !walletClient) throw new Error('OWNER_PRIVATE_KEY required for this command.');

if (cmd === 'status') {
  const n = Number(await read(publicClient, 'agentCount'));
  const killed = await read(publicClient, 'killed');
  const balance = await read(publicClient, 'balance');
  console.log(`chain ${chainId}  vault ${vaultAddress()}  balance $${fromUsdc(balance)}  kill ${killed ? 'ON' : 'off'}`);
  for (let i = 0; i < n; i++) {
    const agent = await read(publicClient, 'agentList', [BigInt(i)]);
    show(await status(publicClient, agent));
  }
  const reqs = Number(await read(publicClient, 'requestCount'));
  for (let i = 1; i <= reqs; i++) {
    const r = await read(publicClient, 'getRequest', [BigInt(i)]);
    const st = ['None', 'Pending', 'Approved', 'Rejected', 'Cancelled'][Number(r.status)] || r.status;
    console.log(`request #${i}: ${st} $${fromUsdc(r.amount)} -> ${r.to} by ${r.agent} "${r.memo}"`);
  }
} else if (cmd === 'policy') {
  if (!isAddress(a1)) throw new Error('agent must be an address');
  const exp = a6 ? Math.floor(Date.now() / 1000) + Number(a6) * 86400 : 0;
  show(await write(walletClient, publicClient, 'setPolicy', [
    a1,
    usdc(a2),
    usdc(a3),
    usdc(a4),
    usdc(a5 || 0),
    BigInt(exp),
  ]));
} else if (cmd === 'allow') {
  show(await write(walletClient, publicClient, 'setAllowed', [a1, a2, !no(a3)]));
} else if (cmd === 'pause') {
  show(await write(walletClient, publicClient, 'setAgentPaused', [a1, !no(a2)]));
} else if (cmd === 'kill') {
  show(await write(walletClient, publicClient, 'setKill', [!no(a1)]));
} else if (cmd === 'approve') {
  show(await write(walletClient, publicClient, 'approveRequest', [BigInt(a1)]));
} else if (cmd === 'reject') {
  show(await write(walletClient, publicClient, 'rejectRequest', [BigInt(a1), a2 || 'rejected by owner']));
} else {
  throw new Error(`unknown command: ${cmd}`);
}
