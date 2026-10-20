"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applySpend,
  approveRequest,
  eventsToCsv,
  rejectRequest,
  setAgentPaused,
  setKill,
} from "./engine";
import {
  getClientSnapshot,
  getServerSnapshot,
  resetState,
  saveState,
  subscribe,
} from "./store";
import type { SpendAttempt, SpendOutcome } from "./types";

export function useSpendlock() {
  const state = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);

  const trySpend = useCallback(
    (attempt: SpendAttempt): SpendOutcome | null => {
      if (!state) return null;
      const { state: next, outcome } = applySpend(state, attempt);
      saveState(next);
      return outcome;
    },
    [state],
  );

  const approve = useCallback(
    (id: number) => {
      if (!state) return;
      saveState(approveRequest(state, id));
    },
    [state],
  );

  const reject = useCallback(
    (id: number) => {
      if (!state) return;
      saveState(rejectRequest(state, id, "rejected by owner"));
    },
    [state],
  );

  const toggleKill = useCallback(() => {
    if (!state) return;
    saveState(setKill(state, !state.killed));
  }, [state]);

  const togglePause = useCallback(
    (agentId: string) => {
      if (!state) return;
      const agent = state.agents.find((item) => item.id === agentId);
      if (!agent) return;
      saveState(setAgentPaused(state, agentId, !agent.paused));
    },
    [state],
  );

  const reset = useCallback(() => {
    resetState();
  }, []);

  const downloadCsv = useCallback(() => {
    if (!state) return;
    const blob = new Blob([eventsToCsv(state.events)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spendlock-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [state]);

  return { state, trySpend, approve, reject, toggleKill, togglePause, reset, downloadCsv };
}
