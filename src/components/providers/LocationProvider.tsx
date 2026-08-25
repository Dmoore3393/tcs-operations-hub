"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { careLocations, locationThemes, normalizeLocation, selectableLocations, type LocationKey } from "@/lib/location-config";
import { migrateActiveLocation } from "@/lib/storage-migrations";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type LocationContextValue = {
  location: LocationKey;
  setLocation: (location: LocationKey) => void;
  availableLocations: LocationKey[];
  locationLocked: boolean;
  theme: (typeof locationThemes)[LocationKey];
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const { profile, isLocationRestricted } = useAuth();
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
        const stored = window.localStorage.getItem("tcs-active-location");
        const saved = migrateActiveLocation(stored) as LocationKey | null;
        const next = saved && availableLocations.includes(saved) ? saved : availableLocations[0];
        setLocationState(next);
        window.localStorage.setItem("tcs-active-location", next);
      } catch {
        setLocationState(availableLocations[0]);
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [availableLocations]);

  const setLocation = useCallback((next: LocationKey) => {
    if (!availableLocations.includes(next)) return;
    setLocationState(next);
    try {
      window.localStorage.setItem("tcs-active-location", next);
    } catch {
      // The selector still works for the current session.
    }
  }, [availableLocations]);

  const value = useMemo(() => ({
    location,
    setLocation,
    availableLocations,
    locationLocked: isLocationRestricted,
    theme: locationThemes[location],
  }), [availableLocations, isLocationRestricted, location, setLocation]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useHubLocation() {
  const value = useContext(LocationContext);
  if (!value) throw new Error("useHubLocation must be used inside LocationProvider");
  return value;
}
