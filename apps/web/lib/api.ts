"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiErrorBody } from "@daveup/shared";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? "Something went wrong. Please try again.");
  }
  return data as T;
}

/**
 * Load a resource; null path skips loading. `loading` is true only until the
 * first response for the current path. Later reloads refresh quietly, so a
 * session refresh does not blank out (and refetch) every guarded screen.
 */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const loadedPath = useRef<string | null>(null);

  const reload = useCallback(async () => {
    if (path === null) return;
    if (loadedPath.current !== path) setLoading(true);
    try {
      setData(await api<T>(path));
      loadedPath.current = path;
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "NETWORK", "You appear to be offline. Check your connection."));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Refresh quietly when the person comes back to the tab: the other person in
  // a relationship may have confirmed a plan or finished a check meanwhile.
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Wrap an action: tracks busy state and the last error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
