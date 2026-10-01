"use client";

type SceneVariant =
  | "playtime"
  | "reading"
  | "art"
  | "school"
  | "transport"
  | "celebrate"
  | "family";

type KidPose = "stand" | "wave" | "read" | "paint" | "ball" | "star" | "backpack";

type KidProps = {
  x: number;
  y: number;
  scale?: number;
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  pose?: KidPose;
  delay?: number;
};

function Kid({ x, y, scale = 1, skin, shirt, pants, hair, pose = "stand", delay = 0 }: KidProps) {
  const isRead = pose === "read";
  const isPaint = pose === "paint";
  const isWave = pose === "wave";
  const isBall = pose === "ball";
  const isStar = pose === "star";
  const isBackpack = pose === "backpack";
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      className="tcs-kid-bob"
      style={{ animationDelay: `${delay}s` }}
    >
      {isBackpack && <rect x="-21" y="34" width="14" height="29" rx="7" fill="#7c3aed" opacity=".9" />}
      <circle cx="0" cy="0" r="23" fill={skin} />
      <path d="M-20 -8 Q-14 -29 0 -28 Q17 -27 21 -8 Q10 -18 0 -15 Q-9 -18 -20 -8Z" fill={hair} />
      <circle cx="-8" cy="2" r="2.2" fill="#172033" />
      <circle cx="8" cy="2" r="2.2" fill="#172033" />
      <path d="M-7 11 Q0 16 7 11" stroke="#8b4a42" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      <rect x="-22" y="24" width="44" height="48" rx="15" fill={shirt} />
      <path d="M-13 70 L-16 107" stroke={pants} strokeWidth="12" strokeLinecap="round" />
      <path d="M13 70 L16 107" stroke={pants} strokeWidth="12" strokeLinecap="round" />
      <path d="M-18 108 L-7 108" stroke="#24354b" strokeWidth="7" strokeLinecap="round" />
      <path d="M18 108 L7 108" stroke="#24354b" strokeWidth="7" strokeLinecap="round" />

      {!isRead && !isPaint && !isBall && !isStar && <>
        <path d="M-19 39 L-34 67" stroke={skin} strokeWidth="9" strokeLinecap="round" />
        <g className={isWave ? "tcs-arm-wave" : undefined}>
          <path d={isWave ? "M19 39 L37 14" : "M19 39 L34 67"} stroke={skin} strokeWidth="9" strokeLinecap="round" />
          {isWave && <circle cx="39" cy="10" r="5" fill={skin} />}
        </g>
      </>}

      {isRead && <>
        <path d="M-18 39 L-26 62" stroke={skin} strokeWidth="9" strokeLinecap="round" />
        <path d="M18 39 L26 62" stroke={skin} strokeWidth="9" strokeLinecap="round" />
        <g className="tcs-book-bob">
          <path d="M-31 58 Q-14 50 0 61 L0 85 Q-14 73 -31 79Z" fill="#fbbf24" stroke="#92400e" strokeWidth="2" />
          <path d="M31 58 Q14 50 0 61 L0 85 Q14 73 31 79Z" fill="#fde68a" stroke="#92400e" strokeWidth="2" />
        </g>
      </>}

      {isPaint && <>
        <path d="M-19 39 L-31 62" stroke={skin} strokeWidth="9" strokeLinecap="round" />
        <g className="tcs-arm-paint">
          <path d="M19 39 L34 55" stroke={skin} strokeWidth="9" strokeLinecap="round" />
          <path d="M35 55 L49 43" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
        </g>
      </>}

      {isBall && <>
        <path d="M-19 39 L-31 59" stroke={skin} strokeWidth="9" strokeLinecap="round" />
        <path d="M19 39 L31 59" stroke={skin} strokeWidth="9" strokeLinecap="round" />
        <circle className="tcs-ball-bounce" cx="42" cy="76" r="14" fill="#fb923c" stroke="#9a3412" strokeWidth="2" />
      </>}

      {isStar && <>
        <path d="M-19 39 L-29 56" stroke={skin} strokeWidth="9" strokeLinecap="round" />
        <path d="M19 39 L29 56" stroke={skin} strokeWidth="9" strokeLinecap="round" />
        <g className="tcs-star-pop" transform="translate(0 62)">
          <path d="M0 -20 L6 -7 L20 -5 L10 5 L13 19 L0 12 L-13 19 L-10 5 L-20 -5 L-6 -7Z" fill="#facc15" stroke="#a16207" strokeWidth="2" />
        </g>
      </>}
    </g>
  );
}

