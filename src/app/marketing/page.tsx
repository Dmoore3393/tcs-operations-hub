"use client";

import MainLayout from "@/components/layout/MainLayout";
import {
  PageIntro,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  StatCard,
  StatusBadge,
  inputClass,
} from "@/components/hub/HubUI";
import { useAuth } from "@/components/providers/AuthProvider";
import { useHubLocation } from "@/components/providers/LocationProvider";
import { usePersistentState } from "@/hooks/usePersistentState";
import { recordAuditEvent } from "@/lib/audit";
import { locationThemes, type LocationKey } from "@/lib/location-config";
import { downloadSvgAsPng, escapeXml, printSvg } from "@/lib/visual-export";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  Megaphone,
  Palette,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

type Campaign = {
  id: number;
  day: string;
  theme: string;
  status: "Draft" | "Scheduled" | "Posted";
  location: string;
};

type FlyerGoal =
  | "Enrollment"
  | "School Age Center"
  | "Transportation"
  | "Schedule a Tour"
  | "Weekend Care"
  | "Now Hiring"
  | "Special Theme Day";

type FlyerVibe =
  | "Bold colorful scrapbook"
  | "Modern energetic collage"
  | "Bright playful editorial"
  | "Clean premium childcare"
  | "Seasonal celebration";

type FlyerDraft = {
  goal: FlyerGoal;
  vibe: FlyerVibe;
  headline: string;
  subheadline: string;
  audience: string;
  ageLine: string;
  callToAction: string;
  phone: string;
  address: string;
  licenseNumber: string;
  fundingText: string;
  benefits: string[];
  extraDirection: string;
};

type GeneratedFlyer = {
  id: string;
  imageBase64: string;
  layout: number;
};

const starterCampaigns: Campaign[] = [
  { id: 1, day: "Monday", theme: "Back-to-school enrollment", status: "Posted", location: "All Locations" },
  { id: 2, day: "Tuesday", theme: "Creative Tuesday", status: "Scheduled", location: "All Locations" },
  { id: 3, day: "Wednesday", theme: "Everyday wellness and routines", status: "Draft", location: "Halcom" },
  { id: 4, day: "Thursday", theme: "Think Big learning", status: "Draft", location: "Division" },
  { id: 5, day: "Friday", theme: "Fun Friday moments", status: "Draft", location: "All Locations" },
];

const goalDefaults: Record<FlyerGoal, Pick<FlyerDraft, "headline" | "subheadline" | "ageLine" | "callToAction" | "benefits">> = {
  Enrollment: {
    headline: "NOW ENROLLING",
    subheadline: "Dependable childcare with routines, learning, play, meals, and support for real family life.",
    ageLine: "Ages and openings vary by location",
    callToAction: "Ask about current openings today!",
    benefits: ["Learning support", "Creative activities", "Active play", "Nutritious meals", "Safe and supportive care"],
  },
  "School Age Center": {
    headline: "SCHOOL AGE CARE THAT FEELS AWESOME",
    subheadline: "A place for children to learn, create, move, connect, and finish the day strong.",
    ageLine: "Serving children 4 years, 9 months–13 years old",
    callToAction: "Schedule a tour today!",
    benefits: ["Homework help", "Creative projects", "Active games", "Team building", "Snack and dinner"],
  },
  Transportation: {
    headline: "SCHOOL PICKUP + CHILDCARE",
    subheadline: "Reliable care after the bell with transportation based on school, route, and space availability.",
    ageLine: "School-age transportation varies by route",
    callToAction: "Ask whether your child’s school is on our route!",
    benefits: ["School pickup", "Afternoon care", "Homework support", "Meals and snacks", "Safe route planning"],
  },
  "Schedule a Tour": {
    headline: "COME SEE WHAT MAKES TCS DIFFERENT",
    subheadline: "Meet the team, explore the space, and learn how our program can support your family.",
    ageLine: "Programs and age groups vary by location",
    callToAction: "Schedule your tour today!",
    benefits: ["Warm environment", "Structured routines", "Engaging activities", "Family communication", "Multiple locations"],
  },
  "Weekend Care": {
    headline: "WEEKEND CARE FOR BUSY FAMILIES",
    subheadline: "A safe, engaging place for children while parents work, recharge, or handle weekend responsibilities.",
    ageLine: "Weekend availability varies by location",
    callToAction: "Contact us to check this weekend’s availability!",
    benefits: ["Flexible support", "Meals and snacks", "Indoor activities", "Outdoor play", "Safe supervision"],
  },
  "Now Hiring": {
    headline: "JOIN THE TCS TEAM",
    subheadline: "Bring your energy, reliability, and love for children to a growing childcare team.",
    ageLine: "Positions and schedules vary by location",
    callToAction: "Apply or ask about current openings!",
    benefits: ["Meaningful work", "Supportive team", "Multiple locations", "Growth opportunities", "Hands-on experience"],
  },
  "Special Theme Day": {
    headline: "FUN FRIDAY!",
    subheadline: "Ending the week with fun, friends, movement, creativity, and memories.",
    ageLine: "Activities are part of our regular childcare day",
    callToAction: "Ask about current childcare openings!",
    benefits: ["Fun activities", "Creative projects", "Active play", "Friendship building", "Learning support"],
  },
};

