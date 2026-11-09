import "server-only";
import type { AuthorizedStaff } from "@/lib/server/require-staff";
import { canManageTraining, isTrainingAssigned } from "@/lib/training-access";
import type { TeamTraining, TeamTrainingCompletion } from "@/lib/team-store";

export async function trainingAsset(auth: AuthorizedStaff, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Response("Training file not found.", { status: 404 });
  const { data, error } = await auth.admin.from("training_assets").select("id,organization_id,training_id,kind,filename,mime_type,size_bytes,storage_path,status,uploaded_by")
    .eq("organization_id", auth.profile.organization_id).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Response("Training file not found.", { status: 404 });
  return data;
}

export async function requireTrainingAssetAccess(auth: AuthorizedStaff, asset: { id: string; training_id: string; kind: string }) {
  if (canManageTraining(auth.profile)) return;
  const { data, error } = await auth.admin.from("hub_state").select("state_key,state_value")
    .eq("organization_id", auth.profile.organization_id)
    .in("state_key", ["tcs-team-trainings-v1", "tcs-team-training-completions-v1"]);
  if (error) throw new Error(error.message);
  const list = (key: string) => {
    const value = data?.find(row => row.state_key === key)?.state_value;
    return Array.isArray(value) ? value : [];
  };
  const training = (list("tcs-team-trainings-v1") as TeamTraining[]).find(row => row.id === asset.training_id);
  const linkedId = asset.kind === "certificate" ? training?.certificateAssetId : training?.contentAssetId;
  if (!training || linkedId !== asset.id || !isTrainingAssigned(training, auth.profile)) {
    throw new Response("This training is not assigned to you.", { status: 403 });
  }
  if (asset.kind === "certificate" && !(list("tcs-team-training-completions-v1") as TeamTrainingCompletion[])
    .some(row => row.trainingId === training.id && row.userId === auth.user.id && row.status === "Verified")) {
    throw new Response("Your certificate is available after your completion is verified.", { status: 403 });
  }
}