function Blocks() {
  return <g className="tcs-blocks-stack">
    <rect x="28" y="166" width="34" height="34" rx="5" fill="#60a5fa" />
    <rect x="64" y="166" width="34" height="34" rx="5" fill="#f472b6" />
    <rect x="47" y="130" width="34" height="34" rx="5" fill="#facc15" />
    <text x="64" y="153" textAnchor="middle" fontSize="15" fontWeight="900" fill="#7c2d12">T</text>
  </g>;
}

function Easel() {
  return <g>
    <path d="M318 85 L298 198 M318 85 L340 198" stroke="#8b5e3c" strokeWidth="8" strokeLinecap="round" />
    <rect x="278" y="72" width="80" height="75" rx="8" fill="#fff7ed" stroke="#c08457" strokeWidth="4" />
    <path className="tcs-paint-stroke" d="M293 121 Q310 91 326 117 Q340 132 349 95" stroke="#22c55e" strokeWidth="7" fill="none" strokeLinecap="round" />
    <circle cx="301" cy="92" r="8" fill="#f97316" />
  </g>;
}

function Bubbles() {
  return <g opacity=".8">
    <circle className="tcs-bubble tcs-bubble-1" cx="352" cy="82" r="10" fill="#dbeafe" stroke="#60a5fa" strokeWidth="2" />
    <circle className="tcs-bubble tcs-bubble-2" cx="379" cy="112" r="7" fill="#ecfeff" stroke="#22d3ee" strokeWidth="2" />
    <circle className="tcs-bubble tcs-bubble-3" cx="334" cy="128" r="6" fill="#ede9fe" stroke="#a78bfa" strokeWidth="2" />
  </g>;
}

function BusScene() {
  return <g className="tcs-bus-roll">
    <rect x="210" y="102" width="174" height="74" rx="22" fill="#facc15" stroke="#92400e" strokeWidth="4" />
    <rect x="230" y="118" width="36" height="30" rx="5" fill="#dbeafe" />
    <rect x="273" y="118" width="36" height="30" rx="5" fill="#dbeafe" />
    <rect x="316" y="118" width="36" height="30" rx="5" fill="#dbeafe" />
    <rect x="359" y="118" width="18" height="46" rx="5" fill="#fef3c7" />
    <circle cx="252" cy="177" r="14" fill="#1f2937" />
    <circle cx="344" cy="177" r="14" fill="#1f2937" />
    <circle cx="252" cy="177" r="6" fill="#94a3b8" />
    <circle cx="344" cy="177" r="6" fill="#94a3b8" />
    <text x="294" y="164" textAnchor="middle" fontSize="14" fontWeight="900" fill="#173d29">TCS</text>
    <circle cx="248" cy="133" r="8" fill="#8d5524" />
    <circle cx="291" cy="133" r="8" fill="#f1c27d" />
    <circle cx="334" cy="133" r="8" fill="#c68642" />
  </g>;
}

