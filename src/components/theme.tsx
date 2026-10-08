"use client";
import { useSyncExternalStore } from "react";
type Theme = "light" | "dark" | "system";
let themeAnimation: Animation | null = null;
let fallbackTheme: Theme = "system";
function getTheme(): Theme {
  try {
    const value = localStorage.getItem("mailloop-theme");
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return fallbackTheme;
  }
}
function apply(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#050709" : "#f8fafc");
}
function subscribe(callback: () => void) {
  const update = () => {
    apply(getTheme());
    callback();
  };
  const query = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", update);
  window.addEventListener("mailloop-theme", update);
  query.addEventListener("change", update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener("mailloop-theme", update);
    query.removeEventListener("change", update);
  };
}
export function ThemeControl({ label = "Theme" }: { label?: string }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "system");
  return (
    <label className="inline-flex items-center gap-2 text-xs text-body">
      <span className="hidden sm:inline">{label}</span>
      <select
        name="theme"
        aria-label={label}
        className="text-base"
        value={theme}
        onChange={(e) => {
          const value = e.target.value as Theme;
          fallbackTheme = value;
          themeAnimation?.cancel();
          try {
            localStorage.setItem("mailloop-theme", value);
          } catch {
            /* Preference remains active for this page. */
          }
          apply(value);
          window.dispatchEvent(new Event("mailloop-theme"));
          if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
            themeAnimation = document.body.animate(
              [{ opacity: 0.75 }, { opacity: 1 }],
              {
                duration: 160,
              },
            );
        }}
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
