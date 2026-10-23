// Agent Profiles for a Spendlock team.
// Names, Walmart-style approval rules, per-agent history, pause/delete live here.
// Caps, allowlist, approval, and the kill switch are the same rules as Spendlock.sol;
// this layer does not take custody. Funds stay in the team's vault (or a simulated vault).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const APPROVAL_PRESETS = ['every', 50, 100, 200];

/** `every`, a preset ($50 / $100 / $200), or any USDC number >= 0. */
export function normalizeApprovalRule(input) {
  if (input === 'every' || input === 'all') return 'every';
  const n = Number(input ?? 50);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error('approval rule must be every or a USDC amount >= 0');
  }
  return n;
}

/** Map a profile approval rule onto the vault's approvalThreshold (USDC).
 *  Contract: spends ABOVE the threshold wait; 0 = never ask.
 *  "every" → 1 micro-USDC so every real payment waits on-chain.
 *  50 / 100 / 200 → auto-approve at or below that many dollars. */
export function vaultApprovalThresholdUSDC(rule) {
  if (rule === 'every') return 1 / 1e6;
  const n = Number(rule);
  if (!Number.isFinite(n) || n < 0) throw new Error(`bad approval rule: ${rule}`);
  return n;
}

export function todayKey(iso = new Date().toISOString()) {
  return iso.slice(0, 10);
}

export function spentTodayUSDC(agent, at) {
  return agent.dayKey === todayKey(at) ? agent.spentTodayUSDC : 0;
}

export function remainingOf(agent, vaultUSDC, killed, at) {
  const usedToday = spentTodayUSDC(agent, at);
  const today = Math.max(0, agent.dailyUSDC - usedToday);
  const budget = Math.max(0, agent.budgetUSDC - agent.spentTotalUSDC);
  let spendableNow = Math.min(agent.perTxUSDC, today, budget, vaultUSDC);
  if (!agent.active || agent.paused || killed) spendableNow = 0;
  return { perTxUSDC: agent.perTxUSDC, todayUSDC: today, budgetUSDC: budget, spendableNowUSDC: spendableNow, spentTodayUSDC: usedToday };
}

export function needsOwnerApproval(agent, amountUSDC) {
  if (agent.approvalRule === 'every') return true;
  return amountUSDC > Number(agent.approvalRule);
}

export function approvalRuleLabel(rule) {
  if (rule === 'every') return 'Approve every purchase';
  return `Auto-approve under $${Number(rule)}`;
}

function sellerHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function matchesSeller(pattern, url) {
  const p = String(pattern).trim().toLowerCase();
  if (!p) return false;
  if (p === '*' || p === 'any') return true;
  const u = String(url).toLowerCase();
  if (u === p || u.startsWith(p)) return true;
  const host = sellerHost(url);
  if (host && (host === p || host.endsWith(`.${p}`))) return true;
  try {
    if (new URL(url).origin.toLowerCase() === p) return true;
  } catch {
    // ignore
  }
  return false;
}

/** Check order matches Spendlock.sol `_check`. First failure wins.
 *  Seller allowlist/blocklist are the x402 equivalent of the vault recipient allowlist. */
export function checkPay(state, agent, { amountUSDC, sellerUrl }) {
  if (state.killed) return 'kill switch on';
  if (!agent || !agent.active) return 'agent removed';
  if (agent.paused) return 'agent paused';
  if (!Number.isFinite(amountUSDC) || amountUSDC <= 0) return 'zero amount';
  const blocklist = agent.blocklist || [];
  if (blocklist.some((p) => matchesSeller(p, sellerUrl))) return 'seller blocked';
  const allowlist = agent.allowlist || [];
  if (allowlist.length && !allowlist.some((p) => matchesSeller(p, sellerUrl))) return 'seller not allowed';
  if (amountUSDC > agent.perTxUSDC) return 'over per-tx cap';
  if (spentTodayUSDC(agent) + amountUSDC > agent.dailyUSDC) return 'over daily limit';
  if (agent.spentTotalUSDC + amountUSDC > agent.budgetUSDC) return 'over total budget';
  if (state.vaultUSDC < amountUSDC) return 'vault balance too low';
  return '';
}

