"use client";
import StaffingWorkspace from "@/components/scheduling/StaffingWorkspace";
import TeamScheduleView from "@/components/scheduling/TeamScheduleView";
import MainLayout from "@/components/layout/MainLayout";
import { useAuth } from "@/components/providers/AuthProvider";

export default function StaffSchedulesPage() {
  const { isSystemOwner, isLocationLicensee } = useAuth();
  if (isSystemOwner) return <StaffingWorkspace mode="staff" />;
  if (isLocationLicensee) return <TeamScheduleView />;
  return <MainLayout><p className="p-6 text-lg">Owner/Admin or Location Licensee access is required to view team schedules.</p></MainLayout>;
}
