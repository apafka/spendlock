export type AllowlistKind = "domain" | "address";

export type AllowlistItem = {
  id: string;
  kind: AllowlistKind;
  value: string;
  label: string;
};

export type Agent = {
  id: string;
  name: string;
  role: string;
};

export type SpendStatus = "allowed" | "blocked";

export type SpendEvent = {
  id: string;
  agentId: string;
  agentName: string;
  merchant: string;
  merchantLabel: string;
  amountCents: number;
  at: string;
  status: SpendStatus;
  reason: string;
};

export type Policy = {
  fundedCents: number;
  dailyCapCents: number;
  paused: boolean;
  allowlist: AllowlistItem[];
};

export type AppState = {
  version: 1;
  policy: Policy;
  agents: Agent[];
  events: SpendEvent[];
};

export type SpendAttempt = {
  agentId: string;
  merchant: string;
  amountCents: number;
  at?: string;
};

export type SpendVerdict = {
  status: SpendStatus;
  reason: string;
};
