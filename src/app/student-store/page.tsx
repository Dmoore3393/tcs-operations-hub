"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { careLocations, type LocationKey } from "@/lib/location-config";
import {
  emptyGatorLedger,
  emptyJobApplications,
  emptyJobAssignments,
  emptyStoreOrders,
  emptyStoreProducts,
  emptyStudentJobs,
  type GatorLedgerEntry,
  type JobApplication,
  type JobAssignment,
  type JobApplicationStatus,
  type StoreCategory,
  type StoreLocation,
  type StoreOrder,
  type StoreProduct,
  type StudentJob,
} from "@/lib/student-store";
import { BriefcaseBusiness, ChevronRight, Coins, Package, Plus, Search, ShoppingCart, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";

type Tab = "Shop" | "Gator Profiles" | "Job Applications" | "Jobs & Pay" | "Location Inventory";
type CartLine = { productId: string; quantity: number };

type AwardForm = { amount: number; reason: string };
type ProductForm = { name: string; category: StoreCategory; price: number; stock: number; emoji: string; notes: string; active: boolean };
type JobForm = { title: string; pay: number; openings: number; responsibilities: string; active: boolean };

const categories: StoreCategory[] = ["Snacks", "School Supplies", "Spirit Wear", "Rewards", "Essentials"];
const quickReasons = ["Great Choices", "Helping Others", "Completed Job", "Homework / Reading", "Leadership", "Cleanup", "Kindness", "Following Directions"];

function fullName(child: ChildRecord) { return `${child.firstName} ${child.lastName}`; }
function makeId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function emojiFor(category: StoreCategory) { return category === "Snacks" ? "🍿" : category === "School Supplies" ? "📓" : category === "Spirit Wear" ? "👕" : category === "Rewards" ? "🏆" : "🎒"; }

export default function StudentStorePage() {
  const { profile, isEmployee } = useAuth();
  const { location, setLocation, availableLocations } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [schedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [products, setProducts] = usePersistentState<StoreProduct[]>("tcs-store-products-v1", emptyStoreProducts);
  const [ledger, setLedger] = usePersistentState<GatorLedgerEntry[]>("tcs-gator-ledger-v1", emptyGatorLedger);
  const [orders, setOrders] = usePersistentState<StoreOrder[]>("tcs-store-orders-v1", emptyStoreOrders);
  const [jobs, setJobs] = usePersistentState<StudentJob[]>("tcs-student-jobs-v1", emptyStudentJobs);
  const [applications, setApplications] = usePersistentState<JobApplication[]>("tcs-job-applications-v1", emptyJobApplications);
  const [assignments, setAssignments] = usePersistentState<JobAssignment[]>("tcs-job-assignments-v1", emptyJobAssignments);

  const allowedStoreLocations = useMemo(() => availableLocations.filter((item): item is StoreLocation => item !== "All Locations"), [availableLocations]);
  const fallbackLocation = allowedStoreLocations[0] ?? "Halcom";
  const [ownerLocation, setOwnerLocation] = useState<StoreLocation>(fallbackLocation);
  const activeLocation: StoreLocation = location !== "All Locations" ? location as StoreLocation : ownerLocation;
  const canManageInventory = !isEmployee;
  const staffName = profile?.full_name || profile?.email || "TCS Staff";

  const [tab, setTab] = useState<Tab>("Shop");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<StoreCategory | "All Products">("All Products");
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [profileChildId, setProfileChildId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [awardOpen, setAwardOpen] = useState(false);
  const [awardForm, setAwardForm] = useState<AwardForm>({ amount: 10, reason: quickReasons[0] });
  const [productEditing, setProductEditing] = useState<StoreProduct | null | "new">(null);
  const [productForm, setProductForm] = useState<ProductForm>({ name: "", category: "Snacks", price: 10, stock: 0, emoji: "🍿", notes: "", active: true });
  const [jobEditing, setJobEditing] = useState<StudentJob | null | "new">(null);
  const [jobForm, setJobForm] = useState<JobForm>({ title: "", pay: 10, openings: 1, responsibilities: "", active: true });
  const [kidApplyChildId, setKidApplyChildId] = useState<number | null>(null);
  const [reviewAppId, setReviewAppId] = useState<string | null>(null);
  const [parentPreviewChildId, setParentPreviewChildId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const locationChildren = useMemo(() => children.filter((child) => {
    if (child.enrollmentStatus === "Archived") return false;
    const schedule = schedules.find((record) => record.childId === child.id);
    return childAttendsLocation(child, schedule, activeLocation);
  }), [activeLocation, children, schedules]);

  const activeProducts = products.filter((item) => item.location === activeLocation && item.active);
  const visibleProducts = activeProducts.filter((item) => (category === "All Products" || item.category === category) && (!search.trim() || `${item.name} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase())));
  const locationJobs = jobs.filter((item) => item.location === activeLocation);
  const locationApplications = applications.filter((item) => item.location === activeLocation);
  const locationAssignments = assignments.filter((item) => item.location === activeLocation && item.active);
  const selectedChild = locationChildren.find((child) => child.id === selectedChildId) ?? null;
  const profileChild = children.find((child) => child.id === profileChildId) ?? null;
  const kidApplyChild = children.find((child) => child.id === kidApplyChildId) ?? null;
  const reviewApplication = applications.find((item) => item.id === reviewAppId) ?? null;
  const reviewChild = reviewApplication ? children.find((child) => child.id === reviewApplication.childId) ?? null : null;
  const parentPreviewChild = children.find((child) => child.id === parentPreviewChildId) ?? null;

  function balance(childId: number) { return ledger.filter((entry) => entry.childId === childId).reduce((sum, entry) => sum + entry.amount, 0); }
  function earned(childId: number) { return ledger.filter((entry) => entry.childId === childId && entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0); }
  function spent(childId: number) { return Math.abs(ledger.filter((entry) => entry.childId === childId && entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)); }
  function assignmentFor(childId: number) { return assignments.find((item) => item.childId === childId && item.active); }
  function jobForAssignment(assignment?: JobAssignment) { return assignment ? jobs.find((item) => item.id === assignment.jobId) : undefined; }

  const cartDetails = cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? [{ line, product }] : [];
  });
  const cartTotal = cartDetails.reduce((sum, item) => sum + item.product.price * item.line.quantity, 0);

  function chooseLocation(next: StoreLocation) {
    setOwnerLocation(next);
    if (availableLocations.includes(next as LocationKey)) setLocation(next as LocationKey);
    setCart([]);
    setSelectedChildId(null);
  }

  function addToCart(product: StoreProduct) {
    if (product.stock <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (!existing) return [...current, { productId: product.id, quantity: 1 }];
      return current.map((line) => line.productId === product.id ? { ...line, quantity: Math.min(product.stock, line.quantity + 1) } : line);
    });
  }

  function changeCart(productId: string, delta: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setCart((current) => current.flatMap((line) => {
      if (line.productId !== productId) return [line];
      const next = Math.max(0, Math.min(product.stock, line.quantity + delta));
      return next ? [{ ...line, quantity: next }] : [];
    }));
  }

  function checkout() {
    if (!selectedChild) return setNotice("Select a child before checkout.");
    if (!cartDetails.length) return setNotice("The cart is empty.");
    if (balance(selectedChild.id) < cartTotal) return setNotice(`${fullName(selectedChild)} does not have enough Gator Cash.`);
    const orderId = makeId("order");
    const now = new Date().toISOString();
    setOrders((current) => [...current, { id: orderId, childId: selectedChild.id, location: activeLocation, items: cartDetails.map(({ line, product }) => ({ productId: product.id, name: product.name, quantity: line.quantity, price: product.price })), total: cartTotal, staffName, createdAt: now }]);
    setLedger((current) => [...current, { id: makeId("ledger"), childId: selectedChild.id, location: activeLocation, amount: -cartTotal, type: "Purchase", reason: `Student Store purchase: ${cartDetails.map(({ line, product }) => `${product.name}${line.quantity > 1 ? ` x${line.quantity}` : ""}`).join(", ")}`, staffName, createdAt: now, referenceId: orderId }]);
    setProducts((current) => current.map((product) => {
      const line = cart.find((item) => item.productId === product.id);
      return line ? { ...product, stock: Math.max(0, product.stock - line.quantity) } : product;
    }));
    setCart([]);
    setNotice(`Purchase completed for ${fullName(selectedChild)}.`);
  }

  function openNewProduct() {
    setProductForm({ name: "", category: "Snacks", price: 10, stock: 0, emoji: "🍿", notes: "", active: true });
    setProductEditing("new");
  }

  function openProduct(product: StoreProduct) {
    setProductForm({ name: product.name, category: product.category, price: product.price, stock: product.stock, emoji: product.emoji, notes: product.notes, active: product.active });
    setProductEditing(product);
  }

  function saveProduct() {
    if (!canManageInventory || !productForm.name.trim()) return;
    const record: StoreProduct = {
      id: productEditing === "new" || !productEditing ? makeId("product") : productEditing.id,
      location: activeLocation,
      name: productForm.name.trim(), category: productForm.category, price: Math.max(0, productForm.price), stock: Math.max(0, productForm.stock), active: productForm.active,
      emoji: productForm.emoji.trim() || emojiFor(productForm.category), notes: productForm.notes.trim(),
    };
    setProducts((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
    setProductEditing(null);
  }

  function openNewJob() {
    setJobForm({ title: "", pay: 10, openings: 1, responsibilities: "", active: true });
    setJobEditing("new");
  }

  function openJob(job: StudentJob) {
    setJobForm({ title: job.title, pay: job.pay, openings: job.openings, responsibilities: job.responsibilities.join("\n"), active: job.active });
    setJobEditing(job);
  }

  function saveJob() {
    if (!jobForm.title.trim()) return;
    const record: StudentJob = { id: jobEditing === "new" || !jobEditing ? makeId("job") : jobEditing.id, location: activeLocation, title: jobForm.title.trim(), pay: Math.max(0, jobForm.pay), openings: Math.max(1, jobForm.openings), responsibilities: jobForm.responsibilities.split("\n").map((item) => item.trim()).filter(Boolean), active: jobForm.active };
    setJobs((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
    setJobEditing(null);
  }

  function awardCash() {
    if (!profileChild || !awardForm.reason.trim() || awardForm.amount === 0) return;
    setLedger((current) => [...current, { id: makeId("ledger"), childId: profileChild.id, location: activeLocation, amount: awardForm.amount, type: awardForm.amount > 0 ? "Earned" : "Adjustment", reason: awardForm.reason.trim(), staffName, createdAt: new Date().toISOString() }]);
    setAwardOpen(false);
    setNotice(`${awardForm.amount > 0 ? "+" : ""}${awardForm.amount} Gator Cash recorded for ${fullName(profileChild)}.`);
  }

  function setApplicationStatus(app: JobApplication, status: JobApplicationStatus) {
    setApplications((current) => current.map((item) => item.id === app.id ? { ...item, status, reviewedBy: staffName, reviewedAt: new Date().toISOString() } : item));
  }

  function assignJob(app: JobApplication) {
    const job = jobs.find((item) => item.id === app.jobId);
    if (!job) return;
    setAssignments((current) => [...current.filter((item) => !(item.childId === app.childId && item.active)), { id: makeId("assignment"), childId: app.childId, location: app.location, jobId: job.id, applicationId: app.id, payPerCompletion: job.pay, active: true, assignedBy: staffName, assignedAt: new Date().toISOString(), completedCount: 0 }]);
    setApplicationStatus(app, "Assigned");
    setReviewAppId(null);
    setNotice("Job assigned successfully.");
  }

  function completeJob(child: ChildRecord, assignment: JobAssignment, job: StudentJob) {
    const now = new Date().toISOString();
    setLedger((current) => [...current, { id: makeId("ledger"), childId: child.id, location: assignment.location, amount: assignment.payPerCompletion, type: "Job Pay", reason: `Completed ${job.title} job`, staffName, createdAt: now, referenceId: assignment.id }]);
    setAssignments((current) => current.map((item) => item.id === assignment.id ? { ...item, completedCount: item.completedCount + 1, lastPaidAt: now } : item));
    setNotice(`${fullName(child)} earned ${assignment.payPerCompletion} Gator Cash for ${job.title}.`);
  }

  const navTabs: Tab[] = canManageInventory ? ["Shop", "Gator Profiles", "Job Applications", "Jobs & Pay", "Location Inventory"] : ["Shop", "Gator Profiles", "Job Applications", "Jobs & Pay"];

  return <MainLayout><div className="mx-auto max-w-[1600px] space-y-5">
    {notice && <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}

    <section className="overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#07131d,#12303a)] p-6 text-white shadow-xl sm:p-8">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center"><div><p className="text-xs font-black uppercase tracking-[0.35em] text-[#35e2d2]">The Hub</p><h1 className="mt-1 text-5xl font-black sm:text-7xl">STUDENT STORE</h1><p className="mt-1 text-2xl font-black italic text-[#35e2d2]">SPEND SMART • BRIGHTER FUTURES</p><p className="mt-3 text-xs font-bold tracking-[0.25em] text-slate-300">GOOD PEOPLE • BRIGHT IDEAS • BIGGER TOMORROWS</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-black uppercase tracking-wider text-slate-400">Store Location</p><select value={activeLocation} disabled={allowedStoreLocations.length <= 1} onChange={(event) => chooseLocation(event.target.value as StoreLocation)} className="mt-2 rounded-xl border border-white/20 bg-[#0b1d26] px-4 py-3 text-sm font-black text-white outline-none">{allowedStoreLocations.map((item) => <option key={item}>{item}</option>)}</select>{allowedStoreLocations.length <= 1 && <p className="mt-2 text-xs text-slate-400">Your account is locked to this location.</p>}</div></div>
    </section>

    <div className="flex flex-wrap gap-2">{navTabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-xl px-4 py-2.5 text-sm font-black ${tab === item ? "bg-[#07131d] text-white shadow" : "border border-slate-200 bg-white text-slate-700"}`}>{item}{item === "Job Applications" && locationApplications.filter((app) => app.status === "New").length > 0 ? ` (${locationApplications.filter((app) => app.status === "New").length})` : ""}</button>)}</div>

    {tab === "Shop" && <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search snacks, supplies, spirit wear and more..." className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-teal-400" /></div><div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6"><button onClick={() => setCategory("All Products")} className={`rounded-xl border p-3 text-sm font-black ${category === "All Products" ? "bg-[#07131d] text-white" : "bg-white"}`}>▦<br />All Products</button>{categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={`rounded-xl border p-3 text-sm font-black ${category === item ? "bg-[#07131d] text-white" : "bg-white"}`}>{emojiFor(item)}<br />{item}</button>)}</div><div className="mt-5 flex items-end justify-between"><div><h2 className="text-2xl font-black">Featured Items</h2><p className="text-sm text-slate-500">Real items available at {activeLocation}</p></div>{canManageInventory && <button onClick={() => setTab("Location Inventory")} className="text-sm font-black text-teal-700">Manage this location’s inventory →</button>}</div>{visibleProducts.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visibleProducts.map((product) => <article key={product.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid h-28 place-items-center rounded-xl bg-slate-50 text-6xl">{product.emoji || emojiFor(product.category)}</div><h3 className="mt-3 font-black">{product.name}</h3><p className="text-sm font-black text-amber-600">🪙 {product.price}</p><p className="text-xs text-slate-400">{product.stock} in stock</p><button disabled={product.stock <= 0} onClick={() => addToCart(product)} className="mt-3 w-full rounded-lg bg-[#35e2d2] py-2 text-sm font-black text-[#07131d] disabled:bg-slate-200">{product.stock > 0 ? "Buy with Gator Cash" : "Out of stock"}</button></article>)}</div> : <Empty icon="🛍️" title="No items here yet" text={canManageInventory ? "Open Location Inventory and add the real items this location wants to sell." : "This location’s admin has not added store items yet."} />}</section>
      <aside className="space-y-4"><div className="rounded-2xl border border-teal-200 bg-teal-50 p-5"><p className="font-black">🐊 Gator Cash Balance</p><select value={selectedChild?.id ?? ""} onChange={(event) => setSelectedChildId(event.target.value ? Number(event.target.value) : null)} className="mt-3 w-full rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-bold"><option value="">Select a child</option>{locationChildren.map((child) => <option key={child.id} value={child.id}>{fullName(child)}</option>)}</select><p className="mt-4 text-5xl font-black">{selectedChild ? balance(selectedChild.id) : "—"}</p><p className="text-xs font-black uppercase tracking-wider text-slate-500">Gator Cash</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black"><ShoppingCart className="mr-2 inline h-5 w-5" />Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)})</h3><div className="mt-3 space-y-3">{cartDetails.map(({ line, product }) => <div key={product.id} className="flex items-center gap-2 border-b border-slate-100 pb-3"><span className="text-3xl">{product.emoji}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{product.name}</p><p className="text-xs font-black text-amber-600">🪙 {product.price}</p></div><button onClick={() => changeCart(product.id, -1)} className="rounded border px-2">−</button><span>{line.quantity}</span><button onClick={() => changeCart(product.id, 1)} className="rounded border px-2">+</button></div>)}</div><div className="mt-4 flex justify-between text-lg font-black"><span>Total</span><span>🪙 {cartTotal}</span></div><button onClick={checkout} className="mt-3 w-full rounded-xl bg-[#35e2d2] py-3 font-black text-[#07131d]">Checkout with Gator Cash →</button></div></aside>
    </div>}

    {tab === "Gator Profiles" && <section><div><h2 className="text-2xl font-black">Gator Profiles</h2><p className="text-sm text-slate-500">Staff-managed child profiles. Children do not need their own Hub account.</p></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{locationChildren.map((child) => { const assignment = assignmentFor(child.id); const job = jobForAssignment(assignment); return <button key={child.id} onClick={() => setProfileChildId(child.id)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:shadow-md"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-teal-50 font-black text-teal-700">{child.firstName[0]}{child.lastName[0]}</div><div><h3 className="font-black">{fullName(child)}</h3><p className="text-xs text-slate-500">{child.ageGroup} • {child.classroom}</p></div><ChevronRight className="ml-auto h-5 w-5 text-slate-400" /></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-teal-50 p-3"><p className="text-xs font-black uppercase text-slate-500">Balance</p><p className="text-2xl font-black">🪙 {balance(child.id)}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black uppercase text-slate-500">Current Job</p><p className="text-sm font-black">{job?.title ?? (child.ageGroup === "School Age" ? "Not assigned" : "Not eligible")}</p></div></div></button>; })}</div></section>}

    {tab === "Job Applications" && <section><h2 className="text-2xl font-black">Job Applications</h2><p className="text-sm text-slate-500">Children fill these out in Kid Mode from their Gator Profile while staff are logged in.</p>{locationApplications.length ? <div className="mt-4 space-y-3">{locationApplications.slice().sort((a,b) => b.submittedAt.localeCompare(a.submittedAt)).map((app) => { const child = children.find((item) => item.id === app.childId); const job = jobs.find((item) => item.id === app.jobId); return <button key={app.id} onClick={() => setReviewAppId(app.id)} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left"><span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50">📝</span><div className="flex-1"><p className="font-black">{child ? fullName(child) : "Child"} — {job?.title ?? "Job"}</p><p className="text-xs text-slate-500">Submitted {formatDate(app.submittedAt)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{app.status}</span><ChevronRight className="h-5 w-5 text-slate-400" /></button>; })}</div> : <Empty icon="📝" title="No applications yet" text="Open a school-age child’s Gator Profile and choose Apply for a Job." />}</section>}

    {tab === "Jobs & Pay" && <section><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">Jobs & Pay</h2><p className="text-sm text-slate-500">Each location controls its own student jobs and Gator Cash pay.</p></div><button onClick={openNewJob} className="rounded-xl bg-[#07131d] px-4 py-2.5 text-sm font-black text-white"><Plus className="mr-1 inline h-4 w-4" />Add Job</button></div>{locationJobs.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{locationJobs.map((job) => { const assigned = locationAssignments.filter((item) => item.jobId === job.id); return <button key={job.id} onClick={() => openJob(job)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left"><div className="flex justify-between"><BriefcaseBusiness className="h-8 w-8 text-teal-700" /><span className={`rounded-full px-2 py-1 text-xs font-black ${job.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100"}`}>{job.active ? "Open" : "Paused"}</span></div><h3 className="mt-3 text-lg font-black">{job.title}</h3><p className="mt-1 text-sm font-black text-amber-600">🪙 {job.pay} per completed job</p><p className="mt-2 text-xs text-slate-500">{assigned.length}/{job.openings} position{job.openings === 1 ? "" : "s"} filled</p></button>; })}</div> : <Empty icon="💼" title="No student jobs yet" text="Create jobs for school-age children at this location." />}</section>}

    {tab === "Location Inventory" && canManageInventory && <section><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">{activeLocation} Inventory</h2><p className="text-sm text-slate-500">You are editing only this location’s Student Store items.</p></div><button onClick={openNewProduct} className="rounded-xl bg-[#35e2d2] px-4 py-2.5 text-sm font-black"><Plus className="mr-1 inline h-4 w-4" />Add Product</button></div>{products.filter((product) => product.location === activeLocation).length ? <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead><tbody>{products.filter((product) => product.location === activeLocation).map((product) => <tr key={product.id} onClick={() => openProduct(product)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"><td className="p-3 font-black">{product.emoji} {product.name}</td><td>{product.category}</td><td>🪙 {product.price}</td><td>{product.stock}</td><td>{product.active ? "Active" : "Hidden"}</td></tr>)}</tbody></table></div> : <Empty icon="📦" title="This location’s inventory is empty" text="Add the snacks, supplies, rewards, spirit wear, and essentials this location wants to offer." />}</section>}

    {profileChild && <Modal close={() => setProfileChildId(null)}><div className="flex items-start gap-4"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-teal-50 text-xl font-black text-teal-700">{profileChild.firstName[0]}{profileChild.lastName[0]}</div><div><p className="text-xs font-black uppercase tracking-[0.16em] text-teal-700">Gator Profile</p><h2 className="text-2xl font-black">{fullName(profileChild)}</h2><p className="text-sm text-slate-500">{profileChild.ageGroup} • {profileChild.classroom}</p></div></div><div className="mt-5 grid grid-cols-3 gap-2"><Metric label="Balance" value={`🪙 ${balance(profileChild.id)}`} /><Metric label="Lifetime Earned" value={`+${earned(profileChild.id)}`} /><Metric label="Spent" value={`${spent(profileChild.id)}`} /></div><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => { setAwardForm({ amount: 10, reason: quickReasons[0] }); setAwardOpen(true); }} className="rounded-xl bg-[#35e2d2] px-4 py-2.5 text-sm font-black">+ Award Gator Cash</button><button onClick={() => setParentPreviewChildId(profileChild.id)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-black">Parent View</button>{profileChild.ageGroup === "School Age" && <button onClick={() => setKidApplyChildId(profileChild.id)} className="rounded-xl bg-[#07131d] px-4 py-2.5 text-sm font-black text-white">📝 Apply for a Job</button>}</div>{(() => { const assignment = assignmentFor(profileChild.id); const job = jobForAssignment(assignment); return <div className="mt-5 rounded-2xl border border-slate-200 p-4"><p className="text-xs font-black uppercase text-slate-400">Current Job</p><div className="flex items-center justify-between gap-3"><div><h3 className="font-black">{job?.title ?? (profileChild.ageGroup === "School Age" ? "No job assigned" : "Not part of school-age jobs")}</h3>{assignment && <p className="text-xs text-slate-500">🪙 {assignment.payPerCompletion} per completed responsibility • {assignment.completedCount} paid completions</p>}</div>{assignment && job && <button onClick={() => completeJob(profileChild, assignment, job)} className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-black text-amber-800">Complete Job + Pay</button>}</div></div>; })()}<div className="mt-5"><h3 className="font-black">How I Earned & Spent It</h3><div className="mt-2 max-h-72 space-y-2 overflow-y-auto">{ledger.filter((entry) => entry.childId === profileChild.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => <div key={entry.id} className="flex gap-3 rounded-xl bg-slate-50 p-3"><span className={`font-black ${entry.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</span><div><p className="text-sm font-black">{entry.reason}</p><p className="text-xs text-slate-500">{entry.type} • {entry.staffName} • {formatDate(entry.createdAt)}</p></div></div>)}{!ledger.some((entry) => entry.childId === profileChild.id) && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No Gator Cash activity yet.</p>}</div></div></Modal>}

    {awardOpen && profileChild && <Modal close={() => setAwardOpen(false)}><h2 className="text-2xl font-black">Award Gator Cash</h2><p className="text-sm text-slate-500">Every entry shows the amount, reason, staff member, date, and time.</p><label className="mt-4 block text-sm font-black">Amount<input type="number" value={awardForm.amount} onChange={(event) => setAwardForm((current) => ({ ...current, amount: Number(event.target.value) }))} className="mt-1 w-full rounded-xl border p-3" /></label><label className="mt-3 block text-sm font-black">Reason<select value={awardForm.reason} onChange={(event) => setAwardForm((current) => ({ ...current, reason: event.target.value }))} className="mt-1 w-full rounded-xl border p-3">{quickReasons.map((reason) => <option key={reason}>{reason}</option>)}<option>Other</option></select></label><label className="mt-3 block text-sm font-black">Custom reason<input value={quickReasons.includes(awardForm.reason) ? "" : awardForm.reason === "Other" ? "" : awardForm.reason} onChange={(event) => setAwardForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Optional custom reason" className="mt-1 w-full rounded-xl border p-3" /></label><button onClick={awardCash} className="mt-5 w-full rounded-xl bg-[#35e2d2] py-3 font-black">Save Gator Cash Entry</button><p className="mt-2 text-xs text-slate-400">Use a negative amount only for a documented correction/adjustment.</p></Modal>}

    {productEditing && canManageInventory && <Modal close={() => setProductEditing(null)}><h2 className="text-2xl font-black">{productEditing === "new" ? "Add Product" : "Edit Product"}</h2><p className="text-sm text-slate-500">This item belongs only to {activeLocation}.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Item name"><input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border p-3" /></Field><Field label="Category"><select value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value as StoreCategory, emoji: emojiFor(event.target.value as StoreCategory) }))} className="w-full rounded-xl border p-3">{categories.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Gator Cash price"><input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field><Field label="Stock"><input type="number" min="0" value={productForm.stock} onChange={(event) => setProductForm((current) => ({ ...current, stock: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field><Field label="Emoji / icon"><input value={productForm.emoji} onChange={(event) => setProductForm((current) => ({ ...current, emoji: event.target.value }))} className="w-full rounded-xl border p-3" /></Field><label className="flex items-center gap-2 self-end rounded-xl border p-3 text-sm font-black"><input type="checkbox" checked={productForm.active} onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))} />Show in store</label><label className="sm:col-span-2 text-sm font-black">Notes<textarea value={productForm.notes} onChange={(event) => setProductForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 min-h-20 w-full rounded-xl border p-3" /></label></div><button onClick={saveProduct} className="mt-5 w-full rounded-xl bg-[#35e2d2] py-3 font-black">Save {activeLocation} Product</button></Modal>}

    {jobEditing && <Modal close={() => setJobEditing(null)}><h2 className="text-2xl font-black">{jobEditing === "new" ? "Add Student Job" : "Edit Student Job"}</h2><p className="text-sm text-slate-500">This job is available only at {activeLocation}.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Job title"><input value={jobForm.title} onChange={(event) => setJobForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-xl border p-3" /></Field><Field label="Gator Cash pay"><input type="number" min="0" value={jobForm.pay} onChange={(event) => setJobForm((current) => ({ ...current, pay: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field><Field label="Openings"><input type="number" min="1" value={jobForm.openings} onChange={(event) => setJobForm((current) => ({ ...current, openings: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field><label className="flex items-center gap-2 self-end rounded-xl border p-3 text-sm font-black"><input type="checkbox" checked={jobForm.active} onChange={(event) => setJobForm((current) => ({ ...current, active: event.target.checked }))} />Accepting applications</label><label className="sm:col-span-2 text-sm font-black">Responsibilities — one per line<textarea value={jobForm.responsibilities} onChange={(event) => setJobForm((current) => ({ ...current, responsibilities: event.target.value }))} className="mt-1 min-h-28 w-full rounded-xl border p-3" /></label></div><button onClick={saveJob} className="mt-5 w-full rounded-xl bg-[#07131d] py-3 font-black text-white">Save Job</button></Modal>}

    {kidApplyChild && <KidApplication child={kidApplyChild} jobs={locationJobs.filter((job) => job.active)} close={() => setKidApplyChildId(null)} submit={(app) => { setApplications((current) => [...current, app]); setKidApplyChildId(null); setNotice("Application submitted! Staff can now review it."); }} location={activeLocation} />}

    {reviewApplication && reviewChild && <Modal close={() => setReviewAppId(null)}><p className="text-xs font-black uppercase tracking-wider text-teal-700">Student Job Application</p><h2 className="text-2xl font-black">{fullName(reviewChild)}</h2><p className="mt-1 text-sm text-slate-500">Applied for: {jobs.find((job) => job.id === reviewApplication.jobId)?.title ?? "Job"}</p><ApplicationAnswers app={reviewApplication} /><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setApplicationStatus(reviewApplication, "Reviewing")} className="rounded-xl border px-4 py-2 text-sm font-black">Mark Reviewing</button><button onClick={() => setApplicationStatus(reviewApplication, "Approved")} className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">Approve</button><button onClick={() => assignJob(reviewApplication)} className="rounded-xl bg-[#07131d] px-4 py-2 text-sm font-black text-white">Assign Job</button><button onClick={() => setApplicationStatus(reviewApplication, "Not Selected")} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700">Not Selected</button></div></Modal>}

    {parentPreviewChild && <Modal close={() => setParentPreviewChildId(null)}><p className="text-xs font-black uppercase tracking-wider text-teal-700">Parent View • Read Only</p><h2 className="text-2xl font-black">{fullName(parentPreviewChild)}’s Gator Cash</h2><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Balance" value={`🪙 ${balance(parentPreviewChild.id)}`} /><Metric label="Earned" value={`+${earned(parentPreviewChild.id)}`} /><Metric label="Spent" value={`${spent(parentPreviewChild.id)}`} /></div>{(() => { const assignment = assignmentFor(parentPreviewChild.id); const job = jobForAssignment(assignment); return <div className="mt-4 rounded-xl bg-slate-50 p-4"><p className="text-xs font-black uppercase text-slate-400">Current Job</p><p className="font-black">{job?.title ?? "No job assigned"}</p></div>; })()}<h3 className="mt-5 font-black">Earnings & Purchase History</h3><div className="mt-2 max-h-80 space-y-2 overflow-y-auto">{ledger.filter((entry) => entry.childId === parentPreviewChild.id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => <div key={entry.id} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-black">{entry.reason}</p><span className={`font-black ${entry.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</span></div><p className="mt-1 text-xs text-slate-500">{entry.staffName} • {formatDate(entry.createdAt)}</p></div>)}</div><p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">This is the parent-facing read-only layout. Parent login/share access will use this same ledger without giving parents editing permissions.</p></Modal>}
  </div></MainLayout>;
}

function KidApplication({ child, jobs, close, submit, location }: { child: ChildRecord; jobs: StudentJob[]; close: () => void; submit: (app: JobApplication) => void; location: StoreLocation }) {
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [second, setSecond] = useState("");
  const [why, setWhy] = useState("");
  const [strengths, setStrengths] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [availability, setAvailability] = useState("");
  const [agreed, setAgreed] = useState(false);
  function save() {
    if (!jobId || !why.trim() || !strengths.trim() || !agreed) return;
    submit({ id: makeId("application"), childId: child.id, location, jobId, secondChoiceJobId: second || undefined, whyInterested: why.trim(), strengths: strengths.trim(), responsibilities: responsibilities.trim(), availability: availability.trim(), agreed, status: "New", submittedAt: new Date().toISOString() });
  }
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#07131d] p-4 text-white"><div className="mx-auto max-w-3xl py-8"><button onClick={close} className="rounded-xl border border-white/20 px-4 py-2 text-sm font-black">← Back to Staff</button><div className="mt-6 rounded-3xl bg-white p-6 text-[#07131d] shadow-2xl sm:p-8"><p className="text-sm font-black uppercase tracking-[0.2em] text-teal-700">Kid Mode</p><h1 className="mt-1 text-4xl font-black">My Job Application 🐊</h1><p className="mt-2 text-lg">Hi {child.firstName}! Pick a job you want to work for and tell us why you’d be great at it.</p>{jobs.length ? <div className="mt-6 space-y-5"><Field label="What job do you want?"><select value={jobId} onChange={(event) => setJobId(event.target.value)} className="w-full rounded-xl border p-4 text-lg font-bold">{jobs.map((job) => <option key={job.id} value={job.id}>{job.title} — {job.pay} Gator Cash</option>)}</select></Field><Field label="Why do you want this job?"><textarea value={why} onChange={(event) => setWhy(event.target.value)} className="min-h-24 w-full rounded-xl border p-4 text-lg" /></Field><Field label="What would make you good at this job?"><textarea value={strengths} onChange={(event) => setStrengths(event.target.value)} className="min-h-24 w-full rounded-xl border p-4 text-lg" /></Field><Field label="What can staff count on you to do?"><textarea value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} className="min-h-20 w-full rounded-xl border p-4 text-lg" /></Field><Field label="What days or times can you help?"><input value={availability} onChange={(event) => setAvailability(event.target.value)} className="w-full rounded-xl border p-4 text-lg" /></Field><Field label="Second-choice job (optional)"><select value={second} onChange={(event) => setSecond(event.target.value)} className="w-full rounded-xl border p-4 text-lg"><option value="">No second choice</option>{jobs.filter((job) => job.id !== jobId).map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></Field><label className="flex items-start gap-3 rounded-2xl bg-teal-50 p-4 text-lg font-bold"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-1 h-5 w-5" />I understand I have to complete my job responsibilities to earn my Gator Cash.</label><button disabled={!jobId || !why.trim() || !strengths.trim() || !agreed} onClick={save} className="w-full rounded-2xl bg-[#35e2d2] py-4 text-xl font-black disabled:bg-slate-200">SUBMIT MY APPLICATION 🐊</button></div> : <Empty icon="💼" title="No jobs are open right now" text="Ask a staff member when new jobs will be available." />}</div></div></div>;
}

function ApplicationAnswers({ app }: { app: JobApplication }) { return <div className="mt-5 space-y-3"><Answer label="Why do you want this job?" value={app.whyInterested} /><Answer label="Why would you be good at it?" value={app.strengths} /><Answer label="What can staff count on you to do?" value={app.responsibilities || "Not entered"} /><Answer label="Availability" value={app.availability || "Not entered"} /></div>; }
function Answer({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-sm font-bold">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm font-black">{label}<div className="mt-1">{children}</div></label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-[11px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>; }
function Empty({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="text-5xl">{icon}</div><h3 className="mt-3 text-lg font-black">{title}</h3><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
function Modal({ close, children }: { close: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/60 p-4"><div className="relative my-6 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><button onClick={close} className="absolute right-4 top-4 rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>{children}</div></div>; }
