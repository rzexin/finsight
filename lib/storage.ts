"use client";

import type { Market } from "@/types/finsight";
import { DEFAULT_SIGNAL_CONFIG, type SignalConfig } from "@/lib/signals";

export interface WatchItem {
  market: Market;
  code: string;
  name: string;
  addedAt: number;
}

const WATCH_KEY = "finsight.watchlist.v1";
const CFG_KEY = "finsight.signalConfig.v1";

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function getWatchlist(): WatchItem[] {
  return read<WatchItem[]>(WATCH_KEY, []);
}

export function addWatch(item: Omit<WatchItem, "addedAt">): WatchItem[] {
  const list = getWatchlist();
  if (list.some((w) => w.market === item.market && w.code === item.code)) return list;
  const next = [{ ...item, addedAt: Date.now() }, ...list];
  write(WATCH_KEY, next);
  return next;
}

export function removeWatch(market: Market, code: string): WatchItem[] {
  const next = getWatchlist().filter((w) => !(w.market === market && w.code === code));
  write(WATCH_KEY, next);
  return next;
}

export function isWatched(market: Market, code: string): boolean {
  return getWatchlist().some((w) => w.market === market && w.code === code);
}

export function getSignalConfig(): SignalConfig {
  return read<SignalConfig>(CFG_KEY, DEFAULT_SIGNAL_CONFIG);
}

export function saveSignalConfig(cfg: SignalConfig) {
  write(CFG_KEY, cfg);
}
