import { locationThemes, normalizeLocation, type LocationKey } from "@/lib/location-config";
import { requireOwner, responseFromThrown } from "@/lib/server/require-owner";

export const runtime = "nodejs";
export const maxDuration = 180;

type GenerateAction = "all" | "images" | "caption";

type MarketingRequest = {
  action?: GenerateAction;
  location?: string;
  goal?: string;
  vibe?: string;
  audience?: string;
  headline?: string;
  subheadline?: string;
  ageLine?: string;
  phone?: string;
  address?: string;
  licenseNumber?: string;
  fundingText?: string;
  callToAction?: string;
  benefits?: string[];
  extraDirection?: string;
  imageCount?: number;
  quality?: "low" | "medium" | "high";
};

type OpenAIImageItem = { b64_json?: string; revised_prompt?: string };

type OpenAIImageResponse = {
  data?: OpenAIImageItem[];
  error?: { message?: string };
};

type OpenAIResponseContent = { type?: string; text?: string };
type OpenAIResponseOutput = { type?: string; content?: OpenAIResponseContent[] };
type OpenAITextResponse = {
  output?: OpenAIResponseOutput[];
  output_text?: string;
  error?: { message?: string };
};

function safeText(value: unknown, fallback: string, maxLength = 240) {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function safeBenefits(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => safeText(item, "", 90))
    .filter(Boolean)
    .slice(0, 6);
}

function extractResponseText(payload: OpenAITextResponse) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();
}

function buildBackgroundPrompt(input: Required<Omit<MarketingRequest, "action" | "imageCount" | "quality">>, palette: { primary: string; accent: string; dark: string }) {
  return `
Create a premium portrait 4:5 CHILDCARE MARKETING FLYER BACKGROUND only. This will be used behind exact typography added later by software.

CRITICAL RULES:
- DO NOT add any words, letters, numbers, logos, signs, phone numbers, watermarks, or fake writing.
- Keep faces and hands natural and realistic.
- The children must be fictional, diverse, happy, school-safe, fully clothed, and clearly participating in supervised childcare activities.
- Do not imitate a specific brand or copy an existing flyer.

VISUAL DIRECTION:
- Goal: ${input.goal}
- Audience: ${input.audience}
- Vibe: ${input.vibe}
- Location palette: primary ${palette.primary}, accent ${palette.accent}, deep neutral ${palette.dark}
- Bold editorial scrapbook collage with polished commercial photography, colorful brush strokes, torn-paper edges, playful doodle shapes, paper notes, small photo-frame moments, and energetic movement.
- Include one large hero photo area with 3-4 cheerful children and 2 smaller supporting activity photo moments such as art, active play, building blocks, homework support, or a safe classroom game.
- Leave a large clean bright text-safe area on the LEFT TOP and a clean text-safe band along the BOTTOM.
- Use strong visual hierarchy, bright natural light, premium daycare advertising quality, and a fun modern look that feels exciting to parents without looking babyish.
- Background should feel full, layered, colorful, and dynamic while preserving readable blank areas for later text overlays.

ADDITIONAL DIRECTION:
${input.extraDirection || "Keep the design bold, warm, realistic, and eye-catching for a childcare flyer."}
`;
}

function fallbackCaption(input: Required<Omit<MarketingRequest, "action" | "imageCount" | "quality">>) {
  const benefits = input.benefits.length ? input.benefits.slice(0, 4).join(" • ") : "Learning support • Active play • Creative activities • Safe care";
  return `${input.headline}\n\n${input.subheadline}\n\n${benefits}\n\n${input.callToAction}\n📞 ${input.phone}\n${input.address ? `📍 ${input.address}\n` : ""}${input.fundingText ? `${input.fundingText}\n` : ""}\n#LancasterChildcare #AntelopeValleyChildcare #ChildcareEnrollment #WorkingParents #TCSChildcare`;
}

