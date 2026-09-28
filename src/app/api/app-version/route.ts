export const dynamic = "force-dynamic";

export async function GET() {
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "";
  const deploymentUrl = process.env.VERCEL_URL?.trim() || "";
  const version =
    gitSha ||
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    deploymentUrl ||
    "development";

  return Response.json(
    {
      version,
      gitSha,
      deploymentUrl,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
}
