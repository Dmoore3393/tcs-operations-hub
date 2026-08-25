"use client";

import MainLayout from "@/components/layout/MainLayout";
import { DemoNotice, PageIntro, PrimaryButton, SectionCard, StatCard, StatusBadge, inputClass } from "@/components/hub/HubUI";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { dateToDayName, starterChildSchedules, timeToMinutes, type ChildScheduleRecord } from "@/lib/child-schedules";
import { type CareLogEntry, starterCareLogs } from "@/lib/employee-care";
import { formatClock, normalizeLocation, type LocationKey } from "@/lib/location-config";
import {
  createBlankWeeklyMenu,
  dateForDay,
  dayNameForDate,
  formatWeekRange,
  mealComponents,
  mealDefaults,
  mealIntakeOptions,
  mealTypes,
  menuDayOrder,
  shiftWeek,
  starterMealServices,
  starterWeeklyMenus,
  weekStartFor,
  type MealComponent,
  type MealIntake,
  type MealServiceRecord,
  type MealType,
  type MenuSlot,
  type WeeklyMenu,
} from "@/lib/meals";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  History,
  Lock,
  Save,
  Search,
  Users,
  Utensils,
} from "lucide-react";
import { useMemo, useState } from "react";
import { localIsoDate } from "@/lib/date-utils";

const defaultDate = localIsoDate();

type View = "Weekly Menu" | "Log What Children Ate" | "Meal History";

type MealDraft = {
  date: string;
  meal: MealType;
  servedTime: string;
  actualFoods: string;
  drinkServed: string;
  components: MealComponent[];
  substitutionReason: string;
  notes: string;
  initials: string;
};

function cloneMenuForLocation(source: WeeklyMenu, location: Exclude<LocationKey, "All Locations">, weekOf: string): WeeklyMenu {
  const copy = structuredClone(source);
  for (const day of menuDayOrder) {
    for (const meal of mealTypes) {
      copy.days[day][meal] = {
        ...copy.days[day][meal],
        actualFoods: "",
        status: "Planned",
        initials: "",
        notes: "",
      };
    }
  }
  return {
    ...copy,
    id: `menu-${location.toLowerCase().replaceAll(" ", "-")}-${weekOf}`,
    location,
    weekOf,
  };
}

function statusTone(status: MenuSlot["status"]): "green" | "amber" | "blue" | "slate" {
  if (status === "Served as Planned") return "green";
  if (status === "Substitution") return "amber";
  if (status === "Closed") return "slate";
  return "blue";
}

export default function MealsPage() {
  const { location: activeLocation } = useHubLocation();
  const currentLocation: Exclude<LocationKey, "All Locations"> = activeLocation === "All Locations" ? "Halcom" : activeLocation;
  return <MealsLocationPage key={currentLocation} currentLocation={currentLocation} />;
}

