import { auditSummary, type ChildFileAudit } from "@/lib/child-file-audits";
import { familyAccessSummary } from "@/lib/family-access";
import { defaultImmunizationProgram, immunizationStatus, normalizeImmunizationRecord } from "@/lib/immunization-tracker";
import { parentErrorResponse, requireParent } from "@/lib/server/require-parent";

type DbRow = Record<string, unknown>;

function object(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function records(value: unknown): DbRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is DbRow => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function safeParentMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-100).map((entry) => {
    const message = object(entry);
    return {
      id: text(message.id),
      direction: text(message.direction) === "Family to TCS" ? "Family to TCS" : "TCS to Family",
      subject: text(message.subject),
      body: text(message.body),
      createdAt: text(message.createdAt),
      createdBy: text(message.createdBy),
      readAt: text(message.readAt),
    };
  }).filter((message) => message.id && message.body);
}

async function signedChildMediaUrl(admin: Awaited<ReturnType<typeof requireParent>>["admin"], objectPath: string) {
  if (!objectPath) return "";
  const result = await admin.storage.from("child-media").createSignedUrl(objectPath, 60 * 60);
  return result.error ? "" : result.data.signedUrl;
}

async function signedNewsletterUrl(admin: Awaited<ReturnType<typeof requireParent>>["admin"], objectPath: string) {
  if (!objectPath) return "";
  const result = await admin.storage.from("family-newsletters").createSignedUrl(objectPath, 60 * 60);
  return result.error ? "" : result.data.signedUrl;
}

async function signedMenuImageUrl(admin: Awaited<ReturnType<typeof requireParent>>["admin"], objectPath: string) {
  if (!objectPath) return "";
  const result = await admin.storage.from("weekly-menu-images").createSignedUrl(objectPath, 60 * 60);
  return result.error ? "" : result.data.signedUrl;
}

function latestAudit(record: DbRow): ChildFileAudit | null {
  const audits = Array.isArray(record.fileAudits) ? record.fileAudits as ChildFileAudit[] : [];
  return [...audits].sort((a, b) =>
    (b.auditDate || b.updatedAt || "").localeCompare(a.auditDate || a.updatedAt || ""),
  )[0] ?? null;
}

