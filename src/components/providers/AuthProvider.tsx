"use client";

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import {
  employeeCanAccessRoute,
  employeeCanReadState,
  employeeCanWriteState,
  isEmployeeAccessRole,
  isLicenseeAccessRole,
  isOwnerAccessRole,
  isSupportedAccessRole,
  normalizeAccessRole,
} from "@/lib/team-access";
import type { Session, User } from "@supabase/supabase-js";
import { AlertTriangle, Database, LoaderCircle, LockKeyhole, LogOut } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type StaffAccessProfile = {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  locations: string[];
  permissions: string[];
  is_active: boolean;
  organization_id: string;
  invited_at: string | null;
  accepted_at: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: StaffAccessProfile | null;
  loading: boolean;
  isSystemOwner: boolean;
  isCorporateAdmin: boolean;
  isLocationLicensee: boolean;
  isEmployee: boolean;
  isLocationRestricted: boolean;
  canManageSystem: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ownerOnlyRoutes = new Set(["/settings", "/team-access", "/locations", "/audit-log", "/marketing"]);
const ownerOnlyReadStateKeys = new Set(["tcs-settings"]);
const ownerOnlyWriteStateKeys = new Set([
  "tcs-settings",
  "tcs-locations-v2",
  "tcs-location-hours-v2",
  "tcs-schools-v2",
  "tcs-vehicles-v2",
  "tcs-timesheet-department-routes-v1",
]);

export function normalizedStaffRole(role = "") {
  return normalizeAccessRole(role);
}

export function isOwnerRole(role = "") {
  return isOwnerAccessRole(role);
}

export function isCorporateAdminRole(role = "") {
  return isOwnerAccessRole(role);
}

export function isLicenseeRole(role = "") {
  return isLicenseeAccessRole(role);
}

export function isEmployeeRole(role = "") {
  return isEmployeeAccessRole(role);
}

export function isApprovedPilotRole(role = "") {
  return isSupportedAccessRole(role);
}

export function canAccessRoute(profile: StaffAccessProfile | null, pathname: string) {
  if (!profile) return false;
  if (isOwnerRole(profile.role)) return true;
  if (isLicenseeRole(profile.role)) return !ownerOnlyRoutes.has(pathname);
  if (isEmployeeRole(profile.role)) return employeeCanAccessRoute(profile.permissions ?? [], pathname);
  return false;
}

export function canReadStateKey(profile: StaffAccessProfile | null, stateKey: string) {
  if (!profile) return false;
  if (isOwnerRole(profile.role)) return true;
  if (isLicenseeRole(profile.role)) return !ownerOnlyReadStateKeys.has(stateKey);
  if (isEmployeeRole(profile.role)) return employeeCanReadState(profile.permissions ?? [], stateKey);
  return false;
}

export function canWriteStateKey(profile: StaffAccessProfile | null, stateKey: string) {
  if (!profile) return false;
  if (isOwnerRole(profile.role)) return true;
  if (isLicenseeRole(profile.role)) return !ownerOnlyWriteStateKeys.has(stateKey);
  if (isEmployeeRole(profile.role)) return employeeCanWriteState(profile.permissions ?? [], stateKey);
  return false;
}

export function canAccessStateKey(profile: StaffAccessProfile | null, stateKey: string) {
  return canReadStateKey(profile, stateKey);
}

function initials(name: string, email: string) {
  const source = name.trim() || email;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffAccessProfile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [accessError, setAccessError] = useState("");

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!supabase || !activeSession) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("staff_access")
      .select("user_id,email,full_name,role,locations,permissions,is_active,organization_id,invited_at,accepted_at")
      .eq("user_id", activeSession.user.id)
      .maybeSingle();

    if (error) {
      setAccessError(`Could not verify staff access: ${error.message}`);
      setProfile(null);
      return;
    }

    if (!data || !data.is_active) {
      setAccessError("This login does not have active TCS staff access. Ask Danielle or Jennifer to add or reactivate the account.");
      setProfile(null);
      return;
    }

    if (!isApprovedPilotRole(data.role)) {
      setAccessError("This account has an unsupported role. Ask Danielle or Jennifer to update the role in Team Access.");
      setProfile(null);
      return;
    }

    setAccessError("");
    setProfile({
      ...(data as StaffAccessProfile),
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
      locations: Array.isArray(data.locations) ? data.locations : [],
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let mounted = true;

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) setAccessError(error.message);
      const nextSession = data.session ?? null;
      setSession(nextSession);
      if (nextSession) await loadProfile(nextSession);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(true);
      window.setTimeout(() => {
        void loadProfile(nextSession).finally(() => setLoading(false));
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (loading || !isSupabaseConfigured) return;

    if (!session) {
      if (pathname !== "/login") router.replace("/login");
      return;
    }

    if (!profile) return;

    if (!profile.accepted_at && pathname !== "/accept-invite") {
      router.replace("/accept-invite");
      return;
    }

    if (profile.accepted_at && (pathname === "/login" || pathname === "/accept-invite")) {
      router.replace("/");
    }
  }, [loading, pathname, profile, router, session]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(() => {
    const isSystemOwner = isOwnerRole(profile?.role);
    const isLocationLicensee = isLicenseeRole(profile?.role);
    const isEmployee = isEmployeeRole(profile?.role);
    return {
      session,
      user: session?.user ?? null,
      profile,
      loading,
      isSystemOwner,
      isCorporateAdmin: isSystemOwner,
      isLocationLicensee,
      isEmployee,
      isLocationRestricted: isLocationLicensee || isEmployee,
      canManageSystem: isSystemOwner,
      refreshProfile: async () => loadProfile(session),
      signOut,
    };
  }, [loadProfile, loading, profile, session, signOut]);

  if (pathname === "/login") {
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5">
        <section className="w-full max-w-2xl rounded-3xl bg-white p-7 shadow-2xl sm:p-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-800"><Database className="h-7 w-7" /></div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-amber-700">Secure setup required</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Connect Supabase before entering live information</h1>
          <p className="mt-3 leading-7 text-slate-600">Follow <strong>FINAL-SETUP-GUIDE.md</strong>, add the Supabase URL, publishable key, and server secret to <strong>.env.local</strong>, and restart the app.</p>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><AlertTriangle className="mr-2 inline h-4 w-4" />Do not enter child, family, medical, employee, or timesheet information until the secure connection is active.</div>
        </section>
      </main>
    );
  }

  if (loading) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-white"><LoaderCircle className="h-9 w-9 animate-spin" /><p className="font-bold">Verifying secure staff access…</p></main>;
  }

  if (!session) return null;

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5">
        <section className="w-full max-w-xl rounded-3xl bg-white p-7 text-center shadow-2xl sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-red-700"><LockKeyhole className="h-7 w-7" /></div>
          <h1 className="mt-5 text-2xl font-black text-slate-950">Staff access is not active</h1>
          <p className="mt-3 leading-7 text-slate-600">{accessError || "This account is signed in, but it has not been approved for the TCS Operations Hub."}</p>
          <p className="mt-2 text-sm text-slate-500">Signed in as {session.user.email}</p>
          <button onClick={() => void signOut()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"><LogOut className="h-4 w-4" /> Sign Out</button>
        </section>
      </main>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function staffInitials(profile: StaffAccessProfile | null, email = "") {
  return initials(profile?.full_name ?? "", profile?.email ?? email);
}
