"use client";
// The in-call screen. Loaded only when a call starts, so the LiveKit client
// (a large library) is not downloaded with every page.
//
// Layouts: one-to-one (the other person full screen, you in a corner window you
// can drag or hide), gallery (everyone in a grid that fits the screen, in pages
// for big calls, people speaking first) and spotlight (a pinned person or a
// shared screen large, everyone else in a strip). Leaders of a group call can
// mute people. Anyone can send reactions.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { RoomEvent, Track, type Participant, type RemoteTrack, type Room } from "livekit-client";
import { CALL_REACTIONS } from "@daveup/shared";
import { api } from "@/lib/api";
import { Initials } from "../ui";
import { CallIcon } from "./icons";

export interface ActiveCall {
  callId: string;
  conversationId: string;
  title: string;
  media: "audio" | "video";
  room: Room;
  startedAt: number;
  /** A leader in a group call: may mute other people. */
  canModerate: boolean;
}

type Person = { p: Participant; local: boolean };

function useRoomVersion(room: Room) {
  const [, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((v) => v + 1);
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ParticipantMetadataChanged,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
      RoomEvent.AudioPlaybackStatusChanged,
      RoomEvent.ConnectionStateChanged,
    ] as const;
    for (const e of events) room.on(e, bump);
    return () => {
      for (const e of events) room.off(e, bump);
    };
  }, [room]);
}

