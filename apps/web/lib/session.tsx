"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { MeDto } from "@daveup/shared";
import { useApi } from "./api";

interface SessionValue {
  me: MeDto | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({ me: null, loading: true, reload: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload, error } = useApi<MeDto>("/me");
  const me = error?.status === 401 ? null : data;
  return <SessionContext.Provider value={{ me, loading, reload }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

/** Where a person belongs, given how far through onboarding they are. Admins land in the Church console. */
export function nextStep(me: MeDto | null): string {
  if (!me) return "/signin";
  if (!me.person.fullName) return "/profile";
  if (!me.membership) return "/start";
  if (me.membership.status === "pending") return "/pending";
  return me.membership.isAdmin ? "/admin" : "/home";
}

function isApprovedMember(me: MeDto | null): boolean {
  return !!me?.person.fullName && me.membership?.status === "approved";
}

/**
 * Guard for app screens. `need`:
 *  - "member": signed in and an approved church member (default). Admins may
 *    open the member app too, from the console.
 *  - "admin": approved member who is a church administrator
 */
export function useGuard(need: "member" | "admin" = "member") {
  const { me, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  const ok = isApprovedMember(me) && (need === "member" || !!me!.membership!.isAdmin);
  useEffect(() => {
    if (loading) return;
    if (!ok) router.replace(isApprovedMember(me) ? "/home" : nextStep(me));
  }, [loading, ok, me, router, path]);
  return { me: ok ? me! : null, ready: !loading && ok };
}
