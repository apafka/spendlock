"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  applySpend,
  eventsToCsv,
  formatUsd,
  normalizeMerchant,
  spentTodayCents,
} from "./policy";
import {
  getClientSnapshot,
  getServerSnapshot,
  resetState,
  saveState,
  subscribe,
} from "./store";
import type { AllowlistItem, SpendAttempt } from "./types";

export function useSpendlock() {
  const state = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const updatePolicy = useCallback(
    (patch: Partial<NonNullable<typeof state>["policy"]>) => {
      if (!state) return;
      saveState({ ...state, policy: { ...state.policy, ...patch } });
    },
    [state],
  );

  const fund = useCallback(
    (cents: number) => {
      if (!state || cents <= 0) return;
      updatePolicy({ fundedCents: state.policy.fundedCents + cents });
    },
    [state, updatePolicy],
  );

  const setDailyCap = useCallback(
    (cents: number) => {
      if (!state || cents < 0) return;
      updatePolicy({ dailyCapCents: Math.round(cents) });
    },
    [state, updatePolicy],
  );

  const setPaused = useCallback(
    (paused: boolean) => {
      updatePolicy({ paused });
    },
    [updatePolicy],
  );

  const addAllowlist = useCallback(
    (raw: string, label: string) => {
      if (!state) return false;
      const normalized = normalizeMerchant(raw);
      if (!normalized.value) return false;
      const exists = state.policy.allowlist.some(
        (item) =>
          normalizeMerchant(item.value).value === normalized.value &&
          item.kind === normalized.kind,
      );
      if (exists) return false;
      const item: AllowlistItem = {
        id: crypto.randomUUID(),
        kind: normalized.kind,
        value: normalized.value,
        label: label.trim() || normalized.value,
      };
      updatePolicy({ allowlist: [...state.policy.allowlist, item] });
      return true;
    },
    [state, updatePolicy],
  );

  const removeAllowlist = useCallback(
    (id: string) => {
      if (!state) return;
      updatePolicy({
        allowlist: state.policy.allowlist.filter((item) => item.id !== id),
      });
    },
    [state, updatePolicy],
  );

  const trySpend = useCallback(
    (attempt: SpendAttempt) => {
      if (!state) return null;
      const next = applySpend(state, attempt);
      saveState(next);
      return next.events[0] ?? null;
    },
    [state],
  );

  const reset = useCallback(() => {
    resetState();
  }, []);

  const downloadCsv = useCallback(() => {
    if (!state) return;
    const blob = new Blob([eventsToCsv(state.events)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spendlock-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [state]);

  const todayCents = useMemo(
    () => (state ? spentTodayCents(state.events) : 0),
    [state],
  );

  return {
    state,
    todayCents,
    fund,
    setDailyCap,
    setPaused,
    addAllowlist,
    removeAllowlist,
    trySpend,
    reset,
    downloadCsv,
    formatUsd,
  };
}
