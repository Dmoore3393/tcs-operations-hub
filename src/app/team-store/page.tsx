"use client";

import "./team-store.css";
import Link from "next/link";
import { canAccessRoute, useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import type { LocationKey } from "@/lib/location-config";
import {
  emptyTeamRewardOrders,
  emptyTeamRewards,
  emptyTeamTrainingCompletions,
  emptyTeamTrainings,
  emptyTeamXpLedger,
  type TeamReward,
  type TeamRewardCategory,
  type TeamRewardOrder,
  type TeamStoreLocation,
  type TeamTraining,
  type TeamTrainingCompletion,
  type TeamXpLedgerEntry,
} from "@/lib/team-store";
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Box,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Crown,
  ExternalLink,
  Gift,
  Heart,
  Home,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Store,
  Trophy,
  Upload,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

type StoreTab = "Shop" | "My XP" | "My Rewards" | "My Orders" | "Training Center" | "Leaderboards" | "Achievements" | "Manage Rewards" | "Training Rewards" | "Reports";
type CartLine = { rewardId: string; quantity: number };
type RewardForm = { name: string; category: TeamRewardCategory; xpCost: number; stock: number; active: boolean; emoji: string; imageUrl: string; notes: string };
type TrainingForm = {
  title: string;
  provider: string;
  externalUrl: string;
  description: string;
  instructions: string;
  locations: TeamStoreLocation[];
  roles: string;
  assignedEmails: string;
  dueDate: string;
  recurring: boolean;
  renewalMonths: number;
  requiresProof: boolean;
  verificationRequired: boolean;
  baseXp: number;
  onTimeBonusXp: number;
  lateXp: number;
  active: boolean;
};

const categories: TeamRewardCategory[] = ["Gift Cards", "Team Gear", "Self-Care", "Office Essentials", "Recognition"];
const trainingAdminNames = new Set(["danielle moore", "jennifer thomason", "heather graham"]);

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "TS";
}

function rewardEmoji(category: TeamRewardCategory) {
  if (category === "Gift Cards") return "🎁";
  if (category === "Team Gear") return "👕";
  if (category === "Self-Care") return "🪷";
  if (category === "Office Essentials") return "🗂️";
  return "🏆";
}

function isOnTime(training: TeamTraining, completedAt: string) {
  if (!training.dueDate) return true;
  return completedAt.slice(0, 10) <= training.dueDate;
}

