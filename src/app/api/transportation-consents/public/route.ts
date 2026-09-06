import { encryptDocument } from "@/lib/server/document-crypto";
import { verifyTransportationConsentToken } from "@/lib/server/transportation-consent-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

const DOCUMENT_TYPE = "Transportation Consent 2026-2027";

const authorizationStatements = [
  "My child is expected to follow all applicable laws regarding transport in a motor vehicle.",
  "My child must adhere to directions given by the driver, staff, or volunteers.",
  "Participation in the identified events is not a requirement for participation in the transportation program.",
  "The driver will never leave my child unattended in any vehicle.",
  "Each child will board or exit from the curbside of the street. If the curbside is unavailable, the driver will safely walk the child across the street.",
  "Any vehicle used to transport my child will be insured, registered, and pass inspection. It will be driven by an individual who is at least 18 years old, live-scanned into our program, and holds a valid California driver’s license.",
  "I will be notified if the driver is running late due to uncontrollable circumstances, such as heavy traffic or road closures.",
  "My child will travel in a motor vehicle driven by a qualified adult, and my child is to wear a safety belt during travel.",
  "My child is expected to listen to supervising staff/drivers, and respect staff and other children, the vehicles they ride in, and the people they travel with during the trip.",
  "Riding in a motor vehicle may result in personal injuries or death from wrecks, collisions, or acts by riders, other drivers, or other objects.",
  "My child is to remain in their seat and not be disruptive to the driver of the vehicle.",
  "I understand that I may be called upon to pick my child up if they fail to comply with these requirements.",
];

const policyStatements = [
  "Transportation schedule changes must be submitted by 11:00 AM on the day transportation is needed.",
  "Transportation fees are due every Friday by 6:00 PM.",
  "Transportation fees are not covered by CCRC or other subsidy programs. Fees are the responsibility of the parent/guardian.",
  "Pick-up and drop-off availability depends on school dismissal times and route availability.",
  "Parents must notify us immediately if their child will not need transportation due to absence, change in schedule, minimum day, early dismissal, field trips, or other events.",
  "Children must be signed in to childcare before morning transportation.",
  "Children are expected to follow staff directions and remain properly seated at all times.",
  "Transportation may be suspended if fees become delinquent.",
  "The School Shuttle staff may refuse transportation if a child’s behavior creates an unsafe environment for others.",
];

type ConsentSubmission = {
  childDob?: string;
  grade?: string;
  teacher?: string;
  schoolName?: string;
  schoolAddress?: string;
  centerName?: string;
  facilityNumber?: string;
  locationAddress?: string;
  route?: string;
  transportationNeeded?: string[];
  days?: string[];
  homeAddress?: string;
  schoolStartTime?: string;
  schoolStartPeriod?: string;
  dismissalTime?: string;
  dismissalPeriod?: string;
  minimumDayTime?: string;
  minimumDayPeriod?: string;
  parentPhone?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  boosterSeat?: boolean;
  fivePointHarness?: boolean;
  frontSeatAuthorization?: boolean;
  safetyInitials?: string;
  specialInstructions?: string;
  specialInitials?: string;
  authorizationInitials?: string;
  policyInitials?: string[];
  policySectionInitials?: string;
  waiverInitials?: string;
  parentName?: string;
  signatureDataUrl?: string;
  relationship?: string;
};

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next.toISOString().slice(0, 10);
}

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character] ?? character));
}

function checked(value: boolean | undefined) {
  return value ? "Yes" : "No";
}

function list(value: string[] | undefined) {
  return value?.length ? value.map(esc).join(", ") : "None selected";
}

async function resolveToken(token: string) {
  const payload = verifyTransportationConsentToken(token);
  const admin = createSupabaseAdminClient();
  const { data: location, error: locationError } = await admin
    .from("locations")
    .select("id,name,full_name,slug,organization_id")
    .eq("organization_id", payload.organizationId)
    .eq("slug", payload.locationSlug)
    .maybeSingle();
  if (locationError) throw locationError;
  if (!location) throw new Error("This consent link is no longer connected to an active location.");

  const { data: child, error: childError } = await admin
    .from("children")
    .select("id,legacy_id,first_name,last_name,organization_id")
    .eq("organization_id", payload.organizationId)
    .eq("legacy_id", payload.childLegacyId)
    .maybeSingle();
  if (childError) throw childError;
  if (!child) throw new Error("This consent link is no longer connected to an active child record.");

  const { data: membership, error: membershipError } = await admin
    .from("child_location_memberships")
    .select("id")
    .eq("child_id", child.id)
    .eq("location_id", location.id)
    .maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) throw new Error("This consent link is no longer valid for this location.");

  return { admin, payload, location, child };
}

