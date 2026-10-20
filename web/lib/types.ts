export type Recipient = {
  id: string;
  label: string;
  address: string;
};

export type Agent = {
  id: string;
  name: string;
  role: string;
  address: string;
  perTxCents: number;
  dailyLimitCents: number;
  totalBudgetCents: number;
  /** Spends ABOVE this wait for the owner. 0 = never ask. */
  approvalThresholdCents: number;
  expiry: number | null;
  active: boolean;
  paused: boolean;
  allowlist: string[];
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
  | "pause";

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
  version: 2;
  vaultCents: number;
  killed: boolean;
  nextRequestId: number;
  agents: Agent[];
  recipients: Recipient[];
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
