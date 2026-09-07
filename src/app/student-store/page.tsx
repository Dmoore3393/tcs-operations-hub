"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { childAttendsLocation, starterChildSchedules, type ChildScheduleRecord } from "@/lib/child-schedules";
import { initialChildren, type ChildRecord } from "@/lib/children";
import { type LocationKey } from "@/lib/location-config";
import {
  emptyGatorLedger,
  emptyJobApplications,
  emptyJobAssignments,
  emptyStoreOrders,
  emptyStoreProducts,
  emptyStudentJobs,
  type GatorLedgerEntry,
  type JobApplication,
  type JobApplicationStatus,
  type JobAssignment,
  type StoreCategory,
  type StoreLocation,
  type StoreOrder,
  type StoreProduct,
  type StudentJob,
} from "@/lib/student-store";
import {
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  Coins,
  Crown,
  FileText,
  GraduationCap,
  Grid2X2,
  Heart,
  Home,
  LogOut,
  Medal,
  Package,
  Pencil,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Trophy,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

type View =
  | "Shop"
  | "Gator Profiles"
  | "Orders"
  | "Jobs & Pay"
  | "Job Applications"
  | "Location Inventory"
  | "Leaderboard"
  | "School Info"
  | "Reports";

type CartLine = { productId: string; quantity: number };
type AwardForm = { amount: number; reason: string };
type ProductForm = {
  name: string;
  category: StoreCategory;
  price: number;
  stock: number;
  emoji: string;
  imageUrl: string;
  notes: string;
  active: boolean;
};
type JobForm = { title: string; pay: number; openings: number; responsibilities: string; active: boolean };

type StoreProductWithImage = StoreProduct & { imageUrl?: string };

const categories: StoreCategory[] = ["Snacks", "School Supplies", "Spirit Wear", "Rewards", "Essentials"];
const quickReasons = [
  "Great Choices",
  "Helping Others",
  "Completed Job",
  "Homework / Reading",
  "Leadership",
  "Cleanup",
  "Kindness",
  "Following Directions",
];

function fullName(child: ChildRecord) {
  return `${child.firstName} ${child.lastName}`;
}
function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
function emojiFor(category: StoreCategory) {
  return category === "Snacks" ? "🍿" : category === "School Supplies" ? "📓" : category === "Spirit Wear" ? "👕" : category === "Rewards" ? "🏆" : "🎒";
}
function categoryIcon(category: StoreCategory) {
  return category === "Snacks" ? "🥨" : category === "School Supplies" ? "✏️" : category === "Spirit Wear" ? "👕" : category === "Rewards" ? "🏆" : "🎒";
}
function productImage(product: StoreProductWithImage) {
  return product.imageUrl?.trim() || "";
}

export default function StudentStorePage() {
  const { profile, isEmployee, isSystemOwner, signOut } = useAuth();
  const { location, setLocation, availableLocations } = useHubLocation();
  const [children] = usePersistentState<ChildRecord[]>("tcs-children-v1", initialChildren);
  const [schedules] = usePersistentState<ChildScheduleRecord[]>("tcs-child-schedules-v2", starterChildSchedules);
  const [products, setProducts] = usePersistentState<StoreProduct[]>("tcs-store-products-v1", emptyStoreProducts);
  const [ledger, setLedger] = usePersistentState<GatorLedgerEntry[]>("tcs-gator-ledger-v1", emptyGatorLedger);
  const [orders, setOrders] = usePersistentState<StoreOrder[]>("tcs-store-orders-v1", emptyStoreOrders);
  const [jobs, setJobs] = usePersistentState<StudentJob[]>("tcs-student-jobs-v1", emptyStudentJobs);
  const [applications, setApplications] = usePersistentState<JobApplication[]>("tcs-job-applications-v1", emptyJobApplications);
  const [assignments, setAssignments] = usePersistentState<JobAssignment[]>("tcs-job-assignments-v1", emptyJobAssignments);

  const allowedStoreLocations = useMemo(
    () => availableLocations.filter((item): item is StoreLocation => item !== "All Locations"),
    [availableLocations],
  );
  const fallbackLocation = allowedStoreLocations[0] ?? "Halcom";
  const [ownerLocation, setOwnerLocation] = useState<StoreLocation>(fallbackLocation);
  const activeLocation: StoreLocation = location !== "All Locations" ? (location as StoreLocation) : ownerLocation;
  const canManageInventory = !isEmployee;
  const canManageJobs = !isEmployee;
  const staffName = profile?.full_name || profile?.email || "TCS Staff";

  const [view, setView] = useState<View>("Shop");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<StoreCategory | "All Products">("All Products");
  const [sortBy, setSortBy] = useState("Most Popular");
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);
  const [profileChildId, setProfileChildId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [awardOpen, setAwardOpen] = useState(false);
  const [awardForm, setAwardForm] = useState<AwardForm>({ amount: 10, reason: quickReasons[0] });
  const [productEditing, setProductEditing] = useState<StoreProduct | null | "new">(null);
  const [productForm, setProductForm] = useState<ProductForm>({
    name: "",
    category: "Snacks",
    price: 10,
    stock: 0,
    emoji: "🍿",
    imageUrl: "",
    notes: "",
    active: true,
  });
  const [jobEditing, setJobEditing] = useState<StudentJob | null | "new">(null);
  const [jobForm, setJobForm] = useState<JobForm>({ title: "", pay: 10, openings: 1, responsibilities: "", active: true });
  const [kidApplyChildId, setKidApplyChildId] = useState<number | null>(null);
  const [reviewAppId, setReviewAppId] = useState<string | null>(null);
  const [parentPreviewChildId, setParentPreviewChildId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const locationChildren = useMemo(
    () =>
      children.filter((child) => {
        if (child.enrollmentStatus === "Archived") return false;
        const schedule = schedules.find((record) => record.childId === child.id);
        return childAttendsLocation(child, schedule, activeLocation);
      }),
    [activeLocation, children, schedules],
  );

  const activeProducts = products.filter((item) => item.location === activeLocation && item.active);
  const popularity = useMemo(() => {
    const counts = new Map<string, number>();
    orders
      .filter((order) => order.location === activeLocation)
      .forEach((order) => order.items.forEach((item) => counts.set(item.productId, (counts.get(item.productId) ?? 0) + item.quantity)));
    return counts;
  }, [activeLocation, orders]);
  const visibleProducts = activeProducts
    .filter((item) => (category === "All Products" || item.category === category) && (!search.trim() || `${item.name} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase())))
    .sort((a, b) => {
      if (sortBy === "Price: Low to High") return a.price - b.price;
      if (sortBy === "Price: High to Low") return b.price - a.price;
      if (sortBy === "Name A-Z") return a.name.localeCompare(b.name);
      return (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0) || a.name.localeCompare(b.name);
    });

  const locationJobs = jobs.filter((item) => item.location === activeLocation);
  const locationApplications = applications.filter((item) => item.location === activeLocation);
  const locationAssignments = assignments.filter((item) => item.location === activeLocation && item.active);
  const locationOrders = orders.filter((item) => item.location === activeLocation);
  const selectedChild = locationChildren.find((child) => child.id === selectedChildId) ?? null;
  const profileChild = children.find((child) => child.id === profileChildId) ?? null;
  const kidApplyChild = children.find((child) => child.id === kidApplyChildId) ?? null;
  const reviewApplication = applications.find((item) => item.id === reviewAppId) ?? null;
  const reviewChild = reviewApplication ? children.find((child) => child.id === reviewApplication.childId) ?? null : null;
  const parentPreviewChild = children.find((child) => child.id === parentPreviewChildId) ?? null;

  function balance(childId: number) {
    return ledger.filter((entry) => entry.childId === childId).reduce((sum, entry) => sum + entry.amount, 0);
  }
  function earned(childId: number) {
    return ledger.filter((entry) => entry.childId === childId && entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  }
  function spent(childId: number) {
    return Math.abs(ledger.filter((entry) => entry.childId === childId && entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0));
  }
  function assignmentFor(childId: number) {
    return assignments.find((item) => item.childId === childId && item.active);
  }
  function jobForAssignment(assignment?: JobAssignment) {
    return assignment ? jobs.find((item) => item.id === assignment.jobId) : undefined;
  }

  const cartDetails = cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    return product ? [{ line, product: product as StoreProductWithImage }] : [];
  });
  const cartTotal = cartDetails.reduce((sum, item) => sum + item.product.price * item.line.quantity, 0);
  const snackCount = activeProducts.filter((item) => item.category === "Snacks").length;
  const totalStock = activeProducts.reduce((sum, item) => sum + item.stock, 0);
  const inStockPct = activeProducts.length ? Math.round((activeProducts.filter((item) => item.stock > 0).length / activeProducts.length) * 100) : 0;

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
      return current.map((line) => (line.productId === product.id ? { ...line, quantity: Math.min(product.stock, line.quantity + 1) } : line));
    });
  }

  function changeCart(productId: string, delta: number) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setCart((current) =>
      current.flatMap((line) => {
        if (line.productId !== productId) return [line];
        const next = Math.max(0, Math.min(product.stock, line.quantity + delta));
        return next ? [{ ...line, quantity: next }] : [];
      }),
    );
  }

  function checkout() {
    if (!selectedChild) return setNotice("Select a child before checkout.");
    if (!cartDetails.length) return setNotice("The cart is empty.");
    if (balance(selectedChild.id) < cartTotal) return setNotice(`${fullName(selectedChild)} does not have enough Gator Cash.`);
    const orderId = makeId("order");
    const now = new Date().toISOString();
    setOrders((current) => [
      ...current,
      {
        id: orderId,
        childId: selectedChild.id,
        location: activeLocation,
        items: cartDetails.map(({ line, product }) => ({ productId: product.id, name: product.name, quantity: line.quantity, price: product.price })),
        total: cartTotal,
        staffName,
        createdAt: now,
      },
    ]);
    setLedger((current) => [
      ...current,
      {
        id: makeId("ledger"),
        childId: selectedChild.id,
        location: activeLocation,
        amount: -cartTotal,
        type: "Purchase",
        reason: `Student Store purchase: ${cartDetails.map(({ line, product }) => `${product.name}${line.quantity > 1 ? ` x${line.quantity}` : ""}`).join(", ")}`,
        staffName,
        createdAt: now,
        referenceId: orderId,
      },
    ]);
    setProducts((current) =>
      current.map((product) => {
        const line = cart.find((item) => item.productId === product.id);
        return line ? { ...product, stock: Math.max(0, product.stock - line.quantity) } : product;
      }),
    );
    setCart([]);
    setNotice(`Purchase completed for ${fullName(selectedChild)}.`);
  }

  function openNewProduct() {
    setProductForm({ name: "", category: "Snacks", price: 10, stock: 0, emoji: "🍿", imageUrl: "", notes: "", active: true });
    setProductEditing("new");
  }

  function openProduct(product: StoreProduct) {
    const item = product as StoreProductWithImage;
    setProductForm({
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      emoji: product.emoji,
      imageUrl: item.imageUrl ?? "",
      notes: product.notes,
      active: product.active,
    });
    setProductEditing(product);
  }

  function saveProduct() {
    if (!canManageInventory || !productForm.name.trim()) return;
    const record: StoreProductWithImage = {
      id: productEditing === "new" || !productEditing ? makeId("product") : productEditing.id,
      location: activeLocation,
      name: productForm.name.trim(),
      category: productForm.category,
      price: Math.max(0, productForm.price),
      stock: Math.max(0, productForm.stock),
      active: productForm.active,
      emoji: productForm.emoji.trim() || emojiFor(productForm.category),
      imageUrl: productForm.imageUrl.trim() || undefined,
      notes: productForm.notes.trim(),
    };
    setProducts((current) =>
      current.some((item) => item.id === record.id) ? current.map((item) => (item.id === record.id ? record : item)) : [...current, record],
    );
    setProductEditing(null);
    setNotice(`${record.name} saved to ${activeLocation}'s Student Store.`);
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
    if (!jobForm.title.trim() || !canManageJobs) return;
    const record: StudentJob = {
      id: jobEditing === "new" || !jobEditing ? makeId("job") : jobEditing.id,
      location: activeLocation,
      title: jobForm.title.trim(),
      pay: Math.max(0, jobForm.pay),
      openings: Math.max(1, jobForm.openings),
      responsibilities: jobForm.responsibilities.split("\n").map((item) => item.trim()).filter(Boolean),
      active: jobForm.active,
    };
    setJobs((current) =>
      current.some((item) => item.id === record.id) ? current.map((item) => (item.id === record.id ? record : item)) : [...current, record],
    );
    setJobEditing(null);
  }

  function awardCash() {
    if (!profileChild || !awardForm.reason.trim() || awardForm.amount === 0) return;
    setLedger((current) => [
      ...current,
      {
        id: makeId("ledger"),
        childId: profileChild.id,
        location: activeLocation,
        amount: awardForm.amount,
        type: awardForm.amount > 0 ? "Earned" : "Adjustment",
        reason: awardForm.reason.trim(),
        staffName,
        createdAt: new Date().toISOString(),
      },
    ]);
    setAwardOpen(false);
    setNotice(`${awardForm.amount > 0 ? "+" : ""}${awardForm.amount} Gator Cash recorded for ${fullName(profileChild)}.`);
  }

  function setApplicationStatus(app: JobApplication, status: JobApplicationStatus) {
    setApplications((current) =>
      current.map((item) =>
        item.id === app.id ? { ...item, status, reviewedBy: staffName, reviewedAt: new Date().toISOString() } : item,
      ),
    );
  }

  function assignJob(app: JobApplication) {
    const job = jobs.find((item) => item.id === app.jobId);
    if (!job) return;
    setAssignments((current) => [
      ...current.filter((item) => !(item.childId === app.childId && item.active)),
      {
        id: makeId("assignment"),
        childId: app.childId,
        location: app.location,
        jobId: job.id,
        applicationId: app.id,
        payPerCompletion: job.pay,
        active: true,
        assignedBy: staffName,
        assignedAt: new Date().toISOString(),
        completedCount: 0,
      },
    ]);
    setApplicationStatus(app, "Assigned");
    setReviewAppId(null);
    setNotice("Job assigned successfully.");
  }

  function completeJob(child: ChildRecord, assignment: JobAssignment, job: StudentJob) {
    const now = new Date().toISOString();
    setLedger((current) => [
      ...current,
      {
        id: makeId("ledger"),
        childId: child.id,
        location: assignment.location,
        amount: assignment.payPerCompletion,
        type: "Job Pay",
        reason: `Completed ${job.title} job`,
        staffName,
        createdAt: now,
        referenceId: assignment.id,
      },
    ]);
    setAssignments((current) =>
      current.map((item) => (item.id === assignment.id ? { ...item, completedCount: item.completedCount + 1, lastPaidAt: now } : item)),
    );
    setNotice(`${fullName(child)} earned ${assignment.payPerCompletion} Gator Cash for ${job.title}.`);
  }

  const sidebarPrimary = [
    { label: "Shop", view: "Shop" as View, icon: ShoppingCart },
    { label: "My Gator Cash", view: "Gator Profiles" as View, icon: Coins },
    { label: "My Orders", view: "Orders" as View, icon: Package },
    { label: "Earn Gator Cash", view: "Jobs & Pay" as View, icon: Trophy },
    { label: "Leaderboards", view: "Leaderboard" as View, icon: BarChart3 },
    { label: "School Info", view: "School Info" as View, icon: Home },
  ];

  return (
    <div className="min-h-screen bg-[#f4f7fa] text-[#07131d]">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[236px] flex-col overflow-y-auto bg-[linear-gradient(180deg,#08151e_0%,#101f29_55%,#08141d_100%)] px-4 py-5 text-white shadow-2xl lg:flex">
          <button onClick={() => setView("Shop")} className="mb-5 text-center">
            <Crown className="mx-auto h-12 w-12 -rotate-6 text-[#35e2d2]" strokeWidth={2.5} />
            <div className="text-2xl font-black leading-none">THE</div>
            <div className="text-5xl font-black leading-none tracking-tight">HUB</div>
            <div className="mt-1 -rotate-2 text-xl font-black italic text-[#35e2d2]">STUDENT STORE</div>
          </button>

          <nav className="space-y-1.5">
            {sidebarPrimary.map(({ label, view: nextView, icon: Icon }) => (
              <SidebarButton key={label} active={view === nextView} onClick={() => setView(nextView)} icon={<Icon className="h-5 w-5" />}>
                {label}
              </SidebarButton>
            ))}
          </nav>

          <div className="my-5 border-t border-white/15" />
          <p className="mb-2 px-3 text-sm text-slate-300">Staff / Admin</p>
          <nav className="space-y-1.5">
            {canManageInventory && (
              <>
                <SidebarButton active={view === "Location Inventory"} onClick={() => setView("Location Inventory")} icon={<Package className="h-5 w-5" />}>Location Inventory</SidebarButton>
                <SidebarButton active={false} onClick={() => { setView("Location Inventory"); openNewProduct(); }} icon={<Pencil className="h-5 w-5" />}>Manage Products</SidebarButton>
              </>
            )}
            <SidebarButton active={view === "Job Applications"} onClick={() => setView("Job Applications")} icon={<FileText className="h-5 w-5" />}>Job Applications</SidebarButton>
            <SidebarButton active={view === "Reports"} onClick={() => setView("Reports")} icon={<BarChart3 className="h-5 w-5" />}>Reports</SidebarButton>
            {isSystemOwner && <Link href="/settings" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/10"><Settings className="h-5 w-5" />Settings</Link>}
          </nav>

          <div className="mt-auto pt-8">
            <div className="-rotate-3 text-2xl font-black italic leading-tight text-slate-200">GOOD<br />PEOPLE<br /><span className="text-[#35e2d2]">BRIGHT IDEAS</span><br />BIGGER<br />TOMORROWS</div>
            <Crown className="ml-auto mt-2 h-10 w-10 rotate-6 text-[#35e2d2]" />
          </div>
        </aside>

        <div className="min-w-0 flex-1 lg:ml-[236px]">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 shadow-sm sm:px-5">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search for snacks, supplies, spirit wear and more..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-[#35e2d2] focus:ring-2 focus:ring-[#35e2d2]/20" />
            </div>
            <label className="relative hidden min-w-[220px] md:block">
              <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-600" />
              <select value={activeLocation} disabled={allowedStoreLocations.length <= 1} onChange={(event) => chooseLocation(event.target.value as StoreLocation)} className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm font-bold outline-none">
                {allowedStoreLocations.map((item) => <option key={item}>{item}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            </label>
            <button className="relative grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" /><span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" /></button>
            <div className="hidden h-9 w-9 place-items-center rounded-full bg-[#0a2740] text-xs font-black text-white sm:grid">{staffName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
            <div className="hidden min-w-[110px] text-xs sm:block"><p className="text-slate-500">Good day!</p><p className="max-w-[150px] truncate font-black">{staffName}</p></div>
            <button onClick={() => void signOut()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Sign out"><LogOut className="h-4 w-4" /></button>
          </header>

          <main className="p-3 sm:p-4">
            {notice && <div className="mb-3 flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-bold text-teal-800"><span>{notice}</span><button onClick={() => setNotice("")}><X className="h-4 w-4" /></button></div>}

            {view === "Shop" && (
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="min-w-0">
                  <HeroBanner location={activeLocation} />

                  <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-6">
                    <CategoryButton active={category === "All Products"} onClick={() => setCategory("All Products")} icon={<Grid2X2 className="h-7 w-7" />} label="All Products" />
                    {categories.map((item) => <CategoryButton key={item} active={category === item} onClick={() => setCategory(item)} icon={<span className="text-2xl">{categoryIcon(item)}</span>} label={item} />)}
                  </div>

                  <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2"><Crown className="h-8 w-8 -rotate-6 text-[#35e2d2]" /><div><h2 className="text-xl font-black">Featured Items</h2><p className="text-xs text-slate-500">Popular picks at {activeLocation}</p></div></div>
                      <label className="flex items-center gap-2 text-xs font-bold">Sort by<select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-black"><option>Most Popular</option><option>Price: Low to High</option><option>Price: High to Low</option><option>Name A-Z</option></select></label>
                    </div>

                    {visibleProducts.length ? (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                        {visibleProducts.map((product) => <ProductCard key={product.id} product={product as StoreProductWithImage} onAdd={() => addToCart(product)} />)}
                      </div>
                    ) : (
                      <Empty icon="🛍️" title="No items here yet" text={canManageInventory ? "Open Location Inventory and add the real items this location wants to sell." : "This location’s admin has not added store items yet."} />
                    )}
                  </section>

                  <div className="mt-2 grid gap-2 md:grid-cols-4">
                    <BottomBadge icon={<Trophy className="h-6 w-6" />} title="Earn and Redeem" text="Turn your good choices into great rewards." />
                    <BottomBadge icon={<Sparkles className="h-6 w-6" />} title="Spend Smart" text="Real items. Real impact." />
                    <BottomBadge icon={<UsersRound className="h-6 w-6" />} title="Good Choices" text="Kind people. Cool things. Brighter days." />
                    <div className="rounded-xl bg-[#35e2d2]/20 p-3 text-center"><Crown className="mx-auto h-6 w-6" /><p className="mt-1 text-sm font-black italic">SAME KIDS<br />BRIGHTER FUTURES</p></div>
                  </div>
                </section>

                <aside className="space-y-3 2xl:sticky 2xl:top-20 2xl:self-start">
                  <GatorBalanceCard children={locationChildren} selectedChildId={selectedChildId} setSelectedChildId={setSelectedChildId} selectedChild={selectedChild} balance={selectedChild ? balance(selectedChild.id) : 0} openProfile={() => selectedChild && setProfileChildId(selectedChild.id)} />
                  <CartCard cartDetails={cartDetails} cartCount={cart.reduce((sum, item) => sum + item.quantity, 0)} cartTotal={cartTotal} changeCart={changeCart} checkout={checkout} clear={() => setCart([])} />
                  <InventorySummary location={activeLocation} snacks={snackCount} total={totalStock} inStock={inStockPct} canManage={canManageInventory} manage={() => setView("Location Inventory")} />
                </aside>
              </div>
            )}

            {view === "Gator Profiles" && (
              <StoreWorkspace title="Gator Profiles" subtitle="Staff-managed child profiles. Children do not need their own Hub accounts." icon={<Coins className="h-7 w-7" />}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {locationChildren.map((child) => {
                    const assignment = assignmentFor(child.id);
                    const job = jobForAssignment(assignment);
                    return (
                      <button key={child.id} onClick={() => setProfileChildId(child.id)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                        <div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-full bg-[#35e2d2]/20 font-black text-teal-800">{child.firstName[0]}{child.lastName[0]}</div><div><h3 className="font-black">{fullName(child)}</h3><p className="text-xs text-slate-500">{child.ageGroup} • {child.classroom}</p></div><ChevronRight className="ml-auto h-5 w-5 text-slate-400" /></div>
                        <div className="mt-4 grid grid-cols-2 gap-2"><Metric label="Balance" value={`🪙 ${balance(child.id)}`} /><Metric label="Current Job" value={job?.title ?? (child.ageGroup === "School Age" ? "Not assigned" : "Not eligible")} /></div>
                      </button>
                    );
                  })}
                </div>
              </StoreWorkspace>
            )}

            {view === "Orders" && (
              <StoreWorkspace title="Student Store Orders" subtitle={`Purchases completed at ${activeLocation}.`} icon={<Package className="h-7 w-7" />}>
                {locationOrders.length ? <div className="space-y-3">{locationOrders.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((order) => { const child = children.find((item) => item.id === order.childId); return <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black">{child ? fullName(child) : "Child"}</p><p className="text-xs text-slate-500">{formatDate(order.createdAt)} • Staff: {order.staffName}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-black text-amber-700">🪙 {order.total}</span></div><p className="mt-3 text-sm font-bold text-slate-600">{order.items.map((item) => `${item.name} ×${item.quantity}`).join(" • ")}</p></div>; })}</div> : <Empty icon="📦" title="No purchases yet" text="Completed Student Store purchases will appear here." />}
              </StoreWorkspace>
            )}

            {view === "Jobs & Pay" && (
              <StoreWorkspace title="Earn Gator Cash" subtitle="School-age jobs, assigned responsibilities, and job pay." icon={<Trophy className="h-7 w-7" />} action={canManageJobs ? <button onClick={openNewJob} className="rounded-xl bg-[#07131d] px-4 py-2.5 text-sm font-black text-white"><Plus className="mr-1 inline h-4 w-4" />Add Job</button> : undefined}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {locationJobs.length ? locationJobs.map((job) => <div key={job.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-black uppercase tracking-wider text-teal-700">{job.active ? "Open Job" : "Inactive"}</p><h3 className="mt-1 text-xl font-black">{job.title}</h3></div>{canManageJobs && <button onClick={() => openJob(job)} className="rounded-lg border p-2"><Pencil className="h-4 w-4" /></button>}</div><p className="mt-3 text-2xl font-black text-amber-600">🪙 {job.pay} <span className="text-xs text-slate-400">per completion</span></p><p className="mt-1 text-xs text-slate-500">{job.openings} opening{job.openings === 1 ? "" : "s"}</p><div className="mt-3 space-y-1 text-sm text-slate-600">{job.responsibilities.map((item) => <p key={item}>• {item}</p>)}</div></div>) : <Empty icon="💼" title="No student jobs yet" text={canManageJobs ? "Add the first school-age job for this location." : "This location has not opened student jobs yet."} />}
                </div>
                <h3 className="mt-7 text-lg font-black">Assigned Jobs</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{locationAssignments.length ? locationAssignments.map((assignment) => { const child = children.find((item) => item.id === assignment.childId); const job = jobs.find((item) => item.id === assignment.jobId); if (!child || !job) return null; return <div key={assignment.id} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="font-black">{fullName(child)}</p><p className="text-sm text-slate-500">{job.title} • 🪙 {assignment.payPerCompletion}</p><p className="mt-2 text-xs text-slate-400">Completed {assignment.completedCount} time{assignment.completedCount === 1 ? "" : "s"}</p><button onClick={() => completeJob(child, assignment, job)} className="mt-3 w-full rounded-xl bg-[#35e2d2] py-2.5 text-sm font-black">Complete Job + Pay</button></div>; }) : <p className="text-sm text-slate-500">No jobs are currently assigned.</p>}</div>
              </StoreWorkspace>
            )}

            {view === "Job Applications" && (
              <StoreWorkspace title="Job Applications" subtitle="Children complete these in Kid Mode from their Gator Profile while staff are logged in." icon={<FileText className="h-7 w-7" />}>
                {locationApplications.length ? <div className="space-y-3">{locationApplications.slice().sort((a,b) => b.submittedAt.localeCompare(a.submittedAt)).map((app) => { const child = children.find((item) => item.id === app.childId); const job = jobs.find((item) => item.id === app.jobId); return <button key={app.id} onClick={() => setReviewAppId(app.id)} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"><span className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50">📝</span><div className="flex-1"><p className="font-black">{child ? fullName(child) : "Child"} — {job?.title ?? "Job"}</p><p className="text-xs text-slate-500">Submitted {formatDate(app.submittedAt)}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{app.status}</span><ChevronRight className="h-5 w-5 text-slate-400" /></button>; })}</div> : <Empty icon="📝" title="No applications yet" text="Open a school-age child’s Gator Profile and choose Apply for a Job." />}
              </StoreWorkspace>
            )}

            {view === "Location Inventory" && canManageInventory && (
              <StoreWorkspace title={`${activeLocation} Inventory`} subtitle="This location chooses its own products, prices, photos, stock, and availability." icon={<Package className="h-7 w-7" />} action={<button onClick={openNewProduct} className="rounded-xl bg-[#35e2d2] px-4 py-2.5 text-sm font-black"><Plus className="mr-1 inline h-4 w-4" />Add Product</button>}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{products.filter((item) => item.location === activeLocation).map((product) => <button key={product.id} onClick={() => openProduct(product)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm"><ProductVisual product={product as StoreProductWithImage} compact /><div className="p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-black">{product.name}</p><p className="text-xs text-slate-500">{product.category}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-black ${product.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{product.active ? "ACTIVE" : "HIDDEN"}</span></div><div className="mt-3 flex justify-between text-sm font-black"><span>🪙 {product.price}</span><span>{product.stock} in stock</span></div></div></button>)}</div>
                {!products.some((item) => item.location === activeLocation) && <Empty icon="📦" title="Build this location’s store" text="Add snacks, supplies, spirit wear, rewards, or essentials. Each location can have a completely different inventory." />}
              </StoreWorkspace>
            )}

            {view === "Leaderboard" && (
              <StoreWorkspace title="Gator Cash Leaderboard" subtitle={`Positive choices and job earnings at ${activeLocation}.`} icon={<Medal className="h-7 w-7" />}>
                <div className="space-y-2">{locationChildren.slice().sort((a,b) => earned(b.id) - earned(a.id)).map((child, index) => <button key={child.id} onClick={() => setProfileChildId(child.id)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left"><div className={`grid h-10 w-10 place-items-center rounded-full font-black ${index === 0 ? "bg-amber-100 text-amber-800" : index === 1 ? "bg-slate-200" : index === 2 ? "bg-orange-100 text-orange-800" : "bg-teal-50"}`}>{index + 1}</div><div className="flex-1"><p className="font-black">{fullName(child)}</p><p className="text-xs text-slate-500">Lifetime earned: 🪙 {earned(child.id)}</p></div><p className="text-xl font-black">🪙 {balance(child.id)}</p></button>)}</div>
              </StoreWorkspace>
            )}

            {view === "School Info" && (
              <StoreWorkspace title="Student Store Info" subtitle={activeLocation} icon={<GraduationCap className="h-7 w-7" />}>
                <div className="grid gap-4 lg:grid-cols-3"><InfoCard icon="🐊" title="How Gator Cash Works" text="Staff record every earning with a reason. Children can spend their balance on real items in their location’s Student Store." /><InfoCard icon="💼" title="School-Age Jobs" text="School-age children apply for jobs in Kid Mode. Staff review applications, assign jobs, and pay Gator Cash after responsibilities are completed." /><InfoCard icon="🛍️" title="Different Store, Same System" text="Each location admin chooses that site’s own snacks, supplies, rewards, prices, and stock. Other locations can have completely different offerings." /></div>
              </StoreWorkspace>
            )}

            {view === "Reports" && (
              <StoreWorkspace title="Student Store Reports" subtitle={`Live snapshot for ${activeLocation}.`} icon={<BarChart3 className="h-7 w-7" />}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="Active Products" value={String(activeProducts.length)} /><MetricCard label="Inventory Units" value={String(totalStock)} /><MetricCard label="Purchases" value={String(locationOrders.length)} /><MetricCard label="Open Applications" value={String(locationApplications.filter((app) => app.status === "New" || app.status === "Reviewing").length)} /></div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black">Gator Cash in Circulation</h3><p className="mt-2 text-4xl font-black">🪙 {locationChildren.reduce((sum, child) => sum + balance(child.id), 0)}</p><p className="mt-1 text-sm text-slate-500">Current combined child balances at this location.</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-black">Store Spend</h3><p className="mt-2 text-4xl font-black">🪙 {locationOrders.reduce((sum, order) => sum + order.total, 0)}</p><p className="mt-1 text-sm text-slate-500">Total Gator Cash redeemed through purchases.</p></div></div>
              </StoreWorkspace>
            )}
          </main>
        </div>
      </div>

      {profileChild && (
        <Modal close={() => setProfileChildId(null)}>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">Gator Profile</p>
          <h2 className="mt-1 text-3xl font-black">{fullName(profileChild)}</h2>
          <p className="text-sm text-slate-500">{profileChild.ageGroup} • {profileChild.classroom} • {activeLocation}</p>
          <div className="mt-5 grid grid-cols-3 gap-2"><Metric label="Balance" value={`🪙 ${balance(profileChild.id)}`} /><Metric label="Lifetime Earned" value={`🪙 ${earned(profileChild.id)}`} /><Metric label="Spent" value={`🪙 ${spent(profileChild.id)}`} /></div>
          {(() => { const assignment = assignmentFor(profileChild.id); const job = jobForAssignment(assignment); return <div className="mt-4 rounded-2xl bg-[#07131d] p-4 text-white"><p className="text-xs font-black uppercase tracking-wider text-[#35e2d2]">Current Job</p><p className="mt-1 text-xl font-black">{job?.title ?? (profileChild.ageGroup === "School Age" ? "No job assigned yet" : "Jobs begin at school age")}</p>{assignment && job && <p className="mt-1 text-sm text-slate-300">Pays 🪙 {assignment.payPerCompletion} each time staff confirms the job is completed.</p>}</div>; })()}
          <div className="mt-4 grid gap-2 sm:grid-cols-3"><button onClick={() => setAwardOpen(true)} className="rounded-xl bg-[#35e2d2] px-3 py-3 text-sm font-black">Award Gator Cash</button>{profileChild.ageGroup === "School Age" && <button onClick={() => { setKidApplyChildId(profileChild.id); setProfileChildId(null); }} className="rounded-xl bg-[#07131d] px-3 py-3 text-sm font-black text-white">Apply for a Job</button>}<button onClick={() => setParentPreviewChildId(profileChild.id)} className="rounded-xl border border-slate-200 px-3 py-3 text-sm font-black">Parent View</button></div>
          <h3 className="mt-6 font-black">How I Earned & Spent It</h3>
          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">{ledger.filter((entry) => entry.childId === profileChild.id).slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => <div key={entry.id} className="flex gap-3 rounded-xl bg-slate-50 p-3"><span className={`text-lg font-black ${entry.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</span><div><p className="text-sm font-black">{entry.reason}</p><p className="text-xs text-slate-500">{formatDate(entry.createdAt)} • {entry.staffName}</p></div></div>)}</div>
        </Modal>
      )}

      {awardOpen && profileChild && <Modal close={() => setAwardOpen(false)}><p className="text-xs font-black uppercase text-teal-700">Gator Cash</p><h2 className="mt-1 text-2xl font-black">Award {profileChild.firstName}</h2><Field label="Amount"><input type="number" value={awardForm.amount} onChange={(event) => setAwardForm((current) => ({ ...current, amount: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field><div className="mt-3"><p className="mb-2 text-sm font-black">Quick reason</p><div className="flex flex-wrap gap-2">{quickReasons.map((reason) => <button key={reason} onClick={() => setAwardForm((current) => ({ ...current, reason }))} className={`rounded-full px-3 py-2 text-xs font-black ${awardForm.reason === reason ? "bg-[#07131d] text-white" : "bg-slate-100"}`}>{reason}</button>)}</div></div><Field label="Reason"><input value={awardForm.reason} onChange={(event) => setAwardForm((current) => ({ ...current, reason: event.target.value }))} className="w-full rounded-xl border p-3" /></Field><button onClick={awardCash} className="mt-4 w-full rounded-xl bg-[#35e2d2] py-3 font-black">Save Gator Cash</button></Modal>}

      {productEditing && <Modal close={() => setProductEditing(null)}><p className="text-xs font-black uppercase text-teal-700">{activeLocation} Inventory</p><h2 className="mt-1 text-2xl font-black">{productEditing === "new" ? "Add Product" : "Edit Product"}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Product name"><input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} className="w-full rounded-xl border p-3" /></Field><Field label="Category"><select value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value as StoreCategory }))} className="w-full rounded-xl border p-3">{categories.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="Gator Cash price"><input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field><Field label="Stock quantity"><input type="number" min="0" value={productForm.stock} onChange={(event) => setProductForm((current) => ({ ...current, stock: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field><Field label="Emoji / fallback icon"><input value={productForm.emoji} onChange={(event) => setProductForm((current) => ({ ...current, emoji: event.target.value }))} className="w-full rounded-xl border p-3" /></Field><Field label="Product image URL (optional)"><input value={productForm.imageUrl} onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://..." className="w-full rounded-xl border p-3" /></Field></div><Field label="Notes"><textarea value={productForm.notes} onChange={(event) => setProductForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-20 w-full rounded-xl border p-3" /></Field><label className="mt-3 flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={productForm.active} onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))} />Available in store</label><button onClick={saveProduct} className="mt-4 w-full rounded-xl bg-[#35e2d2] py-3 font-black">Save Product</button></Modal>}

      {jobEditing && <Modal close={() => setJobEditing(null)}><p className="text-xs font-black uppercase text-teal-700">Student Jobs</p><h2 className="mt-1 text-2xl font-black">{jobEditing === "new" ? "Add Job" : "Edit Job"}</h2><Field label="Job title"><input value={jobForm.title} onChange={(event) => setJobForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-xl border p-3" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Gator Cash pay"><input type="number" value={jobForm.pay} onChange={(event) => setJobForm((current) => ({ ...current, pay: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field><Field label="Openings"><input type="number" value={jobForm.openings} onChange={(event) => setJobForm((current) => ({ ...current, openings: Number(event.target.value) }))} className="w-full rounded-xl border p-3" /></Field></div><Field label="Responsibilities (one per line)"><textarea value={jobForm.responsibilities} onChange={(event) => setJobForm((current) => ({ ...current, responsibilities: event.target.value }))} className="min-h-32 w-full rounded-xl border p-3" /></Field><label className="mt-3 flex items-center gap-2 text-sm font-black"><input type="checkbox" checked={jobForm.active} onChange={(event) => setJobForm((current) => ({ ...current, active: event.target.checked }))} />Accepting applications</label><button onClick={saveJob} className="mt-4 w-full rounded-xl bg-[#35e2d2] py-3 font-black">Save Job</button></Modal>}

      {reviewApplication && reviewChild && <Modal close={() => setReviewAppId(null)}><p className="text-xs font-black uppercase text-teal-700">Job Application</p><h2 className="mt-1 text-2xl font-black">{fullName(reviewChild)}</h2><p className="text-sm text-slate-500">Applied for {jobs.find((item) => item.id === reviewApplication.jobId)?.title ?? "a student job"}</p><ApplicationAnswers app={reviewApplication} /><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setApplicationStatus(reviewApplication, "Reviewing")} className="rounded-xl border px-4 py-2 text-sm font-black">Mark Reviewing</button><button onClick={() => setApplicationStatus(reviewApplication, "Approved")} className="rounded-xl bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">Approve</button><button onClick={() => assignJob(reviewApplication)} className="rounded-xl bg-[#35e2d2] px-4 py-2 text-sm font-black">Assign Job</button><button onClick={() => setApplicationStatus(reviewApplication, "Not Selected")} className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-black text-rose-700">Not Selected</button></div></Modal>}

      {parentPreviewChild && <Modal close={() => setParentPreviewChildId(null)}><p className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">Parent View Preview</p><h2 className="mt-1 text-3xl font-black">{parentPreviewChild.firstName}’s Gator Cash</h2><p className="mt-2 text-sm text-slate-500">Read-only view showing what your child earned, why they earned it, and what they purchased.</p><div className="mt-5 grid grid-cols-3 gap-2"><Metric label="Balance" value={`🪙 ${balance(parentPreviewChild.id)}`} /><Metric label="Earned" value={`🪙 ${earned(parentPreviewChild.id)}`} /><Metric label="Spent" value={`🪙 ${spent(parentPreviewChild.id)}`} /></div><div className="mt-5 space-y-2">{ledger.filter((entry) => entry.childId === parentPreviewChild.id).slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map((entry) => <div key={entry.id} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-3"><p className="text-sm font-black">{entry.reason}</p><span className={`font-black ${entry.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{entry.amount >= 0 ? "+" : ""}{entry.amount}</span></div><p className="mt-1 text-xs text-slate-500">{formatDate(entry.createdAt)}</p></div>)}</div></Modal>}

      {kidApplyChild && <KidApplication child={kidApplyChild} jobs={locationJobs.filter((job) => job.active)} location={activeLocation} close={() => setKidApplyChildId(null)} submit={(application) => { setApplications((current) => [...current, application]); setKidApplyChildId(null); setNotice(`${kidApplyChild.firstName}'s job application was submitted.`); }} />}
    </div>
  );
}

function HeroBanner({ location }: { location: StoreLocation }) {
  return <section className="relative min-h-[220px] overflow-hidden rounded-xl border border-[#153441] bg-[linear-gradient(135deg,#07131d,#0d2933_60%,#07131d)] px-6 py-6 text-white shadow-xl sm:px-10"><div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(135deg,rgba(53,226,210,.18) 1px,transparent 1px)", backgroundSize: "28px 28px" }} /><div className="relative flex min-h-[170px] items-center justify-center text-center"><div className="absolute left-4 top-7 hidden -rotate-6 text-left text-lg font-black italic leading-tight text-slate-100 lg:block">GOOD<br />PEOPLE<br />BRIGHT IDEAS<br />BIGGER TOMORROWS</div><div><div className="flex items-center justify-center gap-3"><span className="hidden -rotate-90 text-xl font-black sm:block">THE</span><h1 className="text-7xl font-black tracking-tight drop-shadow-[0_0_8px_rgba(53,226,210,.9)] sm:text-8xl">HUB</h1></div><p className="-mt-1 text-3xl font-black italic tracking-wide text-[#35e2d2] sm:text-4xl">STUDENT STORE</p><p className="mt-3 text-[10px] font-black tracking-[0.38em] text-slate-300">{location.toUpperCase()} • KIND KIDS • BRIGHTER FUTURES</p></div><div className="absolute right-4 top-8 hidden rotate-3 text-right text-xl font-black italic leading-tight lg:block">SPEND<br />SMART<br /><span className="text-[#35e2d2]">BRIGHTER<br />FUTURES</span><Crown className="ml-auto mt-2 h-10 w-10 text-[#35e2d2]" /></div></div></section>;
}

function SidebarButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${active ? "bg-[#35e2d2] text-[#07131d] shadow-[0_0_18px_rgba(53,226,210,.25)]" : "text-slate-200 hover:bg-white/10"}`}>{icon}<span>{children}</span></button>;
}

function CategoryButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button onClick={onClick} className={`rounded-xl border px-2 py-3 text-center text-xs font-black shadow-sm transition ${active ? "border-[#35e2d2] bg-[#0a1821] text-white shadow-[0_0_12px_rgba(53,226,210,.22)]" : "border-slate-200 bg-white hover:-translate-y-0.5"}`}><div className="mb-1 flex justify-center text-[#35e2d2]">{icon}</div>{label}</button>;
}

function ProductCard({ product, onAdd }: { product: StoreProductWithImage; onAdd: () => void }) {
  return <article className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><button className="absolute right-3 top-3 z-10 text-slate-500"><Heart className="h-5 w-5" /></button><ProductVisual product={product} /><h3 className="mt-2 truncate text-sm font-black">{product.name}</h3><p className="text-xs font-black text-amber-600">🪙 {product.price}</p><button disabled={product.stock <= 0} onClick={onAdd} className="mt-2 w-full rounded-lg bg-[#35e2d2] py-2 text-xs font-black text-[#07131d] transition hover:brightness-95 disabled:bg-slate-200 disabled:text-slate-500">{product.stock > 0 ? "Buy with Gator Cash" : "Out of stock"}</button></article>;
}

function ProductVisual({ product, compact = false }: { product: StoreProductWithImage; compact?: boolean }) {
  const image = productImage(product);
  return <div className={`grid place-items-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_center,#fff,#f6f8fa)] ${compact ? "h-32" : "h-36"}`}>{image ? <div className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${image})` }} /> : <span className="text-6xl drop-shadow-sm">{product.emoji || emojiFor(product.category)}</span>}</div>;
}

function GatorBalanceCard({ children, selectedChildId, setSelectedChildId, selectedChild, balance, openProfile }: { children: ChildRecord[]; selectedChildId: number | null; setSelectedChildId: (value: number | null) => void; selectedChild: ChildRecord | null; balance: number; openProfile: () => void }) {
  return <div className="rounded-xl border border-[#b5eeea] bg-[linear-gradient(135deg,#e5fbfb,#d8f8fb)] p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 font-black"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#35e2d2] text-xl">🪙</span>Gator Cash Balance</div><p className="mt-2 text-5xl font-black">{selectedChild ? balance : "—"}</p><p className="text-xs font-black uppercase tracking-wider">Gator Cash</p></div><div className="text-6xl">🐊</div></div><select value={selectedChildId ?? ""} onChange={(event) => setSelectedChildId(event.target.value ? Number(event.target.value) : null)} className="mt-3 w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-bold"><option value="">Select a child</option>{children.map((child) => <option key={child.id} value={child.id}>{fullName(child)}</option>)}</select><button disabled={!selectedChild} onClick={openProfile} className="mt-3 w-full rounded-lg bg-[#35e2d2] py-2.5 text-sm font-black disabled:bg-slate-200">Earn More Gator Cash →</button><p className="mt-2 text-center text-xs text-slate-500">Good Choices. Brighter Days.</p></div>;
}

function CartCard({ cartDetails, cartCount, cartTotal, changeCart, checkout, clear }: { cartDetails: Array<{ line: CartLine; product: StoreProductWithImage }>; cartCount: number; cartTotal: number; changeCart: (id: string, delta: number) => void; checkout: () => void; clear: () => void }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h3 className="font-black"><ShoppingCart className="mr-2 inline h-5 w-5" />Your Cart ({cartCount})</h3>{cartCount > 0 && <button onClick={clear} className="text-xs font-bold text-sky-600">Clear All</button>}</div><div className="mt-3 space-y-2">{cartDetails.map(({ line, product }) => <div key={product.id} className="flex items-center gap-2 border-b border-slate-100 pb-2"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-lg bg-slate-50">{productImage(product) ? <div className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${productImage(product)})` }} /> : <span className="text-2xl">{product.emoji}</span>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{product.name}</p><p className="text-xs font-black text-amber-600">🪙 {product.price}</p></div><div className="flex items-center overflow-hidden rounded-lg border"><button onClick={() => changeCart(product.id, -1)} className="px-2 py-1">−</button><span className="border-x px-2 py-1 text-xs font-black">{line.quantity}</span><button onClick={() => changeCart(product.id, 1)} className="px-2 py-1">+</button></div></div>)}</div>{cartCount === 0 && <p className="py-4 text-center text-xs text-slate-400">Your cart is empty.</p>}<div className="mt-3 flex justify-between text-lg font-black"><span>Total</span><span>🪙 {cartTotal}</span></div><button onClick={checkout} className="mt-3 w-full rounded-lg bg-[#35e2d2] py-3 font-black">Checkout with Gator Cash →</button></div>;
}

function InventorySummary({ location, snacks, total, inStock, canManage, manage }: { location: StoreLocation; snacks: number; total: number; inStock: number; canManage: boolean; manage: () => void }) {
  return <div className="rounded-xl border border-sky-100 bg-[linear-gradient(135deg,#eaf9ff,#dff8fa)] p-4 shadow-sm"><div className="flex items-center gap-2"><Building2 className="h-7 w-7 text-teal-700" /><div><p className="font-black">This Location’s Snacks</p><p className="text-xs text-sky-700">{location}</p></div></div><div className="mt-3 grid grid-cols-3 gap-2"><Metric label="Snacks" value={String(snacks)} /><Metric label="Total Items" value={String(total)} /><Metric label="In Stock" value={`${inStock}%`} /></div>{canManage && <button onClick={manage} className="mt-3 w-full rounded-lg bg-[#35e2d2]/70 py-2.5 text-sm font-black"><Settings className="mr-1 inline h-4 w-4" />Manage This Location’s Inventory →</button>}<p className="mt-2 text-center text-[11px] text-slate-500">Each location can add, edit, and manage its own offerings!</p></div>;
}

function StoreWorkspace({ title, subtitle, icon, action, children }: { title: string; subtitle: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <div className="mx-auto max-w-[1500px]"><div className="rounded-xl bg-[linear-gradient(135deg,#07131d,#12303a)] p-5 text-white shadow-lg"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-[#35e2d2] text-[#07131d]">{icon}</div><div><h1 className="text-2xl font-black">{title}</h1><p className="text-sm text-slate-300">{subtitle}</p></div></div>{action}</div></div><div className="mt-4">{children}</div></div>;
}

function BottomBadge({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><div>{icon}</div><div><p className="text-sm font-black">{title}</p><p className="text-[11px] text-slate-500">{text}</p></div></div>;
}
function InfoCard({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-4xl">{icon}</div><h3 className="mt-3 text-lg font-black">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>;
}
function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-2 text-4xl font-black">{value}</p></div>;
}

function KidApplication({ child, jobs, location, close, submit }: { child: ChildRecord; jobs: StudentJob[]; location: StoreLocation; close: () => void; submit: (application: JobApplication) => void }) {
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
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="mt-3 block text-sm font-black">{label}<div className="mt-1">{children}</div></label>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 truncate text-base font-black">{value}</p></div>; }
function Empty({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div className="text-5xl">{icon}</div><h3 className="mt-3 text-lg font-black">{title}</h3><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
function Modal({ close, children }: { close: () => void; children: ReactNode }) { return <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/65 p-4"><div className="relative my-6 w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"><button onClick={close} className="absolute right-4 top-4 rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button>{children}</div></div>; }
