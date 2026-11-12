"use client";

import { requestHubTransition } from "@/lib/unsaved-transitions";
import { useAuth } from "@/components/providers/AuthProvider";
import { careLocations, locationThemes, normalizeLocation, selectableLocations, type LocationKey } from "@/lib/location-config";
import { migrateActiveLocation } from "@/lib/storage-migrations";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type LocationContextValue = {
  location: LocationKey;
  setLocation: (location: LocationKey) => void;
  availableLocations: LocationKey[];
  locationLocked: boolean;
  mainLocation:LocationKey|null;
  theme: (typeof locationThemes)[LocationKey];
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { profile, isLocationRestricted } = useAuth();
  const mainLocation=isLocationRestricted&&profile?.primary_location?normalizeLocation(profile.primary_location):null;
  const workDate=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const storageKey=isLocationRestricted?`tcs-backup-location:${profile?.user_id||"pending"}:${workDate}`:"tcs-active-location";
  const [location, setLocationState] = useState<LocationKey>("All Locations");

  const availableLocations = useMemo<LocationKey[]>(() => {
    if (!isLocationRestricted) return selectableLocations;

    const normalized = (profile?.locations ?? [])
      .flatMap((item) => {
        if (item === "All Locations") return careLocations;
        const value = normalizeLocation(item);
        return value === "All Locations" ? [] : [value];
      })
      .filter((item, index, values) => values.indexOf(item) === index);

    return normalized.length ? normalized : ["Halcom"];
  }, [isLocationRestricted, profile?.locations]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const stored = (isLocationRestricted?window.sessionStorage:window.localStorage).getItem(storageKey);
        const saved = migrateActiveLocation(stored) as LocationKey | null;
        const next = saved && availableLocations.includes(saved) ? saved : mainLocation&&availableLocations.includes(mainLocation)?mainLocation:availableLocations[0];
        setLocationState(next);
        (isLocationRestricted?window.sessionStorage:window.localStorage).setItem(storageKey, next);
      } catch {
        setLocationState(mainLocation&&availableLocations.includes(mainLocation)?mainLocation:availableLocations[0]);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [availableLocations,isLocationRestricted,mainLocation,storageKey]);

  const setLocation = useCallback((next: LocationKey) => {
    if (!availableLocations.includes(next)) return;
    requestHubTransition(()=>{
    setLocationState(next);
    try {
      (isLocationRestricted?window.sessionStorage:window.localStorage).setItem(storageKey, next);
    } catch {
      // The selector still works for the current session.
    }
    });
  }, [availableLocations,isLocationRestricted,storageKey]);

  const value = useMemo(() => ({
    location,
    setLocation,
    availableLocations,
    locationLocked: isLocationRestricted,
    mainLocation,
    theme: locationThemes[location],
  }), [availableLocations, isLocationRestricted, location, setLocation,mainLocation]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useHubLocation() {
  const value = useContext(LocationContext);
  if (!value) throw new Error("useHubLocation must be used inside LocationProvider");
  return value;
}
