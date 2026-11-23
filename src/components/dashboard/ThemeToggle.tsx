"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DASHBOARD_THEME_EVENT,
  DASHBOARD_THEME_KEY,
  resolveDashboardTheme,
  type DashboardTheme,
} from "@/lib/dashboard-theme";
import styles from "./ThemeToggle.module.css";

function readStoredTheme(): string | null {
  try {
    return window.localStorage.getItem(DASHBOARD_THEME_KEY);
  } catch {
    return null;
  }
}

function persistTheme(theme: DashboardTheme) {
  try {
    window.localStorage.setItem(DASHBOARD_THEME_KEY, theme);
  } catch {
    return false;
  }
  return true;
}

function readTheme(): DashboardTheme {
  const stored = readStoredTheme();
  if (stored === "light" || stored === "dark") return stored;

  const applied = document.documentElement.getAttribute("data-dashboard-theme");
  if (applied === "light" || applied === "dark") return applied;

  return resolveDashboardTheme(
    stored,
    window.matchMedia("(prefers-color-scheme: light)").matches,
  );
}

function applyTheme(theme: DashboardTheme) {
  document.documentElement.setAttribute("data-dashboard-theme", theme);
  persistTheme(theme);
  window.dispatchEvent(new Event(DASHBOARD_THEME_EVENT));
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<DashboardTheme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = readTheme();
      document.documentElement.setAttribute("data-dashboard-theme", next);
      setTheme(next);
      setMounted(true);
    };

    sync();
    window.addEventListener(DASHBOARD_THEME_EVENT, sync);
    window.addEventListener("storage", sync);

    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onMediaChange = () => {
      if (!readStoredTheme()) sync();
    };
    media.addEventListener("change", onMediaChange);

    return () => {
      window.removeEventListener(DASHBOARD_THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", onMediaChange);
    };
  }, []);

  function toggleTheme() {
    const next = readTheme() === "dark" ? "light" : "dark";
    setTheme(next);
    setMounted(true);
    applyTheme(next);
  }

  const label = mounted
    ? theme === "dark"
      ? "Switch to light mode"
      : "Switch to dark mode"
    : "Toggle dashboard theme";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${styles.toggle} ${compact ? styles.compact : ""}`}
      aria-label={label}
      aria-pressed={mounted ? theme === "light" : undefined}
      title={label}
    >
      <span className={styles.icon} aria-hidden="true">
        <Moon className={styles.moon} size={18} />
        <Sun className={styles.sun} size={18} />
      </span>
      <span className={styles.label}>
        {theme === "dark" ? "Dark" : "Light"} mode
      </span>
    </button>
  );
}
