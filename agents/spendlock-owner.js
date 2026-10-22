#!/usr/bin/env node
// Owner CLI for a Spendlock team: agent profiles, approval queue, pause/delete, kill switch.
// Simulated by default (no wallet). On-chain vault commands still work when SPENDLOCK_VAULT is set.
//   node spendlock-owner.js status
//   node spendlock-owner.js profile <id> <name> <perTx> <daily> <budget> <every|50|100|200>
//   node spendlock-owner.js allow <agent> <sellerUrlOrHost>
//   node spendlock-owner.js block <agent> <sellerUrlOrHost>
//   node spendlock-owner.js pause <agent> [false]
//   node spendlock-owner.js delete <agent>
//   node spendlock-owner.js kill [false]
//   node spendlock-owner.js queue
//   node spendlock-owner.js approve <requestId>
//   node spendlock-owner.js reject <requestId> [reason]
import { isAddress } from 'viem';
import { defaultTeam, approvalRuleLabel } from './profiles.js';
import { approvePay, rejectPay } from './pay.js';

const [cmd, a1, a2, a3, a4, a5, a6] = process.argv.slice(2);
const MODE = process.env.SPENDLOCK_MODE || (process.env.SPENDLOCK_VAULT ? 'vault' : 'simulated');
const simulated = MODE === 'simulated' || !process.env.SPENDLOCK_VAULT;
const team = defaultTeam({ mode: MODE, seed: true });
const no = (x) => x === 'false' || x === 'off';
const show = (o) => console.log(JSON.stringify(o, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

function help() {
  console.log(`Spendlock owner CLI (testnet / local / simulated)
  node spendlock-owner.js status
  node spendlock-owner.js profile <id> <name> <perTx> <daily> <budget> <every|50|100|200>
  node spendlock-owner.js allow <agent> <sellerUrlOrHost> [false]
  node spendlock-owner.js block <agent> <sellerUrlOrHost> [false]
  node spendlock-owner.js pause <agent> [false]
  node spendlock-owner.js delete <agent>
  node spendlock-owner.js kill [false]
  node spendlock-owner.js queue
  node spendlock-owner.js approve <requestId>
  node spendlock-owner.js reject <requestId> [reason]
Agent profiles map onto vault per-agent limits. Spendlock never holds customer money.
On-chain (when SPENDLOCK_VAULT is set): policy / allow / pause / kill / approve / reject also hit the contract.`);
}

if (!cmd || cmd === 'help') {
  help();
  process.exit(0);
}

async function chain() {
  const lib = await import('./lib.js');
  const owner = process.env.OWNER_PRIVATE_KEY ? lib.keyToAccount(process.env.OWNER_PRIVATE_KEY) : null;
  const { publicClient, walletClient, chainId } = await lib.clients(owner);
  return { lib, owner, publicClient, walletClient, chainId };
}

if (cmd === 'status') {
  console.log(`mode ${MODE}  vault $${team.vaultUSDC()}  kill ${team.killed() ? 'ON' : 'off'}`);
  for (const agent of team.agents()) {
    show({
      id: agent.id,
      name: agent.name,
      active: agent.active,
      paused: agent.paused,
      perTxUSDC: agent.perTxUSDC,
      dailyUSDC: agent.dailyUSDC,
      budgetUSDC: agent.budgetUSDC,
      approval: approvalRuleLabel(agent.approvalRule),
      spentTodayUSDC: agent.dayKey === new Date().toISOString().slice(0, 10) ? agent.spentTodayUSDC : 0,
      spentTotalUSDC: agent.spentTotalUSDC,
      allowlist: agent.allowlist,
      blocklist: agent.blocklist,
    });
  }
  for (const r of team.queue()) {
    console.log(`request #${r.id}: ${r.status} $${r.amountUSDC} ${r.seller} by ${r.agentName} "${r.memo}"`);
  }
  if (!simulated) {
    const { lib, publicClient, chainId } = await chain();
    const n = Number(await lib.read(publicClient, 'agentCount'));
    const killed = await lib.read(publicClient, 'killed');
    const balance = await lib.read(publicClient, 'balance');
    console.log(`chain ${chainId}  vault ${lib.vaultAddress()}  balance $${lib.fromUsdc(balance)}  kill ${killed ? 'ON' : 'off'}`);
    for (let i = 0; i < n; i++) {
      const agent = await lib.read(publicClient, 'agentList', [BigInt(i)]);
      show(await lib.status(publicClient, agent));
    }
  }
} else if (cmd === 'profile') {
  if (!a1) throw new Error('profile <id> <name> <perTx> <daily> <budget> <every|50|100|200>');
  const approvalRule = a6 === 'every' ? 'every' : Number(a6 || 50);
  show(team.upsert({
    id: a1,
    name: a2 || a1,
    perTxUSDC: a3,
    dailyUSDC: a4,
    budgetUSDC: a5,
    approvalRule,
  }));
} else if (cmd === 'allow' && simulated) {
  const agent = team.findAgent(a1);
  if (!agent) throw new Error(`unknown agent: ${a1}`);
  const list = new Set(agent.allowlist);
  if (no(a3)) list.delete(a2);
  else list.add(a2);
  show(team.upsert({ id: agent.id, allowlist: [...list] }));
} else if (cmd === 'block') {
  const agent = team.findAgent(a1);
  if (!agent) throw new Error(`unknown agent: ${a1}`);
  const list = new Set(agent.blocklist);
  if (no(a3)) list.delete(a2);
  else list.add(a2);
  show(team.upsert({ id: agent.id, blocklist: [...list] }));
} else if (cmd === 'pause') {
  show(team.pause(a1, !no(a2)));
  if (!simulated) {
    const { lib, publicClient, walletClient } = await chain();
    if (!walletClient) throw new Error('OWNER_PRIVATE_KEY required.');
    const agent = team.findAgent(a1);
    if (agent?.address && isAddress(agent.address)) {
      show(await lib.write(walletClient, publicClient, 'setAgentPaused', [agent.address, !no(a2)]));
    }
  }
} else if (cmd === 'delete') {
  show(team.remove(a1));
  if (!simulated) {
    const { lib, publicClient, walletClient } = await chain();
    if (!walletClient) throw new Error('OWNER_PRIVATE_KEY required.');
    const agent = team.findAgent(a1);
    if (agent?.address && isAddress(agent.address)) {
      show(await lib.write(walletClient, publicClient, 'removeAgent', [agent.address]));
    }
  }
} else if (cmd === 'kill') {
  show({ killed: team.setKill(!no(a1)) });
  if (!simulated) {
    const { lib, publicClient, walletClient } = await chain();
    if (!walletClient) throw new Error('OWNER_PRIVATE_KEY required.');
    show(await lib.write(walletClient, publicClient, 'setKill', [!no(a1)]));
  }
} else if (cmd === 'queue') {
  show(team.pending());
} else if (cmd === 'approve') {
  if (simulated) show(await approvePay(team, a1));
  else {
    const { lib, publicClient, walletClient } = await chain();
    if (!walletClient) throw new Error('OWNER_PRIVATE_KEY required.');
    show(await lib.write(walletClient, publicClient, 'approveRequest', [BigInt(a1)]));
  }
} else if (cmd === 'reject') {
  if (simulated) show(rejectPay(team, a1, a2 || 'rejected by owner'));
  else {
    const { lib, publicClient, walletClient } = await chain();
    if (!walletClient) throw new Error('OWNER_PRIVATE_KEY required.');
    show(await lib.write(walletClient, publicClient, 'rejectRequest', [BigInt(a1), a2 || 'rejected by owner']));
  }
} else if (cmd === 'policy' && !simulated) {
  const { lib, publicClient, walletClient } = await chain();
  if (!walletClient) throw new Error('OWNER_PRIVATE_KEY required.');
  if (!isAddress(a1)) throw new Error('agent must be an address');
  const exp = a6 ? Math.floor(Date.now() / 1000) + Number(a6) * 86400 : 0;
  show(await lib.write(walletClient, publicClient, 'setPolicy', [
    a1,
    lib.usdc(a2),
    lib.usdc(a3),
    lib.usdc(a4),
    lib.usdc(a5 || 0),
    BigInt(exp),
  ]));
} else if (cmd === 'allow' && !simulated) {
  const { lib, publicClient, walletClient } = await chain();
  if (!walletClient) throw new Error('OWNER_PRIVATE_KEY required.');
  show(await lib.write(walletClient, publicClient, 'setAllowed', [a1, a2, !no(a3)]));
} else {
  throw new Error(`unknown command: ${cmd}`);
}