function MealsLocationPage({ currentLocation }: { currentLocation: Exclude<LocationKey, "All Locations"> }) {
  const [menus, setMenus] = usePersistentState<WeeklyMenu[]>("tcs-weekly-menus-v1", starterWeeklyMenus);
  const [services, setServices] = usePersistentState<MealServiceRecord[]>("tcs-meal-services-v1", starterMealServices);
  const [careLogs, setCareLogs] = usePersistentState<CareLogEntry[]>("tcs-daily-care-v1", starterCareLogs);
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [childSchedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [view, setView] = useState<View>("Weekly Menu");
  const [weekOf, setWeekOf] = useState(weekStartFor(defaultDate));
  const [search, setSearch] = useState("");
  const [selectedChildren, setSelectedChildren] = useState<number[]>([]);
  const [intakeByChild, setIntakeByChild] = useState<Record<number, MealIntake>>({});
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<MealDraft>({
    date: defaultDate,
    meal: "Breakfast",
    servedTime: mealDefaults.Breakfast.time,
    actualFoods: currentLocation === "Halcom" ? starterWeeklyMenus[0].days.Monday.Breakfast.plannedFoods : "",
    drinkServed: "Milk and water",
    components: [...mealDefaults.Breakfast.suggestedComponents],
    substitutionReason: "",
    notes: "",
    initials: "",
  });


  const activeChildren = useMemo(() => children.filter((child) => child.enrollmentStatus === "Active"), [children]);
  const locationChildren = useMemo(() => activeChildren.filter((child) => {
    if (normalizeLocation(child.location) === currentLocation) return true;
    const schedule = childSchedules.find((record) => record.childId === child.id);
    return schedule ? Object.values(schedule.days).some((day) => day.blocks.some((block) => block.location === currentLocation)) : false;
  }), [activeChildren, childSchedules, currentLocation]);
  const mealChildren = useMemo(() => {
    const day = dateToDayName(draft.date);
    const servedAt = timeToMinutes(draft.servedTime);
    return activeChildren.filter((child) => {
      const schedule = childSchedules.find((record) => record.childId === child.id);
      if (!schedule) return normalizeLocation(child.location) === currentLocation;
      const daySchedule = schedule.days[day];
      if (!daySchedule || daySchedule.noCare) return false;
      return daySchedule.blocks.some((block) => block.location === currentLocation && timeToMinutes(block.start) <= servedAt && timeToMinutes(block.end) >= servedAt);
    });
  }, [activeChildren, childSchedules, currentLocation, draft.date, draft.servedTime]);
  const mealChildIds = useMemo(() => new Set(mealChildren.map((child) => child.id)), [mealChildren]);
  const validSelectedChildren = selectedChildren.filter((childId) => mealChildIds.has(childId));
  const displayedChildren = mealChildren.filter((child) => `${child.firstName} ${child.lastName}`.toLowerCase().includes(search.toLowerCase()));
  const currentMenu = useMemo(
    () => menus.find((menu) => menu.location === currentLocation && menu.weekOf === weekOf) ?? createBlankWeeklyMenu(currentLocation, weekOf),
    [menus, currentLocation, weekOf],
  );
  const draftWeekOf = weekStartFor(draft.date);
  const draftDay = dayNameForDate(draft.date);
  const draftMenu = menus.find((menu) => menu.location === currentLocation && menu.weekOf === draftWeekOf)
    ?? (currentLocation === "Halcom" && draftWeekOf === starterWeeklyMenus[0]?.weekOf ? starterWeeklyMenus[0] : createBlankWeeklyMenu(currentLocation, draftWeekOf));
  const plannedFoods = draftMenu.days[draftDay][draft.meal].plannedFoods;
  const existingService = services.find((service) => service.location === currentLocation && service.date === draft.date && service.meal === draft.meal);
  const locationServices = services
    .filter((service) => service.location === currentLocation)
    .sort((a, b) => `${b.date}${b.servedTime}`.localeCompare(`${a.date}${a.servedTime}`));
  const dietaryAlerts = mealChildren.filter((child) => {
    const text = `${child.allergies} ${child.medicalNotes}`.toLowerCase();
    return !text.includes("none reported") && !text.includes("no current medical notes");
  });
  const selectedIntakeCounts = validSelectedChildren.reduce<Record<MealIntake, number>>((counts, childId) => {
    const result = intakeByChild[childId] ?? "Ate most";
    counts[result] += 1;
    return counts;
  }, Object.fromEntries(mealIntakeOptions.map((item) => [item, 0])) as Record<MealIntake, number>);

  function loadMealSelection(date: string, meal: MealType) {
    const service = services.find((item) => item.location === currentLocation && item.date === date && item.meal === meal);
    const menuWeek = weekStartFor(date);
    const menuDay = dayNameForDate(date);
    const menu = menus.find((item) => item.location === currentLocation && item.weekOf === menuWeek)
      ?? (currentLocation === "Halcom" && menuWeek === starterWeeklyMenus[0]?.weekOf ? starterWeeklyMenus[0] : createBlankWeeklyMenu(currentLocation, menuWeek));
    const planned = menu.days[menuDay][meal].plannedFoods;

    if (service) {
      setDraft({
        date,
        meal,
        servedTime: service.servedTime,
        actualFoods: service.actualFoods,
        drinkServed: service.drinkServed,
        components: [...service.components],
        substitutionReason: service.substitutionReason,
        notes: service.notes,
        initials: service.initials,
      });
      const priorLogs = careLogs.filter((entry) => entry.mealServiceId === service.id);
      setSelectedChildren(priorLogs.map((entry) => entry.childId));
      setIntakeByChild(Object.fromEntries(priorLogs.map((entry) => [entry.childId, entry.result as MealIntake])));
      return;
    }

    setDraft({
      date,
      meal,
      servedTime: mealDefaults[meal].time,
      actualFoods: planned,
      drinkServed: meal === "AM Snack" || meal === "PM Snack" ? "Water" : "Milk and water",
      components: [...mealDefaults[meal].suggestedComponents],
      substitutionReason: "",
      notes: "",
      initials: "",
    });
    setSelectedChildren([]);
    setIntakeByChild({});
  }

  function updateMenuSlot(day: (typeof menuDayOrder)[number], meal: MealType, updates: Partial<MenuSlot>) {
    setMenus((current) => {
      const existingIndex = current.findIndex((menu) => menu.location === currentLocation && menu.weekOf === weekOf);
      const nextMenu = existingIndex >= 0 ? structuredClone(current[existingIndex]) : createBlankWeeklyMenu(currentLocation, weekOf);
      nextMenu.days[day][meal] = { ...nextMenu.days[day][meal], ...updates };
      if (existingIndex >= 0) return current.map((menu, index) => index === existingIndex ? nextMenu : menu);
      return [...current, nextMenu];
    });
  }

  function copyHalcomMenu() {
    const source = menus.find((menu) => menu.location === "Halcom" && menu.weekOf === weekOf)
      ?? starterWeeklyMenus.find((menu) => menu.location === "Halcom")
      ?? createBlankWeeklyMenu("Halcom", weekOf);
    const copied = cloneMenuForLocation(source, currentLocation, weekOf);
    setMenus((current) => [...current.filter((menu) => !(menu.location === currentLocation && menu.weekOf === weekOf)), copied]);
    setMessage(currentLocation === "Halcom" ? "Halcom’s starter menu was restored for this week." : `Halcom’s menu was copied to ${currentLocation}. You can edit every meal independently.`);
    window.setTimeout(() => setMessage(""), 2800);
  }

  function clearWeek() {
    if (!window.confirm(`Clear the menu for ${currentLocation} for ${formatWeekRange(weekOf)}?`)) return;
    setMenus((current) => [...current.filter((menu) => !(menu.location === currentLocation && menu.weekOf === weekOf)), createBlankWeeklyMenu(currentLocation, weekOf)]);
  }

  function toggleComponent(component: MealComponent) {
    setDraft((current) => ({
      ...current,
      components: current.components.includes(component) ? current.components.filter((item) => item !== component) : [...current.components, component],
    }));
  }

  function toggleChild(childId: number) {
    setSelectedChildren((current) => {
      if (current.includes(childId)) return current.filter((id) => id !== childId);
      setIntakeByChild((results) => ({ ...results, [childId]: results[childId] ?? "Ate most" }));
      return [...current, childId];
    });
  }

  function selectAllChildren() {
    if (validSelectedChildren.length === mealChildren.length) {
      setSelectedChildren([]);
      return;
    }
    setSelectedChildren(mealChildren.map((child) => child.id));
    setIntakeByChild((current) => ({
      ...current,
      ...Object.fromEntries(mealChildren.map((child) => [child.id, current[child.id] ?? "Ate most"])),
    }));
  }

  function setAllIntake(intake: MealIntake) {
    setIntakeByChild((current) => ({ ...current, ...Object.fromEntries(validSelectedChildren.map((childId) => [childId, intake])) }));
  }

  function saveMealService() {
    const initials = draft.initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (!draft.actualFoods.trim()) {
      setMessage("Enter what was actually served before saving.");
      return;
    }
    if (!validSelectedChildren.length) {
      setMessage("Select at least one child scheduled at this location and meal time.");
      return;
    }
    if (initials.length < 2) {
      setMessage("Enter staff initials before saving.");
      return;
    }

    const selectedRecords = mealChildren.filter((child) => validSelectedChildren.includes(child.id));
    const now = new Date().toISOString();
    const serviceId = existingService?.id ?? `meal-service-${now.replace(/[^0-9]/g, "")}`;
    const service: MealServiceRecord = {
      id: serviceId,
      location: currentLocation,
      date: draft.date,
      meal: draft.meal,
      plannedFoods,
      actualFoods: draft.actualFoods.trim(),
      drinkServed: draft.drinkServed.trim(),
      servedTime: draft.servedTime,
      components: draft.components,
      substitutionReason: draft.substitutionReason.trim(),
      notes: draft.notes.trim(),
      initials,
      childrenLogged: selectedRecords.length,
      createdAt: existingService?.createdAt ?? now,
    };

    setServices((current) => existingService ? current.map((item) => item.id === existingService.id ? service : item) : [...current, service]);

    const newCareLogs: CareLogEntry[] = selectedRecords.map((child, index) => ({
      id: `meal-care-${serviceId}-${child.id}-${index}`,
      childId: child.id,
      childName: `${child.firstName} ${child.lastName}`,
      location: currentLocation,
      date: draft.date,
      time: draft.servedTime,
      category: "Meal",
      action: draft.meal,
      result: intakeByChild[child.id] ?? "Ate most",
      notes: draft.notes.trim(),
      initials,
      createdAt: now,
      mealServiceId: serviceId,
      foodServed: draft.actualFoods.trim(),
      drinkServed: draft.drinkServed.trim(),
    }));
    setCareLogs((current) => [...current.filter((entry) => entry.mealServiceId !== serviceId), ...newCareLogs]);

    const serviceWeek = weekStartFor(draft.date);
    const serviceDay = dayNameForDate(draft.date);
    setMenus((current) => {
      const existingIndex = current.findIndex((menu) => menu.location === currentLocation && menu.weekOf === serviceWeek);
      const nextMenu = existingIndex >= 0 ? structuredClone(current[existingIndex]) : createBlankWeeklyMenu(currentLocation, serviceWeek);
      nextMenu.days[serviceDay][draft.meal] = {
        ...nextMenu.days[serviceDay][draft.meal],
        actualFoods: draft.actualFoods.trim(),
        servedTime: draft.servedTime,
        components: [...draft.components],
        initials,
        notes: draft.notes.trim(),
        status: plannedFoods.trim() && plannedFoods.trim().toLowerCase() === draft.actualFoods.trim().toLowerCase() ? "Served as Planned" : "Substitution",
      };
      if (existingIndex >= 0) return current.map((menu, index) => index === existingIndex ? nextMenu : menu);
      return [...current, nextMenu];
    });

    setMessage(`${draft.meal} saved for ${selectedRecords.length} ${selectedRecords.length === 1 ? "child" : "children"} at ${currentLocation}.`);
    window.setTimeout(() => setMessage(""), 2800);
  }

  function editService(service: MealServiceRecord) {
    setDraft({
      date: service.date,
      meal: service.meal,
      servedTime: service.servedTime,
      actualFoods: service.actualFoods,
      drinkServed: service.drinkServed,
      components: [...service.components],
      substitutionReason: service.substitutionReason,
      notes: service.notes,
      initials: service.initials,
    });
    const priorLogs = careLogs.filter((entry) => entry.mealServiceId === service.id);
    setSelectedChildren(priorLogs.map((entry) => entry.childId));
    setIntakeByChild(Object.fromEntries(priorLogs.map((entry) => [entry.childId, entry.result as MealIntake])));
    setView("Log What Children Ate");
  }

  const loggedMealsThisWeek = services.filter((service) => service.location === currentLocation && weekStartFor(service.date) === weekOf).length;

  return <MainLayout><div className="mx-auto max-w-[1650px] space-y-6">
    <PageIntro
      eyebrow="Location-based menu and meal records"
      title="Meals & Menus"
      description="Each location can enter its own weekly menu, record what was actually served, and document exactly what each child ate. The meal records also appear in Daily Care."
      actions={<div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700"><Lock className="h-4 w-4" /> Staff Access Only</div>}
    />
    <DemoNotice />

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Children Linked to Location" value={locationChildren.length} helper={currentLocation} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Meals in Daily Plan" value={mealTypes.length} helper="Breakfast through dinner" icon={<Utensils className="h-5 w-5" />} tone="blue" />
      <StatCard label="Logged This Week" value={loggedMealsThisWeek} helper={formatWeekRange(weekOf)} icon={<ClipboardList className="h-5 w-5" />} tone="purple" />
      <StatCard label="Dietary Alerts" value={dietaryAlerts.length} helper="Review child files before serving" icon={<AlertTriangle className="h-5 w-5" />} tone={dietaryAlerts.length ? "amber" : "emerald"} />
    </section>

    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {(["Weekly Menu", "Log What Children Ate", "Meal History"] as View[]).map((item) => <button key={item} onClick={() => setView(item)} className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${view === item ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{item}</button>)}
    </div>

    {message && <div className={`rounded-2xl px-4 py-3 text-sm font-bold ${message.includes("saved") || message.includes("copied") || message.includes("restored") ? "border border-emerald-200 bg-emerald-50 text-emerald-950" : "border border-amber-200 bg-amber-50 text-amber-950"}`}>{message}</div>}

    {view === "Weekly Menu" && <>
      <SectionCard title={`${currentLocation} Weekly Menu`} description="This follows Halcom’s familiar Breakfast, AM Snack, Lunch, PM Snack, and Dinner layout. Every location keeps its own editable copy." action={<div className="flex flex-wrap items-center gap-2"><button onClick={() => setWeekOf(shiftWeek(weekOf, -1))} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button><span className="min-w-44 text-center text-sm font-black text-slate-700">{formatWeekRange(weekOf)}</span><button onClick={() => setWeekOf(shiftWeek(weekOf, 1))} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button></div>}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
          <div><p className="font-black text-slate-950">Menu tools</p><p className="mt-1 text-xs leading-5 text-slate-500">Copy Halcom’s starter format, then adjust meals for this location. Changes save automatically in this browser.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={copyHalcomMenu} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-black text-slate-700 hover:bg-slate-100"><Copy className="h-4 w-4" /> {currentLocation === "Halcom" ? "Restore Halcom Template" : "Copy Halcom Menu"}</button><button onClick={clearWeek} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-white px-3.5 py-2 text-sm font-black text-red-700 hover:bg-red-50">Clear Week</button></div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[1280px] border-collapse text-left">
            <thead><tr className="bg-slate-950 text-white"><th className="w-36 px-4 py-4 text-xs font-black uppercase tracking-wider">Day</th>{mealTypes.map((meal) => <th key={meal} className="min-w-52 border-l border-white/10 px-4 py-4"><p className="font-black">{meal}</p><p className="mt-1 text-[11px] font-semibold text-white/65">{formatClock(mealDefaults[meal].time)}</p></th>)}</tr></thead>
            <tbody>{menuDayOrder.map((day) => <tr key={day} className="border-b border-slate-200 align-top last:border-0"><td className="bg-slate-50 px-4 py-4"><p className="font-black text-slate-950">{day}</p><p className="mt-1 text-xs font-semibold text-slate-500">{dateForDay(weekOf, day)}</p></td>{mealTypes.map((meal) => {
              const slot = currentMenu.days[day][meal];
              const date = dateForDay(weekOf, day);
              const isLogged = services.some((service) => service.location === currentLocation && service.date === date && service.meal === meal);
              return <td key={meal} className="border-l border-slate-200 p-3"><textarea aria-label={`${day} ${meal}`} className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-800 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100" value={slot.plannedFoods} onChange={(event) => updateMenuSlot(day, meal, { plannedFoods: event.target.value })} placeholder="Enter foods and meal components…" /><div className="mt-2 flex items-center justify-between gap-2"><StatusBadge tone={isLogged ? statusTone(slot.status) : "blue"}>{isLogged ? slot.status : "Planned"}</StatusBadge>{isLogged && <span className="text-[11px] font-black text-slate-500">{slot.initials}</span>}</div></td>;
            })}</tr>)}</tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>Meal planning:</strong> Breakfast, lunch, and dinner include milk in the Halcom format. Snacks should include two qualifying components. Staff still verify the current CACFP requirements and child-specific substitutions.</div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Allergy check:</strong> The menu is not the allergy record. Staff must review each child’s current file before serving food and document substitutions in the meal log.</div>
        </div>
      </SectionCard>
    </>}

    {view === "Log What Children Ate" && <div className="grid gap-6 2xl:grid-cols-[.82fr_1.18fr]">
      <SectionCard title="1. Choose Children" description={`Children scheduled at ${currentLocation} at ${formatClock(draft.servedTime)} on ${draft.date}`} action={<button onClick={selectAllChildren} className="text-sm font-black text-emerald-700">{validSelectedChildren.length === mealChildren.length && mealChildren.length ? "Clear all" : "Select all"}</button>}>
        <label className="relative mb-4 block"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-10`} placeholder="Search children…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="mb-4 flex flex-wrap items-center gap-2"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Set selected to:</span>{mealIntakeOptions.slice(0, 5).map((intake) => <button key={intake} type="button" disabled={!validSelectedChildren.length} onClick={() => setAllIntake(intake)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40">{intake}</button>)}</div>
        <div className="max-h-[680px] space-y-3 overflow-y-auto pr-1">
          {displayedChildren.map((child) => {
            const selected = selectedChildren.includes(child.id);
            return <article key={child.id} className={`rounded-2xl border p-3 transition ${selected ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
              <div className="flex items-center gap-3"><button type="button" onClick={() => toggleChild(child.id)} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${selected ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"}`}>{selected ? <Check className="h-5 w-5" /> : `${child.firstName[0]}${child.lastName[0]}`}</button><div className="min-w-0 flex-1"><p className="font-black text-slate-950">{child.firstName} {child.lastName}</p><p className="truncate text-xs font-semibold text-slate-500">{child.ageGroup} • {child.allergies}</p></div>{selected && <select className="max-w-40 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700" value={intakeByChild[child.id] ?? "Ate most"} onChange={(event) => setIntakeByChild((current) => ({ ...current, [child.id]: event.target.value as MealIntake }))}>{mealIntakeOptions.map((option) => <option key={option}>{option}</option>)}</select>}</div>
            </article>;
          })}
          {!displayedChildren.length && <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">No active children match this location and search.</div>}
        </div>
      </SectionCard>

      <SectionCard title="2. Record the Meal" description="Enter what was actually served, then save one individual intake result for every selected child.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date"><input type="date" className={inputClass} value={draft.date} onChange={(event) => loadMealSelection(event.target.value, draft.meal)} /></Field>
          <Field label="Meal"><select className={inputClass} value={draft.meal} onChange={(event) => loadMealSelection(draft.date, event.target.value as MealType)}>{mealTypes.map((meal) => <option key={meal}>{meal}</option>)}</select></Field>
          <Field label="Served time"><input type="time" className={inputClass} value={draft.servedTime} onChange={(event) => setDraft((current) => ({ ...current, servedTime: event.target.value }))} /></Field>
          <Field label="Drink served"><input className={inputClass} value={draft.drinkServed} onChange={(event) => setDraft((current) => ({ ...current, drinkServed: event.target.value }))} placeholder="Milk, lactose-free milk, water…" /></Field>
          <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Planned menu</p><p className="mt-2 whitespace-pre-line text-sm font-bold leading-6 text-slate-800">{plannedFoods || "No menu has been entered for this meal yet."}</p></div>
          <Field label="What was actually served" wide><textarea className={`${inputClass} min-h-28`} value={draft.actualFoods} onChange={(event) => setDraft((current) => ({ ...current, actualFoods: event.target.value }))} placeholder="List the food offered to the children…" /></Field>
          <Field label="Substitution reason" wide><input className={inputClass} value={draft.substitutionReason} onChange={(event) => setDraft((current) => ({ ...current, substitutionReason: event.target.value }))} placeholder="Only needed when the planned menu changed" /></Field>
          <div className="sm:col-span-2"><p className="mb-2 text-sm font-black text-slate-700">Meal components served</p><div className="grid gap-2 sm:grid-cols-5">{mealComponents.map((component) => <button key={component} type="button" onClick={() => toggleComponent(component)} className={`rounded-xl border px-3 py-3 text-sm font-black transition ${draft.components.includes(component) ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-500 hover:border-emerald-300"}`}>{draft.components.includes(component) && <Check className="mr-1 inline h-3.5 w-3.5" />}{component}</button>)}</div><p className="mt-2 text-xs leading-5 text-slate-500">{mealDefaults[draft.meal].helper}</p></div>
          <Field label="Meal notes" wide><textarea className={`${inputClass} min-h-24`} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Substitutions, allergy-safe alternatives, refusal context, or details staff need…" /></Field>
          <Field label="Staff initials"><input className={`${inputClass} uppercase`} maxLength={4} value={draft.initials} onChange={(event) => setDraft((current) => ({ ...current, initials: event.target.value.toUpperCase().replace(/[^A-Z]/g, "") }))} placeholder="DM" /></Field>
          <div className="flex items-end"><PrimaryButton onClick={saveMealService}><Save className="h-4 w-4" /> {existingService ? "Update Meal Record" : `Save for ${validSelectedChildren.length} ${validSelectedChildren.length === 1 ? "Child" : "Children"}`}</PrimaryButton></div>
        </div>

        {!!validSelectedChildren.length && <div className="mt-5 rounded-2xl border border-slate-200 p-4"><p className="font-black text-slate-950">Selected child intake summary</p><div className="mt-3 flex flex-wrap gap-2">{mealIntakeOptions.filter((option) => selectedIntakeCounts[option]).map((option) => <span key={option} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{option}: {selectedIntakeCounts[option]}</span>)}</div></div>}

        {dietaryAlerts.length > 0 && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><p className="font-black text-amber-950">Review dietary information before serving</p><div className="mt-2 space-y-1 text-sm leading-6 text-amber-900">{dietaryAlerts.map((child) => <p key={child.id}><strong>{child.firstName} {child.lastName}:</strong> {child.allergies}{child.medicalNotes && !child.medicalNotes.toLowerCase().includes("no current") ? ` • ${child.medicalNotes}` : ""}</p>)}</div></div></div></div>}
      </SectionCard>
    </div>}

    {view === "Meal History" && <SectionCard title={`${currentLocation} Meal History`} description="Actual food served and each child’s recorded intake. Editing a service updates its connected Daily Care meal entries." action={<div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"><History className="h-4 w-4" /> {locationServices.length} records</div>}>
      <div className="space-y-4">{locationServices.map((service) => {
        const childEntries = careLogs.filter((entry) => entry.mealServiceId === service.id);
        return <article key={service.id} className="rounded-2xl border border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={service.substitutionReason ? "amber" : "green"}>{service.substitutionReason ? "Substitution" : "Meal logged"}</StatusBadge><span className="text-xs font-black text-slate-500">{service.date} • {formatClock(service.servedTime)} • {service.initials}</span></div><h3 className="mt-3 text-xl font-black text-slate-950">{service.meal}</h3><p className="mt-1 text-sm font-bold leading-6 text-slate-800">{service.actualFoods}</p><p className="mt-1 text-xs text-slate-500">Drink: {service.drinkServed || "Not recorded"}</p></div><button onClick={() => editService(service)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"><ClipboardList className="h-4 w-4" /> Edit Record</button></div>
          {service.plannedFoods && service.plannedFoods !== service.actualFoods && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><strong>Planned:</strong> {service.plannedFoods}{service.substitutionReason ? ` • ${service.substitutionReason}` : ""}</div>}
          <div className="mt-4 flex flex-wrap gap-2">{service.components.map((component) => <span key={component} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">{component}</span>)}</div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{childEntries.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"><div><p className="text-sm font-black text-slate-800">{entry.childName}</p><p className="text-xs font-semibold text-slate-500">{entry.result}</p></div><span className="text-xs font-black text-slate-500">{entry.initials}</span></div>)}</div>
          {!childEntries.length && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-500">No child intake entries are connected to this service yet.</p>}
          {service.notes && <p className="mt-4 text-sm leading-6 text-slate-600"><strong>Notes:</strong> {service.notes}</p>}
        </article>;
      })}{!locationServices.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><Utensils className="mx-auto h-10 w-10 text-slate-400" /><p className="mt-3 font-black text-slate-900">No meals have been logged for this location yet.</p><p className="mt-1 text-sm text-slate-500">Open “Log What Children Ate” to create the first record.</p></div>}</div>
    </SectionCard>}

    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>KidKare reminder:</strong> This Hub records the weekly menu, what was served, and individual child intake for internal operations. Continue using KidKare for the official CACFP claim and required meal documentation.</div>
  </div></MainLayout>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-sm font-black text-slate-700">{label}</span>{children}</label>;
}