function useClock(since: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const mm = String(Math.floor(s / 60) % 60).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Width and height of an element, kept up to date. */
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

function VideoTrack({ track, mirror, fit = "contain" }: { track: Track; mirror?: boolean; fit?: "contain" | "cover" }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => void track.detach(el);
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"} ${mirror ? "-scale-x-100" : ""}`} />;
}

function AudioTrack({ track }: { track: RemoteTrack }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => void track.detach(el);
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

function isLeader(p: Participant): boolean {
  try {
    return !!JSON.parse(p.metadata || "{}").leader;
  } catch {
    return false;
  }
}

interface TileProps {
  p: Participant;
  local: boolean;
  /** Avatar size when the camera is off. */
  initials?: number;
  /** "contain" shows the whole picture (nobody's face is cut off); "cover" fills the box. */
  fit?: "contain" | "cover";
  compact?: boolean;
  className?: string;
  onSelect?: () => void;
  selectLabel?: string;
  onMute?: () => void;
  extra?: ReactNode;
}

/** One person. Fills whatever box it is given; the layout decides the box. */
function Tile({ p, local, initials = 72, fit = "contain", compact, className = "", onSelect, selectLabel, onMute, extra }: TileProps) {
  const cam = p.getTrackPublication(Track.Source.Camera);
  const camTrack = cam && !cam.isMuted ? cam.track : undefined;
  const micOn = p.isMicrophoneEnabled;
  const Box = onSelect ? "button" : "div";
  return (
    <div className={`relative h-full w-full min-h-0 min-w-0 overflow-hidden rounded-2xl bg-[#0B1838] ${className}`}>
      <Box
        {...(onSelect ? { type: "button" as const, onClick: onSelect, "aria-label": selectLabel } : {})}
        className="flex h-full w-full items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white"
      >
        {camTrack ? <VideoTrack track={camTrack} mirror={local} fit={fit} /> : <Initials name={p.name || "?"} size={initials} />}
      </Box>
      {/* Speaking outline drawn on top, so video never hides it and nothing outside clips it. */}
      <span className={`pointer-events-none absolute inset-0 rounded-2xl border-2 transition-colors ${p.isSpeaking ? "border-ok" : "border-transparent"}`} />
      <span
        className={`pointer-events-none absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-lg bg-black/60 font-semibold ${compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-[13px]"}`}
      >
        {!micOn && <CallIcon name="micOff" size={compact ? 11 : 14} />}
        <span className="truncate">{local ? "You" : p.name || "Member"}</span>
        {isLeader(p) && !compact && <span className="shrink-0 rounded bg-white/20 px-1 text-[10px] font-bold uppercase tracking-wide">Leader</span>}
      </span>
      {onMute && micOn && !local && (
        <button
          type="button"
          onClick={onMute}
          aria-label={`Mute ${p.name || "this person"}`}
          title="Mute"
          className={`absolute right-1.5 top-1.5 flex items-center justify-center rounded-full bg-black/60 hover:bg-danger ${compact ? "h-7 w-7" : "h-9 w-9"}`}
        >
          <CallIcon name="micOff" size={compact ? 13 : 16} />
        </button>
      )}
      {extra}
    </div>
  );
}

const GAP = 12;
const MIN_TILE_W = 150;
const MIN_TILE_H = 140;
const MAX_PER_PAGE = 16;

/**
 * Columns for n tiles in a w x h box: the choice whose tiles hold the largest
 * picture of the right shape, square-ish on a phone held upright and
 * widescreen on a laptop (four people: 2 x 2 on both).
 */
function gridFor(n: number, w: number, h: number) {
  const aspect = h > w ? 1 : 16 / 9;
  let best = { cols: 1, tileW: w, tileH: h / n, score: -1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tileW = (w - GAP * (cols - 1)) / cols;
    const tileH = (h - GAP * (rows - 1)) / rows;
    const score = Math.min(tileW / aspect, tileH);
    if (score > best.score) best = { cols, tileW, tileH, score };
  }
  return best;
}

/** How many tiles fit on one page without becoming too small to see. */
function perPage(w: number, h: number): number {
  const cols = Math.max(1, Math.floor((w + GAP) / (MIN_TILE_W + GAP)));
  const rows = Math.max(1, Math.floor((h + GAP) / (MIN_TILE_H + GAP)));
  return Math.max(2, Math.min(MAX_PER_PAGE, cols * rows));
}

/** People speaking now, or most recently, come first so they are on the first page. */
function bySpeaking(a: Person, b: Person): number {
  if (a.local !== b.local) return a.local ? -1 : 1;
  if (a.p.isSpeaking !== b.p.isSpeaking) return a.p.isSpeaking ? -1 : 1;
  return (b.p.lastSpokeAt?.getTime() ?? 0) - (a.p.lastSpokeAt?.getTime() ?? 0);
}

function Gallery({ people, tile }: { people: Person[]; tile: (x: Person, size: { initials: number }) => ReactNode }) {
  const box = useBoxSize<HTMLDivElement>();
  const [page, setPage] = useState(0);
  const size = perPage(box.w, box.h - 40);
  const paged = people.length > size;
  const pages = paged ? Math.ceil(people.length / size) : 1;
  const current = Math.min(page, pages - 1);
  const shown = paged ? [...people].sort(bySpeaking).slice(current * size, current * size + size) : people;
  const n = shown.length;
  const gridH = paged ? box.h - 40 : box.h;
  const g = gridFor(n, box.w, gridH);
  const initials = Math.round(Math.max(40, Math.min(112, Math.min(g.tileW, g.tileH) * 0.38)));
  // An odd last tile in a two-column grid sits centred on its own row, the same size as the others.
  const lastSpans = g.cols === 2 && n % 2 === 1 && n > 1;
  return (
    <div ref={box.ref} className="flex h-full w-full flex-col">
      {box.w > 0 && (
        <div className="mx-auto grid w-full max-w-6xl" style={{ height: gridH, gap: GAP, gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}>
          {shown.map((x, i) => (
            <div
              key={x.p.identity}
              className="min-h-0 min-w-0"
              style={lastSpans && i === n - 1 ? { gridColumn: "1 / -1", justifySelf: "center", width: `calc(50% - ${GAP / 2}px)` } : undefined}
            >
              {tile(x, { initials })}
            </div>
          ))}
        </div>
      )}
      {paged && (
        <div className="flex h-10 shrink-0 items-center justify-center gap-3 text-[13px] font-semibold">
          <button onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0} aria-label="Previous page" className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-30">
            <CallIcon name="chevL" size={18} />
          </button>
          <span>
            Page {current + 1} of {pages} · {people.length} people
          </span>
          <button onClick={() => setPage(Math.min(pages - 1, current + 1))} disabled={current >= pages - 1} aria-label="Next page" className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-30">
            <CallIcon name="chevR" size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

/** One large picture (a pinned person or a shared screen) and everyone else in a strip. */
function Spotlight({ main, strip }: { main: ReactNode; strip: ReactNode[] }) {
  return (
    <div className="flex h-full flex-col gap-3 md:flex-row">
      <div className="relative min-h-0 flex-1">{main}</div>
      {strip.length > 0 && (
        <div className="flex h-28 shrink-0 gap-2 overflow-x-auto md:h-auto md:w-52 md:flex-col md:overflow-y-auto md:overflow-x-hidden">
          {strip.map((t, i) => (
            <div key={i} className="aspect-[4/3] h-full shrink-0 md:h-auto md:w-full">
              {t}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Corner = "tl" | "tr" | "bl" | "br";
const CORNER_CLASS: Record<Corner, string> = { tl: "left-3 top-3", tr: "right-3 top-3", bl: "bottom-3 left-3", br: "bottom-3 right-3" };

/** Your own picture in a corner. Drag it to another corner, or hide it. */
function SelfWindow({ me, onHide }: { me: Participant; onHide: () => void }) {
  const [corner, setCorner] = useState<Corner>("br");
  const [drag, setDrag] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const down = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    moved.current = false;
    setDrag({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };
  const move = (e: ReactPointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true;
    setDrag({ ...drag, dx, dy });
  };
  const up = () => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (drag && el && parent && moved.current) {
      const r = el.getBoundingClientRect();
      const pr = parent.getBoundingClientRect();
      const cx = r.left + r.width / 2 - pr.left;
      const cy = r.top + r.height / 2 - pr.top;
      setCorner(`${cy < pr.height / 2 ? "t" : "b"}${cx < pr.width / 2 ? "l" : "r"}` as Corner);
    }
    setDrag(null);
  };

  return (
    <div
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px)` } : undefined}
      className={`absolute z-10 aspect-[3/4] w-[30%] min-w-[104px] max-w-[200px] touch-none select-none shadow-2xl md:aspect-video md:w-[24%] md:max-w-[280px] ${CORNER_CLASS[corner]} ${drag ? "cursor-grabbing" : "cursor-grab transition-all duration-200"}`}
      title="Drag to move"
    >
      <Tile
        p={me}
        local
        initials={44}
        fit="cover"
        compact
        className="ring-1 ring-white/25"
        extra={
          <button type="button" onClick={onHide} aria-label="Hide my video" title="Hide my video" className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 hover:bg-black/80">
            <CallIcon name="eyeOff" size={14} />
          </button>
        }
      />
    </div>
  );
}

// ---- Reactions ----

type Floating = { id: number; emoji: string; name: string; left: number };
const REACTION_TOPIC = "reaction";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function useReactions(room: Room) {
  const [floating, setFloating] = useState<Floating[]>([]);
  const seq = useRef(0);
  const show = useCallback((emoji: string, name: string) => {
    const id = ++seq.current;
    setFloating((f) => [...f.slice(-24), { id, emoji, name, left: 8 + Math.random() * 60 }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 3200);
  }, []);
  useEffect(() => {
    const onData = (payload: Uint8Array, participant?: Participant, _kind?: unknown, topic?: string) => {
      if (topic !== REACTION_TOPIC) return;
      try {
        const { emoji } = JSON.parse(decoder.decode(payload)) as { emoji?: string };
        if (emoji && (CALL_REACTIONS as readonly string[]).includes(emoji)) show(emoji, participant?.name || "Someone");
      } catch {
        /* not a reaction */
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => void room.off(RoomEvent.DataReceived, onData);
  }, [room, show]);
  const send = useCallback(
    (emoji: string) => {
      show(emoji, "You");
      void room.localParticipant.publishData(encoder.encode(JSON.stringify({ emoji })), { reliable: true, topic: REACTION_TOPIC }).catch(() => {});
    },
    [room, show],
  );
  return { floating, send };
}

function ReactionLayer({ floating }: { floating: Floating[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-live="polite">
      <style>{`@keyframes daveup-rise{0%{transform:translateY(0) scale(.6);opacity:0}12%{transform:translateY(-30px) scale(1.1);opacity:1}80%{opacity:1}100%{transform:translateY(-55vh) scale(1);opacity:0}}`}</style>
      {floating.map((f) => (
        <div key={f.id} className="absolute bottom-4 flex flex-col items-center" style={{ left: `${f.left}%`, animation: "daveup-rise 3.2s ease-out forwards" }}>
          <span className="text-[40px] leading-none drop-shadow-lg">{f.emoji}</span>
          <span className="mt-1 max-w-[120px] truncate rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold">{f.name}</span>
        </div>
      ))}
    </div>
  );
}

// ---- The screen ----

export default function CallScreen({ call, onLeave }: { call: ActiveCall; onLeave: () => void }) {
  const { room } = call;
  useRoomVersion(room);
  const clock = useClock(call.startedAt);
  const [min, setMin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hideSelf, setHideSelf] = useState(false);
  const [tray, setTray] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { floating, send } = useReactions(room);
  const selfToggleAt = useRef(0);

  const local = room.localParticipant;
  const remotes = [...room.remoteParticipants.values()];
  const people: Person[] = [{ p: local, local: true }, ...remotes.map((p) => ({ p, local: false }))];
  const share = people.map(({ p }) => ({ p, pub: p.getTrackPublication(Track.Source.ScreenShare) })).find((x) => x.pub?.track && !x.pub.isMuted);
  const audio = remotes.flatMap((p) => [...p.audioTrackPublications.values()].map((pub) => pub.track).filter((t): t is RemoteTrack => !!t));
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const pinnedPerson = pinned ? people.find((x) => x.p.identity === pinned) : undefined;

  // Tell people when a leader muted them (rather than leaving them wondering).
  useEffect(() => {
    const onMuted = (pub: { source?: Track.Source }, participant: Participant) => {
      if (participant !== room.localParticipant || pub.source !== Track.Source.Microphone) return;
      if (Date.now() - selfToggleAt.current < 2000) return;
      setNotice("A leader muted you. Tap the microphone when you want to speak.");
    };
    room.on(RoomEvent.TrackMuted, onMuted);
    return () => void room.off(RoomEvent.TrackMuted, onMuted);
  }, [room]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const toggle = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    selfToggleAt.current = Date.now();
    try {
      await fn();
    } catch {
      /* permission denied: the button simply stays off */
    } finally {
      setBusy(false);
    }
  };

  const mute = (personId?: string) =>
    void api<{ muted: number }>(`/calls/${call.callId}/mute`, { method: "POST", body: personId ? { personId } : {} })
      .then((r) => !personId && setNotice(r.muted ? `Muted ${r.muted} ${r.muted === 1 ? "person" : "people"}.` : "Everyone else is already muted."))
      .catch(() => setNotice("Could not mute just now. Try again."));

  const tileFor = (x: Person, opts: { initials?: number; compact?: boolean; fit?: "contain" | "cover" } = {}) => (
    <Tile
      p={x.p}
      local={x.local}
      initials={opts.initials}
      compact={opts.compact}
      fit={opts.fit}
      onSelect={() => setPinned(pinned === x.p.identity ? null : x.p.identity)}
      selectLabel={pinned === x.p.identity ? "Back to everyone" : `Enlarge ${x.local ? "yourself" : x.p.name || "this person"}`}
      onMute={call.canModerate ? () => mute(x.p.identity) : undefined}
    />
  );

  const audioEls = audio.map((t) => <AudioTrack key={t.sid} track={t} />);

  if (min) {
    return (
      <div className="fixed bottom-24 right-3 z-[60] flex items-center gap-3 rounded-2xl bg-brand-deep px-4 py-3 text-white shadow-2xl md:bottom-6 md:right-6">
        {audioEls}
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-ok" />
        <button onClick={() => setMin(false)} className="text-left">
          <span className="block max-w-[180px] truncate text-[14px] font-bold">{call.title}</span>
          <span className="block text-[12px] text-white/70">
            {clock} · {people.length} in call
          </span>
        </button>
        <button onClick={() => setMin(false)} aria-label="Return to call" className="rounded-full bg-white/10 p-2 hover:bg-white/20">
          <CallIcon name="max" size={18} />
        </button>
        <button onClick={onLeave} aria-label="Leave call" className="rounded-full bg-danger p-2 hover:bg-danger-dark">
          <CallIcon name="phone" size={18} />
        </button>
      </div>
    );
  }

  const visible = hideSelf ? people.filter((x) => !x.local) : people;
  let stage: ReactNode;
  if (share) {
    stage = (
      <Spotlight
        main={
          <div className="relative h-full overflow-hidden rounded-2xl bg-black">
            <VideoTrack track={share.pub!.track!} />
            <span className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-1 text-[13px] font-semibold">{share.p === local ? "You are sharing your screen" : `${share.p.name}'s screen`}</span>
          </div>
        }
        strip={visible.map((x) => tileFor(x, { initials: 40, compact: true, fit: "cover" }))}
      />
    );
  } else if (pinnedPerson) {
    stage = (
      <Spotlight
        main={tileFor(pinnedPerson, { initials: 112 })}
        strip={visible.filter((x) => x !== pinnedPerson).map((x) => tileFor(x, { initials: 40, compact: true, fit: "cover" }))}
      />
    );
  } else if (remotes.length === 1) {
    stage = (
      <div className="relative h-full w-full">
        {tileFor({ p: remotes[0]!, local: false }, { initials: 112 })}
        {!hideSelf && <SelfWindow me={local} onHide={() => setHideSelf(true)} />}
      </div>
    );
  } else {
    stage = <Gallery people={visible} tile={(x, s) => tileFor(x, { initials: s.initials })} />;
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-brand-deep text-white" role="dialog" aria-label={`Call: ${call.title}`}>
      {audioEls}
      <header className="flex items-center gap-2 px-4 pb-2 pt-4 md:px-8">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold">{call.title}</p>
          <p className="text-[13px] text-white/70">{remotes.length === 0 ? "Waiting for others to join…" : `${clock} · ${people.length} in call`}</p>
        </div>
        {hideSelf && (
          <button onClick={() => setHideSelf(false)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-[13px] font-semibold hover:bg-white/20">
            <CallIcon name="eye" size={16} /> Show me
          </button>
        )}
        {call.canModerate && remotes.length > 0 && (
          <button onClick={() => mute()} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-[13px] font-semibold hover:bg-white/20" title="Mute everyone except you">
            <CallIcon name="micOff" size={16} /> Mute all
          </button>
        )}
        <button onClick={() => setMin(true)} aria-label="Minimise call" title="Back to the app (the call continues)" className="rounded-full bg-white/10 p-2.5 hover:bg-white/20">
          <CallIcon name="min" size={20} />
        </button>
      </header>

      {!room.canPlaybackAudio && (
        <button onClick={() => void room.startAudio()} className="mx-auto mb-2 rounded-xl bg-warn-soft px-4 py-2 text-[14px] font-semibold text-warn">
          Tap to turn on call sound
        </button>
      )}

      <main className="relative min-h-0 flex-1 px-3 pb-1 md:px-8">
        {stage}
        {pinnedPerson && !share && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
            <button onClick={() => setPinned(null)} className="pointer-events-auto rounded-full bg-black/60 px-3 py-1.5 text-[13px] font-semibold hover:bg-black/80">
              Back to everyone
            </button>
          </div>
        )}
        <ReactionLayer floating={floating} />
        {notice && (
          <div role="status" className="absolute inset-x-0 bottom-3 z-30 mx-auto w-fit max-w-[90%] rounded-xl bg-black/80 px-4 py-2.5 text-center text-[14px] font-semibold shadow-xl">
            {notice}
          </div>
        )}
      </main>

      {tray && (
        <div className="mx-auto mb-1 flex max-w-[95%] flex-wrap justify-center gap-1 rounded-2xl bg-white/10 p-1.5" role="group" aria-label="Send a reaction">
          {CALL_REACTIONS.map((e) => (
            <button key={e} onClick={() => send(e)} className="h-11 w-11 rounded-xl text-[24px] transition-transform hover:bg-white/15 active:scale-90" aria-label={`React ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}

      <footer className="flex shrink-0 items-center justify-center gap-2.5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 md:gap-4 md:pb-8">
        <RoundButton label={local.isMicrophoneEnabled ? "Mute" : "Unmute"} off={!local.isMicrophoneEnabled} disabled={busy} onClick={() => toggle(() => local.setMicrophoneEnabled(!local.isMicrophoneEnabled))}>
          <CallIcon name={local.isMicrophoneEnabled ? "mic" : "micOff"} />
        </RoundButton>
        <RoundButton label={local.isCameraEnabled ? "Turn camera off" : "Turn camera on"} off={!local.isCameraEnabled} disabled={busy} onClick={() => toggle(() => local.setCameraEnabled(!local.isCameraEnabled))}>
          <CallIcon name={local.isCameraEnabled ? "video" : "videoOff"} />
        </RoundButton>
        <RoundButton label="Reactions" active={tray} onClick={() => setTray((v) => !v)}>
          <CallIcon name="react" />
        </RoundButton>
        {canShare && (
          <RoundButton label={local.isScreenShareEnabled ? "Stop sharing" : "Share screen"} active={local.isScreenShareEnabled} disabled={busy} onClick={() => toggle(() => local.setScreenShareEnabled(!local.isScreenShareEnabled))}>
            <CallIcon name="screen" />
          </RoundButton>
        )}
        <button onClick={onLeave} aria-label="Leave call" title="Leave call" className="flex h-14 w-[72px] items-center justify-center rounded-full bg-danger hover:bg-danger-dark">
          <span className="rotate-[135deg]">
            <CallIcon name="phone" />
          </span>
        </button>
      </footer>
    </div>
  );
}

function RoundButton({ children, label, off, active, disabled, onClick }: { children: ReactNode; label: string; off?: boolean; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-14 w-14 items-center justify-center rounded-full transition-colors disabled:opacity-60 ${off ? "bg-white text-ink" : active ? "bg-ok text-white" : "bg-white/15 hover:bg-white/25"}`}
    >
      {children}
    </button>
  );
}
