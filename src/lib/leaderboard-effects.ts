import type { CSSProperties } from "react";

const NAME_EFFECTS: Record<string, (accent: string) => CSSProperties> = {
  "☀️ Glow": (accent) => ({ textShadow: `0 0 10px ${accent}` }),
  "✨ Shimmer": () => ({ backgroundImage: "linear-gradient(90deg,#F8FAFC 25%,#94A3B8 50%,#F8FAFC 75%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }),
  "🌈 Rainbow": () => ({ backgroundImage: "linear-gradient(90deg,#F87171,#FBBF24,#34D399,#60A5FA,#A78BFA)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }),
  "🏆 Gold": () => ({ color: "#FCD34D", textShadow: "0 0 8px rgba(252,211,77,0.6)" }),
  "💎 Diamond": () => ({ backgroundImage: "linear-gradient(180deg, #F0F9FF, #7DD3FC)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }),
  "🔮 Plasma": () => ({ backgroundImage: "linear-gradient(90deg,#F0ABFC,#818CF8)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }),
  "🌀 SteamKit": () => ({ backgroundImage: "linear-gradient(90deg,#67E8F9,#818CF8)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }),
  "⚡ Thunder": () => ({ color: "#FDE047", textShadow: "0 0 10px rgba(253,224,71,0.7)" }),
  "👾 Glitch": () => ({ color: "#F8FAFC", textShadow: "2px 0 #EF4444, -2px 0 #22D3EE" }),
  "🔥 Fire": () => ({ backgroundImage: "linear-gradient(180deg,#FDE047,#F97316,#EF4444)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }),
};

export function getNameEffectStyle(nameEffect: string | undefined, accent: string): CSSProperties {
  if (!nameEffect || nameEffect.includes("None")) return {};
  const key = Object.keys(NAME_EFFECTS).find((k) => nameEffect.includes(k.split(" ").pop() ?? "~~"));
  return key ? NAME_EFFECTS[key](accent) : {};
}

const ICON_EFFECTS: Record<string, string> = {
  "✨ Shimmer": "drop-shadow(0 0 6px #F8FAFC)",
  "🌈 Prism Rainbow": "saturate(2) drop-shadow(0 0 6px #F472B6)",
  "🌟 Golden Glow": "drop-shadow(0 0 8px #FBBF24)",
  "🥇 Liquid Gold": "drop-shadow(0 0 6px #EAB308) sepia(0.4)",
  "💎 Diamond": "drop-shadow(0 0 6px #38BDF8)",
  "🔮 Plasma": "drop-shadow(0 0 8px #C084FC)",
  "🌀 SteamKit": "drop-shadow(0 0 8px #818CF8)",
  "⚡ Thunder": "drop-shadow(0 0 8px #FDE047)",
  "👾 Glitch": "drop-shadow(2px 0 #EF4444) drop-shadow(-2px 0 #22D3EE)",
  "🔥 Fire": "drop-shadow(0 0 8px #F97316)",
  Glow: "drop-shadow(0 0 6px #F8FAFC)",
};

export function getIconEffectStyle(iconEffect: string | undefined): CSSProperties {
  if (!iconEffect || iconEffect.includes("None")) return {};
  const key = Object.keys(ICON_EFFECTS).find((k) => iconEffect.includes(k.split(" ").pop() ?? "~~"));
  return key ? { filter: ICON_EFFECTS[key] } : {};
}

export function getIconAnimClass(iconAnimation: string | undefined): string {
  if (!iconAnimation) return "";
  if (iconAnimation.includes("Bounce")) return "iconBounce";
  if (iconAnimation.includes("Spin")) return "iconSpin";
  if (iconAnimation.includes("Pulse")) return "iconPulse";
  if (iconAnimation.includes("Shake")) return "iconShake";
  return "";
}

export const ICON_ANIM_CSS = `
@keyframes iconPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.25); } }
.iconPulse { animation: iconPulse 1.2s ease-in-out infinite; display: inline-block; }
@keyframes iconBounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.iconBounce { animation: iconBounce 1s ease-in-out infinite; display: inline-block; }
@keyframes iconSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.iconSpin { animation: iconSpin 1.5s linear infinite; display: inline-block; }
@keyframes iconShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
.iconShake { animation: iconShake 0.6s ease-in-out infinite; display: inline-block; }
@keyframes topPop { 0% { transform: scale(0.7); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
.topPop { animation: topPop 0.5s ease-out both; }
`;

export const RANK_ICONS: Record<string, string[]> = {
  "🥇 Medals": ["🥇", "🥈", "🥉"],
  "👑 Status": ["👑", "🎖️", "🎖️"],
  "💰 Wealth": ["💰", "💸", "💵"],
  "🎮 Gaming": ["🎮", "🕹️", "👾"],
  "🚀 Space": ["🚀", "🛸", "🪐"],
  "❤️ Hearts": ["❤️", "💖", "💗"],
};

export function getRankIcons(iconStyle: string | undefined): string[] {
  if (!iconStyle || iconStyle.includes("None") || iconStyle === "Reset") return [];
  return RANK_ICONS[iconStyle] ?? RANK_ICONS["🥇 Medals"];
}

export function getVisibleRowCount(topN: string | undefined, rows: number): number {
  switch (topN) {
    case "Top 1 Only": return 1;
    case "Top 2": return 2;
    case "Top 3": return 3;
    case "Top 4": return 4;
    case "Top 5": return 5;
    default: return rows;
  }
}