const starterDraft: FlyerDraft = {
  goal: "School Age Center",
  vibe: "Bold colorful scrapbook",
  headline: goalDefaults["School Age Center"].headline,
  subheadline: goalDefaults["School Age Center"].subheadline,
  audience: "Working families in Lancaster and the Antelope Valley",
  ageLine: goalDefaults["School Age Center"].ageLine,
  callToAction: goalDefaults["School Age Center"].callToAction,
  phone: "(760) 382-5742",
  address: "Lancaster, CA",
  licenseNumber: "",
  fundingText: "Accepting CCRC, CCCC, DCFS & Crystal Stairs",
  benefits: goalDefaults["School Age Center"].benefits,
  extraDirection: "Use energetic school-age activities, strong contrast, colorful brush strokes, playful doodles, and polished realistic photography.",
};

function splitLines(value: string, maxChars: number, maxLines = 4) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  const usedWords = lines.join(" ").split(/\s+/).length;
  if (usedWords < words.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.!?…]*$/, "")}…`;
  return lines;
}

function svgLines(options: {
  text: string;
  x: number;
  y: number;
  maxChars: number;
  maxLines?: number;
  size: number;
  lineHeight: number;
  fill: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  family?: string;
  letterSpacing?: number;
}) {
  const lines = splitLines(options.text, options.maxChars, options.maxLines ?? 4);
  return lines
    .map(
      (line, index) =>
        `<text x="${options.x}" y="${options.y + index * options.lineHeight}" text-anchor="${options.anchor ?? "start"}" font-family="${options.family ?? "Arial, sans-serif"}" font-size="${options.size}" font-weight="${options.weight ?? 800}" letter-spacing="${options.letterSpacing ?? 0}" fill="${options.fill}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function benefitCards(benefits: string[], theme: (typeof locationThemes)[LocationKey], layout: number) {
  const items = benefits.slice(0, 5);
  if (layout === 1) {
    return items
      .map((item, index) => {
        const y = 735 + index * 78;
        return `<circle cx="710" cy="${y - 7}" r="18" fill="${index % 2 ? theme.accent : theme.primary}"/><path d="M700 ${y - 7}l7 8 14-17" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${svgLines({ text: item, x: 744, y, maxChars: 29, maxLines: 2, size: 19, lineHeight: 24, fill: "#172033", weight: 850 })}`;
      })
      .join("");
  }

  return items
    .map((item, index) => {
      const col = index % 5;
      const x = 68 + col * 190;
      return `<rect x="${x}" y="830" width="170" height="185" rx="26" fill="white" stroke="#e2e8f0" stroke-width="2"/><circle cx="${x + 85}" cy="880" r="31" fill="${index % 2 ? theme.accent : theme.primary}"/><path d="M${x + 70} 880l11 12 22-28" fill="none" stroke="${index % 2 && theme.textOnPrimary === "#111827" ? theme.ink : "white"}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>${svgLines({ text: item, x: x + 85, y: 945, maxChars: 15, maxLines: 3, size: 17, lineHeight: 22, fill: theme.ink, weight: 900, anchor: "middle" })}`;
    })
    .join("");
}

