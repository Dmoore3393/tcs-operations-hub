"use client";

import MainLayout from "@/components/layout/MainLayout";
import { recordAuditEvent } from "@/lib/audit";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { type ChildRecord } from "@/lib/children";
import { childDisplayName, emergencyCardReadiness, hasCriticalMedicalAlert, normalizedPersonName } from "@/lib/emergency-cards";
import { starterRoutes, type TransportationRoute } from "@/lib/hub-data";
import {
  AlertTriangle,
  BadgeCheck,
  Bus,
  CheckCircle2,
  ChevronLeft,
  FileWarning,
  HeartPulse,
  LoaderCircle,
  Phone,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./emergency-cards.css";

type EmergencyRoute = TransportationRoute & {
  routeName?: string;
  stopOrder?: number;
};

function routeKey(route: EmergencyRoute) {
  return route.routeName?.trim() || `${route.location} • ${route.driver || "Transportation Route"}`;
}

function locationKey(value: string) {
  const source = value.toLowerCase();
  if (source.includes("halcom") || source.includes("moore family")) return "Halcom";
  if (source.includes("21st") || source.includes("cathers")) return "21st Street";
  if (source.includes("division") || source.includes("school age")) return "Division";
  if (source.includes("33rd") || source.includes("cornejo")) return "33rd Street";
  if (source.includes("42nd") || source.includes("lara")) return "42nd Street";
  if (source.includes("tehachapi")) return "Tehachapi";
  return value || "Unknown";
}

function formatDate(value?: string) {
  if (!value) return "Not entered";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function normalizedPhone(value?: string) {
  return (value || "").replace(/[^0-9+]/g, "");
}

export default function EmergencyCardsPage() {
  const { session } = useAuth();
  const { location: hubLocation } = useHubLocation();
  const [routes] = usePersistentState<EmergencyRoute[]>("tcs-routes", starterRoutes as EmergencyRoute[]);
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("All Locations");
  const [routeFilter, setRouteFilter] = useState("All Routes / Vehicles");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [openCard, setOpenCard] = useState<ChildRecord | null>(null);
  const [queryHandled, setQueryHandled] = useState(false);

  const request = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const response = await fetch("/api/children", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const raw = await response.text();
      const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
      if (!response.ok) throw new Error(String(payload.error || "Could not load emergency records."));
      setChildren(Array.isArray(payload.children) ? payload.children as ChildRecord[] : []);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load emergency records.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => { void request(); }, [request]);

  useEffect(() => {
    if (hubLocation !== "All Locations") setLocationFilter(hubLocation);
  }, [hubLocation]);

  const activeRoutes = useMemo(() => routes.filter((route) => route.status !== "Not Riding"), [routes]);

  const routeOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; children: Set<string> }>();
    activeRoutes.forEach((route) => {
      const value = routeKey(route);
      const current = map.get(value) ?? {
        value,
        label: route.vehicle ? `${value} • ${route.vehicle}` : value,
        children: new Set<string>(),
      };
      current.children.add(normalizedPersonName(route.child));
      map.set(value, current);
    });
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [activeRoutes]);

  const locationOptions = useMemo(
    () => [...new Set(children.map((child) => locationKey(child.location)).filter(Boolean))].sort(),
    [children],
  );

  useEffect(() => {
    if (loading || queryHandled || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const childId = Number(params.get("child"));
    const childName = params.get("name") || "";
    const route = params.get("route") || "";
    if (route && routeOptions.some((option) => option.value === route)) setRouteFilter(route);
    const match = children.find((child) =>
      (Number.isSafeInteger(childId) && child.id === childId) ||
      (childName && normalizedPersonName(childDisplayName(child)) === normalizedPersonName(childName)),
    );
    if (match) {
      openEmergencyCard(match);
      setSelectedIds([match.id]);
    }
    setQueryHandled(true);
  }, [children, loading, queryHandled, routeOptions]);

  const routeChildSet = useMemo(() => {
    if (routeFilter === "All Routes / Vehicles") return null;
    return routeOptions.find((option) => option.value === routeFilter)?.children ?? new Set<string>();
  }, [routeFilter, routeOptions]);

  const filtered = useMemo(() => children.filter((child) => {
    if (child.enrollmentStatus === "Archived") return false;
    const name = childDisplayName(child);
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${name} ${child.primaryGuardian} ${child.location}`.toLowerCase().includes(query);
    const matchesLocation = locationFilter === "All Locations" || locationKey(child.location) === locationFilter;
    const matchesRoute = !routeChildSet || routeChildSet.has(normalizedPersonName(name));
    return matchesSearch && matchesLocation && matchesRoute;
  }).sort((a, b) => childDisplayName(a).localeCompare(childDisplayName(b))), [children, locationFilter, routeChildSet, search]);

  const readyCount = filtered.filter((child) => emergencyCardReadiness(child).ready).length;
  const needsAttentionCount = filtered.length - readyCount;
  const consentMissingCount = filtered.filter((child) => (child.medicalConsentStatus ?? "Missing") !== "On File").length;
  const criticalAlertCount = filtered.filter(hasCriticalMedicalAlert).length;
  const selectedChildren = children.filter((child) => selectedIds.includes(child.id));

  function openEmergencyCard(child: ChildRecord) {
    setOpenCard(child);
    void recordAuditEvent({
      action: "REVIEW",
      tableName: "children",
      location: child.location,
      legacyId: child.id,
      metadata: { kind: "emergency_medical_card_review" },
    }).catch(() => {
      // Emergency access must remain available even if audit delivery is temporarily unavailable.
    });
  }

  function toggleSelected(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectVisible() {
    setSelectedIds(filtered.map((child) => child.id));
  }

  function printPacket() {
    if (!selectedChildren.length) return;
    window.print();
  }

  return <MainLayout>
    <div className="emergency-shell mx-auto max-w-[1580px] space-y-5 pb-12">
      <section className="emergency-hero">
        <div>
          <Link href="/children" className="emergency-back"><ChevronLeft className="h-4 w-4" /> Children Center</Link>
          <p className="emergency-eyebrow">The Hub • Authorized Staff Only</p>
          <h1>Emergency Medical Cards</h1>
          <p className="emergency-subtitle">Fast access to current emergency contacts, medical authorization status, allergies, providers, insurance, and transportation safety information.</p>
          <div className="emergency-hero-actions">
            <button onClick={() => void request()} className="emergency-secondary"><RefreshCw className="h-4 w-4" /> Refresh Before Departure</button>
            <button onClick={selectVisible} disabled={!filtered.length} className="emergency-secondary"><CheckCircle2 className="h-4 w-4" /> Select Visible</button>
            <button onClick={printPacket} disabled={!selectedChildren.length} className="emergency-primary"><Printer className="h-4 w-4" /> Print Vehicle Backup ({selectedChildren.length})</button>
          </div>
        </div>
        <div className="emergency-shield"><ShieldAlert /></div>
      </section>

      <section className="emergency-policy-note">
        <AlertTriangle className="h-5 w-5" />
        <div><strong>Vehicle safety backup:</strong> Use the digital cards for fast access, but keep a printable/offline backup available until TCS has formally approved a fully paperless vehicle process. The Hub should never be the only way staff can reach emergency information if a device, battery, or network fails.</div>
      </section>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-900">{error}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Emergency Ready" value={readyCount} icon={<BadgeCheck />} tone="green" />
        <Metric label="Needs Attention" value={needsAttentionCount} icon={<FileWarning />} tone="amber" />
        <Metric label="Consent Not Ready" value={consentMissingCount} icon={<ShieldAlert />} tone="red" />
        <Metric label="Medical / Allergy Alerts" value={criticalAlertCount} icon={<HeartPulse />} tone="purple" />
      </section>

      <section className="emergency-filters">
        <label className="emergency-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search child, guardian, or location…" /></label>
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
          <option>All Locations</option>
          {locationOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select value={routeFilter} onChange={(event) => setRouteFilter(event.target.value)}>
          <option>All Routes / Vehicles</option>
          {routeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </section>

      {loading ? <div className="emergency-loading"><LoaderCircle className="animate-spin" /> Loading secured emergency information…</div> :
        filtered.length === 0 ? <div className="emergency-empty"><ShieldCheck /><h2>No children match this emergency view</h2><p>Change the location, route, vehicle, or search filter.</p></div> :
        <section className="emergency-list">
          {filtered.map((child) => {
            const readiness = emergencyCardReadiness(child);
            const critical = hasCriticalMedicalAlert(child);
            const checked = selectedIds.includes(child.id);
            return <article key={child.id} className={`emergency-row ${readiness.ready ? "ready" : "attention"}`}>
              <button type="button" onClick={() => toggleSelected(child.id)} className={`emergency-check ${checked ? "checked" : ""}`} aria-label={checked ? "Remove from vehicle packet" : "Add to vehicle packet"}>{checked ? "✓" : ""}</button>
              <div className="emergency-avatar">{child.firstName?.[0]}{child.lastName?.[0]}</div>
              <div className="emergency-child-main">
                <div className="emergency-name-line"><h3>{childDisplayName(child)}</h3>{critical && <span className="critical-chip">MEDICAL ALERT</span>}</div>
                <p>{child.age} • {locationKey(child.location)} • {child.transportRestraint || "Restraint not entered"}</p>
                {!readiness.ready && <p className="emergency-missing">Missing: {readiness.missing.slice(0, 3).join(", ")}{readiness.missing.length > 3 ? ` +${readiness.missing.length - 3} more` : ""}</p>}
              </div>
              <div className="emergency-consent">
                <small>Medical Consent</small>
                <strong className={readiness.consentStatus === "On File" ? "ok" : "bad"}>{readiness.consentStatus}</strong>
                <span>Verified {formatDate(child.medicalConsentVerifiedAt)}</span>
              </div>
              <div className="emergency-row-actions">
                {child.phone && <a href={`tel:${normalizedPhone(child.phone)}`}><Phone /> Parent</a>}
                <button onClick={() => openEmergencyCard(child)}><HeartPulse /> Open Card</button>
              </div>
            </article>;
          })}
        </section>
      }

      <section className="emergency-footer-actions">
        <div><strong>{selectedChildren.length}</strong> child{selectedChildren.length === 1 ? "" : "ren"} selected for the vehicle backup packet.</div>
        <button onClick={printPacket} disabled={!selectedChildren.length}><Printer /> Print Selected Emergency Cards</button>
      </section>

      {openCard && <EmergencyCardModal child={openCard} onClose={() => setOpenCard(null)} onPrint={() => { setSelectedIds([openCard.id]); window.setTimeout(() => window.print(), 80); }} />}

      <div className="emergency-print-area" aria-hidden="true">
        <div className="print-cover">
          <h1>TCS Emergency Vehicle Packet</h1>
          <p>Generated {new Date().toLocaleString()}</p>
          <p>{routeFilter === "All Routes / Vehicles" ? locationFilter : routeOptions.find((option) => option.value === routeFilter)?.label}</p>
          <strong>{selectedChildren.length} emergency card{selectedChildren.length === 1 ? "" : "s"}</strong>
        </div>
        {selectedChildren.map((child) => <PrintableEmergencyCard key={child.id} child={child} />)}
      </div>
    </div>
  </MainLayout>;
}

function EmergencyCardModal({ child, onClose, onPrint }: { child: ChildRecord; onClose: () => void; onPrint: () => void }) {
  const readiness = emergencyCardReadiness(child);
  return <div className="emergency-modal-backdrop">
    <button className="absolute inset-0" onClick={onClose} aria-label="Close emergency card" />
    <section className="emergency-modal">
      <header>
        <div><p>TCS • Emergency Medical Card</p><h2>{childDisplayName(child)}</h2><span>{child.age} • {locationKey(child.location)} • DOB {formatDate(child.dateOfBirth)}</span></div>
        <button onClick={onClose}><X /></button>
      </header>
      <div className={`emergency-status-banner ${readiness.ready ? "ready" : "attention"}`}>
        {readiness.ready ? <BadgeCheck /> : <AlertTriangle />}
        <div><strong>{readiness.ready ? "Emergency Ready" : "Needs Attention Before Paperless Use"}</strong>{!readiness.ready && <span>{readiness.missing.join(" • ")}</span>}</div>
      </div>

      {hasCriticalMedicalAlert(child) && <section className="emergency-alert-box"><HeartPulse /><div><small>CRITICAL MEDICAL / ALLERGY INFORMATION</small><strong>{child.allergies || "See emergency instructions"}</strong><p>{child.emergencyInstructions || child.medicalNotes}</p></div></section>}

      <div className="emergency-detail-grid">
        <CardSection title="Parent / Guardian" icon={<UserRound />}>
          <Data label="Primary" value={child.primaryGuardian} />
          <PhoneData label="Phone" value={child.phone} />
          <Data label="Secondary" value={child.secondaryGuardian || "Not listed"} />
        </CardSection>

        <CardSection title="Emergency Contact 1" icon={<Phone />}>
          <Data label="Name" value={child.emergencyContact1Name || "Not entered"} />
          <PhoneData label="Phone" value={child.emergencyContact1Phone || ""} />
          <Data label="Relationship" value={child.emergencyContact1Relationship || "Not entered"} />
        </CardSection>

        <CardSection title="Emergency Contact 2" icon={<Phone />}>
          <Data label="Name" value={child.emergencyContact2Name || "Not entered"} />
          <PhoneData label="Phone" value={child.emergencyContact2Phone || ""} />
          <Data label="Relationship" value={child.emergencyContact2Relationship || "Not entered"} />
        </CardSection>

        <CardSection title="Medical Provider" icon={<Stethoscope />}>
          <Data label="Provider" value={child.medicalProvider || "Not entered"} />
          <PhoneData label="Phone" value={child.medicalProviderPhone || ""} />
          <Data label="Dentist" value={child.dentistProvider || "Not entered"} />
          <PhoneData label="Dentist phone" value={child.dentistPhone || ""} />
        </CardSection>

        <CardSection title="Insurance / Medical Plan" icon={<ShieldCheck />}>
          <Data label="Provider" value={child.insuranceProvider || "Not entered"} />
          <Data label="Member / Plan ID" value={child.insuranceMemberId || "Not entered"} />
        </CardSection>

        <CardSection title="Emergency Medical Authorization" icon={<ShieldAlert />}>
          <Data label="Status" value={child.medicalConsentStatus || "Missing"} />
          <Data label="Signed" value={formatDate(child.medicalConsentSignedAt)} />
          <Data label="Last verified" value={formatDate(child.medicalConsentVerifiedAt)} />
        </CardSection>

        <CardSection title="Transportation Safety" icon={<Bus />}>
          <Data label="Restraint" value={child.transportRestraint || "Not entered"} />
          <Data label="Transportation notes" value={child.transportation || "No transportation"} />
        </CardSection>

        <CardSection title="Emergency Instructions" icon={<AlertTriangle />}>
          <Data label="Instructions" value={child.emergencyInstructions || child.medicalNotes || "None entered"} />
        </CardSection>
      </div>

      <footer>
        <Link href={`/children?editChild=${child.id}`}>Edit information in Children Center</Link>
        <button onClick={onPrint}><Printer /> Print This Card</button>
      </footer>
    </section>
  </div>;
}

function PrintableEmergencyCard({ child }: { child: ChildRecord }) {
  const readiness = emergencyCardReadiness(child);
  return <article className="print-emergency-card">
    <header><div><small>TCS OPERATIONS HUB • EMERGENCY MEDICAL CARD</small><h2>{childDisplayName(child)}</h2><p>{child.age} • DOB {formatDate(child.dateOfBirth)} • {locationKey(child.location)}</p></div><strong className={readiness.ready ? "ready" : "attention"}>{readiness.status}</strong></header>
    <div className="print-alert"><b>ALLERGIES / MEDICAL ALERTS:</b> {child.allergies || "None entered"}{child.emergencyInstructions ? <><br/><b>EMERGENCY INSTRUCTIONS:</b> {child.emergencyInstructions}</> : null}</div>
    <div className="print-grid">
      <PrintField label="Parent / Guardian" value={child.primaryGuardian} />
      <PrintField label="Parent Phone" value={child.phone} />
      <PrintField label="Emergency Contact 1" value={`${child.emergencyContact1Name || "Not entered"} • ${child.emergencyContact1Relationship || ""}`} />
      <PrintField label="Emergency Phone 1" value={child.emergencyContact1Phone || "Not entered"} />
      <PrintField label="Emergency Contact 2" value={`${child.emergencyContact2Name || "Not entered"} • ${child.emergencyContact2Relationship || ""}`} />
      <PrintField label="Emergency Phone 2" value={child.emergencyContact2Phone || "Not entered"} />
      <PrintField label="Medical Provider" value={child.medicalProvider || "Not entered"} />
      <PrintField label="Provider Phone" value={child.medicalProviderPhone || "Not entered"} />
      <PrintField label="Dentist" value={child.dentistProvider || "Not entered"} />
      <PrintField label="Dentist Phone" value={child.dentistPhone || "Not entered"} />
      <PrintField label="Insurance / Plan" value={child.insuranceProvider || "Not entered"} />
      <PrintField label="Member / Plan ID" value={child.insuranceMemberId || "Not entered"} />
      <PrintField label="Medical Consent" value={`${child.medicalConsentStatus || "Missing"} • Signed ${formatDate(child.medicalConsentSignedAt)} • Verified ${formatDate(child.medicalConsentVerifiedAt)}`} wide />
      <PrintField label="Transportation Restraint" value={child.transportRestraint || "Not entered"} wide />
    </div>
    <footer>Authorized TCS staff emergency use • Confirm information is current before route departure.</footer>
  </article>;
}

function Metric({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return <div className={`emergency-metric ${tone}`}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function CardSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="emergency-detail-card"><h3>{icon}{title}</h3><div>{children}</div></section>;
}

function Data({ label, value }: { label: string; value: string }) {
  return <p className="emergency-data"><small>{label}</small><strong>{value || "Not entered"}</strong></p>;
}

function PhoneData({ label, value }: { label: string; value: string }) {
  return <p className="emergency-data"><small>{label}</small>{value ? <a href={`tel:${normalizedPhone(value)}`}><Phone /> {value}</a> : <strong>Not entered</strong>}</p>;
}

function PrintField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "wide" : ""}><small>{label}</small><strong>{value || "Not entered"}</strong></div>;
}