export async function GET(request: Request) {
  try {
    const { admin, email, children } = await requireParent(request);
    const rowIds = children.map((child) => child.rowId);
    const organizationIds = [...new Set(children.map((child) => child.organizationId).filter(Boolean))];

    const parentVisibleChildren = children.filter((child) => child.access.permissions.viewProfile);
    const parentVisibleRowIds = parentVisibleChildren.map((child) => child.rowId);
    const parentVisibleLocationIds = [...new Set(parentVisibleChildren.map((child) => child.locationId).filter(Boolean))];
    const mealVisibleChildren = children.filter((child) => child.access.permissions.viewMeals);
    const mealVisibleLocationIds = [...new Set(mealVisibleChildren.map((child) => child.locationId).filter(Boolean))];
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const [careResult, formsResult, transportationFeesResult, familyMattersResult, weeklyCheckinsResult, mediaResult, newslettersResult, storeStateResult, weeklyMenusResult] = await Promise.all([
      rowIds.length
        ? admin
            .from("daily_care_entries")
            .select("id,child_id,entry_date,entry_time,category,action,result,notes,created_at")
            .in("child_id", rowIds)
            .order("entry_date", { ascending: false })
            .order("entry_time", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      children.some((child) => child.access.permissions.viewDocuments)
        ? admin
            .from("digital_forms")
            .select("id,legacy_id,organization_id,location_id,record_data,created_at,updated_at")
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length && children.some((child) => child.access.permissions.viewBilling && child.access.permissions.viewTransportation)
        ? admin
            .from("transportation_fee_records")
            .select("id,legacy_id,organization_id,record_data,created_at,updated_at")
            .in("organization_id", organizationIds)
            .order("updated_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length
        ? admin
            .from("family_matters_posts")
            .select("id,organization_id,location_id,category,title,message,emoji,start_date,end_date,is_pinned")
            .in("organization_id", organizationIds)
            .eq("is_active", true)
            .lte("start_date", today)
            .order("is_pinned", { ascending: false })
            .order("start_date", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      parentVisibleRowIds.length
        ? admin
            .from("child_weekly_checkins")
            .select("id,child_id,child_legacy_id,week_of,title,message,highlights,created_by_name,updated_at")
            .in("child_id", parentVisibleRowIds)
            .eq("status", "Published")
            .order("week_of", { ascending: false })
            .limit(60)
        : Promise.resolve({ data: [], error: null }),
      parentVisibleRowIds.length
        ? admin
            .from("child_media")
            .select("id,child_id,child_legacy_id,media_kind,service_date,caption,object_path,created_at")
            .in("child_id", parentVisibleRowIds)
            .eq("visible_to_family", true)
            .eq("photo_consent_verified", true)
            .order("service_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length
        ? admin
            .from("family_newsletters")
            .select("id,organization_id,location_id,newsletter_month,title,summary,object_path,mime_type,size_bytes,created_by_name,created_at")
            .in("organization_id", organizationIds)
            .eq("is_published", true)
            .order("newsletter_month", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(36)
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length && children.some((child) => child.access.permissions.viewRewards)
        ? admin
            .from("hub_state")
            .select("organization_id,state_key,state_value")
            .in("organization_id", organizationIds)
            .in("state_key", [
              "tcs-gator-ledger-v1",
              "tcs-store-orders-v1",
              "tcs-student-jobs-v1",
              "tcs-job-assignments-v1"
            ])
        : Promise.resolve({ data: [], error: null }),
      mealVisibleLocationIds.length
        ? admin
            .from("weekly_menus")
            .select("id,organization_id,location_id,week_of,record_data")
            .in("organization_id", organizationIds)
            .in("location_id", mealVisibleLocationIds)
            .order("week_of", { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (careResult.error) throw careResult.error;
    if (formsResult.error) throw formsResult.error;
    if (transportationFeesResult.error) throw transportationFeesResult.error;
    if (familyMattersResult.error) throw familyMattersResult.error;
    if (weeklyCheckinsResult.error) throw weeklyCheckinsResult.error;
    if (mediaResult.error) throw mediaResult.error;
    if (newslettersResult.error) throw newslettersResult.error;
    if (storeStateResult.error) throw storeStateResult.error;
    if (weeklyMenusResult.error) throw weeklyMenusResult.error;

    const childByRow = new Map(children.map((child) => [child.rowId, child]));
    const careEntries = ((careResult.data ?? []) as unknown as DbRow[]).map((row) => {
      const child = childByRow.get(text(row.child_id));
      if (!child?.access.permissions.viewAttendance) return null;
      return {
        id: text(row.id),
        childId: child.legacyId || "",
        date: text(row.entry_date),
        time: text(row.entry_time),
        category: text(row.category),
        action: text(row.action),
        result: text(row.result),
        notes: text(row.notes),
      };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item?.childId));

    const parentForms = ((formsResult.data ?? []) as unknown as DbRow[])
      .map((row) => {
        const record = object(row.record_data);
        if (text(record.signerEmail).toLowerCase() !== email) return null;
        return {
          id: text(row.legacy_id) || text(row.id),
          subjectName: text(record.subjectName),
          formName: text(record.formName),
          signerName: text(record.signerName),
          status: text(record.status),
          signatureMethod: text(record.signatureMethod),
          requestedAt: text(record.requestedAt),
          dueDate: text(record.dueDate),
          signedAt: text(record.signedAt),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const billingChildren = children.filter((child) =>
      child.access.permissions.viewBilling && child.access.permissions.viewTransportation,
    );
    const parentChildNames = new Set(
      billingChildren.map((child) => {
        const record = child.record;
        return `${text(record.firstName)} ${text(record.lastName)}`.trim().toLowerCase();
      }).filter(Boolean),
    );

    const transportationFees = ((transportationFeesResult.data ?? []) as unknown as DbRow[])
      .map((row) => object(row.record_data))
      .filter((record) => {
        const names = strings(record.children).map((name) => name.trim().toLowerCase());
        return names.some((name) => parentChildNames.has(name));
      })
      .map((record) => ({
        id: String(record.id ?? ""),
        weekOf: text(record.weekOf),
        familyName: text(record.familyName),
        location: text(record.location),
        expectedAmount: Number(record.expectedAmount) || 0,
        chargedAmount: Number(record.chargedAmount) || 0,
        paymentStatus: text(record.paymentStatus),
        dateCharged: text(record.dateCharged),
        datePaid: text(record.datePaid),
        children: strings(record.children),
        schools: strings(record.schools),
      }))
      .slice(0, 30);

    const familyMatters = ((familyMattersResult.data ?? []) as unknown as DbRow[])
      .filter((row) => {
        const endDate = text(row.end_date);
        if (endDate && endDate < today) return false;
        const locationId = text(row.location_id);
        return !locationId || parentVisibleLocationIds.includes(locationId);
      })
      .map((row) => ({
        id: text(row.id),
        locationId: text(row.location_id),
        category: text(row.category),
        title: text(row.title),
        message: text(row.message),
        emoji: text(row.emoji),
        startDate: text(row.start_date),
        endDate: text(row.end_date),
        isPinned: row.is_pinned === true,
      }));

    const weeklyCheckins = ((weeklyCheckinsResult.data ?? []) as unknown as DbRow[]).map((row) => ({
      id: text(row.id),
      childId: text(row.child_legacy_id),
      weekOf: text(row.week_of),
      title: text(row.title),
      message: text(row.message),
      highlights: strings(row.highlights),
      createdByName: text(row.created_by_name),
      updatedAt: text(row.updated_at),
    }));

    const media = await Promise.all(((mediaResult.data ?? []) as unknown as DbRow[]).map(async (row) => ({
      id: text(row.id),
      childId: text(row.child_legacy_id),
      kind: text(row.media_kind),
      date: text(row.service_date),
      caption: text(row.caption),
      createdAt: text(row.created_at),
      url: await signedChildMediaUrl(admin, text(row.object_path)),
    })));

    const newsletters = await Promise.all(((newslettersResult.data ?? []) as unknown as DbRow[])
      .filter((row) => {
        const locationId = text(row.location_id);
        return !locationId || parentVisibleLocationIds.includes(locationId);
      })
      .map(async (row) => ({
        id: text(row.id),
        locationId: text(row.location_id),
        month: text(row.newsletter_month),
        title: text(row.title),
        summary: text(row.summary),
        mimeType: text(row.mime_type),
        sizeBytes: Number(row.size_bytes) || 0,
        createdByName: text(row.created_by_name),
        createdAt: text(row.created_at),
        url: await signedNewsletterUrl(admin, text(row.object_path)),
      })));

    const weeklyMenus = await Promise.all(((weeklyMenusResult.data ?? []) as unknown as DbRow[])
      .map(async (row) => {
        const record = object(row.record_data);
        const objectPath = text(record.menuImagePath);
        if (!objectPath) return null;
        const locationId = text(row.location_id);
        const linkedChildIds = mealVisibleChildren
          .filter((child) => child.locationId === locationId)
          .map((child) => child.legacyId)
          .filter(Boolean);
        if (!linkedChildIds.length) return null;
        return {
          id: text(row.id),
          childIds: linkedChildIds,
          locationId,
          weekOf: text(row.week_of),
          location: text(record.location),
          imageName: text(record.menuImageName),
          uploadedAt: text(record.menuImageUploadedAt),
          imageUrl: await signedMenuImageUrl(admin, objectPath),
        };
      }));
    const familyMenus = weeklyMenus.filter((menu): menu is NonNullable<typeof menu> => Boolean(menu?.imageUrl));

    const storeState = new Map(
      ((storeStateResult.data ?? []) as unknown as DbRow[]).map((row) => [text(row.state_key), row.state_value]),
    );
    const gatorLedger = records(storeState.get("tcs-gator-ledger-v1"));
    const storeOrders = records(storeState.get("tcs-store-orders-v1"));
    const studentJobs = records(storeState.get("tcs-student-jobs-v1"));
    const jobAssignments = records(storeState.get("tcs-job-assignments-v1"));
    const currentMonth = today.slice(0, 7);

    const gatorCash = children
      .filter((child) => child.access.permissions.viewRewards)
      .map((child) => {
        const record = child.record;
        const candidateIds = new Set(
          [child.legacyId, String(record.id ?? "")].map((value) => String(value ?? "").trim()).filter(Boolean),
        );
        const matchesChild = (row: DbRow) => candidateIds.has(String(row.childId ?? "").trim());

        const ledger = gatorLedger
          .filter(matchesChild)
          .map((row) => ({
            id: text(row.id),
            amount: Number(row.amount) || 0,
            type: text(row.type),
            reason: text(row.reason),
            staffName: text(row.staffName),
            location: text(row.location),
            createdAt: text(row.createdAt),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        const orders = storeOrders
          .filter(matchesChild)
          .map((row) => ({
            id: text(row.id),
            total: Number(row.total) || 0,
            location: text(row.location),
            staffName: text(row.staffName),
            createdAt: text(row.createdAt),
            items: records(row.items).map((item) => ({
              name: text(item.name),
              quantity: Math.max(1, Number(item.quantity) || 1),
              price: Math.max(0, Number(item.price) || 0),
            })),
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

        const assignment = jobAssignments
          .filter(matchesChild)
          .find((row) => row.active === true);
        const job = assignment
          ? studentJobs.find((row) => text(row.id) === text(assignment.jobId))
          : undefined;

        const balance = ledger.reduce((sum, entry) => sum + entry.amount, 0);
        const lifetimeEarned = ledger
          .filter((entry) => entry.amount > 0)
          .reduce((sum, entry) => sum + entry.amount, 0);
        const lifetimeSpent = Math.abs(
          ledger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0),
        );
        const earnedThisMonth = ledger
          .filter((entry) => entry.amount > 0 && entry.createdAt.slice(0, 7) === currentMonth)
          .reduce((sum, entry) => sum + entry.amount, 0);

        return {
          childId: child.legacyId,
          balance,
          lifetimeEarned,
          lifetimeSpent,
          earnedThisMonth,
          recentTransactions: ledger.slice(0, 12),
          recentPurchases: orders.slice(0, 8),
          activeJob: assignment && job ? {
            assignmentId: text(assignment.id),
            jobId: text(job.id),
            title: text(job.title),
            payPerCompletion: Number(assignment.payPerCompletion) || Number(job.pay) || 0,
            completedCount: Number(assignment.completedCount) || 0,
            assignedAt: text(assignment.assignedAt),
            lastPaidAt: text(assignment.lastPaidAt),
            responsibilities: strings(job.responsibilities),
          } : null,
        };
      });

    const safeChildren = children.map((child) => {
      const record = child.record;
      const permissions = child.access.permissions;
      const audit = permissions.viewDocuments ? latestAudit(record) : null;
      const immunization = permissions.viewMedical
        ? normalizeImmunizationRecord(
            object(record.immunizationRecord),
            defaultImmunizationProgram(text(record.ageGroup), text(record.location)),
          )
        : null;
      const shotStatus = immunization
        ? immunizationStatus(text(record.dateOfBirth), immunization)
        : "Private";
      const auditState = audit ? auditSummary(audit) : null;

      return {
        id: child.legacyId,
        firstName: text(record.firstName),
        lastName: text(record.lastName),
        ageGroup: permissions.viewProfile ? text(record.ageGroup) : "",
        location: permissions.viewProfile ? text(record.location) : "",
        classroom: permissions.viewProfile ? text(record.classroom) : "",
        weeklySchedule: permissions.viewSchedule ? text(record.weeklySchedule) : "",
        transportation: permissions.viewTransportation ? text(record.transportation) : "",
        funding: permissions.viewBilling ? text(record.subsidy) || "Not set" : "Private",
        enrollmentStatus: permissions.viewProfile ? text(record.enrollmentStatus) : "",
        attendanceToday: permissions.viewAttendance ? text(record.attendanceToday) : "",
        attendanceDate: permissions.viewAttendance ? text(record.attendanceDate) : "",
        attendanceLocation: permissions.viewAttendance ? text(record.attendanceLocation) : "",
        checkedInAt: permissions.viewAttendance ? text(record.checkedInAt) : "",
        checkedOutAt: permissions.viewAttendance ? text(record.checkedOutAt) : "",
        pickupPerson: permissions.viewAttendance ? text(record.pickupPerson) : "",
        pickupPinConfigured: permissions.managePickup ? Boolean(text(record.pickupPinDigest)) : false,
        pickupPinUpdatedAt: permissions.managePickup ? text(record.pickupPinUpdatedAt) : "",
        missingDocuments: permissions.viewDocuments ? strings(record.missingDocuments) : [],
        medicalConsentStatus: permissions.viewMedical ? text(record.medicalConsentStatus) : "Private",
        nextAuditDue: permissions.viewDocuments ? audit?.nextAuditDue || "" : "",
        fileAuditComplete: permissions.viewDocuments ? Boolean(auditState?.complete) : false,
        immunizationStatus: permissions.viewMedical ? shotStatus : "Private",
        messages: permissions.viewMessages ? safeParentMessages(record.familyMessages) : [],
        access: familyAccessSummary(child.access),
      };
    });

    const adults = [...new Map(children.map((child) => [
      child.access.id,
      {
        id: child.access.id,
        name: child.access.name,
        email: child.access.email,
        relationship: child.access.relationship,
        householdId: child.access.householdId,
        householdName: child.access.householdName,
        financialPrivacy: child.access.financialPrivacy,
        billingResponsibility: child.access.billingResponsibility,
        permissions: child.access.permissions,
      },
    ])).values()];

    return Response.json({
      email,
      viewer: {
        email,
        adults,
        separateFinancialPrivacy: adults.some((adult) => adult.financialPrivacy === "Private"),
      },
      children: safeChildren,
      careEntries,
      forms: parentForms,
      transportationFees,
      familyMatters,
      weeklyCheckins,
      media,
      newsletters,
      gatorCash,
      familyMenus,
    }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (error) {
    return parentErrorResponse(error);
  }
}