function buildFlyerSvg(imageBase64: string, draft: FlyerDraft, location: LocationKey, layout: number) {
  const theme = locationThemes[location];
  const locationName = location === "All Locations" ? "THOMASON CHILDCARE SOLUTIONS" : theme.fullName.toUpperCase();
  const imageHref = `data:image/png;base64,${imageBase64}`;
  const licenseLine = draft.licenseNumber ? `LICENSE #${draft.licenseNumber}` : "LICENSE INFORMATION AVAILABLE BY LOCATION";
  const fundingLine = draft.fundingText || "Funding programs and availability vary by location";

  if (layout === 1) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" style="display:block;width:100%;height:auto">
      <defs>
        <clipPath id="photo-main"><rect x="55" y="250" width="970" height="490" rx="42"/></clipPath>
        <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="15" flood-opacity=".2"/></filter>
        <linearGradient id="footer" x1="0" x2="1"><stop stop-color="${theme.primaryDark}"/><stop offset="1" stop-color="${theme.primary}"/></linearGradient>
      </defs>
      <rect width="1080" height="1350" fill="#fffdf8"/>
      <path d="M0 0h1080v195c-165 62-312-42-485 15C392 278 205 181 0 250z" fill="${theme.primary}"/>
      <circle cx="965" cy="65" r="115" fill="${theme.accent}" opacity=".9"/>
      <text x="58" y="65" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="3" fill="${theme.textOnPrimary}">TCS MARKETING STUDIO</text>
      ${svgLines({ text: locationName, x: 58, y: 112, maxChars: 47, maxLines: 2, size: 25, lineHeight: 31, fill: theme.textOnPrimary, weight: 900 })}
      <image href="${imageHref}" x="55" y="250" width="970" height="490" preserveAspectRatio="xMidYMid slice" clip-path="url(#photo-main)"/>
      <rect x="55" y="250" width="970" height="490" rx="42" fill="none" stroke="white" stroke-width="10" filter="url(#shadow)"/>
      <rect x="74" y="650" width="560" height="240" rx="30" fill="white" filter="url(#shadow)"/>
      <path d="M80 810q130-55 260 0t260 0" fill="none" stroke="${theme.accent}" stroke-width="22" opacity=".9"/>
      ${svgLines({ text: draft.headline, x: 102, y: 710, maxChars: 23, maxLines: 3, size: 52, lineHeight: 55, fill: theme.primaryDark, weight: 950 })}
      <rect x="666" y="682" width="350" height="430" rx="34" fill="#fff" stroke="#e2e8f0" stroke-width="2" filter="url(#shadow)"/>
      <text x="706" y="728" font-family="Arial, sans-serif" font-size="18" font-weight="950" fill="${theme.primary}">WHAT FAMILIES CAN EXPECT</text>
      ${benefitCards(draft.benefits, theme, 1)}
      <rect x="55" y="932" width="570" height="180" rx="30" fill="${theme.primarySoft}"/>
      ${svgLines({ text: draft.subheadline, x: 88, y: 982, maxChars: 52, maxLines: 4, size: 23, lineHeight: 30, fill: theme.ink, weight: 750 })}
      <rect x="55" y="1145" width="970" height="148" rx="34" fill="url(#footer)"/>
      <text x="88" y="1195" font-family="Arial, sans-serif" font-size="24" font-weight="950" fill="${theme.textOnPrimary}">${escapeXml(draft.callToAction.toUpperCase())}</text>
      <text x="88" y="1252" font-family="Arial, sans-serif" font-size="41" font-weight="950" fill="${theme.accent}">${escapeXml(draft.phone)}</text>
      <text x="1004" y="1196" text-anchor="end" font-family="Arial, sans-serif" font-size="17" font-weight="850" fill="${theme.textOnPrimary}">${escapeXml(draft.ageLine)}</text>
      <text x="1004" y="1231" text-anchor="end" font-family="Arial, sans-serif" font-size="14" font-weight="750" fill="${theme.textOnPrimary}" opacity=".9">${escapeXml(draft.address)}</text>
      <text x="1004" y="1262" text-anchor="end" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${theme.textOnPrimary}" opacity=".82">${escapeXml(licenseLine)}</text>
    </svg>`;
  }

  if (layout === 2) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" style="display:block;width:100%;height:auto">
      <defs>
        <clipPath id="hero-photo"><path d="M430 0H1080V790Q840 700 595 810L430 742Z"/></clipPath>
        <filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-opacity=".2"/></filter>
        <linearGradient id="band" x1="0" x2="1"><stop stop-color="${theme.primaryDark}"/><stop offset=".72" stop-color="${theme.primary}"/><stop offset="1" stop-color="${theme.accent}"/></linearGradient>
      </defs>
      <rect width="1080" height="1350" fill="#f8fafc"/>
      <image href="${imageHref}" x="380" y="0" width="740" height="850" preserveAspectRatio="xMidYMid slice" clip-path="url(#hero-photo)"/>
      <path d="M0 0h535v820L420 760 0 895z" fill="white"/>
      <path d="M0 0h465v190H0z" fill="${theme.primary}"/>
      <text x="52" y="62" font-family="Arial, sans-serif" font-size="17" font-weight="900" letter-spacing="3" fill="${theme.textOnPrimary}">THOMASON CHILDCARE SOLUTIONS</text>
      ${svgLines({ text: locationName, x: 52, y: 108, maxChars: 32, maxLines: 2, size: 23, lineHeight: 28, fill: theme.textOnPrimary, weight: 900 })}
      <path d="M55 318q160-95 325 0" fill="none" stroke="${theme.accent}" stroke-width="34" opacity=".95"/>
      ${svgLines({ text: draft.headline, x: 52, y: 280, maxChars: 16, maxLines: 4, size: 68, lineHeight: 70, fill: theme.primaryDark, weight: 950 })}
      <rect x="52" y="594" width="340" height="126" rx="24" fill="${theme.primarySoft}"/>
      ${svgLines({ text: draft.ageLine, x: 82, y: 638, maxChars: 29, maxLines: 3, size: 20, lineHeight: 25, fill: theme.ink, weight: 900 })}
      <rect x="55" y="780" width="970" height="300" rx="42" fill="white" filter="url(#shadow)"/>
      <text x="88" y="832" font-family="Arial, sans-serif" font-size="23" font-weight="950" fill="${theme.primary}">EVERY DAY WE PROVIDE</text>
      ${benefitCards(draft.benefits, theme, 0)}
      <rect x="55" y="1108" width="970" height="190" rx="38" fill="url(#band)"/>
      ${svgLines({ text: draft.callToAction.toUpperCase(), x: 88, y: 1160, maxChars: 32, maxLines: 2, size: 29, lineHeight: 34, fill: theme.textOnPrimary, weight: 950 })}
      <text x="88" y="1255" font-family="Arial, sans-serif" font-size="45" font-weight="950" fill="${theme.textOnPrimary}">${escapeXml(draft.phone)}</text>
      <text x="996" y="1160" text-anchor="end" font-family="Arial, sans-serif" font-size="17" font-weight="850" fill="${theme.textOnPrimary}">${escapeXml(draft.address)}</text>
      <text x="996" y="1200" text-anchor="end" font-family="Arial, sans-serif" font-size="13" font-weight="750" fill="${theme.textOnPrimary}" opacity=".9">${escapeXml(fundingLine)}</text>
      <text x="996" y="1240" text-anchor="end" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="${theme.textOnPrimary}" opacity=".85">${escapeXml(licenseLine)}</text>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" style="display:block;width:100%;height:auto">
    <defs>
      <clipPath id="hero"><path d="M565 0h515v645L510 580z"/></clipPath>
      <clipPath id="small-one"><rect x="55" y="1015" width="315" height="205" rx="24"/></clipPath>
      <clipPath id="small-two"><rect x="710" y="1015" width="315" height="205" rx="24"/></clipPath>
      <filter id="shadow"><feDropShadow dx="0" dy="12" stdDeviation="15" flood-opacity=".2"/></filter>
      <linearGradient id="bottom" x1="0" x2="1"><stop stop-color="${theme.primaryDark}"/><stop offset=".65" stop-color="${theme.primary}"/><stop offset="1" stop-color="${theme.accent}"/></linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="#fffefb"/>
    <image href="${imageHref}" x="470" y="0" width="700" height="680" preserveAspectRatio="xMidYMid slice" clip-path="url(#hero)"/>
    <path d="M0 0h620v645L520 590 0 700z" fill="white"/>
    <text x="55" y="70" font-family="Arial, sans-serif" font-size="18" font-weight="900" letter-spacing="2.5" fill="${theme.ink}">TCS • ${escapeXml(locationName)}</text>
    <path d="M55 155q175-70 375 0" fill="none" stroke="${theme.accent}" stroke-width="28" opacity=".92"/>
    ${svgLines({ text: draft.headline, x: 55, y: 180, maxChars: 16, maxLines: 4, size: 76, lineHeight: 76, fill: theme.primary, weight: 950 })}
    <rect x="650" y="86" width="350" height="170" rx="85" fill="${theme.primaryDark}" opacity=".96"/>
    ${svgLines({ text: draft.ageLine.toUpperCase(), x: 825, y: 137, maxChars: 27, maxLines: 4, size: 20, lineHeight: 25, fill: theme.textOnPrimary, weight: 950, anchor: "middle" })}
    <rect x="55" y="610" width="970" height="185" rx="34" fill="white" filter="url(#shadow)"/>
    ${svgLines({ text: draft.subheadline, x: 89, y: 665, maxChars: 63, maxLines: 4, size: 26, lineHeight: 34, fill: theme.ink, weight: 760 })}
    ${benefitCards(draft.benefits, theme, 0)}
    <image href="${imageHref}" x="55" y="1015" width="315" height="205" preserveAspectRatio="xMinYMid slice" clip-path="url(#small-one)"/>
    <image href="${imageHref}" x="710" y="1015" width="315" height="205" preserveAspectRatio="xMaxYMid slice" clip-path="url(#small-two)"/>
    <rect x="395" y="1027" width="290" height="180" rx="28" fill="${theme.primaryDark}" filter="url(#shadow)"/>
    ${svgLines({ text: draft.callToAction.toUpperCase(), x: 540, y: 1082, maxChars: 23, maxLines: 3, size: 27, lineHeight: 32, fill: theme.textOnPrimary, weight: 950, anchor: "middle" })}
    <rect x="0" y="1240" width="1080" height="110" fill="url(#bottom)"/>
    <text x="55" y="1296" font-family="Arial, sans-serif" font-size="42" font-weight="950" fill="${theme.textOnPrimary}">${escapeXml(draft.phone)}</text>
    <text x="1025" y="1275" text-anchor="end" font-family="Arial, sans-serif" font-size="15" font-weight="850" fill="${theme.textOnPrimary}">${escapeXml(draft.address)}</text>
    <text x="1025" y="1305" text-anchor="end" font-family="Arial, sans-serif" font-size="12" font-weight="750" fill="${theme.textOnPrimary}" opacity=".9">${escapeXml(fundingLine)}</text>
    <text x="1025" y="1332" text-anchor="end" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${theme.textOnPrimary}" opacity=".82">${escapeXml(licenseLine)}</text>
  </svg>`;
}

