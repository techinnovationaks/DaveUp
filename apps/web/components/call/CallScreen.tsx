"use client";
// The in-call screen. Loaded only when a call starts, so the LiveKit client
// (a large library) is not downloaded with every page.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RoomEvent, Track, type Participant, type RemoteTrack, type Room } from "livekit-client";
import { Initials } from "../ui";
import { CallIcon } from "./icons";

export interface ActiveCall {
  callId: string;
  conversationId: string;
  title: string;
  media: "audio" | "video";
  room: Room;
  startedAt: number;
}

function useRoomVersion(room: Room) {
  const [, setV] = useState(0);
  useEffect(() => {
    const bump = () => setV((v) => v + 1);
    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
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

function VideoTrack({ track, mirror, contain }: { track: Track; mirror?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => void track.detach(el);
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`h-full w-full ${contain ? "object-contain" : "object-cover"} ${mirror ? "-scale-x-100" : ""}`} />;
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

function Tile({ p, local, big }: { p: Participant; local: boolean; big?: boolean }) {
  const cam = p.getTrackPublication(Track.Source.Camera);
  const camTrack = cam && !cam.isMuted ? cam.track : undefined;
  const micOn = p.isMicrophoneEnabled;
  return (
    <div className={`relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-white/5 ${p.isSpeaking ? "ring-2 ring-ok" : ""} ${big ? "" : "aspect-video"}`}>
      {camTrack ? (
        <VideoTrack track={camTrack} mirror={local} />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Initials name={p.name || "?"} size={big ? 96 : 64} />
        </div>
      )}
      <span className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 truncate rounded-lg bg-black/55 px-2 py-1 text-[13px] font-semibold">
        {!micOn && <CallIcon name="micOff" size={14} />}
        {local ? "You" : p.name || "Member"}
      </span>
    </div>
  );
}

export default function CallScreen({ call, onLeave }: { call: ActiveCall; onLeave: () => void }) {
  const { room } = call;
  useRoomVersion(room);
  const clock = useClock(call.startedAt);
  const [min, setMin] = useState(false);
  const [busy, setBusy] = useState(false);
  const local = room.localParticipant;
  const remotes = [...room.remoteParticipants.values()];
  const people: { p: Participant; local: boolean }[] = [{ p: local, local: true }, ...remotes.map((p) => ({ p, local: false }))];
  const share = people.map(({ p }) => ({ p, pub: p.getTrackPublication(Track.Source.ScreenShare) })).find((x) => x.pub?.track && !x.pub.isMuted);
  const audio = remotes.flatMap((p) => [...p.audioTrackPublications.values()].map((pub) => pub.track).filter((t): t is RemoteTrack => !!t));
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const toggle = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* permission denied: the button simply stays off */
    } finally {
      setBusy(false);
    }
  };
  const cols = people.length <= 1 ? "grid-cols-1" : people.length <= 4 ? "grid-cols-1 sm:grid-cols-2" : people.length <= 9 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-3 md:grid-cols-4";

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

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-brand-deep text-white" role="dialog" aria-label={`Call: ${call.title}`}>
      {audioEls}
      <header className="flex items-center gap-3 px-4 pb-2 pt-4 md:px-8">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold">{call.title}</p>
          <p className="text-[13px] text-white/70">
            {remotes.length === 0 ? "Waiting for others to join…" : `${clock} · ${people.length} in call`}
          </p>
        </div>
        <button onClick={() => setMin(true)} aria-label="Minimise call" title="Back to the app (the call continues)" className="rounded-full bg-white/10 p-2.5 hover:bg-white/20">
          <CallIcon name="min" size={20} />
        </button>
      </header>

      {!room.canPlaybackAudio && (
        <button onClick={() => void room.startAudio()} className="mx-auto mb-2 rounded-xl bg-warn-soft px-4 py-2 text-[14px] font-semibold text-warn">
          Tap to turn on call sound
        </button>
      )}

      <main className="min-h-0 flex-1 overflow-auto px-3 pb-3 md:px-8">
        {share ? (
          <div className="flex h-full flex-col gap-3 md:flex-row">
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black">
              <VideoTrack track={share.pub!.track!} contain />
              <span className="absolute left-2 top-2 rounded-lg bg-black/55 px-2 py-1 text-[13px] font-semibold">{share.p === local ? "You are sharing your screen" : `${share.p.name}'s screen`}</span>
            </div>
            <div className="flex shrink-0 gap-3 overflow-auto md:w-56 md:flex-col">
              {people.map(({ p, local: l }) => (
                <div key={p.identity} className="w-40 shrink-0 md:w-full">
                  <Tile p={p} local={l} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={`mx-auto grid h-full max-w-6xl content-center gap-3 ${cols}`}>
            {people.map(({ p, local: l }) => (
              <Tile key={p.identity} p={p} local={l} big={people.length === 1} />
            ))}
          </div>
        )}
      </main>

      <footer className="flex items-center justify-center gap-3 px-4 pb-8 pt-3 md:gap-4">
        <RoundButton label={local.isMicrophoneEnabled ? "Mute" : "Unmute"} off={!local.isMicrophoneEnabled} disabled={busy} onClick={() => toggle(() => local.setMicrophoneEnabled(!local.isMicrophoneEnabled))}>
          <CallIcon name={local.isMicrophoneEnabled ? "mic" : "micOff"} />
        </RoundButton>
        <RoundButton label={local.isCameraEnabled ? "Turn camera off" : "Turn camera on"} off={!local.isCameraEnabled} disabled={busy} onClick={() => toggle(() => local.setCameraEnabled(!local.isCameraEnabled))}>
          <CallIcon name={local.isCameraEnabled ? "video" : "videoOff"} />
        </RoundButton>
        {canShare && (
          <RoundButton label={local.isScreenShareEnabled ? "Stop sharing" : "Share screen"} active={local.isScreenShareEnabled} disabled={busy} onClick={() => toggle(() => local.setScreenShareEnabled(!local.isScreenShareEnabled))}>
            <CallIcon name="screen" />
          </RoundButton>
        )}
        <button onClick={onLeave} aria-label="Leave call" title="Leave call" className="flex h-14 w-20 items-center justify-center rounded-full bg-danger hover:bg-danger-dark">
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
