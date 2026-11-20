"use client";
import { use } from "react";
import { ChatScreen } from "@/components/chat/ChatScreen";

export default function Conversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChatScreen selectedId={id} />;
}
