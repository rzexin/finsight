"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useFetch<T = unknown>(
  url: string | null,
  opts: { pollMs?: number } = {}
) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: !!url });
  const urlRef = useRef(url);
  urlRef.current = url;

  const load = useCallback(async (silent = false) => {
    const u = urlRef.current;
    if (!u) return;
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
    const res = await fetch(u).catch(() => null);
    if (!res) {
      setState((s) => ({ ...s, loading: false, error: "网络请求失败" }));
      return;
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setState((s) => ({
        ...s,
        loading: false,
        error: json?.error ? `${json.error}${json.detail ? "：" + json.detail : ""}` : `请求失败 (${res.status})`,
      }));
      return;
    }
    setState({ data: json as T, error: null, loading: false });
  }, []);

  useEffect(() => {
    if (!url) return;
    load();
    if (opts.pollMs && opts.pollMs > 0) {
      const id = setInterval(() => load(true), opts.pollMs);
      return () => clearInterval(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, opts.pollMs, load]);

  return { ...state, reload: () => load(false) };
}
