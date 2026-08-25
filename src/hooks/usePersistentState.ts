"use client";

import { canReadStateKey, canWriteStateKey, useAuth } from "@/components/providers/AuthProvider";
import { getProductionInitialValue } from "@/lib/production-defaults";
import { relationalConfigForKey, sortRelationalRecords } from "@/lib/relational-state";
import { announceHubSync } from "@/lib/sync-events";
import { supabase } from "@/lib/supabase/client";
import { migratePersistentValue } from "@/lib/storage-migrations";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { dayNames } from "@/lib/location-config";

type HubStateRow = {
  state_key: string;
  state_value: unknown;
  version: number;
  updated_by: string | null;
  updated_at: string;
};

type RelationalRow = {
  legacy_id: string;
  record_data: unknown;
  updated_at: string;
  is_primary?: boolean;
};

type SaveHubStateResult = HubStateRow | HubStateRow[];

function normalizeSavedRow(value: SaveHubStateResult) {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeScheduleFragments(rows: RelationalRow[]) {
  const groups = new Map<string, RelationalRow[]>();

  rows.forEach((row) => {
    if (!isRecord(row.record_data)) return;
    const childId = row.record_data.childId;
    if (typeof childId !== "string" && typeof childId !== "number") return;
    const key = String(childId);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups.values()].map((fragments) => {
    const primary = fragments.find((row) => row.is_primary && isRecord(row.record_data)) ?? fragments[0];
    const base = isRecord(primary.record_data) ? primary.record_data : {};
    const mergedDays: Record<string, unknown> = {};

    dayNames.forEach((dayName) => {
      const dayFragments = fragments
        .map((row) => isRecord(row.record_data) && isRecord(row.record_data.days)
          ? row.record_data.days[dayName]
          : null)
        .filter(isRecord);

      const blockMap = new Map<string, Record<string, unknown>>();
      const notes = new Set<string>();
      dayFragments.forEach((day) => {
        const blocks = Array.isArray(day.blocks) ? day.blocks : [];
        blocks.filter(isRecord).forEach((block) => {
          const key = String(block.id ?? `${block.location ?? ""}-${block.start ?? ""}-${block.end ?? ""}`);
          blockMap.set(key, block);
        });
        if (typeof day.note === "string" && day.note.trim()) notes.add(day.note.trim());
      });

      const blocks = [...blockMap.values()].sort((left, right) =>
        String(left.start ?? "").localeCompare(String(right.start ?? "")) ||
        String(left.end ?? "").localeCompare(String(right.end ?? "")),
      );
      mergedDays[dayName] = {
        noCare: blocks.length === 0,
        blocks,
        note: [...notes].join(" • "),
      };
    });

    return { ...base, days: mergedDays };
  });
}

function relationalValue<T>(key: string, rows: RelationalRow[] | null | undefined): T {
  const safeRows = rows ?? [];
  const records = key === "tcs-child-schedules-v2"
    ? mergeScheduleFragments(safeRows)
    : safeRows.map((row) => row.record_data).filter((record) => record != null);
  return sortRelationalRecords(records) as T;
}

export function usePersistentState<T>(key: string, initialValue: T) {
  const { user, profile } = useAuth();
  const config = useMemo(() => relationalConfigForKey(key), [key]);
  const hasStateAccess = canReadStateKey(profile, key);
  const canWrite = canWriteStateKey(profile, key);
  const [productionInitial] = useState<T>(() => getProductionInitialValue(key, initialValue));
  const [value, setValue] = useState<T>(productionInitial);
  const [hydrated, setHydrated] = useState(() => !hasStateAccess);
  const versionRef = useRef(0);
  const skipNextSaveRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const relationalRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Normalized relational collections. Every record is its own row and RLS is
  // evaluated against that row's location_id.
  useEffect(() => {
    if (!config || !supabase || !user || !profile || !hasStateAccess) return;
    let active = true;

    async function loadRelational(message = `Loading ${config!.label}…`) {
      announceHubSync({ state: "loading", key, message });
      const { data, error } = await supabase!
        .from(config!.table)
        .select("*")
        .order("created_at", { ascending: true });

      if (!active) return;
      if (error) {
        announceHubSync({ state: "error", key, message: `Could not load ${config!.label}: ${error.message}` });
        setHydrated(true);
        return;
      }

      const rows = (data ?? []) as unknown as RelationalRow[];
      if (rows.length) {
        skipNextSaveRef.current = true;
        setValue(relationalValue<T>(key, rows));
        setHydrated(true);
        announceHubSync({ state: "saved", key, message: `${config!.label} are current` });
        return;
      }

      if (canWrite && Array.isArray(productionInitial) && productionInitial.length > 0) {
        const { error: seedError } = await supabase!.rpc("sync_tcs_collection", {
          p_collection_key: key,
          p_items: productionInitial,
        });
        if (seedError) {
          announceHubSync({ state: "error", key, message: `Could not initialize ${config!.label}: ${seedError.message}` });
        } else {
          skipNextSaveRef.current = true;
          setValue(productionInitial);
          announceHubSync({ state: "saved", key, message: `${config!.label} initialized` });
        }
      } else {
        skipNextSaveRef.current = true;
        setValue(productionInitial);
        announceHubSync({ state: "saved", key, message: `No ${config!.label} yet` });
      }
      setHydrated(true);
    }

    void loadRelational();

    const channel = supabase
      .channel(`relational-${config.table}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: config.table },
        () => {
          if (relationalRefreshTimerRef.current) clearTimeout(relationalRefreshTimerRef.current);
          relationalRefreshTimerRef.current = setTimeout(() => {
            void loadRelational(`Refreshing ${config.label}…`);
          }, 180);
        },
      )
      .subscribe();

    return () => {
      active = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (relationalRefreshTimerRef.current) clearTimeout(relationalRefreshTimerRef.current);
      void supabase?.removeChannel(channel);
    };
  }, [canWrite, config, hasStateAccess, key, productionInitial, profile, user]);

  // Legacy organization-level configuration that is not location-owned stays
  // in hub_state. Sensitive operational data no longer uses this path.
  useEffect(() => {
    if (config || !supabase || !user || !profile || !hasStateAccess) return;
    let active = true;

    async function load() {
      announceHubSync({ state: "loading", key, message: "Loading shared data…" });
      const { data, error } = await supabase!
        .from("hub_state")
        .select("state_key,state_value,version,updated_by,updated_at")
        .eq("state_key", key)
        .maybeSingle();

      if (!active) return;
      if (error) {
        announceHubSync({ state: "error", key, message: `Could not load ${key}: ${error.message}` });
        setHydrated(true);
        return;
      }

      if (data) {
        const row = data as HubStateRow;
        versionRef.current = row.version;
        skipNextSaveRef.current = true;
        setValue(migratePersistentValue(key, row.state_value as T));
        setHydrated(true);
        announceHubSync({ state: "saved", key, message: "Shared data is current" });
        return;
      }

      if (!canWrite) {
        setValue(productionInitial);
        setHydrated(true);
        announceHubSync({ state: "saved", key, message: "Owner-managed defaults loaded" });
        return;
      }

      const { data: created, error: createError } = await supabase!.rpc("save_hub_state", {
        p_state_key: key,
        p_state_value: productionInitial,
        p_expected_version: 0,
      });

      if (!active) return;
      if (createError) {
        announceHubSync({ state: "error", key, message: `Could not initialize ${key}: ${createError.message}` });
        setHydrated(true);
        return;
      }

      const createdRow = normalizeSavedRow(created as SaveHubStateResult);
      if (!createdRow) {
        announceHubSync({ state: "error", key, message: `No data was returned while initializing ${key}.` });
        setHydrated(true);
        return;
      }
      versionRef.current = createdRow.version;
      skipNextSaveRef.current = true;
      setValue(migratePersistentValue(key, createdRow.state_value as T));
      setHydrated(true);
      announceHubSync({ state: "saved", key, message: "Shared data initialized" });
    }

    void load();

    const channel = supabase
      .channel(`hub-state-${key}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hub_state", filter: `state_key=eq.${key}` },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const row = payload.new as unknown as HubStateRow;
          if (!row?.state_key || row.state_key !== key) return;
          if (row.updated_by === user.id && row.version <= versionRef.current) return;
          versionRef.current = row.version;
          skipNextSaveRef.current = true;
          setValue(migratePersistentValue(key, row.state_value as T));
          announceHubSync({ state: "saved", key, message: row.updated_by === user.id ? "Saved" : "Updated by another staff member" });
        },
      )
      .subscribe();

    return () => {
      active = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void supabase?.removeChannel(channel);
    };
  }, [canWrite, config, hasStateAccess, key, productionInitial, profile, user]);

  useEffect(() => {
    if (!hydrated || !supabase || !user || !profile || !hasStateAccess || !canWrite) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    announceHubSync({ state: "saving", key, message: config ? `Saving ${config.label}…` : "Saving shared changes…" });

    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        if (config) {
          if (!Array.isArray(value)) {
            announceHubSync({ state: "error", key, message: `${config.label} must be saved as a collection.` });
            return;
          }
          const { error } = await supabase!.rpc("sync_tcs_collection", {
            p_collection_key: key,
            p_items: value,
          });
          if (error) {
            announceHubSync({ state: "error", key, message: `Save failed: ${error.message}` });
            return;
          }
          announceHubSync({ state: "saved", key, message: `All ${config.label} changes saved` });
          return;
        }

        const expectedVersion = versionRef.current;
        const { data, error } = await supabase!.rpc("save_hub_state", {
          p_state_key: key,
          p_state_value: value,
          p_expected_version: expectedVersion,
        });

        if (error) {
          const isConflict = error.message.toLowerCase().includes("version conflict") || error.code === "40001";
          if (isConflict) {
            const { data: latest } = await supabase!
              .from("hub_state")
              .select("state_key,state_value,version,updated_by,updated_at")
              .eq("state_key", key)
              .maybeSingle();
            if (latest) {
              const row = latest as HubStateRow;
              versionRef.current = row.version;
              skipNextSaveRef.current = true;
              setValue(migratePersistentValue(key, row.state_value as T));
            }
            announceHubSync({ state: "conflict", key, message: "Another staff member saved this section first. The newest shared version was loaded." });
            return;
          }
          announceHubSync({ state: "error", key, message: `Save failed: ${error.message}` });
          return;
        }

        const saved = normalizeSavedRow(data as SaveHubStateResult);
        if (!saved) {
          announceHubSync({ state: "error", key, message: "The database did not return the saved record." });
          return;
        }
        versionRef.current = saved.version;
        announceHubSync({ state: "saved", key, message: "All changes saved" });
      })();
    }, 650);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [canWrite, config, hasStateAccess, hydrated, key, profile, user, value]);

  const exposedSetter: Dispatch<SetStateAction<T>> = canWrite
    ? setValue
    : () => {
        announceHubSync({ state: "error", key, message: "This account has read-only access to this section." });
      };

  return [value, exposedSetter, hydrated] as const;
}
