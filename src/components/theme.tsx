"use client";
import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
type Theme = "light" | "dark";
let localChoice: Theme | null = null;
let themeRequest = 0;
let activeTransition: ViewTransition | undefined;
function snapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function preference(): Theme | null {
  try {
    const value = localStorage.getItem("mailloop-theme");
    return value === "light" || value === "dark" ? value : localChoice;
  } catch {
    return localChoice;
  }
}
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      getComputedStyle(document.documentElement)
        .getPropertyValue("--background")
        .trim(),
    );
  window.dispatchEvent(new Event("mailloop-theme"));
}
function subscribe(callback: () => void) {
  const query = matchMedia("(prefers-color-scheme: dark)");
  const system = () => {
    if (!preference()) apply(query.matches ? "dark" : "light");
  };
  const storage = () => {
    localChoice = null;
    apply(preference() ?? (query.matches ? "dark" : "light"));
  };
  window.addEventListener("mailloop-theme", callback);
  window.addEventListener("storage", storage);
  query.addEventListener("change", system);
  return () => {
    window.removeEventListener("mailloop-theme", callback);
    window.removeEventListener("storage", storage);
    query.removeEventListener("change", system);
  };
}
function switchTheme(theme: Theme, button: HTMLButtonElement) {
  localChoice = theme;
  try {
    localStorage.setItem("mailloop-theme", theme);
  } catch {
    /* Remains active in this document. */
  }
  const request = ++themeRequest;
  activeTransition?.skipTransition();
  activeTransition = undefined;
  if (snapshot() === theme) return;
  const root = document.documentElement;
  if (
    !document.startViewTransition ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply(theme);
    return;
  }
  const bounds = button.getBoundingClientRect();
  const x = bounds.left + bounds.width / 2,
    y = bounds.top + bounds.height / 2;
  const radius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y),
  );
  const transition = document.startViewTransition(() => {
    if (request === themeRequest) apply(theme);
  });
  activeTransition = transition;
  void transition.ready
    .then(() => {
      if (activeTransition !== transition) return;
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 750,
          easing: "cubic-bezier(.65,0,.35,1)",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {
      /* Skipped transitions already applied the theme. */
    });
}
export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "light");
  return (
    <div className="inline-flex items-center gap-3">
      <span className="text-xs text-body">Theme</span>
      <div className="theme-track" role="group" aria-label="Theme">
        <span className="theme-thumb" aria-hidden="true" />
        {(["light", "dark"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-label={`${value === "light" ? "Light" : "Dark"} theme`}
            aria-pressed={theme === value}
            onClick={(event) => switchTheme(value, event.currentTarget)}
          >
            {value === "light" ? (
              <Sun aria-hidden="true" />
            ) : (
              <Moon aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