function emptyState() {
  return {
    version: 1,
    killed: false,
    vaultUSDC: 10_000,
    nextRequestId: 1,
    nextLogId: 1,
    agents: {},
    queue: [],
    log: [],
  };
}

function normalizeAgent(input) {
  if (!input?.id) throw new Error('agent id required');
  const approvalRule = normalizeApprovalRule(input.approvalRule);
  return {
    id: String(input.id),
    name: input.name || String(input.id),
    role: input.role || '',
    address: input.address || '',
    perTxUSDC: Number(input.perTxUSDC),
    dailyUSDC: Number(input.dailyUSDC),
    budgetUSDC: Number(input.budgetUSDC),
    approvalRule,
    active: input.active !== false,
    paused: Boolean(input.paused),
    allowlist: [...(input.allowlist || [])],
    blocklist: [...(input.blocklist || [])],
    spentTotalUSDC: Number(input.spentTotalUSDC || 0),
    spentTodayUSDC: Number(input.spentTodayUSDC || 0),
    dayKey: input.dayKey || todayKey(),
  };
}

function loadFile(file) {
  if (!file || !existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || parsed.version !== 1 || typeof parsed.agents !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function newId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function seedAgents() {
  return {
    scout: normalizeAgent({
      id: 'scout',
      name: 'Scout',
      role: 'Buys data from any x402 seller under one budget',
      address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
      perTxUSDC: 5,
      dailyUSDC: 50,
      budgetUSDC: 100,
      approvalRule: 50,
      allowlist: [],
      blocklist: [],
    }),
    ops: normalizeAgent({
      id: 'ops',
      name: 'Ops',
      role: 'Owner approves every purchase',
      address: '0x14dC598138a196d0B8A628720B61354Dd4559555',
      perTxUSDC: 100,
      dailyUSDC: 200,
      budgetUSDC: 500,
      approvalRule: 'every',
      allowlist: [],
      blocklist: [],
    }),
  };
}

export function createTeam(opts = {}) {
  const dataDir = opts.dataDir || null;
  const file = dataDir ? join(dataDir, 'team.json') : null;
  const seeded = opts.seed !== false;
  let state = opts.state || loadFile(file) || emptyState();
  if (seeded && Object.keys(state.agents).length === 0) {
    state = { ...state, agents: seedAgents() };
  }

  const persist = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state, null, 2));
  };

  const findAgent = (idOrName) => {
    const key = String(idOrName || '').toLowerCase();
    if (state.agents[idOrName]) return state.agents[idOrName];
    return Object.values(state.agents).find((a) => a.id.toLowerCase() === key || a.name.toLowerCase() === key) || null;
  };

  const pushLog = (partial) => {
    const event = {
      id: `log-${state.nextLogId++}`,
      at: partial.at || new Date().toISOString(),
      agentId: partial.agentId ?? null,
      agentName: partial.agentName || 'Owner',
      outcome: partial.outcome,
      amountUSDC: partial.amountUSDC ?? null,
      sellerUrl: partial.sellerUrl || '',
      seller: partial.seller || '',
      reason: partial.reason || '',
      memo: partial.memo || '',
      requestId: partial.requestId ?? null,
    };
    state.log = [event, ...state.log];
    persist();
    return event;
  };

  const recordUsage = (agent, amountUSDC, at = new Date().toISOString()) => {
    const day = todayKey(at);
    const usedToday = agent.dayKey === day ? agent.spentTodayUSDC : 0;
    const round6 = (n) => Math.round(n * 1e6) / 1e6;
    const next = {
      ...agent,
      dayKey: day,
      spentTodayUSDC: round6(usedToday + amountUSDC),
      spentTotalUSDC: round6(agent.spentTotalUSDC + amountUSDC),
    };
    state.agents[agent.id] = next;
    state.vaultUSDC = round6(state.vaultUSDC - amountUSDC);
    persist();
    return next;
  };

  const team = {
    mode: opts.mode || process.env.SPENDLOCK_MODE || 'simulated',
    dataDir,
    snapshot: () => structuredClone(state),
    persist,
    findAgent,
    agents: () => Object.values(state.agents),
    log: () => state.log,
    queue: () => state.queue,
    historyFor(agentId) {
      return state.log.filter((e) => e.agentId === agentId);
    },
    upsert(input) {
      const prev = findAgent(input.id) || {};
      const agent = normalizeAgent({ ...prev, ...input, id: input.id || prev.id });
      state.agents[agent.id] = agent;
      persist();
      return agent;
    },
    pause(idOrName, paused = true) {
      const agent = findAgent(idOrName);
      if (!agent) throw new Error(`unknown agent: ${idOrName}`);
      agent.paused = Boolean(paused);
      persist();
      pushLog({
        agentId: agent.id,
        agentName: agent.name,
        outcome: paused ? 'paused' : 'resumed',
        reason: paused ? 'agent paused' : 'agent resumed',
      });
      return agent;
    },
    remove(idOrName) {
      const agent = findAgent(idOrName);
      if (!agent) throw new Error(`unknown agent: ${idOrName}`);
      agent.active = false;
      agent.paused = true;
      persist();
      pushLog({
        agentId: agent.id,
        agentName: agent.name,
        outcome: 'deleted',
        reason: 'agent deleted',
      });
      return agent;
    },
    setKill(on) {
      const killed = Boolean(on);
      if (state.killed === killed) return state.killed;
      state.killed = killed;
      persist();
      pushLog({
        outcome: 'kill',
        reason: killed ? 'kill switch on · all spending stopped' : 'kill switch off',
      });
      return state.killed;
    },
    check(idOrName, amountUSDC, sellerUrl) {
      return checkPay(state, findAgent(idOrName), { amountUSDC, sellerUrl });
    },
    decide(idOrName, amountUSDC, sellerUrl) {
      const agent = findAgent(idOrName);
      const reason = checkPay(state, agent, { amountUSDC, sellerUrl });
      if (reason) return { action: 'block', reason, agent };
      if (needsOwnerApproval(agent, amountUSDC)) {
        return {
          action: 'approve',
          reason: agent.approvalRule === 'every'
            ? 'approval required for every purchase'
            : `asks owner above $${agent.approvalRule}`,
          agent,
        };
      }
      return { action: 'pay', reason: 'within rules', agent };
    },
    enqueue({ agent, url, method, body, amountUSDC, seller, requirement, memo }) {
      const id = state.nextRequestId++;
      const item = {
        id,
        agentId: agent.id,
        agentName: agent.name,
        url,
        method: method || 'GET',
        body: body ?? null,
        amountUSDC,
        seller: seller || '',
        requirement: requirement || null,
        memo: memo || '',
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      state.queue = [item, ...state.queue];
      persist();
      return item;
    },
    pending() {
      return state.queue.filter((q) => q.status === 'pending');
    },
    getRequest(id) {
      return state.queue.find((q) => q.id === Number(id)) || null;
    },
    markRequest(id, status) {
      const item = state.queue.find((q) => q.id === Number(id));
      if (!item) throw new Error(`unknown request ${id}`);
      item.status = status;
      persist();
      return item;
    },
    recordSpend: recordUsage,
    pushLog,
    killed: () => state.killed,
    vaultUSDC: () => state.vaultUSDC,
  };
  persist();
  return team;
}

export function defaultDataDir() {
  return process.env.SPENDLOCK_DATA_DIR || join(dirname(new URL(import.meta.url).pathname), 'data');
}

export function defaultTeam(opts = {}) {
  return createTeam({ dataDir: opts.dataDir || defaultDataDir(), seed: opts.seed, mode: opts.mode });
}