export default function TeamStorePage() {
  const { profile, user, isSystemOwner, isLocationLicensee, isEmployee } = useAuth();
  const { location, setLocation, availableLocations } = useHubLocation();
  const [rewards, setRewards] = usePersistentState<TeamReward[]>("tcs-team-rewards-v1", emptyTeamRewards);
  const [orders, setOrders] = usePersistentState<TeamRewardOrder[]>("tcs-team-reward-orders-v1", emptyTeamRewardOrders);
  const [ledger, setLedger] = usePersistentState<TeamXpLedgerEntry[]>("tcs-team-xp-ledger-v1", emptyTeamXpLedger);
  const [trainings, setTrainings] = usePersistentState<TeamTraining[]>("tcs-team-trainings-v1", emptyTeamTrainings);
  const [completions, setCompletions] = usePersistentState<TeamTrainingCompletion[]>("tcs-team-training-completions-v1", emptyTeamTrainingCompletions);

  const storeLocations = useMemo(() => availableLocations.filter((item): item is TeamStoreLocation => item !== "All Locations"), [availableLocations]);
  const fallbackLocation = storeLocations[0] ?? "Halcom";
  const [ownerLocation, setOwnerLocation] = useState<TeamStoreLocation>(fallbackLocation);
  const activeLocation = (location === "All Locations" ? ownerLocation : location) as TeamStoreLocation;
  const staffName = profile?.full_name || profile?.email || user?.email || "TCS Staff";
  const staffEmail = (profile?.email || user?.email || "").toLowerCase();
  const staffUserId = profile?.user_id || user?.id || staffEmail;
  const canManageRewards = isSystemOwner || isLocationLicensee;
  const canManageTrainings = isSystemOwner || trainingAdminNames.has((profile?.full_name || "").trim().toLowerCase());

  const [tab, setTab] = useState<StoreTab>("Shop");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<TeamRewardCategory | "All Rewards">("All Rewards");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [notice, setNotice] = useState("");
  const [rewardEditing, setRewardEditing] = useState<TeamReward | "new" | null>(null);
  const [rewardForm, setRewardForm] = useState<RewardForm>({ name: "", category: "Team Gear", xpCost: 100, stock: 0, active: true, emoji: "👕", imageUrl: "", notes: "" });
  const [trainingEditing, setTrainingEditing] = useState<TeamTraining | "new" | null>(null);
  const [trainingForm, setTrainingForm] = useState<TrainingForm>({
    title: "", provider: "", externalUrl: "", description: "", instructions: "", locations: [fallbackLocation], roles: "", assignedEmails: "", dueDate: "", recurring: false, renewalMonths: 12, requiresProof: true, verificationRequired: true, baseXp: 50, onTimeBonusXp: 20, lateXp: 25, active: true,
  });
  const [completionTraining, setCompletionTraining] = useState<TeamTraining | null>(null);
  const [completionProof, setCompletionProof] = useState("");
  const [completionNote, setCompletionNote] = useState("");

  if (!canAccessRoute(profile, "/team-store")) {
    return <main className="grid min-h-screen place-items-center bg-[#07131d] p-6"><section className="max-w-lg rounded-3xl bg-white p-8 text-center shadow-2xl"><h1 className="text-2xl font-black">Team Store access is not available</h1><p className="mt-3 text-slate-600">Ask Danielle or Jennifer if your account should be able to use the Team Store.</p><Link href="/" className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 font-black text-white">Return to Hub</Link></section></main>;
  }

  const activeRewards = rewards.filter((reward) => reward.location === activeLocation && reward.active);
  const visibleRewards = activeRewards.filter((reward) => (category === "All Rewards" || reward.category === category) && (!search.trim() || `${reward.name} ${reward.category}`.toLowerCase().includes(search.trim().toLowerCase())));
  const myLedger = ledger.filter((entry) => entry.userId === staffUserId || entry.staffEmail.toLowerCase() === staffEmail);
  const currentXp = myLedger.reduce((sum, entry) => sum + entry.amount, 0);
  const lifetimeXp = myLedger.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthXp = myLedger.filter((entry) => entry.amount > 0 && entry.createdAt.slice(0, 7) === currentMonth).reduce((sum, entry) => sum + entry.amount, 0);
  const level = Math.max(1, Math.floor(lifetimeXp / 500) + 1);
  const myOrders = orders.filter((order) => order.userId === staffUserId || order.staffEmail.toLowerCase() === staffEmail).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const myVerifiedCompletions = completions.filter((item) => (item.userId === staffUserId || item.staffEmail.toLowerCase() === staffEmail) && item.status === "Verified");

  const profileLocations = new Set((profile?.locations ?? []).filter((item) => item !== "All Locations"));
  const assignedTrainings = trainings.filter((training) => {
    if (!training.active) return false;
    const locationMatch = training.locations.length === 0 || training.locations.some((item) => profileLocations.has(item)) || (profile?.locations ?? []).includes("All Locations");
    const roleMatch = training.roles.length === 0 || training.roles.some((role) => role.toLowerCase() === (profile?.role || "").toLowerCase());
    const emailMatch = training.assignedEmails.length === 0 || training.assignedEmails.some((email) => email.toLowerCase() === staffEmail);
    return locationMatch && roleMatch && emailMatch;
  });

  const cartDetails = cart.flatMap((line) => {
    const reward = rewards.find((item) => item.id === line.rewardId);
    return reward ? [{ line, reward }] : [];
  });
  const cartTotal = cartDetails.reduce((sum, item) => sum + item.reward.xpCost * item.line.quantity, 0);
  const totalLocationStock = rewards.filter((item) => item.location === activeLocation && item.active).reduce((sum, item) => sum + item.stock, 0);
  const inStockPercent = activeRewards.length ? Math.round((activeRewards.filter((item) => item.stock > 0).length / activeRewards.length) * 100) : 0;

  const leaderboard = useMemo(() => {
    const totals = new Map<string, { name: string; xp: number }>();
    ledger.filter((entry) => entry.amount > 0).forEach((entry) => {
      const key = entry.userId || entry.staffEmail.toLowerCase();
      const current = totals.get(key) ?? { name: entry.staffName || entry.staffEmail, xp: 0 };
      current.xp += entry.amount;
      totals.set(key, current);
    });
    return [...totals.values()].sort((a, b) => b.xp - a.xp);
  }, [ledger]);

  function chooseLocation(next: TeamStoreLocation) {
    setOwnerLocation(next);
    if (availableLocations.includes(next as LocationKey)) setLocation(next as LocationKey);
    setCart([]);
  }

  function addToCart(reward: TeamReward) {
    if (reward.stock <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.rewardId === reward.id);
      if (!existing) return [...current, { rewardId: reward.id, quantity: 1 }];
      return current.map((line) => line.rewardId === reward.id ? { ...line, quantity: Math.min(reward.stock, line.quantity + 1) } : line);
    });
  }

  function changeCart(rewardId: string, delta: number) {
    const reward = rewards.find((item) => item.id === rewardId);
    if (!reward) return;
    setCart((current) => current.flatMap((line) => {
      if (line.rewardId !== rewardId) return [line];
      const next = Math.max(0, Math.min(reward.stock, line.quantity + delta));
      return next ? [{ ...line, quantity: next }] : [];
    }));
  }

  function redeemRewards() {
    if (!cartDetails.length) return setNotice("Your rewards cart is empty.");
    if (currentXp < cartTotal) return setNotice(`You need ${cartTotal - currentXp} more XP to redeem this cart.`);
    const now = new Date().toISOString();
    const orderId = makeId("reward-order");
    setOrders((current) => [...current, {
      id: orderId,
      userId: staffUserId,
      staffEmail,
      staffName,
      location: activeLocation,
      items: cartDetails.map(({ line, reward }) => ({ rewardId: reward.id, name: reward.name, quantity: line.quantity, xpCost: reward.xpCost })),
      totalXp: cartTotal,
      status: "Requested",
      createdAt: now,
    }]);
    setLedger((current) => [...current, { id: makeId("xp"), userId: staffUserId, staffEmail, staffName, location: activeLocation, amount: -cartTotal, type: "Reward Redemption", reason: `Team Store redemption: ${cartDetails.map(({ line, reward }) => `${reward.name}${line.quantity > 1 ? ` x${line.quantity}` : ""}`).join(", ")}`, createdAt: now, referenceId: orderId }]);
    setRewards((current) => current.map((reward) => {
      const line = cart.find((item) => item.rewardId === reward.id);
      return line ? { ...reward, stock: Math.max(0, reward.stock - line.quantity) } : reward;
    }));
    setCart([]);
    setNotice("Reward request submitted! Your location admin can prepare it for pickup.");
  }

  function openNewReward() {
    setRewardForm({ name: "", category: "Team Gear", xpCost: 100, stock: 0, active: true, emoji: "👕", imageUrl: "", notes: "" });
    setRewardEditing("new");
  }

  function openReward(reward: TeamReward) {
    setRewardForm({ name: reward.name, category: reward.category, xpCost: reward.xpCost, stock: reward.stock, active: reward.active, emoji: reward.emoji, imageUrl: reward.imageUrl ?? "", notes: reward.notes });
    setRewardEditing(reward);
  }

  function saveReward() {
    if (!canManageRewards || !rewardForm.name.trim()) return;
    const record: TeamReward = {
      id: rewardEditing === "new" || !rewardEditing ? makeId("reward") : rewardEditing.id,
      location: activeLocation,
      name: rewardForm.name.trim(),
      category: rewardForm.category,
      xpCost: Math.max(0, rewardForm.xpCost),
      stock: Math.max(0, rewardForm.stock),
      active: rewardForm.active,
      emoji: rewardForm.emoji.trim() || rewardEmoji(rewardForm.category),
      imageUrl: rewardForm.imageUrl.trim() || undefined,
      notes: rewardForm.notes.trim(),
    };
    setRewards((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
    setRewardEditing(null);
  }

  function openNewTraining() {
    setTrainingForm({ title: "", provider: "", externalUrl: "", description: "", instructions: "", locations: [activeLocation], roles: "", assignedEmails: "", dueDate: "", recurring: false, renewalMonths: 12, requiresProof: true, verificationRequired: true, baseXp: 50, onTimeBonusXp: 20, lateXp: 25, active: true });
    setTrainingEditing("new");
  }

  function openTraining(training: TeamTraining) {
    setTrainingForm({
      title: training.title, provider: training.provider, externalUrl: training.externalUrl, description: training.description, instructions: training.instructions, locations: training.locations, roles: training.roles.join(", "), assignedEmails: training.assignedEmails.join(", "), dueDate: training.dueDate, recurring: training.recurring, renewalMonths: training.renewalMonths ?? 12, requiresProof: training.requiresProof, verificationRequired: training.verificationRequired, baseXp: training.baseXp, onTimeBonusXp: training.onTimeBonusXp, lateXp: training.lateXp, active: training.active,
    });
    setTrainingEditing(training);
  }

  function saveTraining() {
    if (!canManageTrainings || !trainingForm.title.trim()) return;
    const record: TeamTraining = {
      id: trainingEditing === "new" || !trainingEditing ? makeId("training") : trainingEditing.id,
      title: trainingForm.title.trim(), provider: trainingForm.provider.trim(), externalUrl: trainingForm.externalUrl.trim(), description: trainingForm.description.trim(), instructions: trainingForm.instructions.trim(), locations: trainingForm.locations,
      roles: trainingForm.roles.split(",").map((item) => item.trim()).filter(Boolean), assignedEmails: trainingForm.assignedEmails.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean), dueDate: trainingForm.dueDate, recurring: trainingForm.recurring, renewalMonths: trainingForm.recurring ? Math.max(1, trainingForm.renewalMonths) : undefined,
      requiresProof: trainingForm.requiresProof, verificationRequired: trainingForm.verificationRequired, baseXp: Math.max(0, trainingForm.baseXp), onTimeBonusXp: Math.max(0, trainingForm.onTimeBonusXp), lateXp: Math.max(0, trainingForm.lateXp), active: trainingForm.active,
      createdBy: trainingEditing === "new" || !trainingEditing ? staffName : trainingEditing.createdBy, createdAt: trainingEditing === "new" || !trainingEditing ? new Date().toISOString() : trainingEditing.createdAt,
    };
    setTrainings((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
    setTrainingEditing(null);
  }

  function addTrainingXp(completion: TeamTrainingCompletion, training: TeamTraining) {
    const alreadyAwarded = ledger.some((entry) => entry.referenceId === completion.id && entry.amount > 0);
    if (alreadyAwarded) return;
    const onTime = isOnTime(training, completion.completedAt);
    const entries: TeamXpLedgerEntry[] = [];
    if (onTime) {
      if (training.baseXp > 0) entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.baseXp, type: "Training XP", reason: `Completed ${training.title}`, createdAt: new Date().toISOString(), referenceId: completion.id });
      if (training.onTimeBonusXp > 0) entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.onTimeBonusXp, type: "On-Time Bonus", reason: `On-time bonus: ${training.title}`, createdAt: new Date().toISOString(), referenceId: completion.id });
    } else if (training.lateXp > 0) {
      entries.push({ id: makeId("xp"), userId: completion.userId, staffEmail: completion.staffEmail, staffName: completion.staffName, location: completion.location, amount: training.lateXp, type: "Late Training XP", reason: `Late completion: ${training.title}`, createdAt: new Date().toISOString(), referenceId: completion.id });
    }
    if (entries.length) setLedger((current) => [...current, ...entries]);
    const awarded = entries.reduce((sum, entry) => sum + entry.amount, 0);
    setCompletions((current) => current.map((item) => item.id === completion.id ? { ...item, xpAwarded: awarded } : item));
  }

  function submitCompletion() {
    if (!completionTraining) return;
    if (completionTraining.requiresProof && !completionProof.trim()) return setNotice("Add the certificate/proof file name or secure proof link before submitting.");
    const existing = completions.find((item) => item.trainingId === completionTraining.id && (item.userId === staffUserId || item.staffEmail.toLowerCase() === staffEmail) && item.status !== "Rejected");
    if (existing) return setNotice("This training already has a completion submitted.");
    const now = new Date().toISOString();
    const completion: TeamTrainingCompletion = {
      id: makeId("training-completion"), trainingId: completionTraining.id, userId: staffUserId, staffEmail, staffName, location: activeLocation, status: completionTraining.verificationRequired ? "Submitted" : "Verified", completedAt: now, proofName: completionProof.trim() || undefined, note: completionNote.trim() || undefined, reviewedAt: completionTraining.verificationRequired ? undefined : now, reviewedBy: completionTraining.verificationRequired ? undefined : "Auto-verified", xpAwarded: 0,
    };
    setCompletions((current) => [...current, completion]);
    if (!completionTraining.verificationRequired) addTrainingXp(completion, completionTraining);
    setCompletionTraining(null);
    setCompletionProof("");
    setCompletionNote("");
    setNotice(completionTraining.verificationRequired ? "Training completion submitted for verification." : "Training completed and XP awarded!");
  }

  function reviewCompletion(completion: TeamTrainingCompletion, approved: boolean) {
    if (!canManageTrainings) return;
    const training = trainings.find((item) => item.id === completion.trainingId);
    if (!training) return;
    const now = new Date().toISOString();
    const updated: TeamTrainingCompletion = { ...completion, status: approved ? "Verified" : "Rejected", reviewedAt: now, reviewedBy: staffName };
    setCompletions((current) => current.map((item) => item.id === completion.id ? updated : item));
    if (approved) addTrainingXp(updated, training);
    setNotice(approved ? `${completion.staffName} verified — XP awarded.` : `${completion.staffName}'s completion was returned for correction.`);
  }

  const primaryNav: Array<{ label: StoreTab; icon: React.ComponentType<{ className?: string }> }> = [
    { label: "Shop", icon: ShoppingCart }, { label: "My XP", icon: Trophy }, { label: "My Rewards", icon: Gift }, { label: "My Orders", icon: Package }, { label: "Training Center", icon: BookOpen }, { label: "Leaderboards", icon: BarChart3 }, { label: "Achievements", icon: Award },
  ];
  const adminNav: Array<{ label: StoreTab; icon: React.ComponentType<{ className?: string }>; show: boolean }> = [
    { label: "Manage Rewards", icon: Store, show: canManageRewards }, { label: "Training Rewards", icon: ClipboardCheck, show: canManageTrainings }, { label: "Reports", icon: BarChart3, show: !isEmployee },
  ];

  return <div className="team-store-shell">
    <aside className="team-store-sidebar">
      <div className="team-store-logo"><Crown /><span className="logo-small">THE</span><strong>HUB</strong><em>TEAM STORE</em><small>REWARDS FOR A<br />BRIGHTER TOMORROW</small></div>
      <nav>
        {primaryNav.map(({ label, icon: Icon }) => <button key={label} onClick={() => setTab(label)} className={tab === label ? "active" : ""}><Icon className="nav-icon" />{label}</button>)}
        <div className="nav-divider" />
        <p className="nav-heading">Admin</p>
        {adminNav.filter((item) => item.show).map(({ label, icon: Icon }) => <button key={label} onClick={() => setTab(label)} className={tab === label ? "active" : ""}><Icon className="nav-icon" />{label}</button>)}
        <Link href={isSystemOwner ? "/settings" : "/"}><Settings className="nav-icon" />Settings</Link>
      </nav>
      <div className="team-store-side-slogan"><span>PEOPLE</span><span>LEARN</span><span>GROW</span><span>BELONG</span><Crown /></div>
    </aside>

    <div className="team-store-main">
      <header className="team-store-topbar">
        <label className="team-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rewards, gift cards, gear, and more..." /></label>
        <label className="team-location"><span>●</span><select value={activeLocation} disabled={storeLocations.length <= 1} onChange={(event) => chooseLocation(event.target.value as TeamStoreLocation)}>{storeLocations.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button className="top-bell" aria-label="Notifications"><Bell /><span>{assignedTrainings.filter((training) => !completions.some((item) => item.trainingId === training.id && (item.userId === staffUserId || item.staffEmail.toLowerCase() === staffEmail) && item.status === "Verified")).length}</span></button>
        <div className="team-user"><div className="team-avatar">{initials(staffName)}</div><div><small>Good day!</small><strong>{staffName}</strong></div></div>
      </header>

      <main className="team-store-content">
        {notice && <div className="team-notice"><span>{notice}</span><button onClick={() => setNotice("")}><X /></button></div>}

        {tab === "Shop" && <>
          <div className="team-shop-grid">
            <section className="team-shop-main">
              <div className="team-hero">
                <div className="hero-lines left-lines">◆ ━━━</div>
                <div className="hero-copy"><span>THE</span><strong>HUB</strong><em>TEAM STORE</em><small>COMPLETE TRAININGS. EARN XP. REDEEM REWARDS.</small><b>GROW SKILLS • EARN REWARDS • CELEBRATE WINS.</b></div>
                <div className="hero-note">INVEST<br />IN YOU<br /><span>MAKE A<br />BIGGER<br />TOMORROW</span><Crown /></div>
              </div>

              <div className="reward-categories">
                <button onClick={() => setCategory("All Rewards")} className={category === "All Rewards" ? "active" : ""}><span>▦</span>All Rewards</button>
                {categories.map((item) => <button key={item} onClick={() => setCategory(item)} className={category === item ? "active" : ""}><span>{rewardEmoji(item)}</span>{item}</button>)}
              </div>

              <div className="section-heading"><div><Crown /><h2>Featured Rewards</h2><p>Turn your training progress into something awesome.</p></div><select aria-label="Sort rewards"><option>Most Popular</option><option>Lowest XP</option><option>Highest XP</option></select></div>

              {visibleRewards.length ? <div className="reward-grid">{visibleRewards.map((reward) => <article key={reward.id} className="reward-card">
                <div className="reward-image">{reward.imageUrl ? <img src={reward.imageUrl} alt="" /> : <span>{reward.emoji || rewardEmoji(reward.category)}</span>}<button aria-label="Favorite reward">♡</button></div>
                <h3>{reward.name}</h3><p className="reward-price">{reward.xpCost} XP</p><small>{reward.stock} available</small>
                <button className="redeem-button" disabled={reward.stock <= 0} onClick={() => addToCart(reward)}>{reward.stock > 0 ? "Redeem with XP" : "Out of Stock"}</button>
              </article>)}</div> : <div className="empty-rewards"><Gift /><h3>No rewards added for {activeLocation} yet</h3><p>{canManageRewards ? "Open Manage Rewards and add the items, gift cards, perks, and gear this location wants to offer." : "Your location admin is still setting up this Team Store."}</p>{canManageRewards && <button onClick={() => { setTab("Manage Rewards"); openNewReward(); }}>Add First Reward</button>}</div>}

              <div className="team-bottom-strip">
                <section className="leader-preview"><div className="mini-title"><Trophy /><div><strong>Top Staff This Month</strong><small>Congratulations to our top learners!</small></div><button onClick={() => setTab("Leaderboards")}>View Full Leaderboard →</button></div><div className="leader-row">{leaderboard.slice(0, 5).map((person, index) => <div key={`${person.name}-${index}`}><b>{index + 1}</b><span>{initials(person.name)}</span><p>{person.name}<small>{person.xp.toLocaleString()} XP</small></p></div>)}{leaderboard.length === 0 && <p className="no-leaders">Training XP will populate the leaderboard as staff complete courses.</p>}</div></section>
                {canManageRewards && <button className="location-manage-card" onClick={() => setTab("Manage Rewards")}><Settings /><span><strong>Location Reward Management</strong><small>Each location can customize their own reward options, staff perks, and inventory.</small></span><b>Manage Location Rewards →</b></button>}
              </div>
            </section>

            <aside className="team-shop-side">
              <section className="xp-card"><div className="xp-head"><Coins /><div><small>XP Balance</small><strong>{currentXp.toLocaleString()} XP</strong><p>Earned through completed trainings.</p></div><em>SAME<br />PEOPLE<br /><span>BIGGER<br />POSSIBILITIES</span></em></div><button onClick={() => setTab("Training Center")}>View Assigned Trainings →</button><div className="xp-mini"><div><BookOpen /><strong>{myVerifiedCompletions.length}</strong><span>Trainings<br />Completed</span></div><div><BarChart3 /><strong>Level {level}</strong><span>Current<br />Level</span></div><div><Zap /><strong>{monthXp} XP</strong><span>This Month’s<br />XP</span></div></div></section>

              <section className="reward-cart"><div className="cart-title"><ShoppingCart /><strong>Your Rewards Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)})</strong><button onClick={() => setCart([])}>Clear All</button></div><div className="cart-lines">{cartDetails.map(({ line, reward }) => <div key={reward.id} className="cart-line"><div className="cart-thumb">{reward.imageUrl ? <img src={reward.imageUrl} alt="" /> : reward.emoji}</div><div className="cart-name"><strong>{reward.name}</strong><span>{reward.xpCost} XP</span></div><div className="cart-step"><button onClick={() => changeCart(reward.id, -1)}>−</button><span>{line.quantity}</span><button onClick={() => changeCart(reward.id, 1)}>+</button></div></div>)}{cartDetails.length === 0 && <p className="empty-cart">Add rewards to start your cart.</p>}</div><div className="cart-total"><strong>Total</strong><b>{cartTotal} XP</b></div><button className="cart-redeem" onClick={redeemRewards}>Redeem Rewards →</button></section>

              <section className="earn-card"><div className="earn-title"><Zap /><div><strong>How to Earn XP</strong><small>COMPLETE TRAININGS. GO FURTHER.</small></div><em>LEARNING<br />FUELS<br />IMPACT</em></div><p>Follow these steps to earn XP:</p><ul><li><CheckCircle2 /><span><strong>Complete required trainings</strong><small>Finish assigned courses and learning paths.</small></span></li><li><CheckCircle2 /><span><strong>Finish before due date</strong><small>Earn bonus XP for on-time completion.</small></span></li><li><Upload /><span><strong>Submit certificates / proof</strong><small>XP is awarded after verification when required.</small></span></li><li><ClipboardCheck /><span><strong>Complete recurring renewals</strong><small>Keep required certifications current.</small></span></li></ul></section>

              <section className="location-stats"><div className="location-stat-title"><Home /><div><strong>This Location’s Rewards</strong><small>{activeLocation}</small></div></div><div><span><b>{activeRewards.length}</b>Rewards</span><span><b>{totalLocationStock}</b>Total Items</span><span><b>{inStockPercent}%</b>In Stock</span></div>{canManageRewards && <button onClick={() => setTab("Manage Rewards")}>Manage This Location’s Rewards →</button>}</section>
            </aside>
          </div>
        </>}

        {tab === "My XP" && <ContentPanel title="My XP" subtitle="Your spendable balance, lifetime XP, and full earning history."><div className="metric-grid"><Metric label="Spendable XP" value={`${currentXp.toLocaleString()} XP`} /><Metric label="Lifetime XP" value={`${lifetimeXp.toLocaleString()} XP`} /><Metric label="Current Level" value={`Level ${level}`} /><Metric label="This Month" value={`${monthXp} XP`} /></div><LedgerList entries={myLedger} /></ContentPanel>}

        {tab === "My Rewards" && <ContentPanel title="My Rewards" subtitle="Rewards you have requested and received."><OrderList orders={myOrders} /></ContentPanel>}
        {tab === "My Orders" && <ContentPanel title="My Orders" subtitle="Track Team Store reward requests and pickup status."><OrderList orders={myOrders} /></ContentPanel>}

        {tab === "Training Center" && <ContentPanel title="Training Center" subtitle="Complete assigned trainings, submit proof when required, and earn XP.">
          {assignedTrainings.length ? <div className="training-grid">{assignedTrainings.map((training) => {
            const completion = completions.find((item) => item.trainingId === training.id && (item.userId === staffUserId || item.staffEmail.toLowerCase() === staffEmail) && item.status !== "Rejected");
            const maxOnTime = training.baseXp + training.onTimeBonusXp;
            return <article className="training-card" key={training.id}><div className="training-status-row"><span className={`status-pill ${completion?.status?.toLowerCase() ?? "assigned"}`}>{completion?.status ?? "Assigned"}</span><strong>Up to {maxOnTime} XP</strong></div><h3>{training.title}</h3><p className="training-provider">{training.provider || "TCS Training"}</p><p>{training.description || training.instructions || "Complete this required training."}</p><div className="training-meta"><span>Due: {training.dueDate ? formatDate(training.dueDate) : "No due date"}</span>{training.requiresProof && <span>Proof required</span>}{training.recurring && <span>Renews every {training.renewalMonths ?? 12} months</span>}</div><div className="training-actions">{training.externalUrl && <a href={training.externalUrl} target="_blank" rel="noreferrer">Open Training <ExternalLink /></a>}{!completion && <button onClick={() => setCompletionTraining(training)}>Submit Completion</button>}{completion?.status === "Submitted" && <span className="waiting">Waiting for verification</span>}{completion?.status === "Verified" && <span className="verified">✓ {completion.xpAwarded} XP awarded</span>}</div></article>;
          })}</div> : <EmptyState icon={<BookOpen />} title="No assigned trainings right now" text="New trainings will appear here when Danielle, Jennifer, or Heather assigns them." />}
        </ContentPanel>}

        {tab === "Leaderboards" && <ContentPanel title="XP Leaderboard" subtitle="Celebrate learning progress across the TCS team."><div className="full-leaderboard">{leaderboard.map((person, index) => <div key={`${person.name}-${index}`}><b>#{index + 1}</b><span>{initials(person.name)}</span><strong>{person.name}</strong><em>{person.xp.toLocaleString()} XP</em></div>)}{leaderboard.length === 0 && <EmptyState icon={<Trophy />} title="Leaderboard starts with the first verified training" text="XP earned from completed trainings will appear here." />}</div></ContentPanel>}

        {tab === "Achievements" && <ContentPanel title="Achievements" subtitle="Milestones that grow as you complete trainings and build skills."><div className="achievement-grid"><Achievement icon="🌱" title="Getting Started" unlocked={myVerifiedCompletions.length >= 1} text="Complete your first verified training." /><Achievement icon="⚡" title="XP Builder" unlocked={lifetimeXp >= 250} text="Earn 250 lifetime XP." /><Achievement icon="🏆" title="Learning Leader" unlocked={myVerifiedCompletions.length >= 5} text="Complete 5 verified trainings." /><Achievement icon="👑" title="Hub Champion" unlocked={lifetimeXp >= 1000} text="Earn 1,000 lifetime XP." /></div></ContentPanel>}

        {tab === "Manage Rewards" && canManageRewards && <ContentPanel title={`${activeLocation} Reward Management`} subtitle="Each location chooses its own rewards, XP prices, availability, and inventory." action={<button className="primary-action" onClick={openNewReward}><Plus />Add Reward</button>}>
          {rewards.filter((item) => item.location === activeLocation).length ? <div className="admin-table"><div className="admin-row admin-head"><span>Reward</span><span>Category</span><span>XP</span><span>Stock</span><span>Status</span></div>{rewards.filter((item) => item.location === activeLocation).map((reward) => <button key={reward.id} className="admin-row" onClick={() => openReward(reward)}><span><b>{reward.emoji}</b>{reward.name}</span><span>{reward.category}</span><span>{reward.xpCost}</span><span>{reward.stock}</span><span>{reward.active ? "Active" : "Hidden"}</span></button>)}</div> : <EmptyState icon={<Gift />} title="No location rewards yet" text="Add gift cards, team gear, self-care items, office essentials, or recognition rewards." />}
          <h3 className="subsection-title">Reward Requests</h3><div className="admin-table">{orders.filter((item) => item.location === activeLocation).length ? orders.filter((item) => item.location === activeLocation).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((order) => <div className="order-admin" key={order.id}><div><strong>{order.staffName}</strong><span>{order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}</span><small>{formatDate(order.createdAt)} • {order.totalXp} XP</small></div><select value={order.status} onChange={(event) => setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: event.target.value as TeamRewardOrder["status"], ...(event.target.value === "Fulfilled" ? { fulfilledAt: new Date().toISOString(), fulfilledBy: staffName } : {}) } : item))}><option>Requested</option><option>Ready</option><option>Fulfilled</option><option>Cancelled</option></select></div>) : <p className="empty-row">No reward requests for this location yet.</p>}</div>
        </ContentPanel>}

        {tab === "Training Rewards" && canManageTrainings && <ContentPanel title="Training Rewards" subtitle="Create training assignments and control exactly how much XP staff earn." action={<button className="primary-action" onClick={openNewTraining}><Plus />Add Training</button>}>
          {trainings.length ? <div className="training-admin-grid">{trainings.map((training) => <button key={training.id} onClick={() => openTraining(training)}><span className={training.active ? "live-dot" : "paused-dot"} /><div><strong>{training.title}</strong><small>{training.locations.join(", ") || "All locations"} • Base {training.baseXp} XP • On-time +{training.onTimeBonusXp}</small></div><ChevronRight /></button>)}</div> : <EmptyState icon={<ClipboardCheck />} title="No training assignments yet" text="Create the first training and set its provider, due date, proof rules, assignment audience, and XP rewards." />}
          <h3 className="subsection-title">Pending Verification</h3><div className="verification-list">{completions.filter((item) => item.status === "Submitted").length ? completions.filter((item) => item.status === "Submitted").map((completion) => { const training = trainings.find((item) => item.id === completion.trainingId); return <div key={completion.id}><div><strong>{completion.staffName}</strong><span>{training?.title ?? "Training"}</span><small>{completion.proofName || "No proof name"} • submitted {formatDate(completion.completedAt)}</small>{completion.note && <p>{completion.note}</p>}</div><div className="verify-actions"><button onClick={() => reviewCompletion(completion, true)}>Verify + Award XP</button><button onClick={() => reviewCompletion(completion, false)}>Return</button></div></div>; }) : <p className="empty-row">No training completions are waiting for verification.</p>}</div>
        </ContentPanel>}

        {tab === "Reports" && !isEmployee && <ContentPanel title="Team Store Reports" subtitle="A quick view of XP, training completion, and reward redemption activity."><div className="metric-grid"><Metric label="XP Earned" value={`${ledger.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0).toLocaleString()} XP`} /><Metric label="Verified Trainings" value={String(completions.filter((item) => item.status === "Verified").length)} /><Metric label="Reward Requests" value={String(orders.length)} /><Metric label="Pending Verification" value={String(completions.filter((item) => item.status === "Submitted").length)} /></div></ContentPanel>}
      </main>
    </div>

    {rewardEditing && canManageRewards && <Modal close={() => setRewardEditing(null)}><h2>{rewardEditing === "new" ? "Add Team Store Reward" : "Edit Reward"}</h2><p>This reward will appear only in the <strong>{activeLocation}</strong> Team Store.</p><div className="form-grid"><Field label="Reward name"><input value={rewardForm.name} onChange={(event) => setRewardForm((current) => ({ ...current, name: event.target.value }))} /></Field><Field label="Category"><select value={rewardForm.category} onChange={(event) => setRewardForm((current) => ({ ...current, category: event.target.value as TeamRewardCategory, emoji: rewardEmoji(event.target.value as TeamRewardCategory) }))}>{categories.map((item) => <option key={item}>{item}</option>)}</select></Field><Field label="XP price"><input type="number" min="0" value={rewardForm.xpCost} onChange={(event) => setRewardForm((current) => ({ ...current, xpCost: Number(event.target.value) }))} /></Field><Field label="Inventory"><input type="number" min="0" value={rewardForm.stock} onChange={(event) => setRewardForm((current) => ({ ...current, stock: Number(event.target.value) }))} /></Field><Field label="Emoji / icon"><input value={rewardForm.emoji} onChange={(event) => setRewardForm((current) => ({ ...current, emoji: event.target.value }))} /></Field><Field label="Product image URL (optional)"><input value={rewardForm.imageUrl} onChange={(event) => setRewardForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="https://..." /></Field><label className="check-field"><input type="checkbox" checked={rewardForm.active} onChange={(event) => setRewardForm((current) => ({ ...current, active: event.target.checked }))} /> Show in store</label><label className="full-field">Notes<textarea value={rewardForm.notes} onChange={(event) => setRewardForm((current) => ({ ...current, notes: event.target.value }))} /></label></div><button className="modal-save" onClick={saveReward}>Save {activeLocation} Reward</button></Modal>}

    {trainingEditing && canManageTrainings && <Modal close={() => setTrainingEditing(null)} wide><h2>{trainingEditing === "new" ? "Create Training Assignment" : "Edit Training Assignment"}</h2><p>Training XP is awarded only after the required completion/verification rules are satisfied.</p><div className="form-grid"><Field label="Training title"><input value={trainingForm.title} onChange={(event) => setTrainingForm((current) => ({ ...current, title: event.target.value }))} /></Field><Field label="Provider / company"><input value={trainingForm.provider} onChange={(event) => setTrainingForm((current) => ({ ...current, provider: event.target.value }))} /></Field><Field label="External training link"><input value={trainingForm.externalUrl} onChange={(event) => setTrainingForm((current) => ({ ...current, externalUrl: event.target.value }))} placeholder="https://..." /></Field><Field label="Due date"><input type="date" value={trainingForm.dueDate} onChange={(event) => setTrainingForm((current) => ({ ...current, dueDate: event.target.value }))} /></Field><label className="full-field">Description<textarea value={trainingForm.description} onChange={(event) => setTrainingForm((current) => ({ ...current, description: event.target.value }))} /></label><label className="full-field">Instructions<textarea value={trainingForm.instructions} onChange={(event) => setTrainingForm((current) => ({ ...current, instructions: event.target.value }))} /></label><div className="full-field"><span className="field-label">Assigned locations</span><div className="location-checks">{storeLocations.map((item) => <label key={item}><input type="checkbox" checked={trainingForm.locations.includes(item)} onChange={(event) => setTrainingForm((current) => ({ ...current, locations: event.target.checked ? [...current.locations, item] : current.locations.filter((value) => value !== item) }))} />{item}</label>)}</div></div><Field label="Required roles (comma separated)"><input value={trainingForm.roles} onChange={(event) => setTrainingForm((current) => ({ ...current, roles: event.target.value }))} placeholder="Employee, Location Licensee" /></Field><Field label="Specific staff emails (optional)"><input value={trainingForm.assignedEmails} onChange={(event) => setTrainingForm((current) => ({ ...current, assignedEmails: event.target.value }))} placeholder="name@tcs.org, other@tcs.org" /></Field><Field label="Base XP"><input type="number" min="0" value={trainingForm.baseXp} onChange={(event) => setTrainingForm((current) => ({ ...current, baseXp: Number(event.target.value) }))} /></Field><Field label="On-time bonus XP"><input type="number" min="0" value={trainingForm.onTimeBonusXp} onChange={(event) => setTrainingForm((current) => ({ ...current, onTimeBonusXp: Number(event.target.value) }))} /></Field><Field label="Late completion XP"><input type="number" min="0" value={trainingForm.lateXp} onChange={(event) => setTrainingForm((current) => ({ ...current, lateXp: Number(event.target.value) }))} /></Field><Field label="Renewal interval (months)"><input type="number" min="1" disabled={!trainingForm.recurring} value={trainingForm.renewalMonths} onChange={(event) => setTrainingForm((current) => ({ ...current, renewalMonths: Number(event.target.value) }))} /></Field><label className="check-field"><input type="checkbox" checked={trainingForm.requiresProof} onChange={(event) => setTrainingForm((current) => ({ ...current, requiresProof: event.target.checked }))} /> Certificate/proof required</label><label className="check-field"><input type="checkbox" checked={trainingForm.verificationRequired} onChange={(event) => setTrainingForm((current) => ({ ...current, verificationRequired: event.target.checked }))} /> Verification required before XP</label><label className="check-field"><input type="checkbox" checked={trainingForm.recurring} onChange={(event) => setTrainingForm((current) => ({ ...current, recurring: event.target.checked }))} /> Recurring / renewal training</label><label className="check-field"><input type="checkbox" checked={trainingForm.active} onChange={(event) => setTrainingForm((current) => ({ ...current, active: event.target.checked }))} /> Active assignment</label></div><button className="modal-save" onClick={saveTraining}>Save Training Assignment</button></Modal>}

    {completionTraining && <Modal close={() => setCompletionTraining(null)}><h2>Submit Training Completion</h2><p><strong>{completionTraining.title}</strong></p><div className="form-grid one-col">{completionTraining.requiresProof && <Field label="Certificate / proof file name or secure link"><input value={completionProof} onChange={(event) => setCompletionProof(event.target.value)} placeholder="certificate.pdf or secure link" /></Field>}<label className="full-field">Completion note (optional)<textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} placeholder="Anything the reviewer should know" /></label></div><div className="xp-preview">On-time completion can earn <strong>{completionTraining.baseXp + completionTraining.onTimeBonusXp} XP</strong>. Late completion earns <strong>{completionTraining.lateXp} XP</strong>.</div><button className="modal-save" onClick={submitCompletion}>Submit Completion</button></Modal>}
  </div>;
}

