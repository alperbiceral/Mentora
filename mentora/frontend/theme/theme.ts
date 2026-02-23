export type ThemeMode = "dark" | "light";

export type ThemeColors = {
  background: string;
  backgroundAlt: string;
  card: string;
  subtleCard: string;
  accent: string;
  accentSoft: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderSubtle: string;
  borderSoft: string;
  shadow: string;
  inputBg: string;
  danger: string;
  success: string;
  warning: string;
  online: string;
  offline: string;
  tabBarBg: string;
  tabBarBorder: string;
};

export const DARK_COLORS: ThemeColors = {
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.85)",
  subtleCard: "rgba(15,23,42,0.85)",
  accent: "#6D5EF7",
  accentSoft: "#6D5EF7",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  borderSubtle: "rgba(148,163,184,0.35)",
  borderSoft: "rgba(148,163,184,0.18)",
  shadow: "#000000",
  inputBg: "rgba(2,6,23,0.65)",
  danger: "#EF4444",
  success: "#10B981",
  warning: "#F59E0B",
  online: "#10B981",
  offline: "#6B7280",
  tabBarBg: "#020617",
  tabBarBorder: "#0B1120",
};

export const LIGHT_COLORS: ThemeColors = {
  background: "#F8FAFC",
  backgroundAlt: "#EEF2FF",
  card: "#FFFFFF",
  subtleCard: "#F1F5F9",
  accent: "#6D5EF7",
  accentSoft: "#6D5EF7",
  textPrimary: "#0F172A",
  textSecondary: "#334155",
  textMuted: "#64748B",
  borderSubtle: "rgba(15,23,42,0.12)",
  borderSoft: "rgba(15,23,42,0.08)",
  shadow: "#000000",
  inputBg: "#FFFFFF",
  danger: "#DC2626",
  success: "#059669",
  warning: "#D97706",
  online: "#059669",
  offline: "#64748B",
  tabBarBg: "#FFFFFF",
  tabBarBorder: "rgba(15,23,42,0.08)",
};

export function getColorsForMode(mode: ThemeMode): ThemeColors {
  return mode === "dark" ? DARK_COLORS : LIGHT_COLORS;
}

