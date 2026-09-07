"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TeamStoreLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    function routeTrainingActions(event: MouseEvent) {
      const element = event.target instanceof Element ? event.target.closest("button, a") : null;
      if (!element) return;
      const label = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      const opensTrainingCenter = label === "Training Center" || label === "Training Rewards" || label.startsWith("View Assigned Trainings");
      if (!opensTrainingCenter) return;
      event.preventDefault();
      event.stopPropagation();
      router.push("/training-center");
    }

    document.addEventListener("click", routeTrainingActions, true);
    return () => document.removeEventListener("click", routeTrainingActions, true);
  }, [router]);

  return children;
}