function ContentPanel({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="content-panel"><header><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="team-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function LedgerList({ entries }: { entries: TeamXpLedgerEntry[] }) {
  return <div className="ledger-list"><h3>XP Activity</h3>{entries.length ? entries.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => <div key={entry.id}><span className={entry.amount >= 0 ? "positive" : "negative"}>{entry.amount >= 0 ? "+" : ""}{entry.amount} XP</span><div><strong>{entry.reason}</strong><small>{entry.type} • {formatDate(entry.createdAt)}</small></div></div>) : <p className="empty-row">Complete trainings to start earning XP.</p>}</div>;
}

function OrderList({ orders }: { orders: TeamRewardOrder[] }) {
  return <div className="order-list">{orders.length ? orders.map((order) => <article key={order.id}><div><strong>{order.items.map((item) => `${item.name}${item.quantity > 1 ? ` x${item.quantity}` : ""}`).join(", ")}</strong><small>{formatDate(order.createdAt)} • {order.location}</small></div><div><span>{order.status}</span><b>{order.totalXp} XP</b></div></article>) : <EmptyState icon={<Gift />} title="No rewards redeemed yet" text="Your Team Store redemptions will appear here." />}</div>;
}

function Achievement({ icon, title, text, unlocked }: { icon: string; title: string; text: string; unlocked: boolean }) {
  return <article className={`achievement ${unlocked ? "unlocked" : "locked"}`}><span>{icon}</span><h3>{title}</h3><p>{text}</p><b>{unlocked ? "Unlocked" : "Locked"}</b></article>;
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="empty-state"><div>{icon}</div><h3>{title}</h3><p>{text}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Modal({ close, wide, children }: { close: () => void; wide?: boolean; children: React.ReactNode }) {
  return <div className="team-modal-backdrop"><div className={`team-modal ${wide ? "wide" : ""}`}><button className="modal-close" onClick={close}><X /></button>{children}</div></div>;
}