function fallbackCaption(draft: FlyerDraft, location: LocationKey) {
  return `${draft.headline}\n\n${draft.subheadline}\n\n${draft.benefits.slice(0, 4).map((item) => `✨ ${item}`).join("\n")}\n\n${draft.callToAction}\n📞 ${draft.phone}\n📍 ${draft.address}\n\n#LancasterChildcare #AntelopeValleyChildcare #ChildcareEnrollment #WorkingParents #TCSChildcare #${location.replaceAll(" ", "")}`;
}

export default function MarketingPage() {
  const [campaigns, setCampaigns] = usePersistentState<Campaign[]>("tcs-marketing", starterCampaigns);
  const { location: activeLocation, setLocation: setActiveLocation } = useHubLocation();
  const { session } = useAuth();
  const [location, setLocation] = useState<LocationKey>(activeLocation);
  const [draft, setDraft] = useState<FlyerDraft>(starterDraft);
  const [flyers, setFlyers] = useState<GeneratedFlyer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [caption, setCaption] = useState(fallbackCaption(starterDraft, activeLocation));
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [loadingAction, setLoadingAction] = useState<"all" | "images" | "caption" | "">("");
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  const selectedFlyer = flyers.find((item) => item.id === selectedId) ?? flyers[0];
  const selectedSvg = useMemo(
    () => (selectedFlyer ? buildFlyerSvg(selectedFlyer.imageBase64, draft, location, selectedFlyer.layout) : ""),
    [draft, location, selectedFlyer],
  );
  const filenameBase = `TCS-${location.replaceAll(" ", "-")}-${draft.goal.replaceAll(" ", "-")}`;

  function updateDraft<K extends keyof FlyerDraft>(key: K, value: FlyerDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function chooseGoal(goal: FlyerGoal) {
    const defaults = goalDefaults[goal];
    setDraft((current) => ({ ...current, goal, ...defaults }));
  }

  function updateBenefit(index: number, value: string) {
    setDraft((current) => ({
      ...current,
      benefits: current.benefits.map((benefit, itemIndex) => (itemIndex === index ? value : benefit)),
    }));
  }

  async function generate(action: "all" | "images" | "caption") {
    if (!session?.access_token) {
      setError("Your secure staff session is missing. Sign out and sign back in.");
      return;
    }

    setLoadingAction(action);
    setError("");
    setWarnings([]);
    try {
      const response = await fetch("/api/marketing/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action,
          location,
          ...draft,
          imageCount: action === "caption" ? 0 : 3,
          quality,
        }),
      });
      const payload = (await response.json()) as { images?: string[]; caption?: string; warnings?: string[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "The ad could not be generated.");

      if (payload.images?.length) {
        const next = payload.images.map((imageBase64, index) => ({
          id: `${Date.now()}-${index}`,
          imageBase64,
          layout: index % 3,
        }));
        setFlyers(next);
        setSelectedId(next[0].id);
      }
      if (payload.caption) setCaption(payload.caption);
      setWarnings(payload.warnings ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The ad could not be generated.");
    } finally {
      setLoadingAction("");
    }
  }

  function scheduleCampaign() {
    setCampaigns((current) => [
      ...current,
      { id: Date.now(), day: "Next Available", theme: draft.goal, status: "Scheduled", location },
    ]);
  }

  async function copyCaption() {
    await navigator.clipboard.writeText(caption);
  }

  async function savePng() {
    if (!selectedSvg) return;
    downloadSvgAsPng(selectedSvg, `${filenameBase}-${new Date().toISOString().slice(0, 10)}`);
    await recordAuditEvent({
      action: "EXPORT",
      tableName: "marketing_assets",
      location,
      metadata: { format: "png", goal: draft.goal, headline: draft.headline },
    }).catch(() => undefined);
  }

  async function printFlyer() {
    if (!selectedSvg) return;
    printSvg(selectedSvg, `${location} ${draft.goal} Advertisement`);
    await recordAuditEvent({
      action: "EXPORT",
      tableName: "marketing_assets",
      location,
      metadata: { format: "print", goal: draft.goal, headline: draft.headline },
    }).catch(() => undefined);
  }

  return (
    <MainLayout>
      <div className="mx-auto max-w-[1640px] space-y-6">
        <PageIntro
          eyebrow="Real AI photography + exact TCS wording"
          title="Marketing Studio"
          description="Generate bold, colorful childcare flyers with the layered scrapbook energy you like. AI creates the child-safe photography and collage background; the Hub adds the exact headline, phone number, license details, benefits, and call to action so the important wording stays correct."
          actions={
            <PrimaryButton onClick={scheduleCampaign}>
              <Save className="h-4 w-4" /> Add to Calendar
            </PrimaryButton>
          }
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Flyer Variations" value={flyers.length || 3} helper={flyers.length ? "Fresh AI designs ready" : "Generated together"} icon={<ImageIcon className="h-5 w-5" />} />
          <StatCard label="Style Target" value="Bold + Fun" helper="Scrapbook collage—not plain boxes" icon={<Palette className="h-5 w-5" />} tone="purple" />
          <StatCard label="Exact Text Layer" value="Locked" helper="Phone and details stay readable" icon={<Check className="h-5 w-5" />} tone="emerald" />
          <StatCard label="Active Location" value={location} icon={<Megaphone className="h-5 w-5" />} tone="amber" />
        </section>

        <div className="grid gap-6 2xl:grid-cols-[.7fr_1.3fr]">
          <div className="space-y-6">
            <SectionCard title="Style Reference" description="The new generator uses these design qualities without copying the exact flyer">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/marketing/style-reference.jpg" alt="Bold colorful school-age childcare flyer style reference" className="h-auto w-full" />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  "Big expressive headline",
                  "Layered photos and paper notes",
                  "Brush strokes and doodles",
                  "Multiple useful information sections",
                  "Strong phone-number callout",
                  "Different layout every generation",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                    <Check className="h-4 w-4 text-emerald-600" /> {item}
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Build Your Flyer" description="Control the facts; AI handles the artwork">
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-1.5 block text-sm font-bold">Ad goal</span>
                    <select className={inputClass} value={draft.goal} onChange={(event) => chooseGoal(event.target.value as FlyerGoal)}>
                      {(Object.keys(goalDefaults) as FlyerGoal[]).map((goal) => <option key={goal}>{goal}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1.5 block text-sm font-bold">Visual vibe</span>
                    <select className={inputClass} value={draft.vibe} onChange={(event) => updateDraft("vibe", event.target.value as FlyerVibe)}>
                      {(["Bold colorful scrapbook", "Modern energetic collage", "Bright playful editorial", "Clean premium childcare", "Seasonal celebration"] as FlyerVibe[]).map((vibe) => <option key={vibe}>{vibe}</option>)}
                    </select>
                  </label>
                </div>

                <label>
                  <span className="mb-1.5 block text-sm font-bold">Location</span>
                  <select className={inputClass} value={location} onChange={(event) => {
                    const next = event.target.value as LocationKey;
                    setLocation(next);
                    setActiveLocation(next);
                  }}>
                    {(Object.keys(locationThemes) as LocationKey[]).map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>

                <label>
                  <span className="mb-1.5 block text-sm font-bold">Big headline</span>
                  <input className={inputClass} value={draft.headline} onChange={(event) => updateDraft("headline", event.target.value)} maxLength={110} />
                </label>
                <label>
                  <span className="mb-1.5 block text-sm font-bold">Supporting message</span>
                  <textarea className={`${inputClass} min-h-24`} value={draft.subheadline} onChange={(event) => updateDraft("subheadline", event.target.value)} maxLength={170} />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className="mb-1.5 block text-sm font-bold">Ages / audience line</span><input className={inputClass} value={draft.ageLine} onChange={(event) => updateDraft("ageLine", event.target.value)} /></label>
                  <label><span className="mb-1.5 block text-sm font-bold">Call to action</span><input className={inputClass} value={draft.callToAction} onChange={(event) => updateDraft("callToAction", event.target.value)} /></label>
                  <label><span className="mb-1.5 block text-sm font-bold">Phone</span><input className={inputClass} value={draft.phone} onChange={(event) => updateDraft("phone", event.target.value)} /></label>
                  <label><span className="mb-1.5 block text-sm font-bold">City / address</span><input className={inputClass} value={draft.address} onChange={(event) => updateDraft("address", event.target.value)} /></label>
                  <label><span className="mb-1.5 block text-sm font-bold">License number</span><input className={inputClass} value={draft.licenseNumber} onChange={(event) => updateDraft("licenseNumber", event.target.value)} placeholder="Optional" /></label>
                  <label><span className="mb-1.5 block text-sm font-bold">Funding accepted</span><input className={inputClass} value={draft.fundingText} onChange={(event) => updateDraft("fundingText", event.target.value)} /></label>
                </div>

                <div>
                  <p className="mb-2 text-sm font-bold">Flyer benefit callouts</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {draft.benefits.map((benefit, index) => (
                      <input key={`${index}-${draft.goal}`} className={inputClass} value={benefit} onChange={(event) => updateBenefit(index, event.target.value)} maxLength={70} aria-label={`Benefit ${index + 1}`} />
                    ))}
                  </div>
                </div>

                <label>
                  <span className="mb-1.5 block text-sm font-bold">Extra design direction</span>
                  <textarea className={`${inputClass} min-h-24`} value={draft.extraDirection} onChange={(event) => updateDraft("extraDirection", event.target.value)} maxLength={500} placeholder="Example: Back-to-school colors, older school-age kids, art and outdoor games…" />
                </label>

                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label>
                    <span className="mb-1.5 block text-sm font-bold">AI image quality</span>
                    <select className={inputClass} value={quality} onChange={(event) => setQuality(event.target.value as "low" | "medium" | "high")}>
                      <option value="low">Low — faster test</option>
                      <option value="medium">Medium — recommended</option>
                      <option value="high">High — final artwork</option>
                    </select>
                  </label>
                  <PrimaryButton onClick={() => void generate("all")} disabled={Boolean(loadingAction)}>
                    {loadingAction === "all" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                    Generate 3 Flyers
                  </PrimaryButton>
                </div>

                <div className="flex flex-wrap gap-2">
                  <SecondaryButton onClick={() => void generate("images")} disabled={Boolean(loadingAction)}>
                    {loadingAction === "images" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Regenerate Designs Only
                  </SecondaryButton>
                  <SecondaryButton onClick={() => void generate("caption")} disabled={Boolean(loadingAction)}>
                    {loadingAction === "caption" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Rewrite Caption Only
                  </SecondaryButton>
                </div>

                {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold leading-6 text-red-800"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}
                {warnings.map((warning) => <div key={warning} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{warning}</div>)}
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Flyer Variations" description="Choose the design you like best; all wording stays editable">
              {flyers.length ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    {flyers.map((flyer, index) => {
                      const svg = buildFlyerSvg(flyer.imageBase64, draft, location, flyer.layout);
                      const selected = flyer.id === selectedFlyer?.id;
                      return (
                        <button key={flyer.id} type="button" onClick={() => setSelectedId(flyer.id)} className={`overflow-hidden rounded-2xl border-4 bg-slate-100 text-left transition hover:-translate-y-1 hover:shadow-xl ${selected ? "border-[var(--theme-500)] shadow-xl" : "border-white"}`}>
                          <div dangerouslySetInnerHTML={{ __html: svg }} />
                          <div className="flex items-center justify-between bg-white px-4 py-3">
                            <span className="font-black">Design {index + 1}</span>
                            {selected && <StatusBadge tone="green">Selected</StatusBadge>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <PrimaryButton onClick={() => void savePng()}><Download className="h-4 w-4" /> Save Selected PNG</PrimaryButton>
                    <SecondaryButton onClick={() => void printFlyer()}><Printer className="h-4 w-4" /> Print Selected</SecondaryButton>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[520px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white p-8 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--theme-100)] text-[var(--theme-700)]"><WandSparkles className="h-10 w-10" /></div>
                  <h3 className="mt-6 text-2xl font-black text-slate-950">Your bold flyer designs will appear here</h3>
                  <p className="mt-3 max-w-xl leading-7 text-slate-600">Click <strong>Generate 3 Flyers</strong>. The Hub will create three different AI collage backgrounds, then add your exact TCS wording in polished flyer layouts.</p>
                  <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">AI generation requires a server-side OpenAI API key. ChatGPT subscriptions and API billing are separate.</p>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Caption" description="Generate it with the flyer, rewrite only the caption, or edit it yourself">
              <textarea className={`${inputClass} min-h-[260px] leading-7`} value={caption} onChange={(event) => setCaption(event.target.value)} />
              <div className="mt-4 flex flex-wrap gap-3">
                <SecondaryButton onClick={() => void copyCaption()}><Copy className="h-4 w-4" /> Copy Caption</SecondaryButton>
                <PrimaryButton onClick={scheduleCampaign}><CalendarDays className="h-4 w-4" /> Schedule Idea</PrimaryButton>
              </div>
            </SectionCard>
          </div>
        </div>

        <SectionCard title="Marketing Calendar" description="Planning view—not automatic social posting">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {campaigns.slice(-10).map((campaign) => (
              <article key={campaign.id} className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-[var(--theme-700)]">{campaign.day}</p>
                <p className="mt-2 font-black text-slate-950">{campaign.theme}</p>
                <p className="mt-2 text-xs text-slate-500">{campaign.location}</p>
                <div className="mt-4"><StatusBadge tone={campaign.status === "Posted" ? "green" : campaign.status === "Scheduled" ? "blue" : "amber"}>{campaign.status}</StatusBadge></div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </MainLayout>
  );
}
