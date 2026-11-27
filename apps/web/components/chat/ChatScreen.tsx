"use client";
import { Loading, Screen } from "../ui";
import { useGuard } from "@/lib/session";
import { ConversationList } from "./ConversationList";
import { Thread } from "./Thread";

/**
 * Messages and cells. Desktop and tablet: the list beside the open
 * conversation. Mobile: the list, or the conversation full screen.
 */
export function ChatScreen({ selectedId }: { selectedId: string | null }) {
  const { ready } = useGuard();
  if (!ready) return <Loading />;
  return (
    <Screen fill nav={!selectedId}>
      <div className="flex h-full">
        <div className={`h-full w-full border-r border-surface-line md:w-[320px] md:shrink-0 lg:w-[360px] ${selectedId ? "hidden md:block" : "block"}`}>
          <ConversationList selectedId={selectedId} />
        </div>
        <div className={`h-full min-w-0 flex-1 ${selectedId ? "block" : "hidden md:block"}`}>
          {selectedId ? (
            <Thread id={selectedId} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface p-8 text-center">
              <p className="text-[18px] font-bold text-ink">Choose a conversation</p>
              <p className="max-w-sm text-[15px] text-ink-muted">Chat one to one with anyone in your organization, or with your cell. Share files and start voice or video calls from any conversation.</p>
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}
