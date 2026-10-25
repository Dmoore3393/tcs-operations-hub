"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { threadIsUnread, threadNeedsAcknowledgment, type TeamCommunicationsPayload } from "@/lib/communications";
import { hubRequest } from "@/lib/hub-request";
import { ArrowRight, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function CommunicationGlance() {
  const { session, user } = useAuth();
  const token = session?.access_token, userId = user?.id || "";
  const [state, setState] = useState<{ owner: string; data?: TeamCommunicationsPayload; error?: string }>({ owner: "" });
  useEffect(() => {
    if (!token || !userId) return;
    let active = true;
    async function load() {
      try {
        const data = await hubRequest<TeamCommunicationsPayload>("/api/team-communications", token!);
        if (active) setState({ owner: userId, data });
      } catch { if (active) setState({ owner: userId, error: "Open the inbox to refresh your conversations." }); }
    }
    void load(); window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [token, userId]);
  const data = state.owner === userId ? state.data : undefined;
  const unread = data?.threads.filter((thread) => threadIsUnread(thread, userId)).length || 0;
  const acknowledgments = data?.threads.filter((thread) => threadNeedsAcknowledgment(thread, userId)).length || 0;
  return <Link href="/communications" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><MessageSquareText className="mt-1 h-6 w-6 shrink-0" aria-hidden="true" /><div className="flex-1"><h3 className="text-lg font-black">Team inbox</h3><p className="mt-2 text-base leading-7">{data ? `${unread} unread${data.hasMore ? " in this view" : ""} · ${acknowledgments} need your acknowledgment` : state.owner === userId && state.error ? state.error : "Open conversations and announcements for your team."}</p></div><ArrowRight className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" /></Link>;
}
