export type Recipient = {
  id: string;
  label: string;
  address: string;
};

export type Seller = Recipient & {
  url: string;
  priceCents: number;
};

/** Walmart-style: approve every purchase, or auto-approve under $50 / $100 / $200. */
export type ApprovalRule = "every" | 50 | 100 | 200;

export type Agent = {
  id: string;
  name: string;
  role: string;
  address: string;
  perTxCents: number;
  dailyLimitCents: number;
  totalBudgetCents: number;
  approvalRule: ApprovalRule;
  expiry: number | null;
  active: boolean;
  paused: boolean;
  allowlist: string[];
  blocklist: string[];
  spentTotalCents: number;
  spentTodayCents: number;
  dayKey: string;
};

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type ApprovalRequest = {
  id: number;
  agentId: string;
  toId: string;
  amountCents: number;
  memo: string;
  createdAt: string;
  status: RequestStatus;
};

export type LogKind =
  | "spent"
  | "rejected"
  | "asked"
  | "approved"
  | "request-rejected"
  | "kill"
  | "pause"
  | "deleted";

export type LogEvent = {
  id: string;
  at: string;
  agentId: string | null;
  agentName: string;
  kind: LogKind;
  amountCents: number | null;
  toId: string | null;
  toLabel: string;
  reason: string;
  memo: string;
};

export type AppState = {
  version: 3;
  vaultCents: number;
  killed: boolean;
  nextRequestId: number;
  agents: Agent[];
  recipients: Recipient[];
  sellers: Seller[];
  requests: ApprovalRequest[];
  events: LogEvent[];
};

export type SpendAttempt = {
  agentId: string;
  toId: string;
  amountCents: number;
  memo: string;
  at?: string;
};

export type SpendOutcome =
  | { status: "executed"; event: LogEvent }
  | { status: "pending"; event: LogEvent; requestId: number }
  | { status: "rejected"; event: LogEvent };
