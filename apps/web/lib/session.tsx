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
  // DaveUp staff who do not belong to a church go straight to the staff console.
  if (!me.membership) return me.person.isSuperAdmin ? "/staff" : "/start";
  if (me.membership.status === "pending" || me.membership.churchStatus === "suspended") return "/pending";
  return me.membership.isAdmin ? "/admin" : "/home";
}

function isApprovedMember(me: MeDto | null): boolean {
  return !!me?.person.fullName && me.membership?.status === "approved" && me.membership.churchStatus !== "suspended";
}

/** Guard for the DaveUp staff console. */
export function useStaffGuard() {
  const { me, loading } = useSession();
  const router = useRouter();
  const ok = !!me?.person.isSuperAdmin;
  useEffect(() => {
    if (!loading && !ok) router.replace(nextStep(me));
  }, [loading, ok, me, router]);
  return { me: ok ? me! : null, ready: !loading && ok };
}

/**
 * Guard for app screens. `need`:
 *  - "member": signed in and an approved church member (default). Admins may
 *    open the member app too, from the console.
 *  - "admin": approved member who is a church administrator
 *  - "library": an approved member, or DaveUp staff (Training and Resources)
 */
export function useGuard(need: "member" | "admin" | "library" = "member") {
  const { me, loading } = useSession();
  const router = useRouter();
  const path = usePathname();
  const ok = need === "library" ? isApprovedMember(me) || !!me?.person.isSuperAdmin : isApprovedMember(me) && (need === "member" || !!me!.membership!.isAdmin);
  useEffect(() => {
    if (loading) return;
    if (!ok) router.replace(isApprovedMember(me) ? "/home" : nextStep(me));
  }, [loading, ok, me, router, path]);
  return { me: ok ? me! : null, ready: !loading && ok };
}
