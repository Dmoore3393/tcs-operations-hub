"use client";

import "./store.css";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import type { LocationKey } from "@/lib/location-config";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Coins,
  Crown,
  Home,
  Package,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Trophy,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "GS";
}

function clickPageTab(label: string) {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".student-store-page button"));
  const target = buttons.find((button) => (button.textContent ?? "").trim().startsWith(label));
  target?.click();
  document.querySelector(".student-store-page")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function syncPageSearch(value: string) {
  const input = document.querySelector<HTMLInputElement>('.student-store-page input[placeholder^="Search snacks"]');
  if (!input) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export default function StudentStoreLayout({ children }: { children: React.ReactNode }) {
  const { profile, isEmployee } = useAuth();
  const { location, setLocation, availableLocations } = useHubLocation();
  const [search, setSearch] = useState("");
  const storeLocations = useMemo(() => availableLocations.filter((item) => item !== "All Locations"), [availableLocations]);
  const selectedLocation = location === "All Locations" ? storeLocations[0] ?? "Halcom" : location;
  const displayName = profile?.full_name || "TCS Staff";

  function changeLocation(next: string) {
    setLocation(next as LocationKey);
  }

  const primaryNav = [
    { label: "Shop", icon: ShoppingCart, tab: "Shop" },
    { label: "My Gator Cash", icon: Coins, tab: "Gator Profiles" },
    { label: "My Orders", icon: Package, tab: "Gator Profiles" },
    { label: "Earn Gator Cash", icon: Trophy, tab: "Jobs & Pay" },
    { label: "Leaderboards", icon: BarChart3, tab: "Gator Profiles" },
    { label: "School Info", icon: Home, tab: "Gator Profiles" },
  ];

  const adminNav = [
    { label: "Location Inventory", icon: Package, tab: "Location Inventory" },
    { label: "Manage Products", icon: Store, tab: "Location Inventory" },
    { label: "Job Applications", icon: BriefcaseBusiness, tab: "Job Applications" },
    { label: "Jobs & Pay", icon: Trophy, tab: "Jobs & Pay" },
  ];

  return (
    <div className="student-store-shell">
      <aside className="student-store-sidebar">
        <div className="store-logo-block">
          <Crown className="store-crown" strokeWidth={2.2} />
          <div className="store-logo-the">THE</div>
          <div className="store-logo-hub">HUB</div>
          <div className="store-logo-sub">STUDENT STORE</div>
        </div>

        <nav className="store-sidebar-nav" aria-label="Student Store">
          {primaryNav.map(({ label, icon: Icon, tab }, index) => (
            <button key={label} type="button" className={`store-side-button ${index === 0 ? "is-active" : ""}`} onClick={() => clickPageTab(tab)}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}

          <div className="store-side-divider" />
          <p className="store-side-heading">Staff / Admin</p>
          {adminNav.map(({ label, icon: Icon, tab }) => (
            <button key={label} type="button" className="store-side-button" onClick={() => clickPageTab(tab)}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
          {!isEmployee && (
            <Link href="/reports" className="store-side-button">
              <BarChart3 />
              <span>Reports</span>
            </Link>
          )}
          <Link href={isEmployee ? "/" : "/settings"} className="store-side-button">
            <Settings />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="store-sidebar-slogan">
          <span>GOOD PEOPLE</span>
          <span>BRIGHT IDEAS</span>
          <span>BIGGER TOMORROWS</span>
          <Crown />
        </div>
      </aside>

      <div className="student-store-workspace">
        <header className="student-store-topbar">
          <label className="store-global-search">
            <Search />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                syncPageSearch(event.target.value);
              }}
              placeholder="Search for snacks, supplies, spirit wear and more..."
            />
          </label>

          <label className="store-location-picker">
            <span className="store-location-dot">●</span>
            <select value={selectedLocation} disabled={storeLocations.length <= 1} onChange={(event) => changeLocation(event.target.value)}>
              {storeLocations.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>

          <button type="button" className="store-bell" aria-label="Notifications">
            <Bell />
            <span>3</span>
          </button>

          <div className="store-user">
            <div className="store-avatar">{initials(displayName)}</div>
            <div>
              <span>Good day!</span>
              <strong>{displayName}</strong>
            </div>
          </div>
        </header>

        <div className="student-store-page">{children}</div>
      </div>
    </div>
  );
}