function buildCaptionPrompt(input: Required<Omit<MarketingRequest, "action" | "imageCount" | "quality">>) {
  return `Write one polished social-media caption for a childcare business advertisement.

Use this information exactly and do not invent services, openings, guarantees, schedules, prices, capacity numbers, or transportation availability:
- Goal: ${input.goal}
- Headline: ${input.headline}
- Supporting line: ${input.subheadline}
- Audience: ${input.audience}
- Ages: ${input.ageLine}
- Benefits: ${input.benefits.join("; ")}
- Call to action: ${input.callToAction}
- Phone: ${input.phone}
- Address/location: ${input.address || "not provided"}
- Funding accepted: ${input.fundingText || "not provided"}

Tone: warm, energetic, realistic, parent-friendly, and confident. Keep it under 160 words. Use a few natural emojis. End with 6-9 relevant childcare hashtags. Return only the finished caption.`;
}

async function callImageGeneration(apiKey: string, prompt: string, imageCount: number, quality: "low" | "medium" | "high") {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
      prompt,
      n: imageCount,
      size: "1024x1536",
      quality,
      output_format: "png",
      background: "opaque",
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as OpenAIImageResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Image generation failed with status ${response.status}.`);
  }

  return (payload.data ?? [])
    .map((item) => item.b64_json)
    .filter((item): item is string => Boolean(item));
}

async function callCaptionGeneration(apiKey: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6",
      input: prompt,
      store: false,
    }),
    cache: "no-store",
  });

  const payload = (await response.json()) as OpenAITextResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Caption generation failed with status ${response.status}.`);
  }

  return extractResponseText(payload);
}

export async function POST(request: Request) {
  try {
    const { profile } = await requireOwner(request);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error: "AI flyer generation is not connected yet. Add OPENAI_API_KEY to .env.local and the deployment environment variables, then restart the Hub.",
          code: "OPENAI_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as MarketingRequest;
    const action: GenerateAction = body.action === "images" || body.action === "caption" ? body.action : "all";
    const normalized = normalizeLocation(body.location ?? "All Locations") as LocationKey;
    const location = locationThemes[normalized] ? normalized : "All Locations";
    const theme = locationThemes[location];
    const benefits = safeBenefits(body.benefits);

    const input: Required<Omit<MarketingRequest, "action" | "imageCount" | "quality">> = {
      location,
      goal: safeText(body.goal, "Childcare enrollment", 80),
      vibe: safeText(body.vibe, "Bold colorful scrapbook", 80),
      audience: safeText(body.audience, "Working families in the Antelope Valley", 120),
      headline: safeText(body.headline, "CHILDCARE THAT WORKS FOR REAL FAMILY LIFE", 110),
      subheadline: safeText(body.subheadline, "A safe place to learn, play, grow, and belong.", 170),
      ageLine: safeText(body.ageLine, "Ages and availability vary by location", 110),
      phone: safeText(body.phone, "(760) 382-5742", 40),
      address: safeText(body.address, "Lancaster, CA", 120),
      licenseNumber: safeText(body.licenseNumber, "", 80),
      fundingText: safeText(body.fundingText, "", 140),
      callToAction: safeText(body.callToAction, "Schedule a tour today!", 100),
      benefits: benefits.length ? benefits : ["Learning support", "Creative activities", "Active play", "Healthy meals", "Safe and supportive care"],
      extraDirection: safeText(body.extraDirection, "", 500),
    };

    const imageCount = Math.min(3, Math.max(1, Number(body.imageCount) || 3));
    const quality = body.quality === "low" || body.quality === "high" ? body.quality : "medium";
    const palette = { primary: theme.primary, accent: theme.accent, dark: theme.primaryDark };

    let images: string[] = [];
    let caption = "";
    const warnings: string[] = [];

    if (action === "all" || action === "images") {
      images = await callImageGeneration(apiKey, buildBackgroundPrompt(input, palette), imageCount, quality);
      if (!images.length) throw new Error("The image service returned no flyer backgrounds.");
    }

    if (action === "all" || action === "caption") {
      try {
        caption = await callCaptionGeneration(apiKey, buildCaptionPrompt(input));
      } catch (error) {
        caption = fallbackCaption(input);
        warnings.push(error instanceof Error ? `The AI caption could not be generated, so the Hub used a safe caption template: ${error.message}` : "The Hub used a safe caption template.");
      }
    }

    return Response.json({
      images,
      caption,
      warnings,
      generatedBy: profile.email,
      location,
      model: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
    });
  } catch (error) {
    return responseFromThrown(error);
  }
}
