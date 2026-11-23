type SettingsRecord = Record<string, unknown>;

export type LeaderboardSettings = SettingsRecord & {
  title?: string;
  dataSource?: string;
  rows?: number;
  rowGap?: number;
  maxName?: number;
  colors?: Record<string, string>;
  showBackground?: boolean;
  showIcon?: boolean;
  showMessage?: boolean;
  showBorder?: boolean;
  fontFamily?: string;
  fontSize?: number;
  strokeW?: number;
  strokeColor?: string;
  entryAnimation?: string;
  highlightEffect?: string;
  amountStyle?: string;
  nameStyle?: string;
  enableRanks?: boolean;
  rankAsBadge?: boolean;
  showStreak?: boolean;
  topN?: string;
  iconStyle?: string;
  rankTextColor?: string;
  rankBgColor?: string;
  topHighlight?: boolean;
  nameEffect?: string;
  iconEffect?: string;
  iconAnimation?: string;
  iconSize?: number;
};

export type LeaderboardWidgetRecord = {
  id: number;
  title: string;
  rows: number;
  animation: string;
  type: string;
  colors: string[];
  settings: LeaderboardSettings;
};

type OverlayCredentials = {
  leaderboard_widget?: unknown;
  widget_settings?: unknown;
};

function isRecord(value: unknown): value is SettingsRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function colorValue(colors: SettingsRecord, key: string, fallback: string) {
  return typeof colors[key] === "string" ? (colors[key] as string) : fallback;
}

export function getLeaderboardSettings(
  credentials: OverlayCredentials,
): LeaderboardSettings | null {
  const legacy = credentials.leaderboard_widget;
  if (isRecord(legacy) && typeof legacy.title === "string") {
    return legacy as LeaderboardSettings;
  }

  const saved = credentials.widget_settings;
  if (!isRecord(saved) || !Array.isArray(saved.widgets)) return null;
  for (const widget of saved.widgets) {
    if (isRecord(widget) && isRecord(widget.settings)) {
      return widget.settings as LeaderboardSettings;
    }
  }
  return null;
}

export function getLeaderboardWidgets(
  credentials: OverlayCredentials,
): LeaderboardWidgetRecord[] | null {
  const saved = credentials.widget_settings;
  if (isRecord(saved) && Array.isArray(saved.widgets)) {
    const records = saved.widgets.flatMap((widget): LeaderboardWidgetRecord[] => {
      if (!isRecord(widget)) return [];
      return [{
        id: typeof widget.id === "number" ? widget.id : 1,
        title: typeof widget.title === "string" ? widget.title : "Widget",
        rows: typeof widget.rows === "number" ? widget.rows : 3,
        animation: typeof widget.animation === "string" ? widget.animation : "dropdown",
        type: typeof widget.type === "string" ? widget.type : "ALL-TIME",
        colors: Array.isArray(widget.colors)
          ? widget.colors.filter((color): color is string => typeof color === "string")
          : [],
        settings: isRecord(widget.settings) ? widget.settings as LeaderboardSettings : {},
      }];
    });
    if (records.length > 0) return records;
  }

  const settings = getLeaderboardSettings(credentials);
  if (!settings) return null;
  const colors = isRecord(settings.colors) ? settings.colors : {};
  return [{
    id: 1,
    title: typeof settings.title === "string" ? settings.title : "Widget",
    rows: typeof settings.rows === "number" ? settings.rows : 3,
    animation: typeof settings.entryAnimation === "string"
      ? settings.entryAnimation.toLowerCase().replace(/\s/g, "")
      : "dropdown",
    type: "ALL-TIME",
    colors: [
      colorValue(colors, "background", "#0F172A"),
      colorValue(colors, "border", "#1E3350"),
      colorValue(colors, "amount", "#10B981"),
      colorValue(colors, "name", "#F8FAFC"),
      colorValue(colors, "message", "#F8FAFC"),
      colorValue(colors, "badgeBg", "#10B981"),
    ],
    settings,
  }];
}
