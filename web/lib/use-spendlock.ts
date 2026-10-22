"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  applySpend,
  approveRequest,
  eventsToCsv,
  rejectRequest,
  removeAgent,
  runThreeSellerDemo,
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

  const trySpend = useCallback((attempt: SpendAttempt): SpendOutcome | null => {
    const current = getClientSnapshot();
    const { state: next, outcome } = applySpend(current, attempt);
    saveState(next);
    return outcome;
  }, []);

  const approve = useCallback((id: number) => {
    saveState(approveRequest(getClientSnapshot(), id));
  }, []);

  const reject = useCallback((id: number) => {
    saveState(rejectRequest(getClientSnapshot(), id, "rejected by owner"));
  }, []);

  const toggleKill = useCallback(() => {
    const current = getClientSnapshot();
    saveState(setKill(current, !current.killed));
  }, []);

  const togglePause = useCallback((agentId: string) => {
    const current = getClientSnapshot();
    const agent = current.agents.find((item) => item.id === agentId);
    if (!agent) return;
    saveState(setAgentPaused(current, agentId, !agent.paused));
  }, []);

  const deleteAgent = useCallback((agentId: string) => {
    saveState(removeAgent(getClientSnapshot(), agentId));
  }, []);

  const runSellers = useCallback((agentId = "scout") => {
    const { state: next, results } = runThreeSellerDemo(getClientSnapshot(), agentId);
    saveState(next);
    return results;
  }, []);

  const reset = useCallback(() => {
    resetState();
  }, []);

  const downloadCsv = useCallback(() => {
    const current = getClientSnapshot();
    const blob = new Blob([eventsToCsv(current.events)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spendlock-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, []);

  return {
    state,
    trySpend,
    approve,
    reject,
    toggleKill,
    togglePause,
    deleteAgent,
    runSellers,
    reset,
    downloadCsv,
  };
}
