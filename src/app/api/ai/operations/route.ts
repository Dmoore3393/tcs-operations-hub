import { requireStaff, staffErrorResponse } from "@/lib/server/require-staff";
import { isEmployeeAccessRole } from "@/lib/team-access";

export const runtime = "nodejs";
export const maxDuration = 90;

type Mode = "briefing" | "chat";

type RequestBody = {
  mode?: Mode;
  prompt?: string;
  snapshot?: unknown;
  history?: Array<{ role?: string; content?: string }>;
};

type OpenAIResponseContent = { type?: string; text?: string };
type OpenAIResponseOutput = { type?: string; content?: OpenAIResponseContent[] };
type OpenAITextResponse = {
  output?: OpenAIResponseOutput[];
  output_text?: string;
  error?: { message?: string };
};

function extractText(payload: OpenAITextResponse) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();
}

function safePrompt(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, 2500);
}

function safeHistory(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<{ role: "user" | "assistant"; content: string }>;
  return value
    .slice(-8)
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" as const : "user" as const,
      content: safePrompt(item?.content),
    }))
    .filter((item) => item.content);
}

function safeSnapshot(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2).slice(0, 14000);
  } catch {
    return "{}";
  }
}

function localFallback(mode: Mode, prompt: string, snapshotText: string) {
  let snapshot: Record<string, unknown> = {};
  try {
    snapshot = JSON.parse(snapshotText) as Record<string, unknown>;
  } catch {
    snapshot = {};
  }
  if (mode === "briefing") {
    const children = Number(snapshot.scheduledChildren ?? 0);
    const staff = Number(snapshot.scheduledStaff ?? 0);
    const critical = Number(snapshot.criticalAlerts ?? 0);
    const warnings = Number(snapshot.warningAlerts ?? 0);
    const topAlerts = Array.isArray(snapshot.topAlerts) ? snapshot.topAlerts.slice(0, 3) : [];
    const priorities = topAlerts
      .map((item) => typeof item === "object" && item ? String((item as Record<string, unknown>).title ?? "") : "")
      .filter(Boolean);
    return `Today’s entered schedules show ${children} children and ${staff} staff members. ${critical ? `${critical} critical item${critical === 1 ? " needs" : "s need"} attention first.` : warnings ? `${warnings} warning${warnings === 1 ? " is" : "s are"} worth reviewing.` : "No major schedule or coverage conflicts are showing."}${priorities.length ? `\n\nTop priorities:\n${priorities.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : ""}`;
  }
  return prompt
    ? `I can help organize this request: “${prompt}”\n\nThe OpenAI connection is not active yet, so this is a safe local response. Add OPENAI_API_KEY to the server environment to receive a live TCS AI answer based on the authorized operations snapshot.`
    : "The OpenAI connection is not active yet. Add OPENAI_API_KEY to enable live TCS AI responses.";
}

export async function POST(request: Request) {
  try {
    const { profile } = await requireStaff(request);
    const body = (await request.json()) as RequestBody;
    const mode: Mode = body.mode === "briefing" ? "briefing" : "chat";
    if (mode === "chat" && isEmployeeAccessRole(profile.role) && !(profile.permissions ?? []).includes("ai_assistant")) {
      return Response.json({ error: "TCS AI Assistant is not included in this employee account." }, { status: 403 });
    }
    const prompt = safePrompt(body.prompt);
    const history = safeHistory(body.history);
    const snapshotText = safeSnapshot(body.snapshot);
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json({
        answer: localFallback(mode, prompt, snapshotText),
        connected: false,
        warning: "OPENAI_API_KEY is not configured, so the Hub used its local operations summary.",
      });
    }

    const instructions = `You are TCS AI Director inside a private childcare operations system. Be warm, direct, organized, and practical.

STRICT RULES:
- Use only the operations snapshot and user request provided. Never invent attendance, schedules, services, incidents, openings, staffing, transportation, or family information.
- Respect the signed-in staff member's authorized scope. Do not ask for or reveal records from other locations.
- Opening and Closing Reports are internal staff records and must never be suggested for family sharing.
- Do not make official record changes. You may draft, summarize, identify conflicts, and recommend next steps; the user must approve and save changes in the Hub.
- Avoid exposing unnecessary child medical, behavioral, or family details.
- When the snapshot is incomplete, say what needs to be entered or verified.
- For a morning briefing, return a short opening paragraph followed by 3-5 numbered priorities. Keep it under 220 words.
- For chat, answer the request clearly and keep the response under 450 words unless the user explicitly asks for more detail.

Signed-in staff: ${profile.full_name} (${profile.role}).`;

    const input = mode === "briefing"
      ? `Create today’s TCS operations briefing from this authorized snapshot:\n${snapshotText}`
      : `AUTHORIZED OPERATIONS SNAPSHOT:\n${snapshotText}\n\nRECENT CONVERSATION:\n${history.map((item) => `${item.role.toUpperCase()}: ${item.content}`).join("\n") || "None"}\n\nUSER REQUEST:\n${prompt || "Review today’s operations and recommend the next best action."}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6",
        instructions,
        input,
        store: false,
      }),
      cache: "no-store",
    });

    const payload = (await response.json()) as OpenAITextResponse;
    if (!response.ok) throw new Error(payload.error?.message || `OpenAI request failed with status ${response.status}.`);
    const answer = extractText(payload);
    if (!answer) throw new Error("The AI service returned an empty response.");

    return Response.json({ answer, connected: true });
  } catch (error) {
    return staffErrorResponse(error);
  }
}
