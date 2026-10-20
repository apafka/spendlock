"use client";

import { createSeed } from "./seed";
import type { AppState } from "./types";

export const STORAGE_KEY = "spendlock.demo.v2";
const CHANGE_EVENT = "spendlock-demo-change";

let memory: AppState | null = null;
let memoryRaw: string | null = null;

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseState(raw: string | null): AppState {
  if (!raw) return createSeed();
  try {
    const parsed = JSON.parse(raw) as AppState;
    if (parsed?.version !== 2 || !Array.isArray(parsed.agents) || !Array.isArray(parsed.events)) {
      return createSeed();
    }
    return parsed;
  } catch {
    return createSeed();
  }
}

function persist(state: AppState, notify = true): void {
  const raw = JSON.stringify(state);
  memory = state;
  memoryRaw = raw;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Demo still works in memory if storage is blocked.
  }
  if (notify) window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getClientSnapshot(): AppState {
  const raw = readStorage();
  if (raw === memoryRaw && memory) return memory;
  const state = parseState(raw);
  if (!raw) {
    persist(state, false);
    return state;
  }
  memory = state;
  memoryRaw = raw;
  return state;
}

export function getServerSnapshot(): AppState | null {
  return null;
}

export function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function saveState(state: AppState): void {
  persist(state);
}

export function resetState(): AppState {
  const seed = createSeed();
  persist(seed);
  return seed;
}
