"use client";

import { usePersistentState } from "@/hooks/usePersistentState";
import { starterVehicles } from "@/lib/hub-data";
import ChoiceSelect from "./ChoiceSelect";

export default function VehicleNameSelect({ value, onChange, forMaintenance = false, className }: { value: string; onChange: (value: string) => void; forMaintenance?: boolean; className?: string }) {
  const [vehicles, , ready, state] = usePersistentState("tcs-vehicles-v2", starterVehicles);
  return <><ChoiceSelect label="Vehicle" value={value} onChange={onChange} options={vehicles.filter(vehicle => forMaintenance || vehicle.status !== "Out of Service").map(vehicle => vehicle.name)} placeholder={ready ? "Choose vehicle" : "Loading vehicles…"} allowCustom={forMaintenance} className={className} />{state.error && <span role="alert" className="mt-2 block text-base text-red-900">{state.error} <button type="button" className="min-h-11 underline" onClick={state.retry}>Try again</button></span>}</>;
}
