"use client";
// One WebSocket per tab to /api/realtime (proxied to the API with the session
// cookie). Screens subscribe to events; the provider also keeps the unread
// count for the navigation badge. Reconnects with backoff, and catches up
// (reloads unread) after every reconnect.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatFeaturesDto, RealtimeClientEvent, RealtimeEvent } from "@daveup/shared";
import { api } from "./api";
import { useSession } from "./session";

type Listener = (e: RealtimeEvent) => void;

interface RealtimeValue {
  connected: boolean;
  unread: number;
  features: ChatFeaturesDto | null;
  subscribe: (fn: Listener) => () => void;
  send: (e: RealtimeClientEvent) => void;
  refreshUnread: () => void;
  /** Bumped after each reconnect, so open screens can catch up on what they missed. */
  epoch: number;
}

const Ctx = createContext<RealtimeValue>({
  connected: false,
  unread: 0,
  features: null,
  subscribe: () => () => {},
  send: () => {},
  refreshUnread: () => {},
  epoch: 0,
});

export function useRealtime() {
  return useContext(Ctx);
}

/** Run `fn` for every realtime event while the component is mounted. */
export function useRealtimeEvent(fn: Listener) {
  const { subscribe } = useRealtime();
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const enabled = !!me?.person.fullName && me.membership?.status === "approved" && me.membership.churchStatus !== "suspended";
  const listeners = useRef(new Set<Listener>());
  const socket = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const [features, setFeatures] = useState<ChatFeaturesDto | null>(null);
  const [epoch, setEpoch] = useState(0);

  const refreshUnread = useCallback(() => {
    api<{ total: number }>("/conversations/unread")
      .then((r) => setUnread(r.total))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) {
      setUnread(0);
      return;
    }
    api<ChatFeaturesDto>("/chat/features").then(setFeatures).catch(() => {});
    let stopped = false;
    let retry = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (stopped) return;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${location.host}/api/realtime`);
      socket.current = ws;
      ws.onopen = () => {
        retry = 1000;
        setConnected(true);
        setEpoch((n) => n + 1);
        refreshUnread();
        ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"type":"ping"}'), 25_000);
      };
      ws.onmessage = (m) => {
        let e: RealtimeEvent;
        try {
          e = JSON.parse(String(m.data));
        } catch {
          return;
        }
        if (e.type === "message" && e.senderId !== me?.person.id) refreshUnread();
        if (e.type === "read" || e.type === "conversation" || e.type === "message.changed") refreshUnread();
        for (const fn of listeners.current) fn(e);
      };
      ws.onclose = () => {
        if (ping) clearInterval(ping);
        setConnected(false);
        if (socket.current === ws) socket.current = null;
        if (stopped) return;
        timer = setTimeout(connect, retry + Math.random() * 500);
        retry = Math.min(retry * 2, 30_000);
      };
    };
    connect();
    // Reconnect straight away when the network or the tab comes back.
    const wake = () => {
      if (document.visibilityState === "visible" && !socket.current && !stopped) {
        if (timer) clearTimeout(timer);
        retry = 1000;
        connect();
      }
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      socket.current?.close();
      socket.current = null;
    };
  }, [enabled, me?.person.id, refreshUnread]);

  const subscribe = useCallback((fn: Listener) => {
    listeners.current.add(fn);
    return () => void listeners.current.delete(fn);
  }, []);

  const send = useCallback((e: RealtimeClientEvent) => {
    const ws = socket.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(e));
  }, []);

  return <Ctx.Provider value={{ connected, unread, features, subscribe, send, refreshUnread, epoch }}>{children}</Ctx.Provider>;
}
