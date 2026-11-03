/** Families still use Brightwheel. Moving care attendance to The Hub is an explicit release choice. */
export const transportUsesBrightwheel = process.env.NEXT_PUBLIC_TRANSPORT_CARE_SYSTEM !== "hub";

export function transportHandoffPatch(date: string, at: string, actor: string) {
  return {
    runDate: date,
    runStatus: "Dropped Off" as const,
    droppedOffAt: at,
    droppedOffBy: actor,
  };
}