export function TcsKidsScene({
  variant = "playtime",
  className = "",
  compact = false,
}: {
  variant?: SceneVariant;
  className?: string;
  compact?: boolean;
}) {
  return <div aria-hidden="true" className={`pointer-events-none select-none ${compact ? "h-28 sm:h-32" : "h-36 sm:h-44"} ${className}`}>
    <svg viewBox="0 0 420 220" className="h-full w-full overflow-visible" role="img">
      <ellipse cx="210" cy="203" rx="184" ry="12" fill="rgba(15,23,42,.10)" />
      {variant === "playtime" && <>
        <Blocks />
        <Kid x={122} y={91} scale={.78} skin="#8d5524" shirt="#22c55e" pants="#334155" hair="#1f2937" pose="stand" delay={0} />
        <Kid x={210} y={83} scale={.8} skin="#f1c27d" shirt="#8b5cf6" pants="#1d4ed8" hair="#78350f" pose="ball" delay={.25} />
        <Kid x={317} y={94} scale={.74} skin="#c68642" shirt="#fb7185" pants="#475569" hair="#111827" pose="wave" delay={.5} />
        <Bubbles />
      </>}
      {variant === "reading" && <>
        <rect x="55" y="163" width="310" height="39" rx="20" fill="#d1fae5" />
        <Kid x={132} y={86} scale={.78} skin="#f1c27d" shirt="#0ea5e9" pants="#475569" hair="#713f12" pose="read" delay={0} />
        <Kid x={227} y={92} scale={.74} skin="#6f4e37" shirt="#f97316" pants="#334155" hair="#111827" pose="read" delay={.25} />
        <Kid x={322} y={88} scale={.76} skin="#c68642" shirt="#a855f7" pants="#1e3a8a" hair="#3f2d20" pose="wave" delay={.45} />
        <path d="M45 168 Q100 143 154 166" stroke="#93c5fd" strokeWidth="5" fill="none" strokeLinecap="round" />
      </>}
      {variant === "art" && <>
        <Easel />
        <Kid x={125} y={88} scale={.78} skin="#c68642" shirt="#ec4899" pants="#475569" hair="#111827" pose="paint" delay={0} />
        <Kid x={221} y={91} scale={.74} skin="#f1c27d" shirt="#22c55e" pants="#1d4ed8" hair="#854d0e" pose="star" delay={.3} />
        <circle className="tcs-doodle-twinkle" cx="85" cy="69" r="8" fill="#facc15" />
        <circle className="tcs-doodle-twinkle" cx="358" cy="54" r="6" fill="#60a5fa" />
      </>}
      {variant === "school" && <>
        <rect x="48" y="151" width="322" height="48" rx="14" fill="#e0f2fe" />
        <rect x="169" y="121" width="88" height="42" rx="6" fill="#fff" stroke="#94a3b8" strokeWidth="3" />
        <path d="M213 121 L213 163" stroke="#cbd5e1" strokeWidth="2" />
        <Kid x={110} y={89} scale={.72} skin="#6f4e37" shirt="#22c55e" pants="#334155" hair="#111827" pose="backpack" delay={0} />
        <Kid x={311} y={89} scale={.72} skin="#f1c27d" shirt="#f59e0b" pants="#1e3a8a" hair="#78350f" pose="read" delay={.28} />
        <path className="tcs-pencil-slide" d="M187 141 L239 141" stroke="#f97316" strokeWidth="5" strokeLinecap="round" />
      </>}
      {variant === "transport" && <>
        <BusScene />
        <Kid x={105} y={92} scale={.72} skin="#8d5524" shirt="#22c55e" pants="#334155" hair="#111827" pose="wave" delay={0} />
        <path d="M38 199 H391" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
        <path d="M270 199 H310" stroke="#f8fafc" strokeWidth="4" strokeDasharray="12 12" />
      </>}
      {variant === "celebrate" && <>
        <Kid x={106} y={92} scale={.72} skin="#c68642" shirt="#38bdf8" pants="#334155" hair="#111827" pose="star" delay={0} />
        <Kid x={207} y={82} scale={.8} skin="#f1c27d" shirt="#22c55e" pants="#1d4ed8" hair="#854d0e" pose="wave" delay={.22} />
        <Kid x={313} y={92} scale={.72} skin="#6f4e37" shirt="#f472b6" pants="#475569" hair="#111827" pose="star" delay={.44} />
        <g className="tcs-scene-confetti">
          <circle cx="75" cy="40" r="5" fill="#f43f5e" />
          <rect x="145" y="28" width="9" height="9" fill="#facc15" transform="rotate(25 149 32)" />
          <circle cx="245" cy="34" r="5" fill="#22c55e" />
          <rect x="342" y="32" width="9" height="9" fill="#60a5fa" transform="rotate(-20 346 36)" />
        </g>
      </>}
      {variant === "family" && <>
        <Kid x={106} y={91} scale={.72} skin="#8d5524" shirt="#22c55e" pants="#334155" hair="#111827" pose="wave" delay={0} />
        <Kid x={207} y={84} scale={.78} skin="#f1c27d" shirt="#a855f7" pants="#1d4ed8" hair="#78350f" pose="star" delay={.24} />
        <Kid x={310} y={91} scale={.72} skin="#c68642" shirt="#fb7185" pants="#475569" hair="#3f2d20" pose="read" delay={.44} />
        <path className="tcs-heart-pulse" d="M205 54 C190 39 164 48 164 68 C164 91 205 111 205 111 C205 111 246 91 246 68 C246 48 220 39 205 54Z" fill="#fb7185" opacity=".2" />
      </>}
    </svg>
  </div>;
}