function consentHtml(childName: string, locationName: string, consent: ConsentSubmission, submittedAt: string, userAgent: string) {
  const policyRows = policyStatements.map((statement, index) => `<tr><td>${esc(consent.policyInitials?.[index])}</td><td>${esc(statement)}</td></tr>`).join("");
  const authorizationRows = authorizationStatements.map((statement) => `<li>${esc(statement)}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Transportation Consent 2026-2027 - ${esc(childName)}</title><style>body{font-family:Arial,sans-serif;color:#102a56;max-width:900px;margin:0 auto;padding:32px;line-height:1.45}h1{font-size:34px;margin:0}.banner{background:#ffc72c;padding:8px 14px;font-weight:800;display:inline-block}.card{border:2px solid #d7e6f7;border-radius:18px;padding:20px;margin:18px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px}.label{font-size:11px;font-weight:800;color:#60728a;text-transform:uppercase}.value{font-weight:700;margin-bottom:8px}.sig{max-width:520px;max-height:180px;border:1px solid #ccd8e6;background:white}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e2e8f0;padding:10px;vertical-align:top}td:first-child{width:90px;font-weight:800}.meta{font-size:12px;color:#64748b;margin-top:24px}@media print{body{padding:10px}.card{break-inside:avoid}}</style></head><body>
  <h1>SCHOOL TRANSPORTATION CONSENT</h1><div class="banner">SCHOOL YEAR 2026–2027</div>
  <div class="card"><h2>Child & Location Information</h2><div class="grid"><div><div class="label">Child</div><div class="value">${esc(childName)}</div></div><div><div class="label">DOB</div><div class="value">${esc(consent.childDob)}</div></div><div><div class="label">Grade</div><div class="value">${esc(consent.grade)}</div></div><div><div class="label">Teacher</div><div class="value">${esc(consent.teacher)}</div></div><div><div class="label">School</div><div class="value">${esc(consent.schoolName)}</div></div><div><div class="label">School Address</div><div class="value">${esc(consent.schoolAddress)}</div></div><div><div class="label">Child Care Location</div><div class="value">${esc(consent.centerName || locationName)}</div></div><div><div class="label">Facility Number</div><div class="value">${esc(consent.facilityNumber)}</div></div><div><div class="label">Location Address</div><div class="value">${esc(consent.locationAddress)}</div></div><div><div class="label">Transportation Route</div><div class="value">${esc(consent.route)}</div></div></div></div>
  <div class="card"><h2>Transportation Details</h2><p><b>Transportation needed:</b> ${list(consent.transportationNeeded)}</p><p><b>Authorized days:</b> ${list(consent.days)}</p><p><b>Child’s home address:</b> ${esc(consent.homeAddress)}</p><p><b>School start:</b> ${esc(consent.schoolStartTime)} ${esc(consent.schoolStartPeriod)}</p><p><b>School dismissal:</b> ${esc(consent.dismissalTime)} ${esc(consent.dismissalPeriod)}</p><p><b>Minimum day dismissal:</b> ${esc(consent.minimumDayTime)} ${esc(consent.minimumDayPeriod)}</p><p><b>Parent preferred contact:</b> ${esc(consent.parentPhone)}</p><p><b>Emergency contact during transportation:</b> ${esc(consent.emergencyName)} • ${esc(consent.emergencyPhone)}</p></div>
  <div class="card"><h2>Safety & Seating Options</h2><p>Booster seat required: <b>${checked(consent.boosterSeat)}</b></p><p>5-point harness required: <b>${checked(consent.fivePointHarness)}</b></p><p>Front passenger seat authorization when permitted by California law and at the direction of The School Shuttle staff: <b>${checked(consent.frontSeatAuthorization)}</b></p><p><b>Parent/Guardian Initials:</b> ${esc(consent.safetyInitials)}</p><p><b>Special request instructions:</b> ${esc(consent.specialInstructions)}</p><p><b>Special request initials:</b> ${esc(consent.specialInitials)}</p></div>
  <div class="card"><h2>Transportation Authorization</h2><p>I authorize The School Shuttle and its staff and/or volunteers to transport my minor child in a company vehicle driven by an authorized individual. I understand that I am responsible for reading, understanding, and discussing transportation guidelines with my child.</p><ul>${authorizationRows}</ul><p><b>Parent/Guardian Initials:</b> ${esc(consent.authorizationInitials)}</p><p><b>Reminder:</b> Transportation schedule changes must be submitted by 11:00 AM on the day transportation is needed.</p></div>
  <div class="card"><h2>Transportation Policies Acknowledgement</h2><table>${policyRows}</table><p><b>Parent/Guardian Initials:</b> ${esc(consent.policySectionInitials)}</p></div>
  <div class="card"><h2>Liability Waiver and Release</h2><p><b>Initials:</b> ${esc(consent.waiverInitials)}</p><p>As a condition for the transportation received, I, for myself, my child, my executors, and assigns, further agree to release and forever discharge The School Shuttle, Thomason Childcare Solutions, Moore Family Childcare, Cathers Family Childcare, Anthony Thomason, Jennifer Thomason, Danielle Moore, Jonathan Cathers, and their agents, officers, employees, and volunteers from any claim that I might or that I could bring on my child’s behalf concerning any damages, demands or actions whatsoever, including those based on negligence, in any manner arising out of this transportation.</p><p>I have read this entire waiver and authorization form. I fully understand its terms and conditions, and I agree to be legally bound by its terms.</p><p><b>Parent/Guardian Name:</b> ${esc(consent.parentName)}</p><p><b>Date:</b> ${esc(submittedAt.slice(0,10))}</p><p><b>Relationship to Child:</b> ${esc(consent.relationship)}</p><p><b>Electronic Signature:</b></p><img class="sig" src="${esc(consent.signatureDataUrl)}" alt="Parent or guardian electronic signature" /></div>
  <p class="meta">Digitally submitted ${esc(submittedAt)}. Signature method: drawn electronic signature. Submission user agent: ${esc(userAgent)}</p>
  </body></html>`;
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const { child, location } = await resolveToken(token);
    return Response.json({ childName: `${child.first_name} ${child.last_name}`, locationName: location.full_name || location.name, schoolYear: "2026-2027" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This consent link is invalid.";
    return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: string; consent?: ConsentSubmission };
    const token = String(body.token ?? "");
    const consent = body.consent ?? {};
    const { admin, payload, child, location } = await resolveToken(token);
    const childName = `${child.first_name} ${child.last_name}`;

    if (!consent.parentName?.trim() || !consent.relationship?.trim() || !consent.authorizationInitials?.trim() || !consent.policySectionInitials?.trim() || !consent.waiverInitials?.trim()) {
      return Response.json({ error: "Complete the parent name, relationship, and required initials before signing." }, { status: 400 });
    }
    if (!Array.isArray(consent.policyInitials) || consent.policyInitials.length !== policyStatements.length || consent.policyInitials.some((value) => !String(value).trim())) {
      return Response.json({ error: "Please initial each transportation policy statement." }, { status: 400 });
    }
    if (!consent.signatureDataUrl?.startsWith("data:image/png;base64,") || consent.signatureDataUrl.length > 500000) {
      return Response.json({ error: "Please provide a valid drawn electronic signature." }, { status: 400 });
    }

    const submittedAt = new Date().toISOString();
    const html = consentHtml(childName, location.full_name || location.name, consent, submittedAt, request.headers.get("user-agent") ?? "Unknown");
    const plain = Buffer.from(html, "utf8");
    const encrypted = encryptDocument(plain);

    const { data: policy, error: policyError } = await admin
      .from("retention_policies")
      .select("id,retention_years")
      .eq("organization_id", payload.organizationId)
      .eq("document_type", DOCUMENT_TYPE)
      .eq("is_active", true)
      .maybeSingle();
    if (policyError) throw policyError;

    const { data: fallback, error: fallbackError } = policy ? { data: null, error: null } : await admin
      .from("retention_policies")
      .select("id,retention_years")
      .eq("organization_id", payload.organizationId)
      .eq("document_type", "Other Child Form")
      .eq("is_active", true)
      .maybeSingle();
    if (fallbackError) throw fallbackError;
    const activePolicy = policy ?? fallback;
    if (!activePolicy) throw new Error("No active retention policy is configured for transportation consent forms.");

    const documentId = randomUUID();
    const storagePath = `${payload.organizationId}/${location.id}/${documentId}.enc`;
    const retentionUntil = addYears(new Date(), activePolicy.retention_years);
    const safeChildName = childName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const filename = `transportation-consent-2026-2027-${safeChildName}.html`;

    const { error: uploadError } = await admin.storage.from("tcs-sensitive-documents").upload(storagePath, encrypted.encrypted, { contentType: "application/octet-stream", upsert: false });
    if (uploadError) throw uploadError;

    const { error: recordError } = await admin.from("document_records").insert({
      id: documentId,
      organization_id: payload.organizationId,
      location_id: location.id,
      child_id: child.id,
      document_type: DOCUMENT_TYPE,
      original_filename: filename,
      storage_path: storagePath,
      mime_type: "text/html; charset=utf-8",
      size_bytes: plain.length,
      sha256: encrypted.sha256,
      encryption_algorithm: "AES-256-GCM",
      encryption_iv: encrypted.iv,
      encryption_version: 1,
      retention_policy_id: activePolicy.id,
      retention_until: retentionUntil,
      legal_hold: false,
      status: "Active",
    });

    if (recordError) {
      await admin.storage.from("tcs-sensitive-documents").remove([storagePath]);
      throw recordError;
    }

    return Response.json({ ok: true, childName, submittedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The transportation consent could not be submitted.";
    return Response.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
