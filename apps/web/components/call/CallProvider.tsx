"use client";
// Audio and video calls. Holds the one live call of this tab, shows the
// incoming-call card when someone rings, and the in-call screen. Media goes
// through LiveKit; the API decides who may join and signs the token.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { Room } from "livekit-client";
import { CALL_RING_SECONDS, type CallJoinDto, type CallMedia } from "@daveup/shared";
import { api, ApiError } from "@/lib/api";
import { useRealtimeEvent } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { Initials } from "../ui";
import type { ActiveCall } from "./CallScreen";
import { CallIcon } from "./icons";

export { CallIcon };

const CallScreen = dynamic(() => import("./CallScreen"), { ssr: false });

interface Incoming {
  callId: string;
  conversationId: string;
  media: CallMedia;
  fromName: string;
  title: string;
}

type Active = ActiveCall;

interface CallValue {
  active: { callId: string; conversationId: string } | null;
  start: (conversationId: string, media: CallMedia, title: string) => Promise<void>;
  join: (callId: string, title: string) => Promise<void>;
  error: string | null;
}

const Ctx = createContext<CallValue>({ active: null, start: async () => {}, join: async () => {}, error: null });
export const useCalls = () => useContext(Ctx);

/** A soft two-tone ring, made in the browser (no audio file to load). */
function useRingtone(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const beep = () => {
      if (!ctx) return;
      for (const [freq, at] of [[880, 0], [660, 0.25]] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
        g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.22);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + at);
        o.stop(ctx.currentTime + at + 0.25);
      }
    };
    beep();
    const t = setInterval(beep, 2000);
    return () => {
      clearInterval(t);
      void ctx?.close();
    };
  }, [on]);
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { me } = useSession();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState<string | null>(null);
  const activeRef = useRef<Active | null>(null);
  activeRef.current = active;

  useRingtone(!!incoming && !active);

  // Stop ringing after a while even if the "ended" event is missed.
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => setIncoming(null), (CALL_RING_SECONDS + 5) * 1000);
    return () => clearTimeout(t);
  }, [incoming]);

  const finish = useCallback((message: string | null) => {
    const a = activeRef.current;
    if (!a) return;
    activeRef.current = null;
    setActive(null);
    a.room.removeAllListeners();
    void a.room.disconnect();
    if (message) {
      setEnded(message);
      setTimeout(() => setEnded(null), 4000);
    }
  }, []);

  const leave = useCallback(async () => {
    const a = activeRef.current;
    if (!a) return;
    finish(null);
    await api(`/calls/${a.callId}/leave`, { method: "POST" }).catch(() => {});
  }, [finish]);

  useRealtimeEvent((e) => {
    if (e.type === "call.ring" && e.fromId !== me?.person.id && !activeRef.current) {
      setIncoming({ callId: e.callId, conversationId: e.conversationId, media: e.media, fromName: e.fromName, title: e.title });
    }
    if (e.type === "call.ended") {
      setIncoming((i) => (i?.callId === e.callId ? null : i));
      if (activeRef.current?.callId === e.callId) finish("Call ended");
    }
  });

  // Closing the tab: tell the API straight away (LiveKit also notices, a bit later).
  useEffect(() => {
    const onHide = () => {
      const a = activeRef.current;
      if (a) navigator.sendBeacon(`/api/calls/${a.callId}/leave`);
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const connect = useCallback(
    async (getJoin: () => Promise<CallJoinDto>, title: string) => {
      if (activeRef.current || connecting) return;
      setError(null);
      setConnecting(true);
      let room: Room | null = null;
      try {
        // Load the LiveKit client only now, alongside the join request.
        const [j, lk] = await Promise.all([getJoin(), import("livekit-client")]);
        room = new lk.Room({ adaptiveStream: true, dynacast: true });
        room.on(lk.RoomEvent.Disconnected, () => {
          if (activeRef.current?.room === room) finish("Call ended");
        });
        await room.connect(j.url, j.token);
        const a: Active = { callId: j.call.id, conversationId: j.call.conversationId, title, media: j.call.media, room, startedAt: Date.now(), canModerate: j.canModerate };
        activeRef.current = a;
        setActive(a);
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          if (j.call.media === "video") await room.localParticipant.setCameraEnabled(true);
        } catch {
          setError("Allow microphone and camera access in your browser to be heard and seen.");
        }
      } catch (err) {
        void room?.disconnect();
        setError(err instanceof ApiError ? err.message : "Could not connect the call. Check your connection and try again.");
      } finally {
        setConnecting(false);
      }
    },
    [connecting, finish],
  );

  const start = useCallback(
    (conversationId: string, media: CallMedia, title: string) =>
      connect(() => api<CallJoinDto>(`/conversations/${conversationId}/calls`, { method: "POST", body: { media } }), title),
    [connect],
  );
  const join = useCallback((callId: string, title: string) => connect(() => api<CallJoinDto>(`/calls/${callId}/join`, { method: "POST" }), title), [connect]);

  const accept = async () => {
    const i = incoming;
    if (!i) return;
    setIncoming(null);
    await join(i.callId, i.title);
  };
  const decline = async () => {
    const i = incoming;
    setIncoming(null);
    if (i) await api(`/calls/${i.callId}/decline`, { method: "POST" }).catch(() => {});
  };

  return (
    <Ctx.Provider value={{ active: active ? { callId: active.callId, conversationId: active.conversationId } : null, start, join, error }}>
      {children}
      {incoming && !active && <IncomingCard call={incoming} onAccept={accept} onDecline={decline} busy={connecting} />}
      {active && <CallScreen call={active} onLeave={leave} />}
      {connecting && !active && (
        <Toast>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Connecting the call…
        </Toast>
      )}
      {error && (
        <Toast onClose={() => setError(null)} tone="danger">
          {error}
        </Toast>
      )}
      {ended && !active && <Toast onClose={() => setEnded(null)}>{ended}</Toast>}
    </Ctx.Provider>
  );
}

function Toast({ children, onClose, tone = "dark" }: { children: ReactNode; onClose?: () => void; tone?: "dark" | "danger" }) {
  return (
    <div role="status" className={`fixed bottom-24 left-1/2 z-[70] flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-3 text-[14px] font-semibold text-white shadow-lg md:bottom-8 ${tone === "danger" ? "bg-danger" : "bg-ink"}`}>
      {children}
      {onClose && (
        <button onClick={onClose} aria-label="Dismiss" className="ml-1 rounded-full px-1 text-white/80 hover:text-white">
          ✕
        </button>
      )}
    </div>
  );
}

function IncomingCard({ call, onAccept, onDecline, busy }: { call: Incoming; onAccept: () => void; onDecline: () => void; busy: boolean }) {
  const group = call.title !== call.fromName;
  return (
    <div role="alertdialog" aria-label={`Incoming call from ${call.fromName}`} className="fixed inset-x-3 top-3 z-[80] mx-auto max-w-sm rounded-card bg-brand-deep p-5 text-white shadow-2xl md:right-6 md:left-auto md:top-6">
      <div className="flex items-center gap-3">
        <span className="relative flex">
          <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />
          <Initials name={call.title} size={52} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold">{call.title}</p>
          <p className="text-[14px] text-white/75">
            {group ? `${call.fromName} started a ${call.media === "video" ? "video" : "voice"} call` : `Incoming ${call.media === "video" ? "video" : "voice"} call`}
          </p>
        </div>
      </div>
      <div className="mt-5 flex gap-3">
        <button onClick={onDecline} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-danger font-bold hover:bg-danger-dark">
          {group ? "Dismiss" : "Decline"}
        </button>
        <button disabled={busy} onClick={onAccept} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-ok font-bold hover:brightness-110 disabled:opacity-60">
          <CallIcon name={call.media === "video" ? "video" : "phone"} size={20} /> {group ? "Join" : "Answer"}
        </button>
      </div>
    </div>
  );
}

