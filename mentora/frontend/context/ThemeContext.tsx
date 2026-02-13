import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeName = "dark" | "light";

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
  danger: string;
  success: string;
  warning: string;
  online: string;
  offline: string;
};

type ThemeContextValue = {
  theme: ThemeName;
  isDark: boolean;
  colors: ThemeColors;
  setTheme: (t: ThemeName) => void;
  setDarkMode: (isDark: boolean) => void;
};

const STORAGE_KEY = "mentora.theme";

const DARK_COLORS: ThemeColors = {
  background: "#0B1220",
  backgroundAlt: "#101B2E",
  card: "rgba(15,23,42,0.85)",
  subtleCard: "rgba(15,23,42,0.85)",
  accent: "#4DA3FF",
  accentSoft: "#8FD3FF",
  textPrimary: "#EAF0FF",
  textSecondary: "#9CA3AF",
  textMuted: "#6B7280",
  borderSubtle: "rgba(148,163,184,0.35)",
  borderSoft: "rgba(148,163,184,0.18)",
  shadow: "#000000",
  danger: "#EF4444",
  success: "#10B981",
  warning: "#F59E0B",
  online: "#10B981",
  offline: "#6B7280",
};

const LIGHT_COLORS: ThemeColors = {
  background: "#F7FAFF",
  backgroundAlt: "#FFFFFF",
  card: "rgba(255,255,255,0.92)",
  // Soft blue surface used for "tiles" / small cards
  subtleCard: "rgba(77,163,255,0.10)",
  accent: "#4DA3FF",
  accentSoft: "#8FD3FF",
  textPrimary: "#0B1220",
  textSecondary: "#334155",
  textMuted: "#64748B",
  borderSubtle: "rgba(15,23,42,0.18)",
  borderSoft: "rgba(15,23,42,0.10)",
  shadow: "#000000",
  danger: "#DC2626",
  success: "#16A34A",
  warning: "#D97706",
  online: "#16A34A",
  offline: "#64748B",
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");

  useEffect(() => {
    let active = true;
    (async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (!active) return;
      if (stored === "light" || stored === "dark") {
        setThemeState(stored);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {
      // ignore storage errors
    });
  }, []);

  const setDarkMode = useCallback(
    (isDark: boolean) => {
      setTheme(isDark ? "dark" : "light");
    },
    [setTheme],
  );

  const colors = theme === "dark" ? DARK_COLORS : LIGHT_COLORS;
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      isDark: theme === "dark",
      colors,
      setTheme,
      setDarkMode,
    }),
    [colors, setDarkMode, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

